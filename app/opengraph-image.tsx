import { ImageResponse } from "next/og";
import { markSvg } from "@/lib/cheetah-mark";

/**
 * The link preview — what people see when the site is texted or posted.
 *
 * The mark on black, nothing else — no wordmark (iMessage prints the site
 * name under the card anyway) — the way Palantir and Apple
 * show up in an iMessage bubble. The cheetah (lib/cheetah-mark.ts) is drawn
 * in data bars with a red head: speed built out of data, "live" in red.
 *
 */
export const runtime = "edge";
export const alt = "Vote Unbiased";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = "data:image/svg+xml;base64," + btoa(markSvg({ bars: 7, id: "og", width: 720, height: 240 }));

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={720} height={240} alt="" style={{ marginTop: -10 }} />
      </div>
    ),
    { ...size }
  );
}
