import {
  getLedgerHealed, getLiveState, getLiveClaims, getRecentBroadcasts, getFullBroadcast,
  speakerFromTitle, kvGet, kvSetMany, type LiveClaim,
} from "./live-kv";
import { claimHash, claimPath } from "./claim-link";
import { CHART_KEY, type ClaimChart, type ClaimForChart } from "./claim-chart";
import { SERIES_KEY, type ClaimSeries } from "./claim-series";

/**
 * The Trending tab's feed: every True / Mostly true / False claim, newest
 * first, live broadcast included, each with its chart (when built).
 */
export interface TrendingClaim extends ClaimForChart {
  path: string; videoId: string; videoTime?: number;
  title: string; speaker: string | null; date: string; live: boolean;
  metricKey?: string | null; groundValue?: number | null;
  chart?: ClaimChart | null;
  series?: ClaimSeries | null;
}

export const TRENDING_RATINGS = new Set(["TRUE", "MOSTLY TRUE", "FALSE"]);
const FEED_KEY = "trending-claims:v1";
const FEED_TTL_MS = 3 * 60_000;
const MAX = 160;

function pick(c: LiveClaim, b: { videoId: string; title: string; startedAt: string }, live: boolean, speaker?: string | null): TrendingClaim {
  return {
    key: claimHash(b.videoId, c.quote), path: claimPath(b.videoId, c.quote),
    quote: c.quote, rating: (c.rating || "").toUpperCase(), actual: c.actual || "", explanation: c.explanation,
    claimedValue: c.claimedValue ?? null, sources: c.sources || [],
    videoId: b.videoId, videoTime: c.videoTime, title: b.title, speaker: speaker ?? speakerFromTitle(b.title),
    date: b.startedAt, live, metricKey: c.metricKey ?? null, groundValue: c.groundTruth?.value ?? null,
  };
}

/** Claims without charts (charts attached separately, so the list can be cached). */
export async function listTrendingClaims(): Promise<TrendingClaim[]> {
  try {
    const [raw] = await kvGet([FEED_KEY]);
    if (raw) { const hit = JSON.parse(raw) as { at: string; items: TrendingClaim[] }; if (Date.now() - Date.parse(hit.at) < FEED_TTL_MS) return hit.items; }
  } catch { /* rebuild */ }

  const [state, recent, ledger] = await Promise.all([
    getLiveState().catch(() => null), getRecentBroadcasts().catch(() => []), getLedgerHealed().catch(() => []),
  ]);
  const out = new Map<string, TrendingClaim>();
  const add = (t: TrendingClaim) => { if (TRENDING_RATINGS.has(t.rating) && t.quote && !out.has(t.key)) out.set(t.key, t); };

  if (state?.status === "live" && state.videoId) {
    for (const c of await getLiveClaims().catch(() => [])) add(pick(c, { videoId: state.videoId, title: state.title, startedAt: state.startedAt }, true));
  }
  for (const b of recent) for (const c of b.claims) add(pick(c, b, false));
  // Older broadcasts: the ledger keeps verdicts but not the structured
  // fields; the permanent full record has them.
  const seen = new Set(recent.map(b => b.videoId));
  const older = [...ledger].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .filter(e => !seen.has(e.videoId) && e.claims.some(c => TRENDING_RATINGS.has((c.rating || "").toUpperCase())));
  for (const e of older) {
    if (out.size >= MAX) break;
    const full = await getFullBroadcast(e.videoId).catch(() => null);
    const claims = (full?.claims?.length ? full.claims : e.claims) as LiveClaim[];
    for (const c of claims) add(pick(c, e, false, e.speaker));
  }
  const items = [...out.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.videoTime ?? 0) - (a.videoTime ?? 0))
    .slice(0, MAX);
  await kvSetMany([[FEED_KEY, JSON.stringify({ at: new Date().toISOString(), items }), 3600]]).catch(() => {});
  return items;
}

export async function getTrendingClaims(): Promise<TrendingClaim[]> {
  const items = await listTrendingClaims();
  if (!items.length) return [];
  const raws = await kvGet([...items.map(i => CHART_KEY(i.key)), ...items.map(i => SERIES_KEY(i.key))]);
  const parse = <T,>(r: string | null | undefined): T | null => { try { return r ? JSON.parse(r) as T : null; } catch { return null; } };
  return items.map((i, k) => ({
    ...i, explanation: i.explanation?.slice(0, 400),
    chart: i.metricKey ? null : parse<ClaimChart>(raws[k]),
    series: parse<ClaimSeries>(raws[items.length + k]),
  }));
}

/** Cron: pick an official series for the newest claims that lack one. */
export async function backfillClaimSeries(max = 8): Promise<number> {
  const { getClaimSeries } = await import("./claim-series");
  const items = await listTrendingClaims();
  if (!items.length) return 0;
  const have = await kvGet(items.map(i => SERIES_KEY(i.key)));
  const todo = items.filter((_, k) => !have[k]).slice(0, max);
  const res = await Promise.allSettled(todo.map(i => getClaimSeries(i)));
  return res.filter(r => r.status === "fulfilled" && r.value).length;
}

/** Cron: build charts for the newest web-checked claims that lack one. */
export async function backfillClaimCharts(max = 4): Promise<number> {
  const { getClaimChart } = await import("./claim-chart");
  const items = (await listTrendingClaims()).filter(i => !i.metricKey);
  if (!items.length) return 0;
  const have = await kvGet(items.map(i => CHART_KEY(i.key)));
  const todo = items.filter((_, k) => !have[k]).slice(0, max);
  const res = await Promise.allSettled(todo.map(i => getClaimChart(i)));
  return res.filter(r => r.status === "fulfilled" && r.value).length;
}
