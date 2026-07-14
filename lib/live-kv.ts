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

// ── Subscriber persistence ────────────────────────────────────────
//
// The /api/subscribe route originally forwarded emails to Base44 (never
// configured in production) or console.log (Vercel retains ~1 day) — so
// subscriber emails were being lost. Every signup now lands HERE, in the
// same Upstash store the live pipeline uses, regardless of any external
// service. Export via /api/admin/subscribers.

const SUBSCRIBERS_KEY = "subscribers:list";

export interface SubscriberRecord {
  email: string;
  feedback: string;
  source: string;
  signed_up_at: string;
}

export async function getSubscribers(): Promise<SubscriberRecord[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", SUBSCRIBERS_KEY)) as string | null;
  } else {
    raw = mem.get(SUBSCRIBERS_KEY);
  }
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** Append a subscriber. Dedupes by email (case-insensitive) — a repeat
 *  signup updates feedback/source but keeps the ORIGINAL signup date. */
export async function appendSubscriber(rec: SubscriberRecord): Promise<{ total: number; isNew: boolean }> {
  const all = await getSubscribers();
  const key = rec.email.trim().toLowerCase();
  const existing = key ? all.find(s => s.email.trim().toLowerCase() === key) : undefined;
  let isNew = true;
  if (existing) {
    isNew = false;
    if (rec.feedback) existing.feedback = rec.feedback;
    existing.source = rec.source;
  } else {
    all.push(rec);
  }
  const json = JSON.stringify(all);
  if (hasUpstash()) {
    await upstashCmd("SET", SUBSCRIBERS_KEY, json);
  } else {
    mem.set(SUBSCRIBERS_KEY, json);
  }
  return { total: all.length, isNew };
}

// ── Calendar-feed poll tracking ───────────────────────────────────
//
// Calendar subscriptions are anonymous by design (no signup — clients just
// poll the .ics URL), so "who" is unknowable. "How many" is approximated by
// counting distinct clients (hashed IP + client class). Caveats: each Apple
// device polls independently (slight overcount per multi-device user), and
// Google Calendar fetches ONCE centrally for all its users (undercounts
// Google subscribers to "≥1"). Records prune after 60 days.

const CAL_POLLS_KEY = "calendar:pollers";

export interface CalendarPollStats {
  uniqueClients30d: number;
  byClient: Record<string, number>;
  googleFetcherActive: boolean;
}

export async function recordCalendarPoll(ipHash: string, clientClass: string): Promise<void> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", CAL_POLLS_KEY)) as string | null;
  } else {
    raw = mem.get(CAL_POLLS_KEY);
  }
  let map: Record<string, string> = {};
  try { map = raw ? JSON.parse(raw) : {}; } catch { map = {}; }
  map[`${clientClass}:${ipHash}`] = new Date().toISOString();
  // Prune entries not seen in 60 days.
  const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  for (const [k, v] of Object.entries(map)) {
    if (Date.parse(v) < cutoff) delete map[k];
  }
  const json = JSON.stringify(map);
  if (hasUpstash()) {
    await upstashCmd("SET", CAL_POLLS_KEY, json);
  } else {
    mem.set(CAL_POLLS_KEY, json);
  }
}

export async function getCalendarPollStats(): Promise<CalendarPollStats> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", CAL_POLLS_KEY)) as string | null;
  } else {
    raw = mem.get(CAL_POLLS_KEY);
  }
  let map: Record<string, string> = {};
  try { map = raw ? JSON.parse(raw) : {}; } catch { map = {}; }
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const byClient: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(map)) {
    if (Date.parse(v) < cutoff) continue;
    const cls = k.split(":")[0];
    byClient[cls] = (byClient[cls] || 0) + 1;
    total++;
  }
  return {
    uniqueClients30d: total,
    byClient,
    googleFetcherActive: (byClient["google"] || 0) > 0,
  };
}

// ── Recent broadcasts (24h replay) ────────────────────────────────
//
// When a live session ends, the whole thing — title, timing, every
// fact-checked claim — is archived here for 24 hours. Viewers who missed
// the live moment can replay the video WITH all the verdicts already
// attached: zero additional Deepgram or Claude spend (the analysis was
// paid for once, live). Entries expire 24h after the broadcast ended.

