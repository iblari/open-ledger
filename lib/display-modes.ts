// Per-metric display modes — the single source of truth for how to render
// presidential-tenure metric changes honestly.
//
// Cumulative % change is a misleading universal metric: it produces
// sign-cross artifacts when start values are near zero, rewards long
// tenures via compounding, conflates nominal with real for dollar
// metrics, and triggers "% of a %" confusion on rate metrics.
//
// This module provides:
//   - `Cell` type: richer per-cell summary with ppChange, annualizedReal,
//     annualizedNominal, avgInflation, plus the legacy pctChange field.
//   - `buildCPIIndex()`: compound an inflation rate series into a price
//     level index so dollar metrics can be CPI-deflated without external
//     data.
//   - `computeHeatmap()`: factory that takes a metrics dictionary and an
//     admin order list, returns a Record<metricKey, Record<adminId, Cell>>.
//   - `getDisplayedChange()`: resolve the per-metric display value given a
//     cell + display config.
//   - `formatDisplayedChange()`: format that value for display, with an
//     optional `verbose` mode that spells out "percentage points".
//   - `colorMagnitude()`: per-unit normalization for color intensity.
//   - `cellColorFromMag()`: turn a magnitude + direction into rgba colors.
//
// Used by: app/page.tsx (landing), app/dashboard/page.tsx (dashboard).

import { C } from "./design-tokens";

/* ─────────────────────────────────────────────
   INPUT SHAPES — caller-provided metrics dictionary
───────────────────────────────────────────── */

export type DataPoint = { y: number; v: number; a: string };
export type MetricDef = {
  l: string;   // human-readable label
  u: string;   // unit symbol ("%", "$K", "idx", ...)
  inv: boolean; // true = lower is better (unemployment, inflation, debt/GDP)
  cat: string; // category label (Growth, Jobs, etc.)
  d: DataPoint[];
};

/* ─────────────────────────────────────────────
   OUTPUT — what each cell ends up containing
───────────────────────────────────────────── */

export type Cell = {
  start: number;
  end: number;
  startYear: number;
  endYear: number;
  years: number;
  pctChange: number;                  // legacy (end-start)/|start|*100 — kept for backward compat
  ppChange: number;                   // end - start (in the metric's own units)
  annualizedNominal: number | null;   // %/yr — null if start <= 0 or end <= 0
  annualizedReal: number | null;      // %/yr — same caveat + CPI deflator applied
  avgInflation: number | null;        // %/yr — only populated when metricKey matches inflationMetricKey (legacy alias for avgValue when mk==inflation)
  avgValue: number;                   // arithmetic mean of this admin's yearly values for the metric (used by avg_per_year and pct_avg modes)
  improved: boolean;
};

/* ─────────────────────────────────────────────
   CPI INDEX — compound an inflation rate series
───────────────────────────────────────────── */

// Build a CPI index anchored at 1.0 in the year *before* the first data
// point. cpi[Y] = price level at end of year Y relative to that anchor.
//
// Caller passes the data points (yearly inflation as a %), so this works
// for any inflation series the caller has — landing page and dashboard
// can both call it.
export function buildCPIIndex(inflationData: DataPoint[]): Record<number, number> {
  const idx: Record<number, number> = {};
  const sorted = [...inflationData].sort((a, b) => a.y - b.y);
  if (sorted.length === 0) return idx;
  idx[sorted[0].y - 1] = 1.0;
  let c = 1.0;
  for (const pt of sorted) {
    c *= 1 + pt.v / 100;
    idx[pt.y] = c;
  }
  return idx;
}

/* ─────────────────────────────────────────────
   COMPUTE HEATMAP — produce a Cell per [metric, admin]
───────────────────────────────────────────── */

