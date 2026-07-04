/**
 * Simple KV store for live broadcast state.
 *
 * Uses Upstash Redis REST API when configured (set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN in Vercel env vars — free tier is plenty).
 *
 * Falls back to an in-memory Map for local dev. In-memory state survives within
 * a single serverless container but NOT across cold starts — fine for prototyping,
 * use Upstash for production.
 */

export interface LiveState {
  status: "live" | "off";
  videoId: string;
  title: string;
  source: string;
  startedAt: string;
}

export interface LiveClaim {
  id: string;
  quote: string;
  rating: string;
  confidence?: number;
  actual: string;
  explanation: string;
  videoTime: number;
  timestamp: string;
  // ── Data-layer integration (lib/live-verify) ──
  // Populated when the claim matches one of the 6 anchored economic metrics
  // (gdp, unemployment, inflation, sp500, debt_gdp, median_income). When
  // present, the UI deep-links to /dashboard?metric=<key>&admin=<id> and the
  // server verifier may have overridden 'actual' with a sourced ground-truth.
  metricKey?: string | null;
  year?: number | null;
  admin?: string | null;
  claimedValue?: number | null;
  verifiedFromSource?: boolean;
  groundTruth?: { value: number; year: number; metricKey: string; source: string };
}

// ── Upstash REST helpers ──────────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function hasUpstash(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function upstashCmd(...args: (string | number)[]): Promise<unknown> {
  const resp = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await resp.json();
  return data.result;
}

// ── In-memory fallback ────────────────────────────────────────────

const mem = new Map<string, string>();

// ── Public API ────────────────────────────────────────────────────

const LIVE_STATE_KEY = "live:state";
const LIVE_CLAIMS_KEY = "live:claims";
const LIVE_TRANSCRIPT_KEY = "live:transcript";

/** Get current live broadcast state */
export async function getLiveState(): Promise<LiveState | null> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", LIVE_STATE_KEY)) as string | null;
  } else {
    raw = mem.get(LIVE_STATE_KEY);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Set live broadcast state */
export async function setLiveState(state: LiveState): Promise<void> {
  const json = JSON.stringify(state);
  if (hasUpstash()) {
    await upstashCmd("SET", LIVE_STATE_KEY, json);
  } else {
    mem.set(LIVE_STATE_KEY, json);
  }
}

/** Get all claims for the current live session */
export async function getLiveClaims(): Promise<LiveClaim[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", LIVE_CLAIMS_KEY)) as string | null;
  } else {
    raw = mem.get(LIVE_CLAIMS_KEY);
  }
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Get claims newer than a given timestamp */
export async function getClaimsSince(since: string): Promise<LiveClaim[]> {
  const all = await getLiveClaims();
  const sinceMs = new Date(since).getTime();
  return all.filter((c) => new Date(c.timestamp).getTime() > sinceMs);
}

/** Append new claims to the live session */
export async function appendLiveClaims(newClaims: LiveClaim[]): Promise<void> {
  const existing = await getLiveClaims();
  // Keep most recent 200 claims max
  const combined = [...newClaims, ...existing].slice(0, 200);
  const json = JSON.stringify(combined);
  if (hasUpstash()) {
    await upstashCmd("SET", LIVE_CLAIMS_KEY, json);
  } else {
    mem.set(LIVE_CLAIMS_KEY, json);
  }
}

/** Clear all claims (when going live or stopping) */
export async function clearLiveClaims(): Promise<void> {
  if (hasUpstash()) {
    await upstashCmd("DEL", LIVE_CLAIMS_KEY);
  } else {
    mem.delete(LIVE_CLAIMS_KEY);
  }
}

/** Store the latest transcript snippet (for display) */
export async function setLiveTranscript(text: string): Promise<void> {
  if (hasUpstash()) {
    await upstashCmd("SET", LIVE_TRANSCRIPT_KEY, text);
  } else {
    mem.set(LIVE_TRANSCRIPT_KEY, text);
  }
}

/** Get the latest transcript snippet */
export async function getLiveTranscript(): Promise<string> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", LIVE_TRANSCRIPT_KEY)) as string | null;
  } else {
    raw = mem.get(LIVE_TRANSCRIPT_KEY);
  }
  return raw || "";
}

// ── KV-backed schedule events (autopilot) ─────────────────────────
//
// Events discovered automatically (upcoming livestreams on watched
// channels, later: official calendars) are stored HERE, not in
// public/live-schedule.json — a JSON-file write would require a commit +
// deploy, while a KV write is live on the site within seconds and needs
// no human. /api/live-schedule and /api/schedule.ics merge both sources.

const SCHEDULE_EVENTS_KEY = "live:schedule-events";

export interface KvScheduledEvent {
  id: string;
  title: string;
  speaker: string;
  source: string;
  youtubeUrl?: string;
  streamUrl?: string;
  scheduledStart: string;
  scheduledEnd: string;
  /** Where the autopilot got this event from, e.g. "youtube-upcoming". */
  discoveredVia?: string;
}

export async function getKvScheduleEvents(): Promise<KvScheduledEvent[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", SCHEDULE_EVENTS_KEY)) as string | null;
  } else {
    raw = mem.get(SCHEDULE_EVENTS_KEY);
  }
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function setKvScheduleEvents(events: KvScheduledEvent[]): Promise<void> {
  const json = JSON.stringify(events);
  if (hasUpstash()) {
    await upstashCmd("SET", SCHEDULE_EVENTS_KEY, json);
  } else {
    mem.set(SCHEDULE_EVENTS_KEY, json);
  }
}

/** Upsert events by id and prune anything that ended >48h ago. */
export async function upsertKvScheduleEvents(
  incoming: KvScheduledEvent[]
): Promise<{ total: number; added: number; updated: number; pruned: number }> {
  const existing = await getKvScheduleEvents();
  const byId = new Map(existing.map(e => [e.id, e]));
  let added = 0, updated = 0;
  for (const ev of incoming) {
    if (!ev.id || !ev.scheduledStart || !ev.scheduledEnd) continue;
    if (byId.has(ev.id)) updated++; else added++;
    byId.set(ev.id, ev);
  }
  const cutoff = Date.now() - 48 * 3600 * 1000;
  const kept = [...byId.values()].filter(e => Date.parse(e.scheduledEnd) > cutoff);
  const pruned = byId.size - kept.length;
  await setKvScheduleEvents(kept);
  return { total: kept.length, added, updated, pruned };
}
