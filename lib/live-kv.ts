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
