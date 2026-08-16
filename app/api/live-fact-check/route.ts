import { NextResponse } from "next/server";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";
import { upgradeUnverifiable } from "@/lib/web-verify";
import { appendClaimsToBroadcast, claimsNearTime, appendLiveClaims } from "@/lib/live-kv";

/**
 * POST /api/live-fact-check
 *
 * Client-driven fact-check path: the /live page sends ~15s transcript chunks
 * from caption-driven videos (demos, pasted YouTube URLs) plus rolling context.
 *
 * The prompt, model call, parsing, and ground-truth verification all live in
 * lib/fact-check — shared with /api/admin/ingest so the two paths can't drift.
 */
export async function POST(req: Request) {
  let body: { text?: string; context?: string; recentQuotes?: string[]; videoId?: string; videoTime?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim();
  const context = (body.context || "").trim();
  // Quotes of claims the client already has on screen — lets the server drop
  // re-statements ("15 million jobs" said three times in one speech).
  const recentQuotes = Array.isArray(body.recentQuotes)
    ? body.recentQuotes.filter((q): q is string => typeof q === "string").slice(0, 30)
    : [];

  if (!text || text.length < 30) {
    return NextResponse.json({ claims: [] });
  }

  // ── Answer from the record before spending credits ──
  // "Check this moment" is a button people press repeatedly, and on a replay
  // every viewer presses it at the same interesting passages. If this moment
  // has already been checked, return what's on the record: identical answer,
  // zero model or search spend.
  const videoId = typeof body.videoId === "string" ? body.videoId : null;
  const videoTime = typeof body.videoTime === "number" ? Math.round(body.videoTime) : null;
  if (videoId && videoTime != null) {
    const existing = await claimsNearTime(videoId, videoTime).catch(() => []);
    if (existing.length) {
      return NextResponse.json({ claims: existing, cached: true });
    }
  }

  // Cheap regex pre-filter: chunks with no economic content skip the model
  // call entirely. In a typical speech that's most chunks — the single
  // biggest latency/cost lever in the AUTOMATIC pipeline.
  //
  // It must NOT gate a manual check. Someone pressing "check this moment"
  // has explicitly asked, and silently answering "nothing here" because a
  // keyword regex didn't match is why the button felt broken — press it five
  // times, and the fifth window happens to contain a "%" so it "suddenly
  // works". One Haiku call is the right price for an explicit request.
  const isManual = /manually requested/i.test(context || "");
  if (!isManual && !likelyHasEconomicClaim(text)) {
    return NextResponse.json({ claims: [], skipped: "no-economic-content" });
  }

  const result = await extractAndVerifyClaims(
    `Context from earlier in the speech:\n"${context || "Start of broadcast"}"\n\nNew transcript chunk:\n"${text}"`,
    new URL(req.url).origin
  );

  if (result.error) {
    // Surface the upstream error so the UI can show a real message instead
    // of pretending no claims were found. 200 on purpose — the client
    // handles {error} in-band.
    return NextResponse.json(
      { error: result.error, detail: result.detail, claims: [] },
      { status: 200 }
    );
  }

  const claims = dedupeClaims(result.claims, recentQuotes).map(c => ({
    ...c,
    timestamp: new Date().toISOString(),
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  }));

  // Tier 3: search the live web for anything our datasets couldn't settle.
  try { await upgradeUnverifiable(claims, 8, `${context || ""}\n${text}`); } catch { /* keep original ratings */ }

  // ── Persist, so a manual check becomes part of the record ──
  // These are claims the automatic pass missed (or never reached, on a late
  // join). Saving them means the next viewer sees them without re-paying,
  // and they show up on the credibility timeline and in the export.
  if (claims.length) {
    const stamped = claims.map(c => ({ ...c, videoTime: videoTime ?? c.videoTime ?? 0 }));
    try {
      if (videoId) await appendClaimsToBroadcast(videoId, stamped);
      else await appendLiveClaims(stamped);
    } catch (e) {
      console.error("[manual-check] persist failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ claims });
}
