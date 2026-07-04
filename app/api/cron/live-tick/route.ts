import { NextResponse } from "next/server";

/**
 * GET /api/cron/live-tick — the reliable metronome for live coverage.
 *
 * WHY: GitHub Actions free-tier cron ("every 5 minutes") is throttled
 * without guarantees — observed firing a FULL HOUR apart, which made the
 * pipeline miss an entire 26-minute VP speech. Vercel Pro crons are
 * reliable, but Vercel functions can't host a 2-hour transcription worker.
 * Solution: Vercel is the metronome, GitHub is the muscle — this route
 * fires workflow_dispatch on live-broadcast.yml every couple of minutes.
 *
 * The dispatched workflow is cheap when idle (schedule + discovery checks,
 * ~30s) and its concurrency group means overlapping dispatches collapse
 * into one worker.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` when the
 * CRON_SECRET env var is set. Requires GH_DISPATCH_TOKEN (fine-grained PAT
 * with Actions read/write on the repo).
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    // Not configured — report clearly, never 500 (cron alarms are noise).
    return NextResponse.json({
      ok: false,
      skipped: "GH_DISPATCH_TOKEN not set — GitHub cron remains the (unreliable) fallback trigger",
    });
  }

  const resp = await fetch(
    "https://api.github.com/repos/iblari/open-ledger/actions/workflows/live-broadcast.yml/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "voteunbiased-live-tick",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  // 204 = dispatched. Anything else surfaces in Vercel logs for debugging.
  const ok = resp.status === 204;
  if (!ok) {
    const detail = (await resp.text()).slice(0, 300);
    console.error(`[live-tick] dispatch failed: ${resp.status} ${detail}`);
    return NextResponse.json({ ok, status: resp.status, detail });
  }
  return NextResponse.json({ ok: true, dispatched: new Date().toISOString() });
}
