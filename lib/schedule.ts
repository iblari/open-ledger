// Vote Unbiased — Live Broadcast Schedule.
//
// Public schedule of upcoming live broadcasts (press conferences, addresses,
// hearings). Maintained as JSON in public/live-schedule.json so adding an
// event is a normal commit-and-deploy.
//
// Consumed by:
//   - /api/live-schedule (public endpoint the /live page and the GitHub Action
//     both call to decide what's upcoming / live right now)
//   - /live page (countdown to next broadcast)
//   - .github/workflows/live-broadcast.yml (5-min cron; if event is live or
//     starting within the lookahead window, runs scripts/go-live.mjs)

export interface ScheduledEvent {
  /** Stable slug, e.g. "potus-sotu-2026". */
  id: string;
  /** Display title. */
  title: string;
  /** Who's speaking — for the countdown card subtitle. */
  speaker: string;
  /** Network / channel surfacing the stream, e.g. "White House YouTube". */
  source: string;
  /** Live stream URL (currently must be a YouTube live link). */
  youtubeUrl: string;
  /** ISO timestamp the broadcast is scheduled to start. */
  scheduledStart: string;
  /** ISO timestamp the broadcast is scheduled to end (used to stop the worker). */
  scheduledEnd: string;
}

export interface LiveSchedule {
  events: ScheduledEvent[];
}

/** How early before scheduledStart the GitHub Action will start the worker.
 *  Buffer accounts for cron-trigger delay (GitHub Actions cron can slip up to
 *  15 minutes on free tier) plus a few seconds for the broadcaster to actually
 *  begin streaming. */
export const PRE_ROLL_SECONDS = 10 * 60; // 10 min

/** How long past scheduledEnd we'll allow the worker to keep running.
 *  Some events run over; capping protects against runaway STT costs. */
export const POST_ROLL_SECONDS = 30 * 60; // 30 min

/** GitHub Actions job hard timeout. Workflow can be re-triggered if event
 *  is longer than this; the new run picks up where the previous left off. */
export const WORKER_MAX_RUN_SECONDS = 5 * 60 * 60; // 5hr (workflow max is 6hr)

export interface ScheduleStatus {
  /** Event that should be live right now (or starting within PRE_ROLL_SECONDS). */
  active: ScheduledEvent | null;
  /** Seconds until the active event's scheduledEnd. Negative if past end. */
  activeSecondsRemaining: number | null;
  /** Next upcoming event after `active`, for the /live page countdown. */
  next: ScheduledEvent | null;
  /** Seconds until `next` scheduledStart. */
  nextSecondsUntilStart: number | null;
  /** All upcoming + active events for display, sorted ascending by start time. */
  upcoming: ScheduledEvent[];
}

/** Compute schedule status given a list of events and a reference time.
 *  Pure function — no IO — so it can be unit-tested and reused on both the
 *  server (/api/live-schedule) and the client (/live page). */
export function computeStatus(events: ScheduledEvent[], nowMs: number = Date.now()): ScheduleStatus {
  // Defensive: drop malformed entries (missing required fields, invalid dates).
  const valid = events.filter(e => {
    if (!e.id || !e.youtubeUrl || !e.scheduledStart || !e.scheduledEnd) return false;
    const s = Date.parse(e.scheduledStart);
    const en = Date.parse(e.scheduledEnd);
    return !isNaN(s) && !isNaN(en) && en > s;
  });

  // Sort ascending by start time so "next" iteration is straightforward.
  const sorted = [...valid].sort(
    (a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart)
  );

  // An event is "active" if we're inside [start - PRE_ROLL, end + POST_ROLL].
  // Pre-roll lets the worker spin up before the broadcast begins; post-roll
  // covers events that run long.
  const active = sorted.find(e => {
    const start = Date.parse(e.scheduledStart) - PRE_ROLL_SECONDS * 1000;
    const end = Date.parse(e.scheduledEnd) + POST_ROLL_SECONDS * 1000;
    return nowMs >= start && nowMs <= end;
  }) ?? null;

  const activeSecondsRemaining = active
    ? Math.floor((Date.parse(active.scheduledEnd) - nowMs) / 1000)
    : null;

  // "Next" is the earliest event whose start time is in the future, OTHER than
  // the active one. Lets the /live page show "Next: ___ in 2h" while a live
  // event is running.
  const next = sorted.find(e =>
    Date.parse(e.scheduledStart) > nowMs && (!active || e.id !== active.id)
  ) ?? null;

  const nextSecondsUntilStart = next
    ? Math.floor((Date.parse(next.scheduledStart) - nowMs) / 1000)
    : null;

  // Upcoming list = anything not yet ended, sorted by start time. We keep the
  // active event in this list so the /live page can render it as "live now".
  const upcoming = sorted.filter(e => Date.parse(e.scheduledEnd) > nowMs);

  return { active, activeSecondsRemaining, next, nextSecondsUntilStart, upcoming };
}

/** True if the event is currently live (scheduled window is open, ignoring
 *  pre/post roll). The /live page uses this to color the badge red. */
export function isLiveNow(event: ScheduledEvent, nowMs: number = Date.now()): boolean {
  const start = Date.parse(event.scheduledStart);
  const end = Date.parse(event.scheduledEnd);
  return nowMs >= start && nowMs <= end;
}

/** Extract a YouTube video ID from a watch / youtu.be / /live/ URL.
 *  Returns null if no 11-char ID found. */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}
