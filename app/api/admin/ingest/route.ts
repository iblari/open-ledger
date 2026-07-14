import { NextResponse } from "next/server";
import {
  appendLiveClaims,
  appendLiveTranscript,
  type LiveClaim,
} from "@/lib/live-kv";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";

/**
 * POST /api/admin/ingest
 *
 * Receives transcript text from the broadcast worker (scripts/go-live.mjs),
 * fact-checks it via the shared lib/fact-check pipeline, and stores the
 * results for live viewers.
 *
 * Body: { text: string, videoTime?: number }
 *   - text: ~15 seconds of transcript text
 *   - videoTime: seconds into the broadcast (for seeking)
 *
 * Protected by ADMIN_KEY.
 */

// Ring buffer of recently persisted claim quotes, used to drop re-statements
// across chunks. Module-level state: the worker posts sequentially every ~15s,
// so the serverless container stays warm for the duration of a broadcast.
// Worst case (cold start mid-broadcast) we lose the buffer and a duplicate
// slips through — harmless, and the client-side dedup is a second net.
const recentQuotes: string[] = [];
const RECENT_QUOTES_MAX = 40;

export async function POST(req: Request) {
  // Auth
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "ADMIN_KEY not configured" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string; videoTime?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const videoTime = body.videoTime || 0;

  if (!text || text.length < 20) {
    return NextResponse.json({ skipped: true, reason: "text too short" });
  }

  // Append to the running session transcript (atomic Redis APPEND). The full
  // text powers the replay view and lets us audit exactly what the detector
  // heard; timecode markers keep the audit readable. Runs even for chunks
  // the economic pre-filter skips — viewers still see the rolling subtitle.
  {
    const tmm = Math.floor(videoTime / 60);
    const tss = String(Math.floor(videoTime % 60)).padStart(2, "0");
    await appendLiveTranscript(`[${tmm}:${tss}] ${text}\n`);
  }

  // Regex pre-filter: no economic content → no Claude call. Saves ~$/hr and
  // keeps the pipeline snappy during non-economic stretches of a broadcast.
  if (!likelyHasEconomicClaim(text)) {
    return NextResponse.json({ claims: [], skipped: "no-economic-content" });
  }

  const mm = Math.floor(videoTime / 60);
  const ss = String(Math.floor(videoTime % 60)).padStart(2, "0");
  const result = await extractAndVerifyClaims(
    `Live broadcast transcript chunk (at ${mm}:${ss}):\n"${text}"`
  );

  if (result.error) {
    console.error("[ingest] fact-check error:", result.error, result.detail);
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: 200 }
    );
  }

  const fresh = dedupeClaims(result.claims, recentQuotes);
  if (fresh.length > 0) {
    const claims: LiveClaim[] = fresh.map(verified => ({
      ...verified,
      videoTime,
      timestamp: new Date().toISOString(),
      id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }));

    await appendLiveClaims(claims);
    for (const c of claims) {
      recentQuotes.push(c.quote);
      if (recentQuotes.length > RECENT_QUOTES_MAX) recentQuotes.shift();
    }
    console.log(`[ingest] ${claims.length} claims found at ${videoTime}s`);
    return NextResponse.json({ claims });
  }

  return NextResponse.json({ claims: [] });
}