export function computeHeatmap(
  metrics: Record<string, MetricDef>,
  adminOrder: string[],
  inflationMetricKey = "inflation",
): Record<string, Record<string, Cell>> {
  const out: Record<string, Record<string, Cell>> = {};
  const cpi = metrics[inflationMetricKey]
    ? buildCPIIndex(metrics[inflationMetricKey].d)
    : {};

  for (const [mk, m] of Object.entries(metrics)) {
    out[mk] = {};
    for (let ai = 0; ai < adminOrder.length; ai++) {
      const id = adminOrder[ai];
      const pts = m.d.filter(d => d.a === id).sort((a, b) => a.y - b.y);
      if (pts.length < 1) continue;

      // Inherited baseline: previous admin's last value (and year),
      // or own first for the earliest admin in the order.
      let start: number;
      let startYear: number;
      if (ai > 0) {
        const prevPts = m.d.filter(d => d.a === adminOrder[ai - 1]).sort((a, b) => a.y - b.y);
        if (prevPts.length > 0) {
          start = prevPts[prevPts.length - 1].v;
          startYear = prevPts[prevPts.length - 1].y;
        } else {
          start = pts[0].v;
          startYear = pts[0].y;
        }
      } else {
        start = pts[0].v;
        startYear = pts[0].y;
      }
      const end = pts[pts.length - 1].v;
      const endYear = pts[pts.length - 1].y;
      const years = Math.max(endYear - startYear, 1);

      const pctChange = ((end - start) / Math.abs(start || 1)) * 100;
      const ppChange = end - start;

      // Annualized only defined when both endpoints are positive
      // (no logs of zero/negatives).
      let annualizedNominal: number | null = null;
      if (start > 0 && end > 0) {
        annualizedNominal = (Math.pow(end / start, 1 / years) - 1) * 100;
      }
      let annualizedReal: number | null = null;
      if (start > 0 && end > 0 && cpi[startYear] !== undefined && cpi[endYear] !== undefined) {
        const realEnd = end * (cpi[startYear] / cpi[endYear]);
        annualizedReal = (Math.pow(realEnd / start, 1 / years) - 1) * 100;
      }

      // Arithmetic mean of yearly values during this admin's tenure.
      // Used by avg_per_year mode (flows like Jobs Added, Deficit) and by
      // pct_avg mode (e.g., average annual inflation). For most metrics
      // it's a fine summary stat; for cumulative levels it's less meaningful.
      const avgValue = pts.reduce((s, p) => s + p.v, 0) / pts.length;
      const avgInflation = mk === inflationMetricKey ? avgValue : null;

      const improved = m.inv ? end < start : end > start;
      out[mk][id] = {
        start, end, startYear, endYear, years,
        pctChange, ppChange, annualizedNominal, annualizedReal,
        avgInflation, avgValue,
        improved,
      };
    }
  }
  return out;
}

/* ─────────────────────────────────────────────
   DISPLAY CONFIG — how each metric is rendered
───────────────────────────────────────────── */

export type DisplayMode = "per_metric" | "raw_pct";
export type DollarMode = "real" | "nominal";
export type DisplayUnit =
  | "pp"            // percentage points (rates: GDP growth, unemployment, debt/GDP)
  | "pct_yr"        // annualized %/yr (levels: real GDP, S&P, median income, gas prices)
  | "pct_avg"       // average annual % over tenure (flow rates: inflation, real wages)
  | "avg_per_year"  // average value per year in metric's native unit (flow values: jobs added, deficit, trade balance)
  | "pct";          // legacy raw % change (when display mode is "raw_pct")

export type MetricDisplay = {
  perMetricUnit: DisplayUnit;
  dollarAware: boolean;
};

// Default representation per metric in "per-metric" mode. Rates → pp
// change (avoids "% of a %" confusion and divide-by-near-zero artifacts);
// levels → annualized growth (compounding-aware, fair across tenure
// lengths); flow rates → average annual rate; flow values → average per
// year in native unit.
//
// LANDING — the 6 marquee metrics shown on the homepage scorecard.
export const METRIC_DISPLAY_LANDING: Record<string, MetricDisplay> = {
  gdp:           { perMetricUnit: "pp",      dollarAware: false },
  unemployment:  { perMetricUnit: "pp",      dollarAware: false },
  inflation:     { perMetricUnit: "pct_avg", dollarAware: false },
  sp500:         { perMetricUnit: "pct_yr",  dollarAware: true  },
  debt_gdp:      { perMetricUnit: "pp",      dollarAware: false },
  median_income: { perMetricUnit: "pct_yr",  dollarAware: true  },
};

