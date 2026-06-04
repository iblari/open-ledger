// Vote Unbiased — Automatic Insights.
//
// Pure-function library that scans the 6 anchored economic metrics
// (lib/metrics-data) and surfaces what's currently notable. The site
// owner wants a "daily insights" feel: people who don't want to read every
// row in the heatmap can glance at the top of the page and learn what's
// actually happening in the economy without an editor manually writing copy.
//
// Approach:
//   1. Run a set of pure detector functions over each metric's time series.
//   2. Each detector returns 0 or 1 "candidate" observations with a score.
//   3. Sort all candidates by score, return top N.
//   4. Render with template-generated headlines (no LLM yet — that's the
//      Phase 2 upgrade once the weekly FRED auto-refresh ships).
//
// Honest scope limit: the data driving this is annual (1993-2024), so
// insights describe year-over-year changes and historical extremes — not
// "what moved this week." When real-time FRED data lands, the same
// detectors will run on monthly/weekly series and produce more granular
// observations without changing this file's structure.

import {
  METRICS_DATA, type MetricKey, type MetricDef, type AdminId,
  ADMINS_DATA, formatValue,
} from "./metrics-data";

// ── Output shape ──────────────────────────────────────────────────

export type InsightKind =
  | "biggest_move"      // largest YoY change
  | "extreme_high"      // at multi-year high
  | "extreme_low"       // at multi-year low
  | "streak"            // N consecutive moves in the same direction
  | "above_average"     // significantly above long-run trend
  | "below_average"     // significantly below long-run trend
  | "threshold_cross";  // crossed a notable level (e.g. inflation ≤ 3%)

