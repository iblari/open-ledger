import { NextRequest, NextResponse } from "next/server";
import { getRecentBroadcasts, setRecentBroadcasts, type LiveClaim } from "@/lib/live-kv";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";
import { upgradeUnverifiable } from "@/lib/web-verify";

export const maxDuration = 300;

/**
 * POST /api/admin/backfill  (auth: ADMIN_KEY)  { videoId?, checkClaims?, limit? }
 *
 * Repairs LATE JOINS. The watcher can only start covering a stream once
 * YouTube reports it live, so a broadcast already in progress is captured
 * from the moment we arrive — one archived Cabinet meeting has no transcript
 * before 29:15 because that's when we joined a stream already running.
 *
 * Once the stream ends YouTube publishes captions for the WHOLE video, so the
 * missing head can be recovered after the fact: we pull those captions, splice
 * the portion that predates our own transcript, and (optionally) run the full
 * fact-check chain over it so the early claims get checked too.
 *
 * Bounded per call and idempotent — re-running only ever fills what's absent.
 */
export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const origin = new URL(req.url).origin;
  const wantChecks = body.checkClaims !== false;
  const windowLimit = Math.min(Number(body.limit) || 8, 14);

  const broadcasts = await getRecentBroadcasts();
  const targets = body.videoId
    ? broadcasts.filter(b => b.videoId === body.videoId)
    : broadcasts;
  if (!targets.length) return NextResponse.json({ error: "no matching broadcast" }, { status: 404 });

  const report: Record<string, unknown>[] = [];

  for (const b of targets) {
    const existing = b.transcript || "";
    const marks = [...existing.matchAll(/\[(\d+):(\d\d)\]/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
    const ourStart = marks.length ? Math.min(...marks) : Infinity;
    if (ourStart <= 30) { report.push({ videoId: b.videoId, skipped: "no gap at the head" }); continue; }

    // YouTube captions for the finished stream.
    let segments: { time: number; text: string }[] = [];
    try {
      const r = await fetch(`${origin}/api/fetch-transcript`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${b.videoId}` }),
        signal: AbortSignal.timeout(45_000),
      });
      const j = await r.json();
      segments = Array.isArray(j.segments) ? j.segments : [];
    } catch (e) {
      report.push({ videoId: b.videoId, error: (e as Error).message });
      continue;
    }
    const missing = segments.filter(s => s.time < ourStart);
    if (!missing.length) { report.push({ videoId: b.videoId, skipped: "captions unavailable for the gap" }); continue; }

    // Splice the recovered head in front of our own transcript, using the
    // same [mm:ss] marker format so the replay renders it identically.
    const head = missing
      .map(s => `[${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, "0")}] ${s.text}`)
      .join("\n");
    b.transcript = `${head}\n${existing}`;

    // Fact-check the recovered portion so early claims aren't lost either.
    let added = 0;
    if (wantChecks) {
      const seen = b.claims.map(c => c.quote);
      const windows = missing.filter(s => likelyHasEconomicClaim(s.text)).slice(0, windowLimit);
      for (const w of windows) {
        try {
          const res = await extractAndVerifyClaims(
            `Broadcast transcript (at ${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, "0")}):\n"${w.text}"`,
            origin
          );
          const fresh = dedupeClaims(res.claims, seen);
          if (!fresh.length) continue;
          const mapped: LiveClaim[] = fresh.map(v => ({
            ...v,
            videoTime: Math.round(w.time),
            timestamp: new Date().toISOString(),
            id: `backfill-${b.videoId}-${Math.round(w.time)}-${Math.random().toString(36).slice(2, 6)}`,
          }));
          await upgradeUnverifiable(mapped, 2, w.text).catch(() => {});
          b.claims.push(...mapped);
          mapped.forEach(m => seen.push(m.quote));
          added += mapped.length;
        } catch { /* keep going; a single window failing shouldn't abort */ }
      }
      b.claims.sort((x, y) => (x.videoTime ?? 0) - (y.videoTime ?? 0));
    }

    report.push({
      videoId: b.videoId,
      recoveredFrom: `0:00 → ${Math.floor(ourStart / 60)}:${String(ourStart % 60).padStart(2, "0")}`,
      segmentsAdded: missing.length,
      claimsAdded: added,
    });
  }

  await setRecentBroadcasts(broadcasts);
  return NextResponse.json({ ok: true, report });
}
