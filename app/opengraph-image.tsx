import { ImageResponse } from "next/og";

/**
 * The link preview — what people see when the site is texted or posted.
 *
 * Same picture as the homepage hero: near-black, 31 years of GDP growth in
 * each administration's colour, the headline over it. The old card was a
 * cream page of small print; in an iMessage bubble it read as a document,
 * next to Palantir's single mark on black it looked amateur. One image, one
 * line, the brand.
 *
 * Fonts ship with the route (app/og-fonts) rather than being fetched from a
 * CDN at render time, so the preview can't silently fall back to a default.
 */
export const runtime = "edge";
export const alt = "Vote Unbiased — the economy under every president, in data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// GDP growth 1993–2024 by administration (BEA) — same series as the hero.
const BARS: [number, string][] = [[2.7,"#1e6b9e"],[4.0,"#1e6b9e"],[2.7,"#1e6b9e"],[3.8,"#1e6b9e"],[4.5,"#1e6b9e"],[4.5,"#1e6b9e"],[4.7,"#1e6b9e"],[4.1,"#1e6b9e"],[1.0,"#8b4c70"],[1.7,"#8b4c70"],[2.8,"#8b4c70"],[3.8,"#8b4c70"],[3.5,"#8b4c70"],[2.8,"#8b4c70"],[2.0,"#8b4c70"],[-0.1,"#8b4c70"],[-2.6,"#2d6a4f"],[2.7,"#2d6a4f"],[1.5,"#2d6a4f"],[2.3,"#2d6a4f"],[1.8,"#2d6a4f"],[2.3,"#2d6a4f"],[2.7,"#2d6a4f"],[1.7,"#2d6a4f"],[2.2,"#c1272d"],[2.9,"#c1272d"],[2.3,"#c1272d"],[-2.8,"#c1272d"],[5.9,"#4361a6"],[1.9,"#4361a6"],[2.5,"#4361a6"],[2.8,"#4361a6"]];

export default async function OpengraphImage() {
  const [serif, serifItalic, sans] = await Promise.all([
    fetch(new URL("./og-fonts/Newsreader-Regular.ttf", import.meta.url)).then(r => r.arrayBuffer()),
    fetch(new URL("./og-fonts/Newsreader-Italic.ttf", import.meta.url)).then(r => r.arrayBuffer()),
    fetch(new URL("./og-fonts/DMSans-Medium.ttf", import.meta.url)).then(r => r.arrayBuffer()),
  ]);
  const max = Math.max(...BARS.map(b => Math.abs(b[0])));
  const BASE = 430; // baseline y
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0C0A08" }}>
        {/* background chart */}
        <div style={{ position: "absolute", left: 36, right: 36, top: 0, bottom: 0, display: "flex", gap: 6 }}>
          {BARS.map(([v, c], i) => {
            const h = (Math.abs(v) / max) * 300;
            return (
              <div key={i} style={{ flex: 1, position: "relative", display: "flex" }}>
                <div style={{
                  position: "absolute", left: 0, right: 0,
                  top: v >= 0 ? BASE - h : BASE, height: v >= 0 ? h : h * 0.9,
                  background: c, opacity: 0.42, borderRadius: 3,
                }} />
              </div>
            );
          })}
        </div>
        {/* legibility wash */}
        <div style={{ position: "absolute", inset: 0, display: "flex",
          backgroundImage: "radial-gradient(ellipse 62% 58% at 50% 48%, rgba(12,10,8,.93) 0%, rgba(12,10,8,.6) 62%, rgba(12,10,8,.35) 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 34 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: "#F4F0EA", color: "#0C0A08", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Newsreader", fontSize: 22 }}>V</div>
            <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: 30, color: "#F4F0EA" }}>
              Vote&nbsp;<span style={{ fontFamily: "NewsreaderItalic", color: "#E0493A" }}>Unbiased</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Newsreader", fontSize: 84, lineHeight: 1.0, letterSpacing: "-0.03em", color: "#FFFEFC" }}>
            <div style={{ display: "flex" }}>The economy under every</div>
            <div style={{ display: "flex" }}>president,&nbsp;<span style={{ fontFamily: "NewsreaderItalic", color: "#E0493A" }}>in data.</span></div>
          </div>
          <div style={{ display: "flex", marginTop: 34, fontFamily: "DM Sans", fontSize: 19, letterSpacing: "0.16em", color: "#A69E92" }}>
            POLITICAL &amp; ECONOMIC INTELLIGENCE · NO SPIN
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: serif, weight: 400, style: "normal" },
        { name: "NewsreaderItalic", data: serifItalic, weight: 500, style: "normal" },
        { name: "DM Sans", data: sans, weight: 500, style: "normal" },
      ],
    }
  );
}
