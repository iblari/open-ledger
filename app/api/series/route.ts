import { NextResponse } from "next/server";
import { getSeries, getSeriesAsOf } from "@/lib/series";

/** GET /api/series?id=cpi_yoy[&c=USA,IRN] — an official time series from the catalog. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  const c = (u.searchParams.get("c") || "").split(",").filter(Boolean);
  const asof = u.searchParams.get("asof");
  try {
    if (asof) {
      const v = await getSeriesAsOf(id, asof);
      return NextResponse.json({ asOf: v }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
    }
    const s = await getSeries(id, c);
    if (!s) return NextResponse.json({ error: "unknown or empty series" }, { status: 404 });
    return NextResponse.json(s, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
