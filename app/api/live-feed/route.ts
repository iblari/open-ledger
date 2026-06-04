import { NextResponse } from "next/server";
import {
  getLiveState,
  getLiveClaims,
  getClaimsSince,
  getLiveTranscript,
} from "@/lib/live-kv";

/**
 * GET /api/live-feed
 *
 * Public endpoint — the frontend polls this every 3-5 seconds during a live broadcast.
 *
 * Query params:
 *   ?since=ISO_TIMESTAMP — only return claims newer than this (saves bandwidth)
 *
 * Returns:
 *   { state: LiveState, claims: LiveClaim[], transcript: string }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");

  const state = await getLiveState();
  const transcript = await getLiveTranscript();

  let claims;
  if (since) {
    claims = await getClaimsSince(since);
  } else {
    claims = await getLiveClaims();
  }

  return NextResponse.json(
    { state: state || { status: "off" }, claims, transcript },
    {
      headers: {
        // Allow polling without stale caches
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
