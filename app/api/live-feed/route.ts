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

  // HOT-PATH OPTIMIZATION: this endpoint is polled by EVERY /live visitor
  // (every 30s idle, every 3s while watching), and the broadcast is "off"
  // the vast majority of the time. When off:
  //   - skip the transcript + claims reads entirely (3 KV reads → 1; the
  //     client ignores both fields when status is off anyway), and
  //   - let the CDN absorb the polling fan-out for 15s — with N concurrent
  //     visitors the function runs ~4×/min total instead of N×2/min.
  // Worst-case cost: a freshly started broadcast surfaces ≤15s later,
  // which is under the idle poll interval already.
  if (!state || state.status !== "live") {
    return NextResponse.json(
      { state: state || { status: "off" }, claims: [], transcript: "" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  }

  // Live: reads in PARALLEL (was sequential — 3 round-trips of latency on
  // the most latency-sensitive path in the product).
  const [transcript, claims] = await Promise.all([
    getLiveTranscript(),
    since ? getClaimsSince(since) : getLiveClaims(),
  ]);

  return NextResponse.json(
    { state, claims, transcript },
    {
      headers: {
        // During a live broadcast every poll must be fresh.
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
