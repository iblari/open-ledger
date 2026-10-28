import { ImageResponse } from "next/og";
import { getStory } from "@/lib/news/store";
import { LEAN_TOTALS } from "@/lib/news/outlets";
import { etTime } from "@/lib/news/share";
import { markSvg } from "@/lib/cheetah-mark";

/**
 * GET /news/<slug>-<id>/opengraph-image — the preview card for one story
 * (1200×630), in the style of the fact-check cards: our own neutral title,
 * how many of each side's outlets covered it, and when that was counted.
 * Neutral tones only (no party colours). Re-rendered every 10 minutes; the
 * page links it with ?v=<counts> so a changed count gets a fresh card.
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
const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ bars: 7, id: "nog", width: 120, height: 40 })).toString("base64");
const BAR: Record<"left" | "center" | "right", string> = { left: "#8C9BBE", center: "#BDB6AC", right: "#C29C7C" };
const NAME = { left: "Left-leaning outlets", center: "Center outlets", right: "Right-leaning outlets" };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [s, serif, sans] = await Promise.all([getStory(slug.split("-").pop() || ""), font("Source+Serif+4", "wght@400"), font("DM+Sans", "wght@500")]);
  const fonts = [
    ...(serif ? [{ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Sans", data: sans, weight: 500 as const, style: "normal" as const }] : []),
  ];
  const headers = { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" };
  if (!s) {
    return new ImageResponse((
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0C0A08" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={360} height={120} alt="" />
      </div>), { ...size, fonts, headers });
  }
  const title = s.title.length > 110 ? s.title.slice(0, 107).replace(/\s+\S*$/, "") + "…" : s.title;
  const tSize = title.length > 80 ? 46 : title.length > 55 ? 52 : 58;
  const rows = (["left", "center", "right"] as const).map(l => ({ l, n: s.coverage[l], of: LEAN_TOTALS[l], r: s.rate[l] }));
  const maxR = Math.max(0.5, ...rows.map(x => x.r));      // scale so the longest bar isn't tiny
  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "52px 64px", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 21, letterSpacing: 3, color: "#A39D93" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#D8D2C8" }} />
          WHO COVERED IT
        </div>
        <div>AS OF {etTime(s.asOf || s.lastSeen).toUpperCase()}</div>
      </div>
      <div style={{ display: "flex", marginTop: 26, fontFamily: "Serif", fontSize: tSize, lineHeight: 1.12, maxWidth: 1060 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: "auto", marginBottom: 30 }}>
        {rows.map(x => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ display: "flex", width: 290, fontSize: 25, color: "#D8D2C8" }}>{NAME[x.l]}</div>
            <div style={{ display: "flex", width: 520, height: 26, borderRadius: 6, background: "#2A2520" }}>
              <div style={{ display: "flex", width: Math.max(x.n ? 10 : 0, Math.round((x.r / maxR) * 520)), height: 26, borderRadius: 6, background: BAR[x.l] }} />
            </div>
            <div style={{ display: "flex", fontSize: 27, color: "#F4F0EA" }}>{x.n} of {x.of} read · {Math.round(x.r * 100)}%</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontSize: 19, color: "#7A746C", maxWidth: 820 }}>
          Source: voteunbiased.org · {LEAN_TOTALS.left + LEAN_TOTALS.center + LEAN_TOTALS.right + LEAN_TOTALS.unrated} outlets&apos; public feeds · lean from Robertson et al. (2018)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width={84} height={28} alt="" />
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 30 }}>Vote&nbsp;<span style={{ color: "#E0493A" }}>Unbiased</span></div>
        </div>
      </div>
    </div>
  ), { ...size, fonts, headers });
}
