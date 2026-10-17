import { NextResponse } from "next/server";
import { getTrendingClaims } from "@/lib/trending-claims";
import type { ClaimChart } from "@/lib/claim-chart";
import { saneContext } from "@/lib/chart-format";

/** An evidence chart needs at least two verified bars, or a dated series. */
function chartable(c?: ClaimChart | null): boolean {
  if (!c) return false;
  const bars = (c.data ? 1 : 0) + (c.data && c.said ? 1 : 0) + saneContext(c.context, c.data?.value, c.said?.value).length;
  return bars >= 2 || c.points.length >= 4;
}

/** GET /api/trending-claims — True / Mostly true / False claims, newest first, with charts. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // Only claims that chart against an official series (interactive chart).
    const items = (await getTrendingClaims()).filter(i => i.series?.series || chartable(i.chart));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
