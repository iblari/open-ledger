import { NextRequest, NextResponse } from "next/server";
import {
  getRecentBroadcasts, setRecentBroadcasts, recordInLedger, claimOnce, type LiveClaim,
} from "@/lib/live-kv";
import { extractAndVerifyClaims } from "@/lib/fact-check";
import { likelyHasEconomicClaim, dedupeClaims } from "@/lib/claim-utils";
import { upgradeUnverifiable } from "@/lib/web-verify";

/**
 * POST /api/admin/check-claims  (auth: ADMIN_KEY)  { videoId? }
 *
 * Fact-checks the WHOLE transcript of a broadcast recovered after the fact.
 *
 * Recovered videos used to be handed to /api/admin/backfill, which exists to
 * repair late joins: it fact-checks only the stretch before our transcript
 * begins, sourced from YouTube captions. A recovered transcript begins at 0:00,
 * so backfill reported "no gap at the head" and checked nothing — and its
 * caption source is blocked anyway. The UN General Assembly address and the
 * 22 Sep Vance press conference sat in the archive fully transcribed, with
 * zero claims.
 *
 * Resumable: each call checks the next batch of windows after a stored cursor
 * and returns; the worker calls again until done. That keeps a two-hour speech
 * inside the five-minute function limit. With no videoId, it picks the next
 * recovered broadcast that still has unchecked transcript.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WINDOW_SEC = 45;        // the same span live coverage checks at a time
const BATCH = 12;             // windows per call
const PARALLEL = 4;

type Seg = { t: number; text: string };

function segments(transcript: string): Seg[] {
  const out: Seg[] = [];
  for (const m of transcript.matchAll(/\[(\d+):(\d\d)\]\s?([^[]*)/g)) {
    const text = m[3].trim();
    if (text) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out;
}

function windows(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  let cur: Seg | null = null;
  for (const s of segs) {
    if (!cur || s.t - cur.t >= WINDOW_SEC) { if (cur) out.push(cur); cur = { t: s.t, text: s.text }; }
    else cur.text += " " + s.text;
  }
  if (cur) out.push(cur);
  return out;
}

const cursorOf = (b: { claimsCheckedTo?: number }) => b.claimsCheckedTo ?? -1;

export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const origin = new URL(req.url).origin;

  const all = await getRecentBroadcasts() as (Awaited<ReturnType<typeof getRecentBroadcasts>>[number] & { claimsCheckedTo?: number })[];
  const pending = (b: typeof all[number]) => {
    if (b.source !== "on-demand" || !b.transcript) return false;
    const segs = segments(b.transcript);
    return segs.length > 0 && cursorOf(b) < segs[segs.length - 1].t;
  };
  const b = body.videoId ? all.find(x => x.videoId === body.videoId) : all.find(pending);
  if (!b) return NextResponse.json({ target: null });
  if (!pending(b)) return NextResponse.json({ target: b.videoId, done: true, added: 0 });

  // One pass at a time per broadcast; two overlapping calls would check the
  // same windows twice and race on the save.
  if (!(await claimOnce(`checkclaims:lease:${b.videoId}:${cursorOf(b)}`, 280))) {
    return NextResponse.json({ target: b.videoId, busy: true });
  }

  const todo = windows(segments(b.transcript!)).filter(w => w.t > cursorOf(b)).slice(0, BATCH);
  const seen = b.claims.map(c => c.quote);
  const fresh: LiveClaim[] = [];

  for (let i = 0; i < todo.length; i += PARALLEL) {
    const results = await Promise.all(todo.slice(i, i + PARALLEL).map(async w => {
      if (!likelyHasEconomicClaim(w.text)) return [] as LiveClaim[];
      try {
        const mm = Math.floor(w.t / 60), ss = String(w.t % 60).padStart(2, "0");
        const res = await extractAndVerifyClaims(`Broadcast transcript (at ${mm}:${ss}):\n"${w.text}"`, origin);
        const mapped: LiveClaim[] = res.claims.map(v => ({
          ...v,
          // Transcript times come from the recording itself, so the window
          // start is already on the video's clock; realign sharpens it to the
          // exact word afterwards.
          videoTime: w.t,
          timestamp: new Date(Date.parse(b.startedAt) + w.t * 1000).toISOString(),
          id: `check-${b.videoId}-${w.t}-${Math.random().toString(36).slice(2, 6)}`,
        }));
        await upgradeUnverifiable(mapped, 6, w.text).catch(() => {});
        return mapped;
      } catch { return [] as LiveClaim[]; }
    }));
    for (const r of results) {
      const kept = dedupeClaims(r, seen);
      kept.forEach(c => seen.push(c.quote));
      fresh.push(...kept);
    }
  }

  // Re-read before writing: the store may have changed while we were checking.
  const latest = await getRecentBroadcasts() as typeof all;
  const target = latest.find(x => x.videoId === b.videoId);
  if (!target) return NextResponse.json({ error: "broadcast vanished during check" }, { status: 409 });
  target.claims = [...target.claims, ...fresh].sort((x, y) => (x.videoTime ?? 0) - (y.videoTime ?? 0));
  target.claimsCheckedTo = todo.length ? todo[todo.length - 1].t : Number.MAX_SAFE_INTEGER;
  await setRecentBroadcasts(latest);
  // The ledger recorded this broadcast at archive time, before any claims
  // existed; without this it would stay at zero and never reach the topic chart.
  await recordInLedger(target).catch(() => null);

  const segs = segments(target.transcript || "");
  const done = !segs.length || target.claimsCheckedTo >= segs[segs.length - 1].t;
  console.log(`[check-claims] ${b.videoId}: +${fresh.length} claims, checked to ${target.claimsCheckedTo}s, ${done ? "done" : "more to do"}`);
  return NextResponse.json({ target: b.videoId, added: fresh.length, total: target.claims.length, done });
}
