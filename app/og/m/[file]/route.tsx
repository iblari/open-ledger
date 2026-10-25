import { ImageResponse } from "next/og";
import { getSeries } from "@/lib/series";
import { buildOgChart, OgChartSvg, OgBrand, ogFonts, fit, OG_SIZE } from "@/lib/og-chart";
import { shareSeriesFor, sourceLabel } from "@/lib/metric-share";

/**
 * GET /og/m/{metric}.png — the share card for a dashboard metric: the
 * series name, its latest reading and date, the change on a year earlier,
 * and five years of the line. Neutral by design: no verdict, no claim.
 */
export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = shareSeriesFor(file.replace(/\.png$/i, ""));
  const [sd, fonts] = await Promise.all([id ? getSeries(id).catch(() => null) : null, ogFonts()]);
  const c = sd ? buildOgChart(sd, { W: 1072, H: 250 }) : null;
  if (!sd || !c) return new Response("not found", { status: 404 });
  const col = "#F4F0EA";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0C0A08", color: "#F4F0EA", padding: "52px 64px 44px", fontFamily: "Sans" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 21, letterSpacing: 3, color: "#A39D93" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: "#E0493A" }} />
            OFFICIAL DATA · LATEST {c.valueDate.toUpperCase()}
          </div>
          <div>{sourceLabel(id, sd.source).toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", marginTop: 22, fontFamily: "Serif", fontSize: 46, lineHeight: 1.1, maxWidth: 1072 }}>{fit(sd.label, 70)}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 10 }}>
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: 96, lineHeight: 1 }}>{c.value}</div>
          {c.change && <div style={{ display: "flex", fontSize: 28, color: "#D8D2C8" }}>{c.change}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <OgChartSvg c={c} color={col} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 19, color: "#7A746C", marginTop: 12 }}>
            <span>{c.from}–{c.to}</span>
            <OgBrand size={28} />
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
