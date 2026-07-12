import { NextResponse } from "next/server";
import { getRecentBroadcasts } from "@/lib/live-kv";

/**
 * GET /api/live-recent — broadcasts from the last 24 hours, each with the
 * full set of fact-checked claims generated while it was live. Powers the
 * "Recent broadcasts" replay section on /live: watching back costs zero
 * additional Deepgram/Claude — the analysis was done once, live.
 */
export async function GET() {
  const recent = await getRecentBroadcasts();
  return NextResponse.json(
    { ok: true, recent },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
  );
}
