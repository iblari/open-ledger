import { ImageResponse } from "next/og";

/**
 * The link preview, generated rather than exported.
 *
 * public/og-image.png was a screenshot of a homepage that no longer exists:
 * it showed the scorecard heatmap (since removed) and a stat row reading
 * "19 · 4 · 5 · 32", including the active-conflicts figure that was cut. A
 * hand-made image is a copy of the site frozen at the moment someone
 * remembered to re-export it, and this is the single asset seen most by
 * people who have never visited — so it going stale is expensive.
 *
 * Built from the same tokens the site uses, so it changes when they do.
 * No external font fetch: a missing font at build time would fail the whole
 * route, and a serif stack renders close enough at this size to be worth
 * more than the fragility.
 */
export const runtime = "edge";
export const alt = "Vote Unbiased — every economic claim, checked against the data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const PAPER = "#FAF8F4";
  const INK = "#1a1a1a";
  const SUB = "#5c5856";
  const MUTE = "#9a9490";
  const ACCENT = "#b8372d";
  const RULE = "#e2ded6";

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        background: PAPER, padding: "68px 72px", justifyContent: "space-between",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* The lockup, rebuilt rather than imported — an <img> here would
              need a public URL and reintroduce the staleness problem. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 44 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 23, background: INK, color: PAPER,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 700,
            }}>V</div>
            <div style={{ display: "flex", fontSize: 30, color: INK }}>
              Vote&nbsp;<span style={{ color: ACCENT, fontStyle: "italic" }}>Unbiased</span>
            </div>
          </div>

          <div style={{
            display: "flex", flexDirection: "column",
            fontSize: 74, lineHeight: 1.06, color: INK, letterSpacing: "-0.025em",
          }}>
            <div style={{ display: "flex" }}>Every economic claim,</div>
            <div style={{ display: "flex" }}>
              checked against&nbsp;<span style={{ color: ACCENT, fontStyle: "italic" }}>the data.</span>
            </div>
          </div>

          <div style={{
            display: "flex", fontSize: 26, color: SUB, marginTop: 28, maxWidth: 900,
            fontFamily: "system-ui, sans-serif", lineHeight: 1.45,
          }}>
            Official broadcasts fact-checked live against BLS, BEA, Census and Fed series.
            You get the quote, the real figure and the source.
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderTop: `1px solid ${RULE}`, paddingTop: 26,
          fontFamily: "system-ui, sans-serif", fontSize: 20, color: MUTE,
        }}>
          <div style={{ display: "flex" }}>voteunbiased.org</div>
          <div style={{ display: "flex" }}>BLS · BEA · Census · Treasury · FHFA · FHWA</div>
        </div>
      </div>
    ),
    size
  );
}