// DASHBOARD — full 19-metric set used by /dashboard's Data tab.
// Rationale per metric:
//   real_gdp:      level in 2017$ — annualized real (effectively nominal here since data is already real)
//   gdp:           growth rate — pp avoids "% of growth rate" confusion
//   unemployment:  rate — pp change in unemployment rate
//   lfpr:          rate — pp change in participation
//   jobs:          flow (M added per year) — average per year in tenure
//   mfg:           level (M of jobs) — pp change in absolute jobs
//   inflation:     flow rate — average annual inflation during tenure
//   gas:           price level $ — annualized real growth
//   wages:         flow rate (YoY %) — average annual real wage growth
//   median_income: $ level — annualized real growth
//   poverty:       rate — pp change
//   inequality:    rate — pp change
//   consumer_conf: index level — pp change in index points
//   debt_gdp:      rate — pp change in debt/GDP ratio
//   deficit:       flow ($B/yr) — average per year
//   sp500:         index level — annualized real
//   trade:         flow ($B/yr) — average per year
//   fed_rate:      rate — pp change in fed funds rate
//   purchasing:    dollar value index, declining over time — pp change in value
export const METRIC_DISPLAY_DASHBOARD: Record<string, MetricDisplay> = {
  real_gdp:      { perMetricUnit: "pct_yr",       dollarAware: false }, // data already real; both modes return same number
  gdp:           { perMetricUnit: "pp",           dollarAware: false },
  unemployment:  { perMetricUnit: "pp",           dollarAware: false },
  lfpr:          { perMetricUnit: "pp",           dollarAware: false },
  jobs:          { perMetricUnit: "avg_per_year", dollarAware: false },
  mfg:           { perMetricUnit: "pp",           dollarAware: false },
  inflation:     { perMetricUnit: "pct_avg",      dollarAware: false },
  gas:           { perMetricUnit: "pct_yr",       dollarAware: true  },
  wages:         { perMetricUnit: "pct_avg",      dollarAware: false },
  median_income: { perMetricUnit: "pct_yr",       dollarAware: true  },
  poverty:       { perMetricUnit: "pp",           dollarAware: false },
  inequality:    { perMetricUnit: "pp",           dollarAware: false },
  consumer_conf: { perMetricUnit: "pp",           dollarAware: false },
  debt_gdp:      { perMetricUnit: "pp",           dollarAware: false },
  deficit:       { perMetricUnit: "avg_per_year", dollarAware: false },
  sp500:         { perMetricUnit: "pct_yr",       dollarAware: true  },
  trade:         { perMetricUnit: "avg_per_year", dollarAware: false },
  fed_rate:      { perMetricUnit: "pp",           dollarAware: false },
  purchasing:    { perMetricUnit: "pp",           dollarAware: false },
};

/* ─────────────────────────────────────────────
   VALUE RESOLVER — what number to display for a cell
───────────────────────────────────────────── */

export function getDisplayedChange(
  c: Cell,
  mk: string,
  mode: DisplayMode,
  dollarMode: DollarMode,
  metricDisplay: Record<string, MetricDisplay>,
  metricInverse: boolean,
): { value: number | null; unit: DisplayUnit; improved: boolean } {
  if (mode === "raw_pct") {
    return { value: c.pctChange, unit: "pct", improved: c.improved };
  }
  const cfg = metricDisplay[mk];
  if (!cfg) {
    // Unknown metric — fall back to raw pct so we don't render junk.
    return { value: c.pctChange, unit: "pct", improved: c.improved };
  }
  if (cfg.perMetricUnit === "pp") {
    return {
      value: c.ppChange,
      unit: "pp",
      improved: metricInverse ? c.ppChange < 0 : c.ppChange > 0,
    };
  }
  if (cfg.perMetricUnit === "pct_avg") {
    // Inflation row: "improved" = at or below the Fed's 2% target.
    if (c.avgInflation === null) return { value: null, unit: "pct_avg", improved: false };
    return { value: c.avgInflation, unit: "pct_avg", improved: c.avgInflation <= 2 };
  }
  if (cfg.perMetricUnit === "pct_yr") {
    const v = dollarMode === "real" ? c.annualizedReal : c.annualizedNominal;
    if (v === null) return { value: null, unit: "pct_yr", improved: false };
    return {
      value: v,
      unit: "pct_yr",
      improved: metricInverse ? v < 0 : v > 0,
    };
  }
  if (cfg.perMetricUnit === "avg_per_year") {
    // Flow metric — improved = average is in the preferred direction.
    // For "trade balance" (inv:false but always negative since 1975),
    // we still report "less negative = improved" via metricInverse=false.
    const v = c.avgValue;
    return {
      value: v,
      unit: "avg_per_year",
      improved: metricInverse ? v < 0 : v > 0,
    };
  }
  return { value: c.pctChange, unit: "pct", improved: c.improved };
}

