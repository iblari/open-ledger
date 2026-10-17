import { NextResponse } from "next/server";
import { listTrendingClaims } from "@/lib/trending-claims";
import { getClaimChart } from "@/lib/claim-chart";

/** GET /api/claim-chart?key=… — the chart for one listed claim, built on first
 *  request (only claims on the Trending feed can be built). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") || "";
  try {
    const c = (await listTrendingClaims()).find(x => x.key === key);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    const chart = await getClaimChart(c);
    return NextResponse.json({ chart }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
