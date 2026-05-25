// Vote Unbiased — shared metrics data layer.
//
// This file is the source of truth for the 6 headline economic metrics
// displayed on the landing page AND used by the Live Broadcast fact-check
// route as a verification layer.
//
// Keeping it server-importable (no "use client", no React) means a server
// route can do exact ground-truth lookups against the same numbers the user
// sees on the dashboard — no LLM hallucination for verifiable claims, and
// the fact card can deep-link to /dashboard?metric=<k>&admin=<id>.
//
// SOURCES: BEA (GDP), BLS (Unemployment, CPI), Yahoo Finance year-end close
// (S&P 500), FRED + Treasury (Debt-to-GDP), Census ACS (Median Income).

export type AdminId = "clinton" | "bush" | "obama" | "trump1" | "biden" | "trump2";

export interface AdminInfo {
  name: string;     // "Clinton"
  party: string;    // "Democrat"
  years: string;    // "1993-2001"
  color: string;    // chart color
  full: string;     // "Bill Clinton"
  start: number;    // first fiscal year of tenure
  end: number;      // last fiscal year of tenure (inclusive)
}

export const ADMINS_DATA: Record<AdminId, AdminInfo> = {
  clinton: { name: "Clinton",  party: "Democrat",   years: "1993-2001", color: "#1d4ed8", full: "Bill Clinton",       start: 1993, end: 2000 },
  bush:    { name: "Bush W.",  party: "Republican", years: "2001-2009", color: "#7c2d12", full: "George W. Bush",     start: 2001, end: 2008 },
  obama:   { name: "Obama",    party: "Democrat",   years: "2009-2017", color: "#0d7377", full: "Barack Obama",       start: 2009, end: 2016 },
  trump1:  { name: "Trump",    party: "Republican", years: "2017-2021", color: "#b8372d", full: "Donald Trump (1st)", start: 2017, end: 2020 },
  biden:   { name: "Biden",    party: "Democrat",   years: "2021-2025", color: "#1d4ed8", full: "Joe Biden",          start: 2021, end: 2024 },
  trump2:  { name: "Trump II", party: "Republican", years: "2025-2029", color: "#b8372d", full: "Donald Trump (2nd)", start: 2025, end: 2028 },
};

export const ADMIN_ORDER: AdminId[] = ["clinton", "bush", "obama", "trump1", "biden"];

// Which AdminId is in power for a given calendar year. Used by the live
// fact-check verification to disambiguate "the unemployment rate is 4.0%"
// — we need to know which year/admin the speaker is implicitly referencing.
export function adminForYear(year: number): AdminId | null {
  for (const id of Object.keys(ADMINS_DATA) as AdminId[]) {
    const a = ADMINS_DATA[id];
    if (year >= a.start && year <= a.end) return id;
  }
  return null;
}

export type MetricKey =
  | "gdp"           // real GDP growth, %/yr (BEA)
  | "unemployment"  // U-3 rate, % (BLS)
  | "inflation"     // CPI-U YoY, % (BLS)
  | "sp500"         // year-end close, index (Yahoo)
  | "debt_gdp"      // federal debt as % of GDP (FRED)
  | "median_income";// real median household income, $K 2023$ (Census ACS)

export interface MetricPoint {
  y: number;        // year
  v: number;        // value
  a: AdminId;       // admin in power that year
}

export interface MetricDef {
  /** Internal stable key — used in dashboard URLs (?metric=<key>). */
  key: MetricKey;
  /** Display label, e.g. "GDP Growth". */
  label: string;
  /** Display unit, e.g. "%", "$K", "idx". */
  unit: string;
  /** Higher is worse (e.g. unemployment, inflation, debt). */
  inverse: boolean;
  /** Category for grouping in UI. */
  category: "Growth" | "Jobs" | "Prices" | "Markets" | "Fiscal" | "Wages";
  /** Authoritative source agency. */
  source: "BEA" | "BLS" | "BLS CPI-U" | "Yahoo Finance" | "FRED / Treasury" | "Census ACS";
  /** Annual time series. */
  data: MetricPoint[];
  /** Short phrase the live fact-check LLM can use to anchor a claim onto this
   *  metric. Should be lowercase keywords. Used as a hint, not a hard match. */
  hints: string[];
}

// ── Snapshot-backed data layer ────────────────────────────────────
//
// The per-year data arrays for each metric live in data/fred-snapshot.json,
// regenerated weekly by scripts/refresh-data.mjs (run by the GitHub Action
// at .github/workflows/refresh-data.yml). The metadata (label, source,
// hints, etc.) stays in this file because it changes rarely and benefits
// from being colocated with the type definitions.
//
// Why split: the snapshot is a single artifact the auto-refresh can replace
// atomically without touching code. The metadata is editorial copy and stays
// hand-maintained.
//
// Fallback behavior: if the snapshot is missing or malformed, the imported
// JSON resolves to {} and METRICS_DATA's data arrays default to []. The site
// still renders (charts will be empty) — won't crash.
import snapshot from "../data/fred-snapshot.json";

