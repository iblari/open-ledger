// GET /api/live-schedule
//
// Returns the public broadcast schedule + computed status (active event,
// next event, countdowns). Single endpoint consumed by:
//   - /live page: renders the upcoming list + "starts in" countdown
//   - .github/workflows/live-broadcast.yml: decides whether to run the
//     scripts/go-live.mjs worker for this 5-minute cron tick
//
// Reads public/live-schedule.json at request time (no caching) so editing
// the file and redeploying picks up immediately. JSON is small (~2KB even
// with 20 events), so re-parsing per request is fine.

import { NextResponse } from "next/server";
import { computeStatus } from "@/lib/schedule";
import { loadAllScheduleEvents } from "@/lib/schedule-store";

export const dynamic = "force-dynamic"; // never cache; schedule changes mid-day

export async function GET() {
  try {
    // File events (repo) + KV events (autopilot) merged — see schedule-store.
    const events = await loadAllScheduleEvents();
    const status = computeStatus(events, Date.now());
    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      active: status.active,
      activeSecondsRemaining: status.activeSecondsRemaining,
      next: status.next,
      nextSecondsUntilStart: status.nextSecondsUntilStart,
      upcoming: status.upcoming,
    });
  } catch (e) {
    // If the schedule file is missing or malformed, return a clean empty
    // response rather than 500 — the GitHub Action treats an empty schedule
    // as "nothing to do" and exits without invoking go-live.mjs.
    console.error("[live-schedule] parse error:", e);
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "schedule parse failed",
      now: new Date().toISOString(),
      active: null,
      activeSecondsRemaining: null,
      next: null,
      nextSecondsUntilStart: null,
      upcoming: [],
    });
  }
}
