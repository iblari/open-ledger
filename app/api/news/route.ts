import { NextResponse } from "next/server";
import { getNewsFeed, refreshNews } from "@/lib/news/store";

/** GET /api/news — the current News feed (stories, coverage, blindspots, number checks). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  let f = await getNewsFeed();
  // First run (or a stale store): build it now.
  if (!f || Date.now() - Date.parse(f.at) > 3 * 3600_000) f = await refreshNews().catch(() => f);
  return NextResponse.json(f ?? { stories: [] }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
