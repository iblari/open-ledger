// Vote Unbiased — Live Insights.
//
// Same idea as lib/insights.ts but works on the FRESH FRED data returned by
// /api/benchmark-data, not on the static annual snapshots in lib/metrics-data.
// The API endpoint refreshes every 24h and serves monthly / weekly / quarterly
// / daily series depending on the metric (unemployment monthly, jobless claims
// weekly, S&P 500 daily, GDP quarterly, etc.) — giving insights actual
// freshness rather than "in 2024" framing.
//
// IMPORTANT: this file is shape-compatible with the existing Insight type from
// lib/insights so the InsightsStrip component can render either source.
// Detectors here are tuned to a "months since admin's inauguration" coordinate
// system — that's how the benchmark API serves data, aligned for the
// month-of-term comparison feature.

import type { Insight, InsightKind } from "./insights";
import type { AdminId } from "./metrics-data";

// ── Shape of the /api/benchmark-data payload (subset we use) ───────

export interface LivePoint { month: number; value: number }
export interface LiveSeries {
  id: string;       // admin id ("trump2", "biden", ...)
  name: string;     // display name
  party: string;
  current: boolean; // true for the sitting admin
  data: LivePoint[];
}
export interface LiveMetric {
  label: string;
  short: string;
  unit: string;
  lowerBetter: boolean;
  cat: string;
  series: LiveSeries[];
}
export interface LiveBenchmarkPayload {
  lastUpdated: string;
  currentMonth: number;
  admins: { id: string; name: string; party: string; current?: boolean }[];
  categories: Record<string, string>;
  metrics: Record<string, LiveMetric>;
  error?: string;
}

// ── Calendar helpers ──────────────────────────────────────────────

// Each admin's inauguration date. Used to translate a series's `month` (=
// months since that admin's inauguration) back into a calendar Date for
// editorial copy like "as of Sept 2025."
const INAUG: Record<string, string> = {
  nixon:   "1969-01-20", carter:  "1977-01-20", reagan:  "1981-01-20",
  bush41:  "1989-01-20", clinton: "1993-01-20", bush43:  "2001-01-20",
  obama:   "2009-01-20", trump1:  "2017-01-20", biden:   "2021-01-20",
  trump2:  "2025-01-20",
};

/** Convert (admin-id, month-of-term) → a calendar Date at month start. */
function monthToDate(adminId: string, month: number): Date {
  const inaug = INAUG[adminId] ?? "2025-01-20";
  const d = new Date(inaug);
  d.setMonth(d.getMonth() + month);
  return d;
}

