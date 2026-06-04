/**
 * Scenario Modeling Engine
 *
 * Provides "what-if" analysis by trend-extrapolating through major economic
 * disruptions. Uses simple linear regression on pre-shock years — the most
 * transparent and reproducible approach.
 *
 * This is NOT a prediction. It estimates what the pre-existing trend would
 * have produced if the disruption hadn't occurred.
 */

export type ScenarioId = "baseline" | "no_covid" | "no_2008" | "no_dotcom";

export interface Scenario {
  id: ScenarioId;
  label: string;
  shortLabel: string;
  shockYears: number[];      // years to replace with extrapolated values
  trendYears: number[];      // years to fit the pre-shock trend from
  recoveryYears: number[];   // post-shock years to shift (smooth re-entry)
  description: string;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  baseline: {
    id: "baseline",
    label: "All Events Included",
    shortLabel: "Baseline",
    shockYears: [],
    trendYears: [],
    recoveryYears: [],
    description: "Raw data as reported by source agencies. No adjustments.",
  },
  no_covid: {
    id: "no_covid",
    label: "Without COVID-19 (2020–21)",
    shortLabel: "No COVID",
    shockYears: [2020, 2021],
    trendYears: [2017, 2018, 2019],
    recoveryYears: [2022, 2023, 2024],
    description: "Extrapolates the 2017–2019 trend through 2020–21 and shifts subsequent years to remove the disruption gap.",
  },
  no_2008: {
    id: "no_2008",
    label: "Without 2008 Financial Crisis (2008–09)",
    shortLabel: "No 2008 Crisis",
    shockYears: [2008, 2009],
    trendYears: [2004, 2005, 2006, 2007],
    recoveryYears: [2010, 2011, 2012],
    description: "Extrapolates the 2004–2007 trend through 2008–09 and shifts subsequent years to remove the disruption gap.",
  },
  no_dotcom: {
    id: "no_dotcom",
    label: "Without Dot-Com Crash (2001–02)",
    shortLabel: "No Dot-Com",
    shockYears: [2001, 2002],
    trendYears: [1997, 1998, 1999, 2000],
    recoveryYears: [2003, 2004, 2005],
    description: "Extrapolates the 1997–2000 trend through 2001–02 and shifts subsequent years to remove the disruption gap.",
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ["baseline", "no_covid", "no_2008", "no_dotcom"];

// ── Linear regression ──────────────────────────────────────────────
// Fits y = slope * x + intercept using ordinary least squares.
// Input: array of { x, y } points.

interface Point { x: number; y: number }

function linearRegression(points: Point[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: points[0].y };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// ── Metric bounds ──────────────────────────────────────────────────
// Some metrics can't go below zero or have natural floors/ceilings.

const METRIC_BOUNDS: Record<string, { min?: number; max?: number }> = {
  unemployment: { min: 0 },
  lfpr: { min: 0, max: 100 },
  inflation: {},                // can go negative (deflation)
  gas: { min: 0 },
  poverty: { min: 0, max: 100 },
  inequality: { min: 0, max: 100 },
  consumer_conf: { min: 0 },
  debt_gdp: { min: 0 },
  sp500: { min: 0 },
  fed_rate: { min: 0 },
  purchasing: { min: 0 },
  mfg: { min: 0 },
  jobs: {},                     // can be negative (net job losses)
  real_gdp: { min: 0 },
  median_income: { min: 0 },
  wages: {},                    // can be negative
  gdp: {},                      // can be negative
  deficit: {},                  // can be negative (deficit) or positive (surplus)
  trade: {},                    // typically negative (deficit)
};

function clamp(value: number, metricKey: string): number {
  const bounds = METRIC_BOUNDS[metricKey] || {};
  let v = value;
  if (bounds.min !== undefined && v < bounds.min) v = bounds.min;
  if (bounds.max !== undefined && v > bounds.max) v = bounds.max;
  return v;
}

// ── Core: apply scenario to a single metric ────────────────────────
// Returns a NEW data array with shock years replaced by trend-extrapolated
// values and post-shock years shifted to close the gap.

export interface DataPoint {
  y: number;      // year
  v: number;      // value
  a: string;      // admin key
  estimated?: boolean;
}

export function applyScenario(
  data: DataPoint[],
  scenario: Scenario,
  metricKey: string,
): DataPoint[] {
  // Baseline = no changes
  if (scenario.id === "baseline" || scenario.shockYears.length === 0) {
    return data.map(d => ({ ...d, estimated: false }));
  }

  // 1. Extract trend points
  const trendPoints: Point[] = [];
  for (const d of data) {
    if (scenario.trendYears.includes(d.y)) {
      trendPoints.push({ x: d.y, y: d.v });
    }
  }

  // Not enough data to fit a trend — return unmodified
  if (trendPoints.length < 2) {
    return data.map(d => ({ ...d, estimated: false }));
  }

  // 2. Fit linear regression
  const { slope, intercept } = linearRegression(trendPoints);

  // 3. Build extrapolated values for shock years
  const extrapolated: Record<number, number> = {};
  for (const yr of scenario.shockYears) {
    extrapolated[yr] = clamp(slope * yr + intercept, metricKey);
  }

  // 4. Calculate the shift for post-shock years
  //    Delta = extrapolated value at last shock year minus actual value at last shock year
  const lastShockYear = Math.max(...scenario.shockYears);
  const actualAtLastShock = data.find(d => d.y === lastShockYear)?.v ?? 0;
  const extrapolatedAtLastShock = extrapolated[lastShockYear] ?? actualAtLastShock;
  const delta = extrapolatedAtLastShock - actualAtLastShock;

  // 5. Determine which years are "post-shock" (everything after last shock year)
  const allPostShockYears = new Set<number>();
  for (const d of data) {
    if (d.y > lastShockYear) allPostShockYears.add(d.y);
  }

  // 6. Apply: replace shock years, shift post-shock years
  return data.map(d => {
    if (scenario.shockYears.includes(d.y)) {
      return {
        ...d,
        v: Math.round(extrapolated[d.y] * 100) / 100,
        estimated: true,
      };
    }
    if (allPostShockYears.has(d.y)) {
      // Fade the shift: full delta in recovery years, then taper off
      // This prevents permanent drift while smoothing the transition
      const yearsAfterShock = d.y - lastShockYear;
      const fadeWindow = scenario.recoveryYears.length + 2;
      const fadeFactor = Math.max(0, 1 - yearsAfterShock / fadeWindow);
      const shifted = d.v + delta * fadeFactor;
      return {
        ...d,
        v: Math.round(clamp(shifted, metricKey) * 100) / 100,
        estimated: true,
      };
    }
    return { ...d, estimated: false };
  });
}

// ── Convenience: apply scenario to all metrics at once ─────────────

export function applyScenarioToAll(
  allMetrics: Record<string, { d: DataPoint[]; [key: string]: any }>,
  scenario: Scenario,
): Record<string, DataPoint[]> {
  const out: Record<string, DataPoint[]> = {};
  for (const [mk, m] of Object.entries(allMetrics)) {
    out[mk] = applyScenario(m.d, scenario, mk);
  }
  return out;
}
