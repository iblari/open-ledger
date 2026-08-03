/**
 * Tier-1b verification — the FULL benchmark dataset.
 *
 * lib/live-verify.ts checks claims against 6 metrics at ANNUAL granularity.
 * Meanwhile /api/benchmark-data already carries 14 metrics × 10
 * administrations × ~450 MONTHLY observations each (~5,700 points, back to
 * Nixon) — the same FRED-backed series that power the Live Benchmark tab.
 * Not using it meant sending claims about payrolls, gas prices, wages, the
 * fed funds rate, manufacturing jobs and the trade balance out to a paid web
 * search, when we already hold the authoritative number.
 *
 * This module closes that gap: deterministic, free, instant, and it runs
 * BEFORE the web tier so search is reserved for what we genuinely don't have.
 */

export interface BenchPoint { month: number; value: number }
interface BenchSeries { id: string; name: string; current: boolean; data: BenchPoint[] }
interface BenchMetric { label: string; unit: string; lowerBetter: boolean; series: BenchSeries[] }
interface BenchData { currentMonth: number; metrics: Record<string, BenchMetric> }

/** First calendar year of each administration (month 0 = inauguration). */
const ADMIN_START: Record<string, number> = {
  nixon: 1969, carter: 1977, reagan: 1981, bush41: 1989, clinton: 1993,
  bush43: 2001, obama: 2009, trump1: 2017, biden: 2021, trump2: 2025,
};

/** Claim-facing metric keys → benchmark keys, with the words that signal them. */
export const BENCH_ANCHORS: Record<string, { label: string; unit: string; hints: string[] }> = {
  jobs:          { label: "Nonfarm Payrolls",     unit: "K", hints: ["jobs created", "payrolls", "jobs added", "job growth", "million jobs", "hiring"] },
  mfg:           { label: "Manufacturing Jobs",   unit: "M", hints: ["manufacturing jobs", "factory jobs", "manufacturing employment"] },
  lfpr:          { label: "Labor Participation",  unit: "%", hints: ["labor force participation", "participation rate", "workforce participation"] },
  gas:           { label: "Gas Prices",           unit: "$", hints: ["gas prices", "gasoline", "price at the pump", "per gallon"] },
  wages:         { label: "Real Wages (YoY)",     unit: "%", hints: ["real wages", "wage growth", "wages are up", "take-home pay", "paychecks"] },
  purchasing:    { label: "Purchasing Power",     unit: "$", hints: ["purchasing power", "cost of living", "buying power"] },
  fed_rate:      { label: "Interest Rate",        unit: "%", hints: ["interest rates", "fed funds", "federal reserve rate", "mortgage rate driver"] },
  trade:         { label: "Trade Balance",        unit: "B", hints: ["trade deficit", "trade balance", "trade surplus", "imports exceed exports"] },
  consumer_conf: { label: "Consumer Confidence",  unit: "",  hints: ["consumer confidence", "consumer sentiment"] },
  real_gdp:      { label: "Real GDP",             unit: "T", hints: ["real gdp", "size of the economy", "economic output"] },
  gdp_growth:    { label: "GDP Growth",           unit: "%", hints: ["gdp growth", "economy grew", "growth rate"] },
  unemployment:  { label: "Unemployment",         unit: "%", hints: ["unemployment", "jobless rate", "out of work"] },
  inflation:     { label: "Inflation (CPI YoY)",  unit: "%", hints: ["inflation", "cpi", "consumer prices", "prices rising"] },
  debt_gdp:      { label: "Debt-to-GDP",          unit: "%", hints: ["debt to gdp", "national debt as a share"] },
};

// Module-level cache. Serverless instances are short-lived; an hour matches
// the benchmark route's own revalidate window.
let cache: { at: number; data: BenchData } | null = null;
const TTL_MS = 3600_000;

async function loadBench(origin: string): Promise<BenchData | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const r = await fetch(`${origin}/api/benchmark-data`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = (await r.json()) as BenchData;
    if (!data?.metrics) return null;
    cache = { at: Date.now(), data };
    return data;
  } catch { return null; }
}

export interface BenchLookup {
  value: number; label: string; unit: string;
  adminId: string; adminName: string; monthOfTerm: number; approxYear: number;
}

/**
 * Resolve (metric, admin, year) → observed value.
 * - year given  → the last observation inside that calendar year
 * - no year     → the latest observation of that administration
 */
