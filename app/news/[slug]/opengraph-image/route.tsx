import { ImageResponse } from "next/og";
import { getStory } from "@/lib/news/store";
import { etTime, leanShares } from "@/lib/news/share";
import { markSvg } from "@/lib/cheetah-mark";

/**
 * GET /news/<slug>-<id>/opengraph-image — the preview card for one story
 * (1200×630): the story's photo (the one the page shows, from an outlet's own
 * feed, credited) full-bleed under a dark gradient, the headline in white, an
 * "N sources" tag, and the Left / Center / Right bar along the bottom with
 * shares only. With no usable photo it falls back to the white card.
 * Re-rendered every 10 minutes; the page links it with ?v=<counts> so a
 * changed count gets a fresh card.
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

/** The story photo as a data URI (satori only draws PNG/JPEG/GIF); tries the chosen photo, then its backups. */
async function photoData(cands: { url: string; name: string }[]): Promise<{ src: string; name: string } | null> {
  for (const { url: u, name } of cands) {
    if (!/^https:\/\//.test(u)) continue;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0 (compatible; VoteUnbiasedBot/1.0; +https://voteunbiased.org)" } });
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!r.ok || !/^image\/(jpeg|png|gif)$/.test(type)) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 8_000 || buf.byteLength > 4_000_000) continue;
      return { src: `data:${type};base64,${Buffer.from(buf).toString("base64")}`, name };
    } catch { /* try the next one */ }
  }
  return null;
}
const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ ink: "#14110E", accent: "#C8102E", bars: 7, id: "nog", width: 120, height: 40 })).toString("base64");
const MARK_WHITE = "data:image/svg+xml;base64," + Buffer.from(markSvg({ ink: "#FFFFFF", accent: "#FFFFFF", bars: 7, id: "nogw", width: 120, height: 40 })).toString("base64");
const COL = { left: "#4361a6", center: "#FFFFFF", right: "#b8372d" } as const;
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
  const brandWhite = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK_WHITE} width={54} height={18} alt="" />
      <div style={{ display: "flex", fontFamily: "Sans", fontSize: 20, fontWeight: 700, color: "#fff" }}>voteunbiased.org</div>
    </div>
  );
  if (!s) {
    return new ImageResponse((
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", padding: "44px 64px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{brand}</div>
      </div>
    ), { ...size, fonts, headers });
  }
  const t0 = s.title.replace(/\s+/g, " ").trim();
  const title = t0.length > 110 ? t0.slice(0, 107).replace(/\s+\S*$/, "") + "…" : t0;
  const tSize = title.length > 85 ? 46 : title.length > 60 ? 52 : 58;
  const sh = leanShares(s.coverage) || { left: 0, center: 0, right: 0 };
  const parts = (["left", "center", "right"] as const).filter(k => s.coverage[k] > 0);
  const c = s.coverage;
  const photo = s.photo ? await photoData([{ url: s.photo.url, name: s.photo.name }, ...(s.photo.alts || [])]) : null;
  if (photo) {
    return new ImageResponse((
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: INK, fontFamily: "Sans", color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.src} width={1200} height={630} alt="" style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(20,17,14,0.45) 0%, rgba(20,17,14,0.55) 35%, rgba(20,17,14,0.92) 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "44px 64px 56px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 0.5, padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.55)" }}>
              {`${s.outlets} source${s.outlets === 1 ? "" : "s"}`}
            </div>
            {brandWhite}
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: tSize + 6, fontWeight: 700, lineHeight: 1.08, maxWidth: 1072, color: "#fff" }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ display: "flex", height: 68, borderRadius: 10, overflow: "hidden", border: "2px solid rgba(255,255,255,0.85)" }}>
              {parts.map(k => (
                <div key={k} style={{ display: "flex", flexGrow: sh[k], flexBasis: 0, minWidth: 132, alignItems: "center", justifyContent: "center", background: COL[k], color: k === "center" ? INK : "#fff", fontSize: 26, fontWeight: 700 }}>
                  {`${LABEL[k]} ${sh[k]}%`}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 17, color: "rgba(255,255,255,0.75)" }}>
              <div style={{ display: "flex" }}>{`Share of rated outlets covering it · as of ${etTime(s.asOf || s.lastSeen)}`}</div>
              <div style={{ display: "flex" }}>{`Photo: ${photo.name}`}</div>
            </div>
          </div>
        </div>
      </div>
    ), { ...size, fonts, headers });
  }
  return new ImageResponse((
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", color: INK, padding: "44px 64px 0", fontFamily: "Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `3px solid ${INK}` }}>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: MUTE }}>{`AS OF ${etTime(s.asOf || s.lastSeen).toUpperCase()}`}</div>
        {brand}
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
          {`Share of rated outlets covering it, by lean`}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 17, color: MUTE }}>
          {`voteunbiased.org · lean from Robertson et al. (2018)`}
        </div>
      </div>
    </div>
  ), { ...size, fonts, headers });
}
