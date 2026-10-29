import { ImageResponse } from "next/og";
import { getStory } from "@/lib/news/store";
import { LEAN_TOTALS } from "@/lib/news/outlets";
import { etTime, leanShares } from "@/lib/news/share";
import { markSvg } from "@/lib/cheetah-mark";

/**
 * GET /news/<slug>-<id>/opengraph-image — the preview card for one story
 * (1200×630), matching the News tab: white, bold headline, and the same
 * Left / Center / Right bar (share of the outlets covering it), with the
 * raw counts under it and when they were counted. Content stays clear of
 * the bottom of the card, where X overlays the link title. Re-rendered
 * every 10 minutes; the page links it with ?v=<counts> so a changed count
 * gets a fresh card.
 */
export const revalidate = 600;
const size = { width: 1200, height: 630 };

async function font(family: string, spec: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:${spec}`)).text();
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch { return null; }
}
const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ ink: "#14110E", accent: "#C8102E", bars: 7, id: "nog", width: 120, height: 40 })).toString("base64");
const COL = { left: "#2C4A86", center: "#FFFFFF", right: "#7B2D26" } as const;
const LABEL = { left: "Left", center: "Center", right: "Right" } as const;
const INK = "#14110E", SUB = "#5c5856", MUTE = "#8a8378", RULE = "#CFC9BF";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [s, serif, sans, bold] = await Promise.all([
    getStory(slug.split("-").pop() || ""), font("Source+Serif+4", "wght@400"), font("DM+Sans", "wght@500"), font("DM+Sans", "wght@700"),
  ]);
  const fonts = [
    ...(serif ? [{ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Sans", data: sans, weight: 500 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Sans", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];
  const headers = { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" };
  const brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={78} height={26} alt="" />
      <div style={{ display: "flex", fontFamily: "Serif", fontSize: 28, color: INK }}>Vote&nbsp;<span style={{ color: "#C8102E" }}>Unbiased</span></div>
    </div>
  );
  if (!s) {
    return new ImageResponse((
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>{brand}</div>
    ), { ...size, fonts, headers });
  }
  const t0 = s.title.replace(/\s+/g, " ").trim();
  const title = t0.length > 110 ? t0.slice(0, 107).replace(/\s+\S*$/, "") + "…" : t0;
  const tSize = title.length > 85 ? 46 : title.length > 60 ? 52 : 58;
  const sh = leanShares(s.coverage) || { left: 0, center: 0, right: 0 };
  const parts = (["left", "center", "right"] as const).filter(k => s.coverage[k] > 0);
  const c = s.coverage;
  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", color: INK, padding: "44px 64px 0", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `3px solid ${INK}` }}>
        {brand}
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: MUTE }}>{`AS OF ${etTime(s.asOf || s.lastSeen).toUpperCase()}`}</div>
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: tSize, fontWeight: 700, lineHeight: 1.08, maxWidth: 1072 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: 92 }}>
        <div style={{ display: "flex", fontSize: 19, letterSpacing: 2.5, color: MUTE, marginBottom: 12 }}>WHO COVERED IT</div>
        <div style={{ display: "flex", height: 64, borderRadius: 8, border: `2px solid ${RULE}`, overflow: "hidden", background: "#fff" }}>
          {parts.map(k => (
            <div key={k} style={{ display: "flex", flexGrow: sh[k], flexBasis: 0, minWidth: 92, alignItems: "center", justifyContent: "center", background: COL[k], color: k === "center" ? INK : "#fff", fontSize: 28, fontWeight: 700 }}>
              {sh[k] >= 16 ? `${LABEL[k]} ${sh[k]}%` : `${sh[k]}%`}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 23, color: SUB }}>
          {`${c.left} of ${LEAN_TOTALS.left} left-leaning · ${c.center} of ${LEAN_TOTALS.center} center · ${c.right} of ${LEAN_TOTALS.right} right-leaning outlets we read`}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 17, color: MUTE }}>
          {`voteunbiased.org · lean from Robertson et al. (2018)`}
        </div>
      </div>
    </div>
  ), { ...size, fonts, headers });
}
