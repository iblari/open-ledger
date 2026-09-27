import { ImageResponse } from "next/og";
import { markSvg } from "@/lib/cheetah-mark";

/**
 * The link preview — what people see when the site is texted or posted.
 *
 * The mark and the name on black, nothing else — the way Palantir and Apple
 * show up in an iMessage bubble. The cheetah (lib/cheetah-mark.ts) is drawn
 * in data bars with a red head: speed built out of data, "live" in red.
 *
 * Fonts ship with the route (app/og-fonts) rather than being fetched from a
 * CDN at render time, so the preview can't silently fall back to a default.
 */
export const runtime = "edge";
export const alt = "Vote Unbiased";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = "data:image/svg+xml;base64," + btoa(markSvg({ bars: 7, id: "og", width: 660, height: 220 }));

export default async function OpengraphImage() {
  const [serif, serifItalic] = await Promise.all([
    fetch(new URL("./og-fonts/Newsreader-Regular.ttf", import.meta.url)).then(r => r.arrayBuffer()),
    fetch(new URL("./og-fonts/Newsreader-Italic.ttf", import.meta.url)).then(r => r.arrayBuffer()),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={660} height={220} alt="" style={{ marginTop: 20 }} />
        <div style={{ display: "flex", marginTop: 48, fontFamily: "Newsreader", fontSize: 54, letterSpacing: "-0.02em", color: "#F5F5F2" }}>
          Vote&nbsp;<span style={{ fontFamily: "NewsreaderItalic", color: "#E0493A" }}>Unbiased</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: serif, weight: 400, style: "normal" },
        { name: "NewsreaderItalic", data: serifItalic, weight: 500, style: "normal" },
      ],
    }
  );
}
