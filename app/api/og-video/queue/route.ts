import { NextResponse } from "next/server";
import { getTrendingClaims } from "@/lib/trending-claims";
import { getSeries } from "@/lib/series";
import { VIDEO_METRICS, metricClipName } from "@/lib/og-media";

/** GET /api/og-video/queue — what the renderer should have on og-media:
 *  one clip per charted Trending claim, and one per metric (re-rendered
 *  whenever the metric's latest observation date changes). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const items = await getTrendingClaims().catch(() => []);
  const claims = items.filter(i => i.series?.series).map(i => ({ key: i.key, date: i.date }));
  const metrics = (await Promise.all(VIDEO_METRICS.map(async id => {
    const pts = (await getSeries(id).catch(() => null))?.lines[0]?.points;
    return pts?.length ? { id, name: metricClipName(id), date: pts[pts.length - 1].d } : null;
  }))).filter(Boolean);
  return NextResponse.json({ claims, metrics }, { headers: { "Cache-Control": "no-store" } });
}
