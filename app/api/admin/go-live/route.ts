import { NextResponse } from "next/server";
import {
  setLiveState,
  getLiveState,
  clearLiveClaims,
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
    if (!body.videoId || !body.title) {
      return NextResponse.json(
        { error: "Missing videoId or title" },
        { status: 400 }
      );
    }

    const state: LiveState = {
      status: "live",
      videoId: body.videoId,
      title: body.title,
      source: body.source || "youtube",
      startedAt: new Date().toISOString(),
    };

    await clearLiveClaims();
    await setLiveState(state);

    console.log(`[GO-LIVE] Started: "${state.title}" (${state.videoId})`);
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "stop") {
    const prev = await getLiveState();
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
