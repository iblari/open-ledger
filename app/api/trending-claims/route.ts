import { NextResponse } from "next/server";
import { getTrendingClaims } from "@/lib/trending-claims";

/** GET /api/trending-claims — True / Mostly true / False claims, newest first, with charts. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // Only claims that chart against an official series (interactive chart).
    const items = (await getTrendingClaims()).filter(i => i.series?.series);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
