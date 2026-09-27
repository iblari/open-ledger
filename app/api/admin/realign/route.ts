import { NextRequest, NextResponse } from "next/server";
import { claimNextAlignment, getReplayableClaims, setAlignment } from "@/lib/live-kv";
import { alignClaims, transcriptFromUtterances, type Word } from "@/lib/align";

/**
 * Worker side of post-broadcast alignment (auth: ADMIN_KEY).
 *
 * GET  → { target: { videoId, title } | null }   next broadcast to re-time
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
  return NextResponse.json({ target: await claimNextAlignment() });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as {
    videoId?: string; words?: [string, number][]; utterances?: [number, string][]; error?: string;
  } | null;
  if (!body?.videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  if (body.error) {
    // The lease expires on its own and the tries counter caps retries, so a
    // failure needs no bookkeeping here beyond being visible in the logs.
    console.warn(`[realign] ${body.videoId} failed on worker: ${body.error}`);
    return NextResponse.json({ ok: false });
  }

  const claims = await getReplayableClaims(body.videoId);
  if (!claims) return NextResponse.json({ error: "not replayable" }, { status: 404 });
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
    transcript: transcriptFromUtterances((body.utterances || []).map(([start, text]) => ({ start: Number(start), text: String(text) }))),
  });
  console.log(`[realign] ${body.videoId}: ${r.matched}/${r.total} claims located, offset ${r.offset}s, ${words.length} words`);
  return NextResponse.json({ ok: true, matched: r.matched, total: r.total, offset: r.offset });
}
