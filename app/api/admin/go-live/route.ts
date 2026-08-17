import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";
import { sendLiveAlert } from "@/lib/email-alerts";
import {
  setLiveState,
  getLiveState,
  clearLiveClaims,
  getLiveClaims,
  getLiveTranscript,
  setLiveTranscript,
  getRecentBroadcasts,
  removeRecentBroadcast,
  archiveBroadcast,
  type LiveState,
} from "@/lib/live-kv";

/**
 * POST /api/admin/go-live
 *
 * Sets the live broadcast state. Protected by ADMIN_KEY env var.
 *
 * Body: { action: "start", videoId: string, title: string, source?: string }
 *    or { action: "stop" }
 *
 * Call from your phone, a script, or a simple admin page:
 *   curl -X POST https://voteunbiased.org/api/admin/go-live \
 *     -H "Authorization: Bearer YOUR_ADMIN_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"action":"start","videoId":"abc123","title":"White House Press Briefing"}'
 */
/**
 * Notifications now run INSIDE this request, so it needs room: the
 * subscriber list is walked in batches of ten with a round trip each, plus
 * the push fan-out. On the ~10-15s default the send would be cut off partway
 * down the list — the same class of failure as the fire-and-forget above.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  // Auth check
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json(
      { error: "ADMIN_KEY not configured on server" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action: "start" | "stop";
    videoId?: string;
    title?: string;
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "start") {
    // videoId is OPTIONAL: broadcasts ingested from non-embeddable sources
    // (C-SPAN Radio simulcasts, direct HLS feeds) run in "monitor mode" —
    // the /live page shows the live fact-check feed without a video player.
    if (!body.title) {
      return NextResponse.json(
        { error: "Missing title" },
        { status: 400 }
      );
    }

    const state: LiveState = {
      status: "live",
      videoId: body.videoId || "",
      title: body.title,
      source: body.source || "youtube",
      startedAt: new Date().toISOString(),
    };

    await clearLiveClaims();
    await setLiveTranscript(""); // fresh session transcript

    // Ping push subscribers the moment coverage actually begins — this is
    // the alert the calendar could never reliably deliver.
    // AWAITED, not fire-and-forget.
    //
    // These were dispatched with .then() and the handler returned straight
    // afterwards. A serverless function is frozen the moment it responds, so
    // a promise still in flight is killed — and this one is ALWAYS in
    // flight, because sendLiveAlert walks the subscriber list in batches of
    // ten with a round trip to Resend for each.
    //
    // The symptom was "the alert doesn't reach people": whether a given
    // address got mailed depended on how far the loop happened to get before
    // the response went out. Nothing about the subscriber record was wrong.
    //
    // Neither can fail the request — a failed notification must not stop the
    // broadcast being marked live.
    const [pushRes, mailRes] = await Promise.allSettled([
      sendPushToAll({
        title: "🔴 Live fact-check in progress",
        body: body.title || "An official broadcast is being fact-checked right now.",
        url: "/live",
      }),
      // Email is the universal channel, and the only one reaching iPhone
      // users who haven't installed the site. No-ops until RESEND_API_KEY.
      sendLiveAlert(body.title || "An official broadcast", body.source),
    ]);
    console.log(`[GO-LIVE] push: ${pushRes.status === "fulfilled" ? `${pushRes.value.sent} sent, ${pushRes.value.pruned} pruned` : `FAILED ${pushRes.reason}`}`);
    console.log(`[GO-LIVE] email: ${mailRes.status === "fulfilled" ? JSON.stringify(mailRes.value) : `FAILED ${mailRes.reason}`}`);

    await setLiveState(state);

    console.log(`[GO-LIVE] Started: "${state.title}" (${state.videoId || "monitor mode"})`);
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "stop") {
    const prev = await getLiveState();

    // Archive the ended session for the 72h "recent broadcasts" replay —
    // viewers who missed the live moment get the video + every claim the
    // pipeline already paid to check. Only when the session was actually
    // LIVE (the workflow's always()-cleanup calls stop repeatedly; archiving
    // off→off would duplicate) and only when it produced claims or ran long
    // enough to be a real broadcast (a 30s crash isn't worth replaying).
    if (prev?.status === "live" && prev.videoId) {
      try {
        const claims = await getLiveClaims();
        const ranMs = Date.now() - Date.parse(prev.startedAt || new Date().toISOString());
        if (claims.length > 0 || ranMs > 10 * 60 * 1000) {
          const transcript = await getLiveTranscript().catch(() => "");
          await archiveBroadcast({
            videoId: prev.videoId,
            title: prev.title,
            source: prev.source,
            startedAt: prev.startedAt,
            endedAt: new Date().toISOString(),
            claims,
            transcript: transcript || undefined,
          });
          console.log(`[GO-LIVE] Archived "${prev.title}" with ${claims.length} claims for 72h replay`);
        }
      } catch (e) {
        console.error("[GO-LIVE] archive failed:", e);
      }
    }

    const state: LiveState = {
      status: "off",
      videoId: prev?.videoId || "",
      title: prev?.title || "",
      source: prev?.source || "",
      startedAt: prev?.startedAt || "",
    };
    await setLiveState(state);

    console.log(`[GO-LIVE] Stopped broadcast`);
    return NextResponse.json({ ok: true, state });
  }

  // Send a test notification to every subscriber — used to confirm the
  // delivery path end-to-end before relying on it for a real broadcast.
  if ((body.action as string) === "test-email") {
    const r = await sendLiveAlert(
      (body as { title?: string }).title || "Test — Presidential Remarks on the Economy",
      "Systems check"
    );
    return NextResponse.json({ ok: true, ...r });
  }

  if ((body.action as string) === "test-push") {
    const r = await sendPushToAll({
      title: "🔴 Vote Unbiased — test alert",
      body: "Push notifications are working. You'll get one like this the moment a live fact-check begins.",
      url: "/live",
    });
    return NextResponse.json({ ok: true, ...r });
  }

  // Ops cleanup: drop one archived broadcast (e.g. a pipeline rehearsal).
  if ((body.action as string) === "delete-recent") {
    const vid = (body as { videoId?: string }).videoId;
    if (!vid) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const removed = await removeRecentBroadcast(vid);
    return NextResponse.json({ ok: true, removed });
  }

  // One-off recovery: attach the still-in-KV live transcript to the most
  // recent archived broadcast that predates transcript archiving.
  if ((body.action as string) === "backfill-transcript") {
    const transcript = await getLiveTranscript().catch(() => "");
    if (!transcript) return NextResponse.json({ ok: false, reason: "no transcript in KV" });
    const recent = await getRecentBroadcasts();
    const target = recent.find(b => !b.transcript);
    if (!target) return NextResponse.json({ ok: false, reason: "nothing to backfill" });
    await archiveBroadcast({ ...target, transcript });
    return NextResponse.json({ ok: true, backfilled: target.title, chars: transcript.length });
  }

  return NextResponse.json(
    { error: 'Invalid action — use "start" or "stop"' },
    { status: 400 }
  );
}

/** GET /api/admin/go-live — check current state (also auth-protected) */
export async function GET(req: Request) {
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

  const state = await getLiveState();
  return NextResponse.json({ state: state || { status: "off" } });
}
