import { NextResponse } from "next/server";
import { getTrendsFeed } from "@/lib/live-kv";

/** GET /api/trends — the "What's Changing in America" homepage feed. */
export async function GET() {
  const feed = await getTrendsFeed();
  if (!feed) {
    return NextResponse.json({ trends: [] }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  }
  return NextResponse.json(feed, {
    // Refreshed monthly; an hour of CDN cache keeps this endpoint ~free.
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
