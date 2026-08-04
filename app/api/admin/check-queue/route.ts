import { NextRequest, NextResponse } from "next/server";
import { claimNextCheck, finishCheck, archiveBroadcast, getRecentBroadcasts } from "@/lib/live-kv";

/**
 * Worker side of the "check any video" queue (auth: ADMIN_KEY).
 *
 * GET   claim the next queued job, or {job:null} when idle
 * POST  { videoId, title, segments[] }  archive the transcript and close the job
 *       { videoId, error }              record a failure
 *
 * The runner supplies only the transcript. Fact-checking is then the existing
 * backfill pass, which already knows how to turn an archived transcript into
 * verified claims — no second copy of that logic.
 */

export const dynamic = "force-dynamic";

function authed(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  return Boolean(key) && req.headers.get("authorization") === `Bearer ${key}`;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = await claimNextCheck();
  return NextResponse.json({ job });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const videoId = String(body.videoId || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  if (body.error) {
    await finishCheck(videoId, { error: String(body.error).slice(0, 300) });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (!segments.length) {
    await finishCheck(videoId, { error: "No captions available for this video." });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const existing = (await getRecentBroadcasts()).find(b => b.videoId === videoId);
  if (!existing) {
    // The archive stores the transcript as ONE STRING with [m:ss] markers,
    // which is the shape replay and backfill both parse. Handing them an
    // array of segment objects would have type-checked and then silently
    // produced an empty replay.
    const transcript = segments
      .map((sg: { time?: number; t?: number; text?: string }) => {
        const t = Math.max(0, Math.round(sg.time ?? sg.t ?? 0));
        const mm = Math.floor(t / 60);
        const ss = String(t % 60).padStart(2, "0");
        return `[${mm}:${ss}] ${(sg.text || "").trim()}`;
      })
      .join(" ");

    await archiveBroadcast({
      videoId,
      title: String(body.title || "YouTube video"),
      source: "on-demand",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      // Claims arrive from the backfill pass; archiving the transcript first
      // is what makes this video visible to that machinery at all.
      claims: [],
      transcript,
    });
  }

  await finishCheck(videoId, { title: String(body.title || "YouTube video") });
  return NextResponse.json({ ok: true, status: "archived", segments: segments.length });
}