export async function lookupBenchmark(
  origin: string, metricKey: string, adminId: string | null, year: number | null
): Promise<BenchLookup | null> {
  const data = await loadBench(origin);
  const metric = data?.metrics?.[metricKey];
  if (!data || !metric) return null;

  const series = adminId
    ? metric.series.find(s => s.id === adminId)
    : metric.series.find(s => s.current);
  if (!series?.data?.length) return null;

  const start = ADMIN_START[series.id];
  const pts = [...series.data].sort((a, b) => a.month - b.month);

  let pick: BenchPoint | undefined;
  if (year != null && start != null) {
    const lo = (year - start) * 12, hi = lo + 11;
    const inYear = pts.filter(p => p.month >= lo && p.month <= hi);
    pick = inYear.length ? inYear[inYear.length - 1] : undefined;
    if (!pick) return null; // year outside this administration — don't guess
  } else {
    pick = pts[pts.length - 1];
  }
  if (!pick) return null;

  return {
    value: pick.value, label: metric.label, unit: metric.unit,
    adminId: series.id, adminName: series.name,
    monthOfTerm: pick.month,
    approxYear: start != null ? start + Math.floor(pick.month / 12) : (year ?? 0),
  };
}

/** Human-readable value with its unit, matching how the site renders it. */
export function formatBenchValue(v: number, unit: string): string {
  switch (unit) {
    case "%": return `${v.toFixed(1)}%`;
    case "$": return `$${v.toFixed(2)}`;
    case "K": return `${v >= 0 ? "+" : ""}${Math.round(v)}K`;
    case "M": return `${v.toFixed(2)}M`;
    case "B": return `$${Math.round(v)}B`;
    case "T": return `$${v.toFixed(1)}T`;
    default: return v.toFixed(1);
  }
}

/**
 * Guard against comparing a CHANGE to a LEVEL.
 *
 * Observed live: "wage increases 5.5%" was scored against Median Income
 * ($83,700) and published as FALSE citing Census ACS. Both numbers are real;
 * they measure different things. Refuting a growth-rate claim with a dollar
 * level is a fabricated refutation, exactly like checking Iranian inflation
 * against BLS.
 *
 * Two independent signals, either of which disqualifies the numeric re-rate:
 *  1. Language — the quote describes a change ("up 5%", "grew", "increase")
 *     while the metric is a level ($, M, K, T, B).
 *  2. Scale — claimed and observed differ by >50x. Speakers round and
 *     exaggerate, but they don't misstate a figure by two orders of
 *     magnitude; that gap means the two numbers aren't the same quantity.
 */
const CHANGE_LANGUAGE = /\b(increase[ds]?|increases|growth|grew|grow|rose|rise|risen|up|down|fell|fall|declin\w*|gain\w*|jump\w*|surge\w*|cut|higher|lower|more than|less than|creat\w*|added|adding|lost|losing|brought back|since)\b/i;
const LEVEL_UNITS = ["$", "M", "K", "T", "B"];

export function isUnitMismatch(quote: string, claimed: number, truth: number, unit: string): boolean {
  if (LEVEL_UNITS.includes(unit) && CHANGE_LANGUAGE.test(quote)) return true;
  const a = Math.abs(claimed), b = Math.abs(truth);
  if (a > 0 && b > 0) {
    const ratio = Math.max(a, b) / Math.min(a, b);
    if (ratio > 50) return true;
  }
  return false;
}

/** Same tolerance philosophy as live-verify: generous, since speakers round. */
export function rateAgainstBenchmark(claimed: number, truth: number, unit: string): string {
  if (unit === "%") {
    const d = Math.abs(claimed - truth);
    if (d <= 0.3) return "TRUE";
    if (d <= 0.8) return "MOSTLY TRUE";
    if (d <= 2.0) return "MISLEADING";
    return "FALSE";
  }
  const rel = Math.abs(claimed - truth) / Math.max(Math.abs(truth), 1);
  if (rel <= 0.05) return "TRUE";
  if (rel <= 0.12) return "MOSTLY TRUE";
  if (rel <= 0.25) return "MISLEADING";
  return "FALSE";
}

/** Prompt block so the extractor knows these keys exist and when to use them. */
export function benchAnchorPromptBlock(): string {
  const lines = Object.entries(BENCH_ANCHORS).map(([k, m]) =>
    `  - "${k}": ${m.label} (${m.unit || "index"}). Use when the speaker mentions ${m.hints.slice(0, 3).join(" / ")}.`
  );
  return [
    "BENCHMARK ANCHORS — 14 metrics, monthly, every administration back to Nixon.",
    "Set metricKey to one of these whenever the claim references it; the server",
    "will look up the true value and re-rate your verdict against it:",
    ...lines,
  ].join("\n");
}
