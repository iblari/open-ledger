import { normalizeQuote } from "./align";
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
  const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status} (non-JSON body)` }));
  // Upstash reports failures (quota exhausted, bad token, deleted database)
  // as { error } with no `result`. This used to return undefined silently,
  // which every caller reads as "empty" — so an outage looked like an empty
  // archive instead of an error anyone could see.
  if (!resp.ok || (data && typeof data === "object" && "error" in data)) {
    console.error(`[upstash] ${String(args[0])} ${String(args[1] ?? "")} failed: HTTP ${resp.status} ${JSON.stringify((data as { error?: unknown })?.error ?? data).slice(0, 300)}`);
  }
  return data.result;
}

/**
 * Same as upstashCmd, but a failure THROWS instead of reading as "empty".
 *
 * Use it for the read half of every read-modify-write. With the lenient
 * version, an Upstash error (on 4 Oct: the plan's request limit) makes the
 * read return nothing, and the write that follows would then overwrite the
 * permanent ledger, the subscriber list or the live claims with just the new
 * item. Failing the whole operation loses one update; the lenient path loses
 * everything before it.
 */
export class KvError extends Error {}
async function upstashCmdStrict(...args: (string | number)[]): Promise<unknown> {
  const resp = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await resp.json().catch(() => null) as { result?: unknown; error?: unknown } | null;
  if (!resp.ok || !data || "error" in data) {
    const msg = `[upstash] ${String(args[0])} ${String(args[1] ?? "")} failed (strict): HTTP ${resp.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`;
    console.error(msg);
    throw new KvError(msg);
  }
  return data.result;
}

// ── In-memory fallback ────────────────────────────────────────────

const mem = new Map<string, string>();

// ── Public API ────────────────────────────────────────────────────

const LIVE_STATE_KEY = "live:state";
const LIVE_CLAIMS_KEY = "live:claims";
const LIVE_TRANSCRIPT_KEY = "live:transcript";

/** Get current live broadcast state */
/**
 * Claim a one-time flag. True only for the first caller; later callers — and
 * the next cron tick two minutes on — get false. Used so a coverage gap is
 * reported once, not every two minutes for the rest of the day.
 */
/** Many keys in one MGET (generic, for derived caches like the radar). */
export async function kvGet(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  if (hasUpstash()) {
    const r = (await upstashCmd("MGET", ...keys)) as (string | null)[] | undefined;
    return r || keys.map(() => null);
  }
  return keys.map(k => mem.get(k) ?? null);
}

/** Write several keys; ttlSec 0 = no expiry. One MSET for the permanent
 *  ones, one SET each for the few that expire. */
export async function kvSetMany(items: [string, string, number][]): Promise<void> {
  const forever = items.filter(i => !i[2]);
  const expiring = items.filter(i => i[2]);
  if (hasUpstash()) {
    if (forever.length) await upstashCmd("MSET", ...forever.flatMap(([k, v]) => [k, v]));
    for (const [k, v, ttl] of expiring) await upstashCmd("SET", k, v, "EX", ttl);
  } else {
    for (const [k, v] of items) mem.set(k, v);
  }
}

export async function claimOnce(key: string, ttlSec: number): Promise<boolean> {
  if (hasUpstash()) {
    const r = await upstashCmd("SET", key, "1", "NX", "EX", ttlSec);
    return r === "OK";
  }
  if (mem.get(key)) return false;
  mem.set(key, "1");
  return true;
}

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
export async function getLiveClaims(strict = false): Promise<LiveClaim[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await (strict ? upstashCmdStrict : upstashCmd)("GET", LIVE_CLAIMS_KEY)) as string | null;
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
  const existing = await getLiveClaims(true);
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

export async function getSubscribers(strict = false): Promise<SubscriberRecord[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await (strict ? upstashCmdStrict : upstashCmd)("GET", SUBSCRIBERS_KEY)) as string | null;
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
  const all = await getSubscribers(true);
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
  /** When this became watchable here, if later than it aired. A broadcast
   *  recovered from its recording days afterwards gets its 72 hours from this,
   *  not from endedAt — otherwise dating it correctly expires it on arrival. */
  availableAt?: string;
}

const RECENT_BROADCASTS_KEY = "live:recent";
const RECENT_TTL_MS = 72 * 3600 * 1000;

/** A ledger entry as a replayable broadcast: video, checks, figures and
 *  sources, but no transcript and no written "why" (the ledger never kept
 *  those). Used only when no full record exists. */
function fromLedger(e: LedgerEntry): RecentBroadcast {
  return {
    videoId: e.videoId,
    title: e.title,
    source: e.channel || "youtube",
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    transcript: "",
    claims: e.claims.map((c, i) => ({
      id: `${e.videoId}-r${i}`,
      quote: c.quote,
      rating: c.rating,
      actual: c.actual || "",
      explanation: "",
      videoTime: c.videoTime ?? 0,
      timestamp: new Date(Date.parse(e.startedAt) + (c.videoTime ?? 0) * 1000).toISOString(),
      ...(c.sources ? { sources: c.sources } : {}),
    })) as LiveClaim[],
  };
}

/** The 72-hour replay store (what /api/live-recent lists). */
async function getReplayableRaw(): Promise<RecentBroadcast[]> {
  return getRecentBroadcasts();
}

/* ── Permanent full records ───────────────────────────────────────────
 *
 * The 72-hour store holds the complete broadcast (every check with its
 * written "why", plus the transcript); the ledger keeps only a slim copy.
 * Each broadcast's full record is also written here, one key per broadcast,
 * never expiring — so a replay looks the same in a year as on the day.
 * ~100 KB a broadcast. One MSET per write, whatever the count.
 */
const BCAST_KEY = (id: string) => `bcast:${id}`;

export async function saveFullBroadcasts(list: RecentBroadcast[]): Promise<void> {
  const items = list.filter(b => b?.videoId);
  if (!items.length) return;
  const cap = (b: RecentBroadcast) => (b.transcript && b.transcript.length > 120_000 ? { ...b, transcript: "… " + b.transcript.slice(-120_000) } : b);
  if (hasUpstash()) {
    const args: string[] = [];
    for (const b of items) args.push(BCAST_KEY(b.videoId), JSON.stringify(cap(b)));
    await upstashCmd("MSET", ...args);
  } else {
    for (const b of items) mem.set(BCAST_KEY(b.videoId), JSON.stringify(cap(b)));
  }
}

export async function getFullBroadcast(id: string): Promise<RecentBroadcast | null> {
  const raw = hasUpstash() ? ((await upstashCmd("GET", BCAST_KEY(id))) as string | null) : mem.get(BCAST_KEY(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as RecentBroadcast; } catch { return null; }
}

/** One-time copy of whatever is in the 72-hour store into permanent keys
 *  (broadcasts archived before this existed). Guarded so it runs once. */
export async function healFullBroadcastsOnce(): Promise<number> {
  if (!(await claimOnce("bcast:healed:v1", 60 * 60 * 24 * 3650))) return 0;
  const recent = await getRecentBroadcasts(true);
  await saveFullBroadcasts(recent);
  return recent.length;
}

/** Lay a stored alignment over a broadcast (see getReplayable). */
function withAlignment(b: RecentBroadcast, a: Alignment | null): RecentBroadcast & { aligned?: boolean } {
  if (!a) return b;
  return {
    ...b,
    aligned: true,
    transcript: a.transcript || b.transcript,
    claims: b.claims.map(c => {
      const t = a.times[normalizeQuote(c.quote)];
      return t != null
        ? { ...c, videoTime: t, aligned: true }
        : { ...c, videoTime: Math.max(0, (c.videoTime ?? 0) - a.offset), aligned: false };
    }) as LiveClaim[],
  };
}

/**
 * Any broadcast we've ever covered, ready to replay: the 72-hour store if
 * it's still there, else its permanent full record, else the ledger's slim
 * copy. Alignment applied in every case.
 */
export async function getReplayableOne(id: string): Promise<(RecentBroadcast & { aligned?: boolean }) | null> {
  const recent = (await getRecentBroadcasts().catch(() => [] as RecentBroadcast[])).find(b => b.videoId === id);
  let b: RecentBroadcast | null = recent ?? null;
  if (!b) b = await getFullBroadcast(id).catch(() => null);
  if (!b) {
    const e = (await getLedger().catch(() => [] as LedgerEntry[])).find(x => x.videoId === id);
    if (e) b = fromLedger(e);
  }
  if (!b) return null;
  const a = await getAlignment(id).catch(() => null);
  return withAlignment(b, a);
}

/* ── Post-broadcast alignment ─────────────────────────────────────────
 *
 * Kept apart from the broadcast records rather than written into them: a
 * replay can come from the 72-hour store or from the ledger, whose claim ids
 * differ, and the overlay applies the same result to either by quote. It also
 * means a bad alignment is one key to delete, not a rewrite of the record.
 */
export interface Alignment {
  alignedAt: string;
  /** normalizeQuote(quote) → second in the recording. */
  times: Record<string, number>;
  /** Live stamp − recording time; applied to claims that could not be found. */
  offset: number;
  matched: number;
  total: number;
  /** Recording-timed transcript, "[m:ss] text" lines. */
  transcript: string;
}

const ALIGN_KEY = (id: string) => `align:${id}`;
const ALIGN_TRY_KEY = (id: string) => `align:try:${id}`;
const ALIGN_TRIES_KEY = (id: string) => `align:tries:${id}`;
const ALIGN_MAX_TRIES = 4;
/** YouTube needs time to finish processing a long stream into a recording. */
const ALIGN_MIN_AGE_MS = 20 * 60_000;

export async function getAlignment(videoId: string): Promise<Alignment | null> {
  const raw = hasUpstash()
    ? ((await upstashCmd("GET", ALIGN_KEY(videoId))) as string | null)
    : mem.get(ALIGN_KEY(videoId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Alignment; } catch { return null; }
}

/** Many alignments in ONE command (MGET). The replay list and the worker's
 *  "what needs aligning?" poll used to issue a GET per broadcast, per request
 *  — the single biggest line on the Upstash bill. */
async function getAlignments(ids: string[]): Promise<(Alignment | null)[]> {
  if (!ids.length) return [];
  const raws: (string | null)[] = hasUpstash()
    ? (((await upstashCmd("MGET", ...ids.map(ALIGN_KEY))) as (string | null)[] | undefined) || ids.map(() => null))
    : ids.map(id => mem.get(ALIGN_KEY(id)) ?? null);
  return raws.map(r => { if (!r) return null; try { return JSON.parse(r) as Alignment; } catch { return null; } });
}

export async function setAlignment(videoId: string, a: Alignment): Promise<void> {
  // No expiry: the ledger is permanent, and so is knowing where its quotes sit.
  const json = JSON.stringify(a);
  if (hasUpstash()) await upstashCmd("SET", ALIGN_KEY(videoId), json);
  else mem.set(ALIGN_KEY(videoId), json);
}

/**
 * The next finished broadcast whose claims have not been re-timed, or null.
 * Claims a 30-minute lease so the worker is not handed the same one while it
 * is still downloading, and gives up after four tries — a recording that is
 * private or deleted should not be retried forever.
 */
export async function claimNextAlignment(): Promise<{ videoId: string; title: string } | null> {
  const now = Date.now();
  const list = (await getReplayableRaw()).filter(b =>
    b.videoId && b.claims?.length && now - Date.parse(b.endedAt) >= ALIGN_MIN_AGE_MS);
  if (!list.length) return null;
  // Two commands for the whole list instead of two per broadcast.
  const ids = list.map(b => b.videoId);
  const [aligns, triesRaw] = await Promise.all([
    getAlignments(ids),
    hasUpstash()
      ? ((upstashCmd("MGET", ...ids.map(ALIGN_TRIES_KEY)) as Promise<(string | null)[] | undefined>).then(r => r || ids.map(() => null)))
      : Promise.resolve(ids.map(id => mem.get(ALIGN_TRIES_KEY(id)) ?? null)),
  ]);
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (aligns[k]) continue;
    const tries = Number(triesRaw[k]) || 0;
    if (tries >= ALIGN_MAX_TRIES) continue;
    if (!(await claimOnce(ALIGN_TRY_KEY(b.videoId), 30 * 60))) continue;
    if (hasUpstash()) await upstashCmd("INCR", ALIGN_TRIES_KEY(b.videoId));
    else mem.set(ALIGN_TRIES_KEY(b.videoId), String(tries + 1));
    return { videoId: b.videoId, title: b.title };
  }
  return nextTranscriptBackfill();
}

/* ── Transcript backfill ───────────────────────────────────────────────
 *
 * The agenda radar reads full transcripts, and broadcasts recorded before
 * full records were kept have none. They are queued once (seed) and fed to
 * the same worker job that re-times claims — it already downloads and
 * transcribes the recording, and its result carries the transcript. Only
 * when nothing recent is waiting, so live-era work always goes first.
 */
const BACKFILL_KEY = "align:backfill";

async function readBackfill(): Promise<{ videoId: string; title: string }[]> {
  const raw = hasUpstash() ? ((await upstashCmd("GET", BACKFILL_KEY)) as string | null) : mem.get(BACKFILL_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function nextTranscriptBackfill(): Promise<{ videoId: string; title: string } | null> {
  const queue = await readBackfill();
  if (!queue.length) return null;
  const ids = queue.map(q => q.videoId);
  const [aligns, triesRaw] = await Promise.all([
    hasUpstash()
      ? ((upstashCmd("MGET", ...ids.map(ALIGN_KEY)) as Promise<(string | null)[] | undefined>).then(r => (r || []).map(x => !!x)))
      : Promise.resolve(ids.map(id => !!mem.get(ALIGN_KEY(id)))),
    hasUpstash()
      ? ((upstashCmd("MGET", ...ids.map(ALIGN_TRIES_KEY)) as Promise<(string | null)[] | undefined>).then(r => r || ids.map(() => null)))
      : Promise.resolve(ids.map(id => mem.get(ALIGN_TRIES_KEY(id)) ?? null)),
  ]);
  const left = queue.filter((_, i) => !aligns[i] && (Number(triesRaw[i]) || 0) < ALIGN_MAX_TRIES);
  if (left.length !== queue.length) {
    const json = JSON.stringify(left);
    if (hasUpstash()) await upstashCmd("SET", BACKFILL_KEY, json); else mem.set(BACKFILL_KEY, json);
  }
  for (const q of left) {
    if (!(await claimOnce(ALIGN_TRY_KEY(q.videoId), 30 * 60))) continue;
    const tries = Number(triesRaw[ids.indexOf(q.videoId)]) || 0;
    if (hasUpstash()) await upstashCmd("INCR", ALIGN_TRIES_KEY(q.videoId));
    else mem.set(ALIGN_TRIES_KEY(q.videoId), String(tries + 1));
    return q;
  }
  return null;
}

/** Once ever: queue every ledger broadcast with no transcript anywhere
 *  (no alignment, no transcript in its full record). ~2 reads a broadcast,
 *  one time. Newest first, so the radar's recent weeks fill in first. */
export async function seedTranscriptBackfillOnce(): Promise<number> {
  if (!(await claimOnce("align:backfill:seeded:v1", 60 * 60 * 24 * 3650))) return 0;
  const ledger = await getLedger(true);
  const missing: { videoId: string; title: string }[] = [];
  for (const e of [...ledger].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    if (await getAlignment(e.videoId).catch(() => null)) continue;
    const full = await getFullBroadcast(e.videoId).catch(() => null);
    if (full?.transcript && full.transcript.length > 1000) continue;
    missing.push({ videoId: e.videoId, title: e.title });
  }
  const json = JSON.stringify(missing);
  if (hasUpstash()) await upstashCmd("SET", BACKFILL_KEY, json); else mem.set(BACKFILL_KEY, json);
  return missing.length;
}

/** Claims of a replayable broadcast as stored, before any alignment. */
export async function getReplayableClaims(videoId: string): Promise<LiveClaim[] | null> {
  const b = (await getReplayableRaw()).find(x => x.videoId === videoId) ?? await getFullBroadcast(videoId).catch(() => null);
  return b ? b.claims : null;
}

/**
 * Replay store + restored broadcasts, with any alignment laid over them:
 * located claims take their recording time, the rest shift by the measured
 * offset, and the transcript becomes the recording-timed one. `aligned` tells
 * the player it can drop the live-era guesswork.
 */
export async function getReplayable(): Promise<(RecentBroadcast & { aligned?: boolean })[]> {
  const list = await getReplayableRaw();
  const aligns = await getAlignments(list.map(b => b.videoId)).catch(() => list.map(() => null));
  return list.map((b, i) => withAlignment(b, aligns[i]));
}

export async function getRecentBroadcasts(strict = false): Promise<RecentBroadcast[]> {
  let raw: string | null | undefined;
  if (hasUpstash()) {
    raw = (await (strict ? upstashCmdStrict : upstashCmd)("GET", RECENT_BROADCASTS_KEY)) as string | null;
  } else {
    raw = mem.get(RECENT_BROADCASTS_KEY);
  }
  if (!raw) return [];
  try {
    const all: RecentBroadcast[] = JSON.parse(raw);
    const cutoff = Date.now() - RECENT_TTL_MS;
    // Kept for 72 hours from whichever is later: the broadcast ending, or it
    // becoming available here. The 22 Sep Vance press conference was
    // recovered on the 27th, correctly dated, and pruned on the very next
    // write — before its claims had even been checked.
    return all.filter(b => Math.max(Date.parse(b.endedAt), Date.parse(b.availableAt || "") || 0) > cutoff);
  } catch {
    return [];
  }
}

/**
 * The ledger, with anything the 72-hour cache has that it doesn't folded in.
 *
 * recordInLedger is awaited inside archiveBroadcast but its failure is caught,
 * so a KV blip loses a broadcast from the permanent record while leaving it in
 * the replay cache — and after 72 hours the cache prunes and it is gone for
 * good. This reconciles on read, so every surface that shows the ledger repairs
 * it rather than only the one route that happened to implement the repair.
 *
 * Callers that READ the ledger should use this. recordInLedger itself must keep
 * using getLedger(), or writing an entry would recurse into reconciling.
 */
export async function getLedgerHealed(): Promise<LedgerEntry[]> {
  const [ledger, recent] = await Promise.all([
    getLedger(),
    getRecentBroadcasts().catch(() => [] as RecentBroadcast[]),
  ]);
  const known = new Set(ledger.map(e => e.videoId));
  const missing = recent.filter(b => !known.has(b.videoId));
  if (!missing.length) return ledger;
  await Promise.all(missing.map(b => recordInLedger(b).catch(() => null)));
  return getLedger();
}

/** Archive an ended broadcast (deduped by videoId — a re-covered stream
 *  replaces its earlier entry, merging claims). Prunes >72h entries. */
export async function archiveBroadcast(b: RecentBroadcast): Promise<void> {
  // Record it permanently FIRST. The block below is a 72-hour cache that
  // prunes on every write; if this call came after it, a broadcast could be
  // pruned before it was ever recorded.
  //
  // AWAITED, despite the failure here being non-fatal. This ran detached so a
  // ledger error could not fail the replay write, but a detached promise on a
  // serverless function is simply lost: the runtime freezes once the response
  // is sent, so the permanent record of a broadcast could vanish because the
  // request that would have written it finished first. The catch preserves the
  // original intent — a ledger failure still must not block the replay write —
  // while guaranteeing the attempt actually completes.
  await recordInLedger(b).catch(e =>
    console.error("[ledger] failed to record", b.videoId, (e as Error).message)
  );

  // Cap the transcript to its final ~120K chars (~3h of speech) so a single
  // marathon session can't blow up the recent-broadcasts KV entry.
  if (b.transcript && b.transcript.length > 120_000) {
    b = { ...b, transcript: "… " + b.transcript.slice(-120_000) };
  }
  const all = await getRecentBroadcasts(true); // already pruned
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
  // Permanent full record of the broadcast just archived (merged copy if it
  // was a re-coverage). Its transcript is never shed here, unlike above.
  const found = all.find(x => x.videoId === b.videoId);
  const merged = found ? { ...found, transcript: found.transcript || b.transcript } : b;
  await saveFullBroadcasts([merged]).catch(e => console.error("[bcast] save failed", (e as Error).message));
}

/** Overwrite the archive wholesale. Used by re-verification, which UPDATES
 *  existing claims in place — archiveBroadcast() merges by claim id and skips
 *  ones it already has, so it would silently discard those updates. */
export async function setRecentBroadcasts(list: RecentBroadcast[]): Promise<void> {
  const json = JSON.stringify(list.slice(0, 30));
  if (hasUpstash()) await upstashCmd("SET", RECENT_BROADCASTS_KEY, json);
  else mem.set(RECENT_BROADCASTS_KEY, json);
  // Re-verification and late checks update claims in place; keep the
  // permanent records in step.
  await saveFullBroadcasts(list.slice(0, 30)).catch(e => console.error("[bcast] save failed", (e as Error).message));
}

/** Append claims to an archived broadcast (manual "check this moment" on a
 *  replay). Deduped by quote so repeated checks of the same passage don't
 *  stack, and re-sorted by video time so the feed and timeline stay ordered. */
export async function appendClaimsToBroadcast(videoId: string, claims: LiveClaim[]): Promise<number> {
  const all = await getRecentBroadcasts(true);
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
  const all = await getRecentBroadcasts(true);
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
export async function enqueueCheck(videoId: string, url: string, opts: { rerun?: boolean } = {}): Promise<CheckJob> {
  const existing = await readJob(videoId);
  // A finished job normally answers repeat requests, but a rerun (a recovered
  // video still at zero claims) must actually go back in the queue.
  // A job left "running" by a worker that was cancelled or crashed mid-check
  // would otherwise answer every request forever. Twenty minutes is well past
  // the longest real check (8 min download + 10 min transcription caps).
  const stuck = existing?.status === "running" &&
    Date.now() - Date.parse((existing as { startedAt?: string }).startedAt || existing.requestedAt) > 20 * 60_000;
  if (existing && existing.status !== "failed" && !stuck && !(opts.rerun && existing.status === "done")) return existing;

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

// ── Permanent broadcast ledger ─────────────────────────────────────
/**
 * The 72-hour store above is a REPLAY CACHE, not a record. It prunes on
 * every write, so a broadcast is gone three days after it airs — transcript,
 * claims, verdicts, all of it. That is correct for replay (transcripts are
 * heavy) and catastrophic for history: every broadcast covered before this
 * shipped has already been destroyed.
 *
 * This is the record. One small row per broadcast — no transcript, just what
 * you would want to count later: who, when, how long, and the verdict mix.
 * A row is well under 1KB, so a year of daily coverage is a few megabytes.
 *
 * Append-only by design. Re-covering the same videoId updates its row rather
 * than adding a second, and nothing here is ever pruned by age.
 */
const LEDGER_KEY = "live:ledger";

export interface LedgerEntry {
  videoId: string;
  title: string;
  /** Best-effort speaker from the title. Null when it can't be read — a
   *  wrong attribution is worse than an absent one on this product. */
  speaker: string | null;
  channel: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  /** Verdict counts. `unscored` covers projections and unaudited claims,
   *  which deliberately don't count toward accuracy. */
  counts: {
    total: number;
    true: number;
    misleading: number;
    false: number;
    unverifiable: number;
    unconfirmed: number;
    projection: number;
  };
  /** Claims kept WITHOUT transcript context: quote, verdict, figures, source. */
  claims: {
    quote: string; rating: string; actual?: string;
    videoTime?: number; sources?: { title: string; url: string }[];
  }[];
  recordedAt: string;
}

/**
 * Read a speaker out of a broadcast title.
 *
 * Deliberately conservative. "President Trump Delivers Remarks" is
 * unambiguous; a Cabinet meeting has eight people making claims and no title
 * can tell you which said what. Returning null there is the honest answer —
 * real per-speaker attribution needs diarization at ingest, which would only
 * apply to future broadcasts anyway.
 */
/**
 * The people we actually cover. Matching against a known roster beats parsing
 * names out of arbitrary titles: the old role-based regex read "Vice President
 * JD Vance" as "Vice President JD" (it took exactly one token after the role to
 * avoid swallowing verbs like "Delivers"), and missed "JD Vance leads..."
 * entirely because no role word preceded the name.
 */
const PRINCIPALS: { name: string; re: RegExp }[] = [
  { name: "Donald Trump", re: /\b(?:president\s+)?donald\s+(?:j\.?\s+)?trump\b|\bpresident\s+trump\b/i },
  { name: "JD Vance", re: /\bj\.?\s?d\.?\s+vance\b|\bvice\s+president\s+vance\b/i },
  { name: "Melania Trump", re: /\b(?:first\s+lady\s+)?melania\s+trump\b/i },
  { name: "Marco Rubio", re: /\b(?:secretary\s+)?marco\s+rubio\b|\bsecretary\s+rubio\b/i },
  { name: "Pam Bondi", re: /\b(?:attorney\s+general\s+)?pam\s+bondi\b|\battorney\s+general\s+bondi\b/i },
  { name: "Scott Bessent", re: /\b(?:secretary\s+)?scott\s+bessent\b|\bsecretary\s+bessent\b/i },
  { name: "Karoline Leavitt", re: /\bkaroline\s+leavitt\b/i },
  { name: "Pete Hegseth", re: /\b(?:secretary\s+)?pete\s+hegseth\b|\bsecretary\s+hegseth\b/i },
  { name: "Jerome Powell", re: /\b(?:chair(?:man)?\s+)?jerome\s+powell\b|\bchair(?:man)?\s+powell\b/i },
];

/** Formats where several principals share the microphone by design, so no
 *  single attribution is defensible even when one name appears in the title. */
const SHARED_FORMAT = /\b(cabinet meeting|roundtable|round table|hearing|panel|committee|summit|town hall|debate|joint (?:address|session|press conference))\b/i;

/**
 * Read the broadcast's principal speaker from its title.
 *
 * Caveat worth remembering when reading any per-speaker number: this is
 * BROADCAST-level attribution, not claim-level. Every claim in a Q&A or a
 * press briefing is credited to whoever is at the podium, including the ones
 * a reporter or a guest actually said. Fixing that needs speaker diarisation
 * of the transcript, which we don't do yet.
 */
export function speakerFromTitle(title: string): string | null {
  const t = (title || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (SHARED_FORMAT.test(t)) return null;
  const hits = PRINCIPALS.filter(p => p.re.test(t));
  // Two principals named means we cannot say who spoke which claim.
  return hits.length === 1 ? hits[0].name : null;
}

export async function getLedger(strict = false): Promise<LedgerEntry[]> {
  const raw = hasUpstash()
    ? ((await (strict ? upstashCmdStrict : upstashCmd)("GET", LEDGER_KEY)) as string | null)
    : mem.get(LEDGER_KEY);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    // Speaker is derived, never trusted from storage. Entries written before
    // the roster fix carry "Vice President JD" (a truncation) or null where a
    // principal was in fact named, and re-reading the title heals both without
    // a migration.
    return (p as LedgerEntry[]).map(e => ({ ...e, speaker: speakerFromTitle(e.title) }));
  } catch { return []; }
}

async function setLedger(list: LedgerEntry[]): Promise<void> {
  const json = JSON.stringify(list);
  if (hasUpstash()) await upstashCmd("SET", LEDGER_KEY, json);
  else mem.set(LEDGER_KEY, json);
}

/** Record (or update) one broadcast in the permanent ledger. */
export async function recordInLedger(b: RecentBroadcast): Promise<LedgerEntry> {
  const counts = {
    total: b.claims.length, true: 0, misleading: 0, false: 0,
    unverifiable: 0, unconfirmed: 0, projection: 0,
  };
  for (const c of b.claims) {
    const r = (c.rating || "").toUpperCase();
    if (r === "TRUE" || r === "MOSTLY TRUE") counts.true++;
    else if (r === "MISLEADING") counts.misleading++;
    else if (r === "FALSE") counts.false++;
    else if (r === "UNCONFIRMED") counts.unconfirmed++;
    else if (r === "PROJECTION") counts.projection++;
    else counts.unverifiable++;
  }

  const start = Date.parse(b.startedAt), end = Date.parse(b.endedAt);
  const entry: LedgerEntry = {
    videoId: b.videoId,
    title: b.title,
    speaker: speakerFromTitle(b.title),
    channel: b.source || "unknown",
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    durationSec: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0,
    counts,
    claims: b.claims.map(c => ({
      quote: c.quote,
      rating: c.rating,
      actual: c.actual,
      videoTime: c.videoTime,
      sources: (c as { sources?: { title: string; url: string }[] }).sources,
    })),
    recordedAt: new Date().toISOString(),
  };

  const all = await getLedger(true);
  const i = all.findIndex(x => x.videoId === entry.videoId);
  // Re-coverage updates in place; a broadcast is one row forever.
  if (i >= 0) all[i] = { ...entry, recordedAt: all[i].recordedAt };
  else all.unshift(entry);
  await setLedger(all);
  return entry;
}

// ── Claim topic tags ─────────────────────────────────────────────
// normalised quote → topic. A hash so one claim can be tagged without
// rewriting the rest. See lib/claim-topics.ts for why tags are stored.
const TOPIC_TAGS_KEY = "claim-topics:v1";

export async function getTopicTagMap(): Promise<Record<string, string>> {
  if (!hasUpstash()) {
    const raw = mem.get(TOPIC_TAGS_KEY);
    return raw ? JSON.parse(raw) : {};
  }
  const flat = (await upstashCmd("HGETALL", TOPIC_TAGS_KEY)) as string[] | null;
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

export async function setTopicTags(tags: Record<string, string>): Promise<number> {
  const entries = Object.entries(tags);
  if (!entries.length) return 0;
  if (!hasUpstash()) {
    const cur = await getTopicTagMap();
    mem.set(TOPIC_TAGS_KEY, JSON.stringify({ ...cur, ...tags }));
    return entries.length;
  }
  // HSET in chunks: one oversized request is the likeliest way for a
  // backfill to half-apply.
  for (let i = 0; i < entries.length; i += 100) {
    await upstashCmd("HSET", TOPIC_TAGS_KEY, ...entries.slice(i, i + 100).flat());
  }
  return entries.length;
}
