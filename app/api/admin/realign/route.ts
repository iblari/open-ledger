import { NextRequest, NextResponse } from "next/server";
import { claimNextAlignment, getReplayableClaims, setAlignment, getLedger, getAlignment, clearAlignment, alignmentsToVerify, alignedDuration } from "@/lib/live-kv";
import { alignClaims, transcriptFromUtterances, type Word } from "@/lib/align";

/**
 * Worker side of post-broadcast alignment (auth: ADMIN_KEY).
 *
 * GET  → { target: { videoId, title } | null }   next broadcast to re-time
 * GET ?verify=1 → { list }   recent alignments to re-check against YouTube's current length
 * POST { videoId, verify: { length } }  → the recording YouTube serves now is `length`
 *      seconds. If that differs from what was transcribed (YouTube trimmed or
 *      re-processed the stream), the alignment is dropped and the broadcast re-timed.
 * POST { videoId, words: [[word, start], …], utterances: [[start, text], …] }
 *      → matches every claim's quote against the recording's own words.
 *
 * The worker does the downloading and transcribing, because that needs the
 * residential proxy and can take minutes. The matching happens here, so there
 * is one implementation of it, next to the data it rewrites.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  return Boolean(key) && req.headers.get("authorization") === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("verify")) return NextResponse.json({ list: await alignmentsToVerify() });
  return NextResponse.json({ target: await claimNextAlignment() });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as {
    videoId?: string; words?: [string, number][]; utterances?: [number, string][]; error?: string; duration?: number; verify?: { length?: number };
  } | null;
  if (!body?.videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  if (body.verify) {
    const len = Number(body.verify.length);
    const a = await getAlignment(body.videoId);
    if (!a || !Number.isFinite(len) || len <= 0) return NextResponse.json({ ok: false });
    const was = alignedDuration(a);
    // The transcript ends at the last spoken line, a little before the end of
    // the recording; a stored duration is exact.
    const stale = was != null && (a.duration ? Math.abs(len - was) > Math.max(15, was * 0.01) : (len < was - 10 || len > was + 300));
    if (stale) {
      await clearAlignment(body.videoId);
      console.warn(`[realign] ${body.videoId}: YouTube length ${len}s vs aligned ${was}s — re-timing`);
      return NextResponse.json({ ok: true, stale: true, was, now: len });
    }
    await setAlignment(body.videoId, { ...a, duration: a.duration ?? len, verifiedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, stale: false });
  }
  if (body.error) {
    // The lease expires on its own and the tries counter caps retries, so a
    // failure needs no bookkeeping here beyond being visible in the logs.
    console.warn(`[realign] ${body.videoId} failed on worker: ${body.error}`);
    return NextResponse.json({ ok: false });
  }

  // Broadcasts queued only for their transcript (the backfill) may have no
  // stored claims beyond the ledger's slim copy — or none at all. They still
  // get an alignment record, which is where the transcript lives.
  let claims: { quote: string; videoTime?: number }[] | null = await getReplayableClaims(body.videoId);
  if (!claims) {
    const e = (await getLedger().catch(() => [])).find(x => x.videoId === body.videoId);
    if (!e) return NextResponse.json({ error: "not replayable" }, { status: 404 });
    claims = e.claims.filter(c => c.quote).map(c => ({ quote: c.quote, videoTime: c.videoTime }));
  }
  const words: Word[] = (body.words || [])
    .map(([w, s]) => ({ w: String(w).toLowerCase().replace(/(\d),(?=\d)/g, "$1").replace(/[^a-z0-9%$.]/g, "").replace(/\.$/, ""), s: Number(s) }))
    .filter(x => x.w && Number.isFinite(x.s));
  // A recording with almost no words is a failed transcription, not a silent
  // speech; writing it would re-time every claim against nothing.
  if (words.length < 50) return NextResponse.json({ error: "too few words to align", words: words.length }, { status: 422 });

  const r = alignClaims(claims.map(c => ({ quote: c.quote, videoTime: c.videoTime })), words);
  await setAlignment(body.videoId, {
    alignedAt: new Date().toISOString(),
    times: r.times, offset: r.offset, matched: r.matched, total: r.total,
    duration: Number(body.duration) > 0 ? Number(body.duration) : (words.length ? Math.ceil(words[words.length - 1].s) : undefined),
    verifiedAt: new Date().toISOString(),
    transcript: transcriptFromUtterances((body.utterances || []).map(([start, text]) => ({ start: Number(start), text: String(text) }))),
  });
  console.log(`[realign] ${body.videoId}: ${r.matched}/${r.total} claims located, offset ${r.offset}s, ${words.length} words`);
  return NextResponse.json({ ok: true, matched: r.matched, total: r.total, offset: r.offset });
}
