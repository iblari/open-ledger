import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-chart";
import { markSvg } from "@/lib/cheetah-mark";
import { STATES } from "@/lib/midterms";

/** 1080×1920 "I voted" story card for Instagram/Snapchat stories. No party, no candidate. */
export const runtime = "nodejs";
const uri = (svg: string) => "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const MARK = uri(markSvg({ ink: "#14110E", accent: "#C8102E", bars: 7, id: "iv", width: 360, height: 120 }));
const ALL_STATES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

export async function GET(req: Request) {
  const st = (new URL(req.url).searchParams.get("st") || "").toUpperCase();
  const name = ALL_STATES[st] || STATES.find(s => s.st === st)?.name || "";
  const fonts = await ogFonts({ bold: true });
  return new ImageResponse((
    <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F7F4EF", color: "#14110E", fontFamily: "Sans", position: "relative" }}>
      <div style={{ position: "absolute", inset: 48, border: "3px solid #14110E", borderRadius: 48, display: "flex" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={360} height={120} alt="" />
      <div style={{ fontFamily: "Serif", fontSize: 200, lineHeight: 1, marginTop: 90, letterSpacing: "-0.03em" }}>I voted.</div>
      <div style={{ fontFamily: "Serif", fontSize: 72, color: "#C8102E", marginTop: 34 }}>I checked the data first.</div>
      <div style={{ fontSize: 40, letterSpacing: "0.16em", color: "#6B655C", marginTop: 110, fontWeight: 700 }}>{`${name ? name.toUpperCase() + " · " : ""}NOV 3, 2026`}</div>
      <div style={{ display: "flex", gap: 14, marginTop: 50 }}>
        <div style={{ width: 150, height: 26, background: "#4361A6", borderRadius: 8 }} />
        <div style={{ width: 150, height: 26, background: "#FFFFFF", border: "3px solid #CFC9BF", borderRadius: 8 }} />
        <div style={{ width: 150, height: 26, background: "#B8372D", borderRadius: 8 }} />
      </div>
      <div style={{ position: "absolute", bottom: 150, fontSize: 46, fontWeight: 700, display: "flex" }}>voteunbiased.org</div>
    </div>
  ), { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