interface SnapshotShape {
  generatedAt?: string;
  source?: string;
  metrics?: Partial<Record<MetricKey, MetricPoint[]>>;
}
const SNAPSHOT = snapshot as SnapshotShape;

/** When the snapshot was last regenerated. Surfaced by callers that want to
 *  show "data updated X days ago" badges. ISO string or null if missing. */
export const SNAPSHOT_GENERATED_AT: string | null = SNAPSHOT.generatedAt ?? null;
/** Where the snapshot data came from. Distinguishes "bootstrap-from-hardcoded"
 *  (our initial commit) from "fred-api" (a real refresh). */
export const SNAPSHOT_SOURCE: string = SNAPSHOT.source ?? "unknown";

function dataFor(key: MetricKey): MetricPoint[] {
  return SNAPSHOT.metrics?.[key] ?? [];
}

// Metric metadata (everything except the data arrays). Data is merged in
// below from the snapshot. To add a new metric:
//   1. Add an entry here with metadata
//   2. Add its key to the MetricKey union above
//   3. Add the FRED series ID + transform to scripts/refresh-data.mjs
const METRIC_DEFS: Record<MetricKey, Omit<MetricDef, "data">> = {
  gdp: {
    key: "gdp", label: "GDP Growth", unit: "%", inverse: false, category: "Growth", source: "BEA",
    hints: ["gdp", "gross domestic product", "economic growth", "economy grew", "economy contracted", "real gdp"],
  },
  unemployment: {
    key: "unemployment", label: "Unemployment", unit: "%", inverse: true, category: "Jobs", source: "BLS",
    hints: ["unemployment", "jobless rate", "out of work", "u-3"],
  },
  inflation: {
    key: "inflation", label: "Inflation (CPI)", unit: "%", inverse: true, category: "Prices", source: "BLS CPI-U",
    hints: ["inflation", "cpi", "consumer price", "prices rose", "prices fell", "cost of living"],
  },
  sp500: {
    key: "sp500", label: "S&P 500", unit: "idx", inverse: false, category: "Markets", source: "Yahoo Finance",
    hints: ["s&p", "s&p 500", "stock market", "wall street", "market cap", "stocks"],
  },
  debt_gdp: {
    key: "debt_gdp", label: "Debt-to-GDP", unit: "%", inverse: true, category: "Fiscal", source: "FRED / Treasury",
    hints: ["debt", "national debt", "debt-to-gdp", "federal debt"],
  },
  median_income: {
    key: "median_income", label: "Median Income", unit: "$K", inverse: false, category: "Wages", source: "Census ACS",
    hints: ["median income", "household income", "family income", "real wages", "wages"],
  },
};

// Merge metadata + snapshot data into the public METRICS_DATA shape.
export const METRICS_DATA: Record<MetricKey, MetricDef> = Object.fromEntries(
  (Object.entries(METRIC_DEFS) as [MetricKey, Omit<MetricDef, "data">][])
    .map(([k, def]) => [k, { ...def, data: dataFor(k) }]),
) as Record<MetricKey, MetricDef>;

export const METRIC_KEYS = Object.keys(METRICS_DATA) as MetricKey[];

// ── Pure-function lookups (server-safe) ───────────────────────────

/** Return the value for a specific metric in a specific year. null if out of range. */
export function lookupValue(key: MetricKey, year: number): number | null {
  const series = METRICS_DATA[key]?.data;
  if (!series) return null;
  const point = series.find(p => p.y === year);
  return point ? point.v : null;
}

/** Return the value for the first or last year of an administration's tenure
 *  (or the average across it). The unit-aware caller should know whether to
 *  use start/end (for rates like unemployment) or sum/average (for flows). */
export function adminTenureValues(key: MetricKey, admin: AdminId):
  { start: number | null; end: number | null; avg: number | null } {
  const a = ADMINS_DATA[admin];
  const series = METRICS_DATA[key]?.data;
  if (!a || !series) return { start: null, end: null, avg: null };
  const slice = series.filter(p => p.y >= a.start && p.y <= a.end);
  if (slice.length === 0) return { start: null, end: null, avg: null };
  return {
    start: slice[0].v,
    end:   slice[slice.length - 1].v,
    avg:   slice.reduce((s, p) => s + p.v, 0) / slice.length,
  };
}

/** Return the most recent point in the series (for "today's value" claims). */
export function latestValue(key: MetricKey): { year: number; value: number } | null {
  const series = METRICS_DATA[key]?.data;
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  return { year: last.y, value: last.v };
}

/** Format a value with its metric's unit, for fact-check display.
 *  e.g. (4.0, "%") → "4.0%", (5881, "idx") → "5,881", (74.6, "$K") → "$74.6K" */
export function formatValue(value: number, unit: string): string {
  switch (unit) {
    case "%":   return `${value.toFixed(1)}%`;
    case "$K":  return `$${value.toFixed(1)}K`;
    case "idx": return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    default:    return value.toString();
  }
}
