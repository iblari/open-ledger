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

import { isDuplicateQuote } from "@/lib/claim-utils";

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
  /** Tier-3: settled by live web search, with the pages actually cited. */
  webVerified?: boolean;
  sources?: { title: string; url: string }[];
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

/** Append a chunk to the running session transcript.
 *  Uses Redis APPEND (atomic, no read-modify-write race) and trims the
 *  string back to its final 200K chars if it grows past 400K (~8h talk). */
export async function appendLiveTranscript(chunk: string): Promise<void> {
  if (hasUpstash()) {
    const newLen = (await upstashCmd("APPEND", LIVE_TRANSCRIPT_KEY, chunk)) as number;
    if (newLen > 400_000) {
      const tail = (await upstashCmd("GETRANGE", LIVE_TRANSCRIPT_KEY, -200_000, -1)) as string;
      await upstashCmd("SET", LIVE_TRANSCRIPT_KEY, "… " + tail);
    }
  } else {
    mem.set(LIVE_TRANSCRIPT_KEY, ((mem.get(LIVE_TRANSCRIPT_KEY) || "") + chunk).slice(-400_000));
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
  /** Consent scope. Subscribers who signed up for the monthly dispatch did
   *  NOT ask to be pinged every time a broadcast starts — a few alerts a week
   *  is a different deal. Anyone who opts in at a live-alert entry point gets
   *  liveAlerts: true; everyone else keeps the monthly-only default. */
  liveAlerts?: boolean;
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
/** Replace the subscriber list (used by one-click unsubscribe). */
export async function setSubscribers(list: SubscriberRecord[]): Promise<void> {
  const json = JSON.stringify(list);
  if (hasUpstash()) await upstashCmd("SET", SUBSCRIBERS_KEY, json);
  else mem.set(SUBSCRIBERS_KEY, json);
}

export async function appendSubscriber(rec: SubscriberRecord): Promise<{ total: number; isNew: boolean }> {
  const all = await getSubscribers();
  const key = rec.email.trim().toLowerCase();
  const existing = key ? all.find(s => s.email.trim().toLowerCase() === key) : undefined;
  let isNew = true;
  if (existing) {
    isNew = false;
    if (rec.feedback) existing.feedback = rec.feedback;
    existing.source = rec.source;
    // Opting in is additive; re-subscribing via the monthly form never
    // silently revokes a live-alert consent.
    if (rec.liveAlerts) existing.liveAlerts = true;
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

// ── Recent broadcasts (72h replay) ────────────────────────────────
//
// When a live session ends, the whole thing — title, timing, every
// fact-checked claim — is archived here for 72 hours. Viewers who missed
// the live moment can replay the video WITH all the verdicts already
// attached: zero additional Deepgram or Claude spend (the analysis was
// paid for once, live). Entries expire 72h after the broadcast ended —
// a weekend's worth, so a Friday briefing is still there on Monday.

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
const RECENT_TTL_MS = 72 * 3600 * 1000;

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
 *  replaces its earlier entry, merging claims). Prunes >72h entries. */
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
  let kept = all.slice(0, 30);

  // Size guard. At 72h retention a busy news cycle can stack a dozen-plus
  // sessions, and each carries a full transcript (up to 120K chars) — enough
  // to exceed the KV value limit in one write. Shed transcripts from the
  // OLDEST entries first (claims and metadata are tiny and stay intact), so
  // recent replays keep their scrolling transcript and older ones gracefully
  // degrade to their fact-checks rather than the whole archive failing.
  const BUDGET = 700_000; // bytes, comfortably under Upstash's limit
  let json = JSON.stringify(kept);
  if (json.length > BUDGET) {
    const byOldest = [...kept].sort((a, b) => (a.endedAt || "").localeCompare(b.endedAt || ""));
    for (const entry of byOldest) {
      if (json.length <= BUDGET) break;
      if (entry.transcript) {
        entry.transcript = undefined;
        json = JSON.stringify(kept);
      }
    }
    // Still too big (pathological claim volume): drop the oldest entries.
    while (json.length > BUDGET && kept.length > 1) {
      kept = kept.slice(0, kept.length - 1);
      json = JSON.stringify(kept);
    }
    console.warn(`[live-kv] recent-broadcasts trimmed to ${kept.length} entries / ${json.length}B`);
  }
  if (hasUpstash()) {
    await upstashCmd("SET", RECENT_BROADCASTS_KEY, json);
  } else {
    mem.set(RECENT_BROADCASTS_KEY, json);
  }
}

/** Overwrite the archive wholesale. Used by re-verification, which UPDATES
 *  existing claims in place — archiveBroadcast() merges by claim id and skips
 *  ones it already has, so it would silently discard those updates. */
export async function setRecentBroadcasts(list: RecentBroadcast[]): Promise<void> {
  const json = JSON.stringify(list.slice(0, 30));
  if (hasUpstash()) await upstashCmd("SET", RECENT_BROADCASTS_KEY, json);
  else mem.set(RECENT_BROADCASTS_KEY, json);
}

/** Append claims to an archived broadcast (manual "check this moment" on a
 *  replay). Deduped by quote so repeated checks of the same passage don't
 *  stack, and re-sorted by video time so the feed and timeline stay ordered. */
export async function appendClaimsToBroadcast(videoId: string, claims: LiveClaim[]): Promise<number> {
  const all = await getRecentBroadcasts();
  const b = all.find(x => x.videoId === videoId);
  if (!b) return 0;
  // Exact-match dedup let paraphrases through ("worst inflation in 48 years"
  // vs "...in fifty years" is the same claim, re-transcribed). Use the fuzzy
  // rule the extractor already applies so the record holds one copy.
  const existing = b.claims.map(c => c.quote);
  const fresh: LiveClaim[] = [];
  for (const c of claims) {
    if (!isDuplicateQuote(c.quote, [...existing, ...fresh.map(f => f.quote)])) fresh.push(c);
  }
  if (!fresh.length) return 0;
  b.claims = [...b.claims, ...fresh].sort((x, y) => (x.videoTime ?? 0) - (y.videoTime ?? 0));
  await setRecentBroadcasts(all);
  return fresh.length;
}

/** Claims already recorded near a point in a broadcast — lets a manual check
 *  answer from the record instead of spending model + search credits again. */
export async function claimsNearTime(videoId: string, videoTime: number, windowSec = 45): Promise<LiveClaim[]> {
  const all = await getRecentBroadcasts();
  const b = all.find(x => x.videoId === videoId);
  if (!b) return [];
  return b.claims.filter(c => c.videoTime != null && Math.abs(c.videoTime - videoTime) <= windowSec);
}

/** Remove one archived broadcast (ops/testing cleanup). */
export async function removeRecentBroadcast(videoId: string): Promise<boolean> {
  const all = await getRecentBroadcasts();
  const next = all.filter(b => b.videoId !== videoId);
  if (next.length === all.length) return false;
  const json = JSON.stringify(next);
  if (hasUpstash()) {
    await upstashCmd("SET", RECENT_BROADCASTS_KEY, json);
  } else {
    mem.set(RECENT_BROADCASTS_KEY, json);
  }
  return true;
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

// ── Promise Tracker archive ─────────────────────────────────────────
// Permanent (no TTL): the whole point is longitudinal accountability.

import type { PromiseFile } from "./promises";

const PROMISES_KEY = "promises:archive";

export async function getPromises(): Promise<PromiseFile | null> {
  let raw: string | null | undefined;
  if (hasUpstash()) raw = (await upstashCmd("GET", PROMISES_KEY)) as string | null;
  else raw = mem.get(PROMISES_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setPromises(file: PromiseFile): Promise<void> {
  const json = JSON.stringify(file);
  if (hasUpstash()) await upstashCmd("SET", PROMISES_KEY, json);
  else mem.set(PROMISES_KEY, json);
}

// ── On-demand video check queue ────────────────────────────────────
/**
 * "Check any video" used to fetch YouTube captions straight from the web
 * server. As of 3 Aug 2026 YouTube blocks that from every egress path this
 * app has — the player API answers "Sign in to confirm you're not a bot" and
 * the watch page is served stripped of caption metadata — while the GitHub
 * Actions worker still gets through.
 *
 * So the request becomes a JOB. The web app enqueues; the long-running
 * watcher (scripts/watch-live.mjs) drains the queue on its normal 2-minute
 * poll and does the work from a runner. Deliberately NO workflow_dispatch:
 * that needs a PAT, and the same reasoning that made the watcher poll-driven
 * in the first place applies here — a queue in KV needs no token, no webhook
 * and no inbound access to the repo.
 */
const CHECK_QUEUE_KEY = "vu:check:queue";
const CHECK_JOB_PREFIX = "vu:check:job:";
const CHECK_JOB_TTL_SEC = 60 * 60 * 24; // a day is plenty to collect a result

export type CheckJobStatus = "queued" | "running" | "done" | "failed";

export interface CheckJob {
  videoId: string;
  url: string;
  status: CheckJobStatus;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Position when it was accepted, so the UI can say something honest. */
  queuedBehind?: number;
  title?: string;
  claimCount?: number;
  error?: string;
}

async function readJob(videoId: string): Promise<CheckJob | null> {
  const key = CHECK_JOB_PREFIX + videoId;
  const raw = hasUpstash() ? ((await upstashCmd("GET", key)) as string | null) : mem.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function writeJob(job: CheckJob): Promise<void> {
  const key = CHECK_JOB_PREFIX + job.videoId;
  const json = JSON.stringify(job);
  if (hasUpstash()) await upstashCmd("SET", key, json, "EX", CHECK_JOB_TTL_SEC);
  else mem.set(key, json);
}

export async function getCheckJob(videoId: string): Promise<CheckJob | null> {
  return readJob(videoId);
}

/** Enqueue a check. Idempotent: asking twice for the same video returns the
 *  job already in flight rather than queueing duplicate work. */
export async function enqueueCheck(videoId: string, url: string): Promise<CheckJob> {
  const existing = await readJob(videoId);
  if (existing && existing.status !== "failed") return existing;

  const queue = await getCheckQueue();
  const job: CheckJob = {
    videoId,
    url,
    status: "queued",
    requestedAt: new Date().toISOString(),
    queuedBehind: queue.length,
  };
  await writeJob(job);
  if (!queue.includes(videoId)) {
    if (hasUpstash()) await upstashCmd("RPUSH", CHECK_QUEUE_KEY, videoId);
    else mem.set(CHECK_QUEUE_KEY, JSON.stringify([...queue, videoId]));
  }
  return job;
}

export async function getCheckQueue(): Promise<string[]> {
  if (hasUpstash()) {
    const r = (await upstashCmd("LRANGE", CHECK_QUEUE_KEY, 0, 49)) as string[] | null;
    return Array.isArray(r) ? r : [];
  }
  try { return JSON.parse(mem.get(CHECK_QUEUE_KEY) || "[]"); } catch { return []; }
}

/** Worker: take the next job, marking it running. Returns null when idle. */
export async function claimNextCheck(): Promise<CheckJob | null> {
  let videoId: string | null = null;
  if (hasUpstash()) {
    videoId = (await upstashCmd("LPOP", CHECK_QUEUE_KEY)) as string | null;
  } else {
    const q = await getCheckQueue();
    videoId = q.shift() || null;
    mem.set(CHECK_QUEUE_KEY, JSON.stringify(q));
  }
  if (!videoId) return null;

  const job = (await readJob(videoId)) || {
    videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
    status: "queued" as CheckJobStatus, requestedAt: new Date().toISOString(),
  };
  job.status = "running";
  job.startedAt = new Date().toISOString();
  await writeJob(job);
  return job;
}

export async function finishCheck(
  videoId: string,
  result: { title?: string; claimCount?: number; error?: string }
): Promise<void> {
  const job = (await readJob(videoId)) || {
    videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
    status: "running" as CheckJobStatus, requestedAt: new Date().toISOString(),
  };
  job.status = result.error ? "failed" : "done";
  job.finishedAt = new Date().toISOString();
  if (result.title) job.title = result.title;
  if (result.claimCount != null) job.claimCount = result.claimCount;
  if (result.error) job.error = result.error;
  await writeJob(job);
}
