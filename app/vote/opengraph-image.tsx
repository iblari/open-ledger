import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-chart";
import { markSvg } from "@/lib/cheetah-mark";

/** Still preview for /vote: the last frame of its og:video (where video doesn't play). */
export const alt = "Check the data first. Compare the candidates on your ballot.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ ink: "#EDE7DE", accent: "#E0493A", bars: 7, id: "vog", width: 450, height: 150 })).toString("base64");

export default async function Image() {
  const fonts = await ogFonts({ bold: true });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: "radial-gradient(ellipse at 50% 42%, #1c1915 0%, #0A0806 72%)", fontFamily: "Sans" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK} width={450} height={150} alt="" style={{ marginTop: 70 }} />
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: 96, color: "#F7F4EF", marginTop: 48, letterSpacing: "-0.02em" }}>Check the data first.</div>
        <div style={{ display: "flex", marginTop: 34 }}>
          <div style={{ width: 130, height: 10, background: "#4361a6" }} /><div style={{ width: 130, height: 10, background: "#F7F4EF" }} /><div style={{ width: 130, height: 10, background: "#b8372d" }} />
        </div>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: 5, color: "#E0493A", marginTop: 42 }}>VOTEUNBIASED.ORG/VOTE</div>
      </div>
    ),
    { ...size, fonts },
  );
}
