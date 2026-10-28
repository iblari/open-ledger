import { NextResponse } from "next/server";
import { getNewsFeed, refreshNews, storiesSince } from "@/lib/news/store";
import { blindspotLabel } from "@/lib/news/engine";
import { storyImage, storyDataLine } from "@/lib/news/share";

/**
 * GET /api/news[?since=ISO][&limit=N] — the News feed: stories, coverage by
 * lean, blindspots and number checks. `since` returns only stories whose
 * counts changed after that time (each story's `updatedAt`).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const since = u.searchParams.get("since");
  const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit") || "0", 10) || 0, 0), 80) || null;
  let f = await getNewsFeed();
  // First run (or a stale store): build it now.
  if (!f || Date.now() - Date.parse(f.at) > 3 * 3600_000) f = await refreshNews().catch(() => f);
  const stories = storiesSince(f, since, limit).map(s => ({
    ...s, blindspotLabel: blindspotLabel(s.blindspot), image: storyImage(s), dataLine: storyDataLine(s), url: `https://voteunbiased.org/news/${s.slug}`,
  }));
  return NextResponse.json(f ? { ...f, since: since || null, stories } : { stories: [] },
    { headers: { "Cache-Control": since ? "public, s-maxage=60" : "public, s-maxage=300, stale-while-revalidate=900", "Access-Control-Allow-Origin": "*" } });
}
