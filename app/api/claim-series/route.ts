import { NextResponse } from "next/server";
import { listTrendingClaims } from "@/lib/trending-claims";
import { getClaimSeries } from "@/lib/claim-series";

/** GET /api/claim-series?key=… — which official series charts this claim (built on first request). */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || "";
  try {
    const c = (await listTrendingClaims()).find(x => x.key === key);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ series: await getClaimSeries(c) }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