/** "Sept 2025" / "Q3 2025" — short label for an admin+month coordinate. */
function fmtMonthLabel(adminId: string, month: number): string {
  const d = monthToDate(adminId, month);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** Format a value with the metric's unit. Mirrors the benchmark page's logic. */
function fmtVal(v: number, unit: string): string {
  if (unit === "T") return `$${v.toFixed(1)}T`;
  if (unit === "B") return `$${v.toFixed(0)}B`;
  if (unit === "M") return `${v.toFixed(2)}M`;
  if (unit === "K") return `${v > 0 ? "+" : ""}${v.toFixed(0)}K`;
  if (unit === "$") return `$${v.toFixed(2)}`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return v.toFixed(1) + unit;
}

/** AdminId-compatible cast — the live API uses the same id strings as the
 *  static AdminId union, so we can pass the value straight through to the
 *  deep-link without runtime checks. */
function toAdminId(id: string): AdminId | null {
  const valid = ["clinton", "bush", "obama", "trump1", "biden", "trump2"];
  if (valid.includes(id)) return id as AdminId;
  // Pre-1993 admins exist in FRED data but aren't in our dashboard, so they
  // get null and the deep-link skips the &admin= param.
  return null;
}

// ── Detectors ─────────────────────────────────────────────────────

/** Find the CURRENT admin's series + latest data point. The "freshest
 *  observation" insight every detector below pivots around. Returns null if
 *  no current admin found or no data. */
function getLatest(m: LiveMetric): { admin: LiveSeries; point: LivePoint } | null {
  const admin = m.series.find(s => s.current);
  if (!admin || admin.data.length === 0) return null;
  const point = admin.data[admin.data.length - 1];
  return { admin, point };
}

/** Simple insight: "X is at Y% as of [Month YYYY]." Always available if
 *  there's data. Lower score baseline — gets included only if nothing more
 *  notable fires for this metric. */
function detectLatestPrint(key: string, m: LiveMetric): Insight | null {
  const latest = getLatest(m);
  if (!latest) return null;
  const dateLabel = fmtMonthLabel(latest.admin.id, latest.point.month);
  return {
    id: `${key}:latest`,
    metricKey: key as never, metricLabel: m.label,
    year: monthToDate(latest.admin.id, latest.point.month).getFullYear(),
    admin: toAdminId(latest.admin.id),
    kind: "above_average" as InsightKind,
    headline: `${m.label}: ${fmtVal(latest.point.value, m.unit)} as of ${dateLabel}`,
    context: `Most recent print, sourced from FRED.`,
    score: 25,
  };
}

/** Compare latest value vs prior month (or quarter — series is whatever
 *  cadence FRED publishes). Score scales with magnitude vs trailing stdev. */
function detectMonthlyChange(key: string, m: LiveMetric): Insight | null {
  const latest = getLatest(m);
  if (!latest || latest.admin.data.length < 6) return null;
  const arr = latest.admin.data;
  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  const delta = last.value - prev.value;
  const trailing = arr.slice(-13, -1).map(p => p.value); // ~1yr trailing
  const mean = trailing.reduce((s, v) => s + v, 0) / trailing.length;
  const stdev = Math.sqrt(trailing.reduce((s, v) => s + (v - mean) ** 2, 0) / trailing.length);
  const z = stdev > 0 ? Math.abs(delta) / stdev : 0;
  if (z < 1.0) return null; // not big enough vs recent volatility

  const score = Math.min(70, 30 + z * 10);
  const dateLabel = fmtMonthLabel(latest.admin.id, last.month);
  const verb = delta >= 0 ? (m.lowerBetter ? "rose" : "rose") : (m.lowerBetter ? "fell" : "fell");
  const goodOrBad = (delta >= 0) !== m.lowerBetter; // delta direction × inverse-ness
  const headline = `${m.label} ${verb} to ${fmtVal(last.value, m.unit)} in ${dateLabel}`;
  // Find when we last saw a move this size, for context
  let lastBigMoveAgo = arr.length;
  for (let i = arr.length - 2; i > 0; i--) {
    const d = Math.abs(arr[i].value - arr[i - 1].value);
    if (d >= Math.abs(delta)) { lastBigMoveAgo = arr.length - 1 - i; break; }
  }
  const monthsAgoTxt = lastBigMoveAgo >= arr.length
    ? "the biggest move in the available series"
    : `the biggest move in ${lastBigMoveAgo} ${lastBigMoveAgo === 1 ? "month" : "months"}`;
  const context = `${prev.value.toFixed(1)} → ${last.value.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}) — ${monthsAgoTxt}.${goodOrBad ? "" : ""}`;
  return {
    id: `${key}:monthly_change`,
    metricKey: key as never, metricLabel: m.label,
    year: monthToDate(latest.admin.id, last.month).getFullYear(),
    admin: toAdminId(latest.admin.id),
    kind: "biggest_move",
    headline, context, score,
  };
}

/** Current value vs the same month-of-term across all prior admins.
 *  "Trump II at month 10: unemployment 4.2% — better than 6 of 9 prior admins
 *  at this point." Powerful framing: the central question of Live Benchmark. */
function detectMonthOfTermRank(key: string, m: LiveMetric): Insight | null {
  const latest = getLatest(m);
  if (!latest) return null;
  const targetMonth = latest.point.month;
  if (targetMonth < 3) return null; // too early to compare meaningfully

  const peers: { id: string; v: number }[] = [];
  for (const s of m.series) {
    if (s.current) continue;
    // Find this admin's value at the closest month
    const pt = [...s.data].filter(p => p.month <= targetMonth + 1 && p.month >= targetMonth - 1)
      .sort((a, b) => Math.abs(a.month - targetMonth) - Math.abs(b.month - targetMonth))[0];
    if (pt) peers.push({ id: s.id, v: pt.value });
  }
  if (peers.length < 4) return null; // need a peer group

  const cur = latest.point.value;
  // "Better than" depends on whether lower is better.
  const betterCount = peers.filter(p => m.lowerBetter ? p.v > cur : p.v < cur).length;
  const totalPeers = peers.length;
  const isStandout = betterCount >= totalPeers * 0.7 || betterCount <= totalPeers * 0.3;
  if (!isStandout) return null; // middle-of-pack isn't an "insight"

  const score = 55;
  const dateLabel = fmtMonthLabel(latest.admin.id, targetMonth);
  const adverb = m.lowerBetter ? "lower" : "higher";
  const direction = betterCount >= totalPeers * 0.7 ? "better" : "worse";
  const headline = direction === "better"
    ? `${m.label}: ${fmtVal(cur, m.unit)} — better than ${betterCount}/${totalPeers} prior administrations`
    : `${m.label}: ${fmtVal(cur, m.unit)} — worse than ${totalPeers - betterCount}/${totalPeers} prior administrations`;
  const context = `Compared at month ${targetMonth} (${dateLabel}, ${adverb} = better).`;
  return {
    id: `${key}:rank`,
    metricKey: key as never, metricLabel: m.label,
    year: monthToDate(latest.admin.id, targetMonth).getFullYear(),
    admin: toAdminId(latest.admin.id),
    kind: direction === "better" ? "extreme_low" : "extreme_high",
    headline, context, score,
  };
}

/** Latest value vs the entire current-admin series — is this a new high/low
 *  for this presidency? (e.g. "Inflation at 2.1% — lowest of Trump II's term.") */
function detectTermExtreme(key: string, m: LiveMetric): Insight | null {
  const latest = getLatest(m);
  if (!latest || latest.admin.data.length < 4) return null;
  const arr = latest.admin.data;
  const cur = arr[arr.length - 1];
  const prior = arr.slice(0, -1).map(p => p.value);
  if (cur.value >= Math.max(...prior)) {
    const dateLabel = fmtMonthLabel(latest.admin.id, cur.month);
    return {
      id: `${key}:term_high`,
      metricKey: key as never, metricLabel: m.label,
      year: monthToDate(latest.admin.id, cur.month).getFullYear(),
      admin: toAdminId(latest.admin.id),
      kind: "extreme_high",
      headline: `${m.label} at term high: ${fmtVal(cur.value, m.unit)}`,
      context: `As of ${dateLabel} — the highest level of ${latest.admin.name}'s term so far.`,
      score: m.lowerBetter ? 65 : 50, // bad-news high is more interesting
    };
  }
  if (cur.value <= Math.min(...prior)) {
    const dateLabel = fmtMonthLabel(latest.admin.id, cur.month);
    return {
      id: `${key}:term_low`,
      metricKey: key as never, metricLabel: m.label,
      year: monthToDate(latest.admin.id, cur.month).getFullYear(),
      admin: toAdminId(latest.admin.id),
      kind: "extreme_low",
      headline: `${m.label} at term low: ${fmtVal(cur.value, m.unit)}`,
      context: `As of ${dateLabel} — the lowest level of ${latest.admin.name}'s term so far.`,
      score: m.lowerBetter ? 55 : 65,
    };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────

/** Run live detectors over a /api/benchmark-data response. Returns top N
 *  insights ranked by score, deduped by metric. */
export function generateLiveInsights(
  payload: LiveBenchmarkPayload,
  opts: { limit?: number } = {},
): Insight[] {
  const { limit = 5 } = opts;
  const candidates: Insight[] = [];
  for (const [key, m] of Object.entries(payload.metrics)) {
    for (const detector of [
      detectTermExtreme,
      detectMonthOfTermRank,
      detectMonthlyChange,
      detectLatestPrint,
    ]) {
      const r = detector(key, m);
      if (r) candidates.push(r);
    }
  }
  // Keep highest-scoring insight per metric.
  const best = new Map<string, Insight>();
  for (const c of candidates) {
    const prev = best.get(c.metricKey);
    if (!prev || c.score > prev.score) best.set(c.metricKey, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Pretty "Last updated: 5 minutes ago" string. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const ago = Date.now() - then;
  const mins = Math.floor(ago / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