/* ─────────────────────────────────────────────
   FORMATTING — value → string
───────────────────────────────────────────── */

export function formatDisplayedChange(
  value: number | null,
  unit: DisplayUnit,
  verbose = false,
  hint?: { metricUnit?: string }, // metric.u from the caller — used by avg_per_year for unit-aware formatting
): string {
  if (value === null || !isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  switch (unit) {
    case "pp":      return verbose
      ? `${sign}${value.toFixed(1)} percentage points`
      : `${sign}${value.toFixed(1)} pp`;
    case "pct_yr":  return `${sign}${value.toFixed(1)}%/yr`;
    case "pct_avg": return `${value.toFixed(1)}% avg`;
    case "avg_per_year": {
      const u = hint?.metricUnit;
      // Dashboard unit conventions: M = millions of jobs, B = billions of dollars,
      // % = percent (annualized flow rate), inc = household income.
      if (u === "M")  return `${sign}${value.toFixed(1)}M/yr avg`;
      if (u === "B")  return `${sign}$${Math.round(value)}B/yr avg`;
      if (u === "%")  return `${sign}${value.toFixed(1)}%/yr avg`;
      return `${sign}${value.toFixed(2)}/yr avg`;
    }
    case "pct":     return `${sign}${value.toFixed(1)}%`;
  }
}

/* ─────────────────────────────────────────────
   COLOR — magnitude normalization + cell background
───────────────────────────────────────────── */

// Per-unit color thresholds calibrated so a "big" move in each unit
// reads with roughly equivalent visual weight. For avg_per_year the
// caller must provide a unit-specific scale (since "big" varies wildly
// between metrics — 2M jobs/yr vs $1000B deficit/yr vs 1%/yr wages).
export function colorMagnitude(value: number, unit: DisplayUnit, hint?: { avgScale?: number }): number {
  switch (unit) {
    case "pp":      return Math.min(Math.abs(value) / 10, 1);          // 10 pp saturates
    case "pct_yr":  return Math.min(Math.abs(value) / 10, 1);          // 10%/yr saturates
    case "pct_avg": return Math.min(Math.abs(value - 2) / 4, 1);       // ±4pp from 2% target saturates
    case "avg_per_year": {
      const scale = hint?.avgScale ?? 1;
      return Math.min(Math.abs(value) / scale, 1);
    }
    case "pct":     return Math.min(Math.abs(value) / 50, 1);          // legacy threshold
  }
}

export function cellColorFromMag(magNorm: number, improved: boolean): { bg: string; text: string } {
  const alpha = 0.15 + magNorm * 0.65;
  if (improved) return { bg: `rgba(13,115,119,${alpha})`, text: alpha > 0.45 ? "#fff" : C.ink };
  return { bg: `rgba(194,65,12,${alpha})`, text: alpha > 0.45 ? "#fff" : C.ink };
}

// Legacy cellColor wrapper — uses pctChange directly. Kept for the
// DeepDive section which reads pctChange off the Cell object.
export function cellColor(c: { improved: boolean; pctChange: number } | undefined): { bg: string; text: string } {
  if (!c) return { bg: C.paper, text: C.mute };
  return cellColorFromMag(Math.min(Math.abs(c.pctChange) / 50, 1), c.improved);
}

/* ─────────────────────────────────────────────
   UNIT FORMATTING — for start → end value display
───────────────────────────────────────────── */

// Light wrapper kept here for symmetry, though most callers have their
// own fmt() with project-specific units. Landing page uses %, $K, idx.
export function fmtValue(v: number, u: string): string {
  if (u === "%") return v.toFixed(1) + "%";
  if (u === "$K") return "$" + v.toFixed(1) + "K";
  if (u === "idx") return v.toLocaleString();
  return String(v);
}