export interface RecentBroadcast {
  videoId: string;
  title: string;
  source: string;
  startedAt: string;
  endedAt: string;
  claims: LiveClaim[];
  /** Full session transcript (tail-capped) — powers replay + detection audits. */
  transcript?: string;
}

const RECENT_BROADCASTS_KEY = "live:recent";
const RECENT_TTL_MS = 24 * 3600 * 1000;

export async function getRecentBroadcasts(): Promise<RecentBroadcast[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", RECENT_BROADCASTS_KEY)) as string | null;
  } else {
    raw = mem.get(RECENT_BROADCASTS_KEY);
  }
  if (!raw) return [];
  try {
    const all: RecentBroadcast[] = JSON.parse(raw);
    const cutoff = Date.now() - RECENT_TTL_MS;
    return all.filter(b => Date.parse(b.endedAt) > cutoff);
  } catch {
    return [];
  }
}

/** Archive an ended broadcast (deduped by videoId — a re-covered stream
 *  replaces its earlier entry, merging claims). Prunes >24h entries. */
export async function archiveBroadcast(b: RecentBroadcast): Promise<void> {
  // Cap the transcript to its final ~120K chars (~3h of speech) so a single
  // marathon session can't blow up the recent-broadcasts KV entry.
  if (b.transcript && b.transcript.length > 120_000) {
    b = { ...b, transcript: "… " + b.transcript.slice(-120_000) };
  }
  const all = await getRecentBroadcasts(); // already pruned
  const existing = all.find(x => x.videoId === b.videoId);
  if (existing) {
    // Same stream covered in multiple worker sessions (rotation/restart):
    // merge claims by id, keep earliest start / latest end.
    const seen = new Set(existing.claims.map(c => c.id));
    existing.claims = [...existing.claims, ...b.claims.filter(c => !seen.has(c.id))];
    if (b.startedAt < existing.startedAt) existing.startedAt = b.startedAt;
    if (b.endedAt > existing.endedAt) existing.endedAt = b.endedAt;
    existing.title = b.title || existing.title;
    // Keep the longer transcript (later sessions contain the earlier text).
    if (b.transcript && (b.transcript.length > (existing.transcript?.length || 0))) {
      existing.transcript = b.transcript;
    }
  } else {
    all.unshift(b);
  }
  // Cap total entries defensively.
  const json = JSON.stringify(all.slice(0, 20));
  if (hasUpstash()) {
    await upstashCmd("SET", RECENT_BROADCASTS_KEY, json);
  } else {
    mem.set(RECENT_BROADCASTS_KEY, json);
  }
}

// ── "What's Changing in America" trends feed ────────────────────────
// Computed by scripts/detect-trends.mjs (deterministic arithmetic over
// Census data), narrated by Claude in /api/admin/trends, served to the
// homepage by /api/trends. Refreshed monthly.

export interface TrendNarrative { why: string; matters: string; watch: string }
export interface TrendCounty {
  fips: string; name: string; st: string; pop: number;
  metricLabel: string; value: string; detail: string;
}
export interface TrendItem {
  id: string; kicker: string; headline: string;
  heroStat: { value: string; label: string };
  window: string;
  breadth: { n: number; total: number; popShare: number };
  facts: Record<string, unknown>;
  top: TrendCounty[];
  method: string;
  narrative?: TrendNarrative;
}
export interface TrendsFeed {
  generatedAt: string;
  window: string;
  universe: { counties: number; population: number; source: string };
  trends: TrendItem[];
}

const TRENDS_KEY = "trends:feed";

export async function getTrendsFeed(): Promise<TrendsFeed | null> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await upstashCmd("GET", TRENDS_KEY)) as string | null;
  } else {
    raw = mem.get(TRENDS_KEY);
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setTrendsFeed(feed: TrendsFeed): Promise<void> {
  const json = JSON.stringify(feed);
  if (hasUpstash()) {
    await upstashCmd("SET", TRENDS_KEY, json);
  } else {
    mem.set(TRENDS_KEY, json);
  }
}
