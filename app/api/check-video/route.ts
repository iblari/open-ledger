import { NextRequest, NextResponse } from "next/server";
import { enqueueCheck, getCheckJob, getCheckQueue, getRecentBroadcasts } from "@/lib/live-kv";

/**
 * /api/check-video — "check any video", done by the worker.
 *
 * YouTube blocks caption access from this server's every egress path (the
 * player API answers "Sign in to confirm you're not a bot"; the watch page
 * arrives stripped of caption metadata). The GitHub Actions runner still
 * gets through, so the web app's job is only to enqueue and report.
 *
 * POST { url }      -> { videoId, status, queuedBehind }
 * GET  ?videoId=..  -> { status, ... } or the finished broadcast
 *
 * Deliberately no workflow_dispatch: that needs a PAT stored in the app. The
 * watcher already polls every two minutes for live streams, so it can drain
 * this queue on the same tick for free.
 */

export const dynamic = "force-dynamic";

function extractVideoId(raw: string): string | null {
  const s = (raw || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** A video already in the 72-hour archive needs no work at all. */
async function findArchived(videoId: string) {
  const all = await getRecentBroadcasts().catch(() => []);
  return all.find(b => b.videoId === videoId) || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const videoId = extractVideoId(String(body.url || ""));
  if (!videoId) {
    return NextResponse.json(
      { error: "That doesn't look like a YouTube link. Paste the full watch URL." },
      { status: 200 }
    );
  }

  const archived = await findArchived(videoId);
  if (archived) {
    return NextResponse.json({
      videoId, status: "done", fromArchive: true,
      title: archived.title, claimCount: archived.claims?.length ?? 0,
    });
  }

  const job = await enqueueCheck(videoId, `https://www.youtube.com/watch?v=${videoId}`);
  const queue = await getCheckQueue();
  return NextResponse.json({
    videoId,
    status: job.status,
    queuedBehind: job.queuedBehind ?? queue.indexOf(videoId),
    requestedAt: job.requestedAt,
  });
}

export async function GET(req: NextRequest) {
  const videoId = new URL(req.url).searchParams.get("videoId") || "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  // The archive is the source of truth for a finished job: the worker writes
  // its results there, so checking it first means a result is never lost to
  // an expired job record.
  const archived = await findArchived(videoId);
  if (archived) {
    return NextResponse.json({
      videoId, status: "done",
      title: archived.title,
      claimCount: archived.claims?.length ?? 0,
      watchUrl: `/live?replay=${videoId}`,
    });
  }

  const job = await getCheckJob(videoId);
  if (!job) return NextResponse.json({ videoId, status: "unknown" });

  const queue = await getCheckQueue();
  return NextResponse.json({
    ...job,
    queuedBehind: job.status === "queued" ? Math.max(0, queue.indexOf(videoId)) : 0,
  });
}
