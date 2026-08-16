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

/**
 * Is this metric TRENDING, and how hard?
 *
 * This replaces a term-extremum detector ("Debt-to-GDP at term high:
 * 122.6%"). The trouble with an extremum test is that in a monotonic series
 * it is true every single month by construction — real wages had not risen
 * once this term, so "at term low" was guaranteed the moment the metric was
 * picked. The panel reported the DIRECTION of a trend and presented it as
 * news, and said the same three things month after month.
 *
 * Scored the same way as /today, so "notable" means one thing across the
 * site: 45% magnitude, 35% persistence, 20% acceleration.
 *
 * UNITS MATTER HERE. A percent change on a RATE is a rate of a rate, and it
 * explodes near zero — GDP growth going -0.6% to 1.5% computes as "+350%",
 * which is arithmetically true and communicates nothing. Rates move in
 * percentage points; levels move in percent.
 */
const RATE_UNITS = new Set(["%"]);

function detectTrend(key: string, m: LiveMetric): Insight | null {
  const latest = getLatest(m);
  if (!latest) return null;
  const pts = latest.admin.data.filter(p => p && Number.isFinite(p.value));
  // Six points is the floor for saying anything about persistence.
  if (pts.length < 6) return null;

  const v = pts.map(p => p.value);
  const first = v[0], last = v[v.length - 1];
  const delta = last - first;
  if (delta === 0) return null;

  const isRate = RATE_UNITS.has(m.unit);
  // A series that is negative, or crosses zero, cannot use percent change
  // either. Nonfarm payrolls went -48K to -23K: arithmetically "+52.1%", but
  // that reads as growth when the real story is "still shrinking, less
  // fast". Trade balance has the same shape. Report the absolute move.
  const spansZero = Math.min(...v) <= 0 && Math.max(...v) >= 0;
  const signFlipRisk = first <= 0 || spansZero;

  let magnitude: number, changeLabel: string;
  if (isRate) {
    // 3 percentage points is a large move for a rate.
    magnitude = Math.min(1, Math.abs(delta) / 3);
    changeLabel = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} pts`;
  } else if (signFlipRisk) {
    // Scale against the series' own spread — the only reference available
    // when there is no meaningful base to divide by.
    const spread = Math.max(...v) - Math.min(...v) || 1;
    magnitude = Math.min(1, Math.abs(delta) / spread);
    changeLabel = `${delta > 0 ? "+" : "−"}${fmtVal(Math.abs(delta), m.unit)}`;
  } else {
    if (first === 0) return null;
    const pct = (delta / Math.abs(first)) * 100;
    magnitude = Math.min(1, Math.abs(pct) / 40);
    changeLabel = `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
  }

  // Persistence: of the months that MOVED, how many moved with the trend?
  //
  // Flat steps are excluded from the denominator, because several series
  // here are quarterly interpolated to monthly — two of every three steps
  // are flat by construction. Counting those as "failed to follow the
  // trend" scored debt-to-GDP at 21% persistence when it had in fact risen
  // in every quarter that moved. That is measuring the interpolation, not
  // the economy.
  const moves = v.slice(1).map((x, i) => x - v[i]).filter(d => d !== 0);
  if (moves.length < 3) return null;
  const withTrend = moves.filter(d => d * delta > 0).length;
  const persistence = withTrend / moves.length;

  // Acceleration: is the second half moving faster than the first?
  const h = Math.floor(v.length / 2);
  const early = Math.abs(v[h] - v[0]) / Math.max(1, h);
  const late = Math.abs(v[v.length - 1] - v[h]) / Math.max(1, v.length - 1 - h);
  const accelerating = late > early;

  const score = 100 * (0.45 * magnitude + 0.35 * persistence + 0.20 * (accelerating ? 1 : 0));
  if (score < 30) return null;

  const cur = pts[pts.length - 1];
  const dateLabel = fmtMonthLabel(latest.admin.id, cur.month);
  const dir = delta > 0 ? "Rose" : "Fell";
  const worse = m.lowerBetter ? delta > 0 : delta < 0;

  return {
    id: `${key}:trend`,
    metricKey: key as never,
    metricLabel: m.label,
    year: monthToDate(latest.admin.id, cur.month).getFullYear(),
    admin: toAdminId(latest.admin.id),
    kind: worse ? "extreme_high" : "extreme_low",
    direction: delta > 0 ? "up" : "down",
    // No metric name here — the card's eyebrow already reads
    // "SAVING RATE · TRUMP II", so repeating it pushed the number, which is
    // the only thing that differs between cards, into the middle of the line.
    headline: `${changeLabel} this term`,
    // Says something NEW each month: persistence and acceleration both move.
    // "of the months that moved", not "of months" — flat steps are excluded
    // from the denominator, so the looser phrasing would overstate it.
    context: `${fmtVal(first, m.unit)} → ${fmtVal(last, m.unit)} · ${dir.toLowerCase()} in ${Math.round(persistence * 100)}% of the months it moved${accelerating ? ", and faster lately" : ""} · through ${dateLabel}`,
    score,
  };
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
      detectTrend,
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

/** Pretty "Last updated: 5 minutes ago" string. NOTE: this reflects when our
 *  API cache was warmed, NOT when the FRED data was published. Use
 *  latestDataDate() instead for any user-facing freshness signal. */
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

/** Find the most recent calendar date across ALL metrics' latest data points.
 *  This is the meaningful "freshness" signal — it reflects how recent the
 *  underlying FRED prints are, not when we last refreshed our cache.
 *
 *  Returns a Date object. Use fmtFreshness() below to format. */
export function latestDataDate(payload: LiveBenchmarkPayload): Date | null {
  let latest: Date | null = null;
  for (const m of Object.values(payload.metrics)) {
    const cur = m.series.find(s => s.current);
    if (!cur || cur.data.length === 0) continue;
    const lastPoint = cur.data[cur.data.length - 1];
    const d = monthToDate(cur.id, lastPoint.month);
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/** Format a Date as "Apr 2026" for the freshness badge. */
export function fmtFreshness(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}
