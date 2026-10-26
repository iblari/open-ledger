import { ImageResponse } from "next/og";
import { stateByCode, raceTitle, daysToElection } from "@/lib/midterms";
import { ogFonts, OgBrand } from "@/lib/og-chart";

export const alt = "Compare the candidates on your 2026 ballot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ st: string }> }) {
  const { st } = await params;
  const s = stateByCode(st);
  const fonts = await ogFonts();
  const days = daysToElection();
  const races = s ? s.races : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "52px 64px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 3, color: "#A39D93" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 14, height: 14, borderRadius: 7, background: "#E0493A" }} />2026 BALLOT · SIDE BY SIDE</div>
          <div>{days > 0 ? `ELECTION DAY NOV 3 · ${days} DAYS` : "ELECTION DAY NOV 3"}</div>
        </div>
        <div style={{ display: "flex", fontFamily: "Serif", fontSize: 72, marginTop: 30 }}>{s ? s.name : "Your state"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 24 }}>
          {races.slice(0, 3).map(r => (
            <div key={r.id} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, letterSpacing: 3, color: "#E0493A" }}>{raceTitle(r).toUpperCase()}</div>
              <div style={{ display: "flex", fontFamily: "Serif", fontSize: races.length > 2 ? 34 : 42, marginTop: 4 }}>
                {r.candidates.filter(c => c.main).slice(0, 3).map(c => c.name).join("  vs  ")}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 26, color: "#C9C2B8", maxWidth: 700 }}>Money, voting record and their own words. Facts only.</div>
          <OgBrand size={30} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
