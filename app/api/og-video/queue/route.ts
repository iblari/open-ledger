import { NextResponse } from "next/server";
import { getTrendingClaims } from "@/lib/trending-claims";

/** GET /api/og-video/queue — which per-claim clips exist to be rendered
 *  (claims on the Trending feed that chart against an official series). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const items = await getTrendingClaims().catch(() => []);
  const claims = items.filter(i => i.series?.series).map(i => ({ key: i.key, date: i.date }));
  return NextResponse.json({ claims }, { headers: { "Cache-Control": "no-store" } });
}