export interface Insight {
  /** Stable id — usually `${metricKey}:${kind}`. Used for React keys + dedup. */
  id: string;
  /** Which metric this insight is about. Powers the deep-link to /dashboard. */
  metricKey: MetricKey;
  /** Display label of the metric (cached so the UI doesn't re-read METRICS_DATA). */
  metricLabel: string;
  /** Year the insight is anchored to (typically the latest data year). */
  year: number;
  /** Admin in power that year, if relevant for the deep-link (?admin=). */
  admin: AdminId | null;
  /** What kind of observation this is. */
  kind: InsightKind;
  /** Editorial headline, ~6-10 words. Templated, no LLM. */
  headline: string;
  /** One-line context (~12-18 words) that explains the headline. */
  context: string;
  /** 0-100 — how "interesting" this observation is. Used for ranking. */
  score: number;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Format helper for editorial copy. "+1.4 pp" / "-3.5%" / "$74.6K". */
function fmtDelta(v: number, unit: string): string {
  const sign = v >= 0 ? "+" : "−";
  const abs = Math.abs(v);
  if (unit === "%") return `${sign}${abs.toFixed(1)} pp`;
  if (unit === "$K") return `${sign}$${abs.toFixed(1)}K`;
  if (unit === "idx") return `${sign}${Math.round(abs).toLocaleString()} pts`;
  return `${sign}${abs.toFixed(1)}`;
}

/** Roman-style ordinal — "1st", "2nd", "3rd", "4th", etc. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Detectors — each returns 0 or 1 Insight ───────────────────────

/** Latest-year value vs prior year. Large absolute change scores higher. */
function detectBiggestMove(m: MetricDef): Insight | null {
  if (m.data.length < 2) return null;
  const last = m.data[m.data.length - 1];
  const prev = m.data[m.data.length - 2];
  const delta = last.v - prev.v;
  // Score on relative move size. Anything within ±5% of trailing stdev is
  // unremarkable; large multiples get higher scores up to a cap.
  const trailing = m.data.slice(-6, -1).map(p => p.v); // 5-year window
  const mean = trailing.reduce((s, v) => s + v, 0) / trailing.length;
  const stdev = Math.sqrt(
    trailing.reduce((s, v) => s + (v - mean) ** 2, 0) / trailing.length
  );
  const zScore = stdev > 0 ? Math.abs(delta) / stdev : 0;
  if (zScore < 0.5) return null;  // not noteworthy

  const score = Math.min(60, 20 + zScore * 12);
  const dir = delta >= 0 ? "rose" : "fell";
  const headline = `${m.label} ${dir} ${fmtDelta(delta, m.unit)} in ${last.y}`;
  const context = m.unit === "%"
    ? `From ${prev.v.toFixed(1)}% to ${last.v.toFixed(1)}% — the largest year-over-year move in the recent window.`
    : `From ${formatValue(prev.v, m.unit)} to ${formatValue(last.v, m.unit)} — the largest YoY move in the recent window.`;
  return {
    id: `${m.key}:biggest_move`,
    metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
    kind: "biggest_move", headline, context, score,
  };
}

/** Latest value is an N-year high or low. The longer the lookback, the higher
 *  the score. Records of 10+ years are very noteworthy; 3-year records less so. */
function detectExtreme(m: MetricDef): Insight | null {
  if (m.data.length < 4) return null;
  const last = m.data[m.data.length - 1];
  const prior = m.data.slice(0, -1);
  const priorMax = Math.max(...prior.map(p => p.v));
  const priorMin = Math.min(...prior.map(p => p.v));
  if (last.v > priorMax) {
    // How far back does this record go?
    const lookback = m.data.length;
    const score = Math.min(80, 30 + lookback * 1.8);
    const headline = `${m.label} hit an all-time high in ${last.y}`;
    const context = `${formatValue(last.v, m.unit)} — the highest reading in the ${lookback}-year series.`;
    return {
      id: `${m.key}:extreme_high`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "extreme_high", headline, context,
      score: m.inverse ? score * 0.75 : score, // record-high inflation is bad-news interesting; record-high GDP is good-news interesting (we surface both)
    };
  }
  if (last.v < priorMin) {
    const lookback = m.data.length;
    const score = Math.min(80, 30 + lookback * 1.8);
    const headline = `${m.label} hit an all-time low in ${last.y}`;
    const context = `${formatValue(last.v, m.unit)} — the lowest reading in the ${lookback}-year series.`;
    return {
      id: `${m.key}:extreme_low`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "extreme_low", headline, context, score,
    };
  }
  // Multi-year highs/lows even if not all-time
  const last10 = m.data.slice(-10, -1);
  if (last10.length >= 5 && last.v === Math.max(last.v, ...last10.map(p => p.v))) {
    const score = 40;
    return {
      id: `${m.key}:extreme_high`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "extreme_high",
      headline: `${m.label} at a 10-year high`,
      context: `${formatValue(last.v, m.unit)} in ${last.y} — the highest since ${m.data[Math.max(0, m.data.length - 11)].y}.`,
      score,
    };
  }
  if (last10.length >= 5 && last.v === Math.min(last.v, ...last10.map(p => p.v))) {
    const score = 40;
    return {
      id: `${m.key}:extreme_low`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "extreme_low",
      headline: `${m.label} at a 10-year low`,
      context: `${formatValue(last.v, m.unit)} in ${last.y} — the lowest since ${m.data[Math.max(0, m.data.length - 11)].y}.`,
      score,
    };
  }
  return null;
}

/** N consecutive YoY moves in the same direction. */
function detectStreak(m: MetricDef): Insight | null {
  if (m.data.length < 4) return null;
  let streak = 0;
  let dir: 1 | -1 | 0 = 0;
  for (let i = m.data.length - 1; i > 0; i--) {
    const d = Math.sign(m.data[i].v - m.data[i - 1].v) as 1 | -1 | 0;
    if (d === 0) break;
    if (dir === 0) { dir = d; streak = 1; }
    else if (d === dir) streak++;
    else break;
  }
  if (streak < 3) return null;
  const score = Math.min(55, 20 + streak * 6);
  const last = m.data[m.data.length - 1];
  const verb = dir === 1 ? "rising" : "falling";
  const headline = `${m.label} ${verb} ${streak} years in a row`;
  const context = `Most recent: ${formatValue(last.v, m.unit)} in ${last.y}. Streak began in ${m.data[m.data.length - 1 - streak + 1].y}.`;
  return {
    id: `${m.key}:streak`,
    metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
    kind: "streak", headline, context, score,
  };
}

/** Inflation specifically: did it cross into / out of the Fed target band (~2%)? */
function detectInflationTarget(m: MetricDef): Insight | null {
  if (m.key !== "inflation") return null;
  const last = m.data[m.data.length - 1];
  if (last.v <= 3 && last.v >= 1) {
    return {
      id: `${m.key}:threshold_cross`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "threshold_cross",
      headline: `Inflation back near the Fed's target`,
      context: `${last.v.toFixed(1)}% in ${last.y} — within the 1-3% band the Fed considers price stability.`,
      score: 65,
    };
  }
  if (last.v > 4) {
    return {
      id: `${m.key}:threshold_cross`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "threshold_cross",
      headline: `Inflation running above the Fed target`,
      context: `${last.v.toFixed(1)}% in ${last.y} — well above the 2% Fed target; bond markets price in higher rates for longer.`,
      score: 65,
    };
  }
  return null;
}

/** Unemployment specifically: at "full employment" (≤4.5%) or stress (>6%)? */
function detectUnemploymentRegime(m: MetricDef): Insight | null {
  if (m.key !== "unemployment") return null;
  const last = m.data[m.data.length - 1];
  if (last.v <= 4.5) {
    return {
      id: `${m.key}:threshold_cross`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "threshold_cross",
      headline: `Labor market still at full employment`,
      context: `Unemployment at ${last.v.toFixed(1)}% in ${last.y} — economists consider 4-5% the "natural rate" for a mature economy.`,
      score: 55,
    };
  }
  if (last.v >= 7) {
    return {
      id: `${m.key}:threshold_cross`,
      metricKey: m.key, metricLabel: m.label, year: last.y, admin: last.a,
      kind: "threshold_cross",
      headline: `Labor market under stress`,
      context: `Unemployment at ${last.v.toFixed(1)}% in ${last.y} — well above the 4-5% level associated with healthy labor demand.`,
      score: 65,
    };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────

/** Run every detector across every anchored metric. Score, deduplicate by
 *  metric (keep highest-scoring observation per metric), return top N. */
export function generateInsights(opts: { limit?: number } = {}): Insight[] {
  const { limit = 5 } = opts;
  const candidates: Insight[] = [];
  for (const key of Object.keys(METRICS_DATA) as MetricKey[]) {
    const m = METRICS_DATA[key];
    for (const detector of [
      detectExtreme,           // strongest signal first
      detectInflationTarget,
      detectUnemploymentRegime,
      detectStreak,
      detectBiggestMove,
    ]) {
      const r = detector(m);
      if (r) candidates.push(r);
    }
  }

  // Dedup: at most ONE insight per metric (the highest-scoring one). Prevents
  // the strip from being dominated by a single metric with 3 different angles.
  const bestPerMetric = new Map<MetricKey, Insight>();
  for (const c of candidates) {
    const prev = bestPerMetric.get(c.metricKey);
    if (!prev || c.score > prev.score) bestPerMetric.set(c.metricKey, c);
  }
  const ranked = [...bestPerMetric.values()].sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/** When the latest data year was anchored — used by the UI footer to set
 *  expectations ("As of 2024 official data"). */
export function insightsAsOfYear(): number {
  let latest = 0;
  for (const key of Object.keys(METRICS_DATA) as MetricKey[]) {
    const m = METRICS_DATA[key];
    const y = m.data[m.data.length - 1]?.y;
    if (y && y > latest) latest = y;
  }
  return latest;
}

/** Pretty admin name for the deep-link tooltip ("During Biden's tenure"). */
export function adminName(id: AdminId | null): string | null {
  if (!id) return null;
  return ADMINS_DATA[id]?.name ?? null;
}
