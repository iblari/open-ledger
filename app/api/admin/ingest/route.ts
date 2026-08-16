import { NextResponse } from "next/server";
import {
  appendLiveClaims,
  appendLiveTranscript,
  type LiveClaim,
} from "@/lib/live-kv";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { extractPromises } from "@/lib/promise-extract";
import { getPromises, setPromises, getLiveState } from "@/lib/live-kv";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";
import { upgradeUnverifiable } from "@/lib/web-verify";
import { sendPushToAll } from "@/lib/push";

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

  let body: { text?: string; videoTime?: number; context?: string };
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

  // ── Promise capture (Promise Tracker) ──
  // A cheap future-tense gate keeps this to a handful of calls per broadcast:
  // most speech is about the past. Fire-and-forget so it never delays the
  // live fact-check path.
  if (/\b(will|going to|gonna|we'll|i'll|by (?:20\d\d|the end of)|within \w+ (?:year|month|day)s?|promise|pledge|commit)\b/i.test(text)
      && /\d/.test(text)) {
    void capturePromises(text, videoTime);
  }

  // Regex pre-filter: no economic content → no Claude call. Saves ~$/hr and
  // keeps the pipeline snappy during non-economic stretches of a broadcast.
  if (!likelyHasEconomicClaim(text)) {
    return NextResponse.json({ claims: [], skipped: "no-economic-content" });
  }

  const mm = Math.floor(videoTime / 60);
  const ss = String(Math.floor(videoTime % 60)).padStart(2, "0");
  // Context is what the speaker said just before. Without it the extractor
  // has no antecedent for "they", "it" or "that number", and a claim split
  // across a chunk boundary is unreadable.
  const context = typeof body.context === "string" ? body.context.slice(0, 1500) : "";
  const result = await extractAndVerifyClaims(
    [
      context ? `Said just before (context only — do NOT extract claims from this):\n"${context}"\n` : "",
      `Live broadcast transcript chunk (at ${mm}:${ss}) — extract claims from THIS:\n"${text}"`,
    ].join("\n"),
    new URL(req.url).origin
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

    // Tier 3: anything our own data couldn't settle goes to live web search
    // before publication. "Unverifiable" must mean nobody can settle it —
    // not that it was missing from our tables. Bounded to 3 per chunk so a
    // slow search can never stall coverage.
    try {
      await upgradeUnverifiable(claims, 8, text);
    } catch (e) {
      console.error("[ingest] web verification skipped:", (e as Error).message);
    }

    await appendLiveClaims(claims);

    // ── Batched contradiction digest (design decision: batched, not
    // per-claim). A 40-minute briefing with 8 false claims must not fire 8
    // lock-screen buzzes — that's how people unsubscribe. We roll up
    // contradicted claims and notify at most once every 10 minutes, and
    // never for claims that match the data.
    void maybeNotifyContradictions(claims);


    for (const c of claims) {
      recentQuotes.push(c.quote);
      if (recentQuotes.length > RECENT_QUOTES_MAX) recentQuotes.shift();
    }
    console.log(`[ingest] ${claims.length} claims found at ${videoTime}s`);
    return NextResponse.json({ claims });
  }

  return NextResponse.json({ claims: [] });
}


/** Store any forward-looking quantified commitments heard in this chunk. */
async function capturePromises(text: string, videoTime: number) {
  try {
    const state = await getLiveState();
    const found = await extractPromises(text, {
      speaker: "Official speaker",
      admin: "trump2",
      spokenAt: new Date().toISOString().slice(0, 10),
      sourceTitle: state?.title || "Live broadcast",
      sourceUrl: state?.videoId ? `https://www.youtube.com/watch?v=${state.videoId}` : null,
      videoTime,
      defaultDeadline: "2029-01-20",
    });
    if (!found.length) return;
    const file = await getPromises();
    const existing = file?.promises ?? [];
    const seen = new Set(existing.map(p => p.quote.toLowerCase().slice(0, 60)));
    const fresh = found.filter(p => !seen.has(p.quote.toLowerCase().slice(0, 60)));
    if (!fresh.length) return;
    await setPromises({
      generatedAt: new Date().toISOString(),
      method: file?.method || "Promises captured verbatim, scored deterministically against official series.",
      promises: [...existing, ...fresh],
    });
    console.log(`[PROMISES] captured ${fresh.length} from live chunk @${videoTime}s`);
  } catch (e) {
    console.error("[PROMISES] capture failed:", (e as Error).message);
  }
}


// ── Contradiction digest state (module-scoped; a serverless instance lives
// for the duration of a broadcast, which is exactly the batching window we
// want — a cold start simply resets the timer).
let lastDigestAt = 0;
let pendingContradictions: { quote: string; actual: string }[] = [];
const DIGEST_INTERVAL_MS = 10 * 60 * 1000;

async function maybeNotifyContradictions(claims: LiveClaim[]) {
  const fresh = claims.filter(c => c.rating === "FALSE" || c.rating === "MISLEADING");
  if (fresh.length) {
    pendingContradictions.push(...fresh.map(c => ({ quote: c.quote, actual: c.actual })));
  }
  if (!pendingContradictions.length) return;

  const now = Date.now();
  if (lastDigestAt && now - lastDigestAt < DIGEST_INTERVAL_MS) return;
  lastDigestAt = now;

  const batch = pendingContradictions;
  pendingContradictions = [];

  // Lock-screen copy carries the quote and the real figure, so the alert is
  // useful without opening the app (spec 2a).
  const first = batch[0];
  const title = batch.length === 1
    ? "Claim contradicted by the data"
    : `${batch.length} claims contradicted so far`;
  const body = batch.length === 1
    ? `"${first.quote.slice(0, 90)}" — ${first.actual.slice(0, 110)}`
    : `Latest: "${first.quote.slice(0, 70)}" — ${first.actual.slice(0, 90)}`;

  try {
    const r = await sendPushToAll({ title, body, url: "/live" });
    console.log(`[digest] ${batch.length} contradictions → ${r.sent} devices`);
  } catch (e) {
    console.error("[digest] push failed:", (e as Error).message);
  }
}
