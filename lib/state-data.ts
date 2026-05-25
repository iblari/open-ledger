// State-level economic data — Phase A.
//
// 50 states + DC × 5 cost-of-living metrics. Hardcoded for now (state-level
// data updates annually at most; runtime API fetching is over-engineered for
// this update cadence — see PR #15 description).
//
// Each metric has:
//   - latest: most-recent values keyed by state code
//   - asOf:   plain-English period the data covers
//   - source: who publishes the underlying number
//   - costLike: true if "higher = more expensive" (used for color direction)
//
// Phase B will add: baseline (e.g., 2020) values for the "Change" view.
// Phase B also adds: pre-computed national-average derivation helpers.

export type StateCode =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "DC" | "FL"
  | "GA" | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME"
  | "MD" | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH"
  | "NJ" | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI"
  | "SC" | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY";

// State code → full name. Topojson uses full names as `properties.name`,
// so we look up by name in the choropleth. This table is the bridge.
export const STATE_NAMES: Record<StateCode, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Reverse lookup — full name → code. Useful when iterating topojson features.
export const STATE_NAME_TO_CODE: Record<string, StateCode> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([k, v]) => [v, k as StateCode]),
) as Record<string, StateCode>;

export type StateMetricCategory =
  | "cost"     // cost of living (rents, utilities, gas)
  | "tax"      // statutory tax rates
  | "demo"     // demographics + economy
  | "health"   // life expectancy, mortality, coverage
  | "politics" // 2024 election + civic engagement
  | "crime";   // crime + incarceration

// Picker section labels. Order here determines the order they render in
// the StateAtlas grouped picker.
export const STATE_CATEGORY_LABELS: Record<StateMetricCategory, string> = {
  cost:     "Cost of living",
  tax:      "Taxes",
  demo:     "People & economy",
  health:   "Health & wellbeing",
  politics: "Politics & civic life",
  crime:    "Crime & safety",
};

export type StateMetric = {
  key: string;
  label: string;
  shortLabel: string;
  unit: "$K" | "¢/kWh" | "$/gal" | "$/mo" | "%" | "M" | "¢/gal"
        // New units for Politics / Health / Crime categories:
        | "yrs"      // life expectancy in years
        | "per100K"  // crime rate / drug deaths / etc per 100,000 residents
        | "per1K"    // infant mortality per 1,000 live births
        | "±pp";     // signed percentage points — for presidential margin (Trump − Harris)
  desc: string;          // short human-readable description for tooltips/legend
  source: string;        // canonical source attribution
  asOf: string;          // e.g., "Q3 2024" or "2024"
  costLike: boolean;     // true = higher value is "more expensive" (colors warm)
  category: StateMetricCategory;  // groups metrics in the picker
  // How the "national line" on the trend chart should aggregate across states:
  //   "mean" (default) — unweighted mean state value. Makes sense for prices,
  //     rates, taxes (where "the average state's electricity cost" is a useful
  //     benchmark).
  //   "sum" — total across all states. Makes sense for aggregates like total
  //     population, total jobs, total deficit. The trend chart will use a dual
  //     Y-axis (state values on left, national total on right) so state lines
  //     stay readable when the sum is orders of magnitude larger.
  aggregateMethod?: "mean" | "sum";
  latest: Partial<Record<StateCode, number>>;
  // Approximate 10-year compound annual growth rate per state (2014→2024).
  // Used by buildHistory() to back-fill an annual series from `latest`. A
  // single default rate covers the median state; entries in stateOverrides
  // refine where reality diverged meaningfully (hot housing markets, states
  // that cut income tax, etc.). Phase B+ should swap these for real
  // year-by-year published series.
  cagr: { default: number; stateOverrides?: Partial<Record<StateCode, number>> };
};

// Years covered by historical data. Indexed 0..11 = 2014..2025.
export const HISTORY_YEARS: number[] = Array.from({ length: 12 }, (_, i) => 2014 + i);

// Back-fill a 12-element series (2014..2025) from a 2025 anchor using a CAGR.
// values[i] = latest / (1+cagr)^(11-i). Returns plain number[] indexed by HISTORY_YEARS.
export function buildHistory(latest: number, cagr: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 11; i++) {
    const yearsAgo = 11 - i;
    out.push(latest / Math.pow(1 + cagr, yearsAgo));
  }
  return out;
}

// Compute a per-state 11-year history for a given metric using `latest` + cagr.
export function stateHistory(m: StateMetric, code: StateCode): number[] | null {
  const latest = m.latest[code];
  if (latest === undefined) return null;
  const cagr = m.cagr.stateOverrides?.[code] ?? m.cagr.default;
  return buildHistory(latest, cagr);
}

// National 12-year series, computed per metric's aggregateMethod:
//   "mean" (default) — unweighted mean state value per year
//   "sum"            — total across states per year (US-wide aggregate)
// Cached per metric.
const _nationalCache = new WeakMap<StateMetric, number[]>();
export function nationalHistory(m: StateMetric): number[] {
  const cached = _nationalCache.get(m);
  if (cached) return cached;
  const sums: number[] = Array(12).fill(0);
  const counts: number[] = Array(12).fill(0);
  for (const code of Object.keys(m.latest) as StateCode[]) {
    const hist = stateHistory(m, code);
    if (!hist) continue;
    for (let i = 0; i < 12; i++) { sums[i] += hist[i]; counts[i] += 1; }
  }
  const method = m.aggregateMethod ?? "mean";
  const result: number[] = method === "sum"
    ? sums
    : sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  _nationalCache.set(m, result);
  return result;
}

export const STATE_METRICS: Record<string, StateMetric> = {

  median_home: {
    key: "median_home",
    label: "Median home value",
    shortLabel: "Home value",
    unit: "$K",
    desc: "Zillow Home Value Index, single-family + condo, thousands of dollars.",
    source: "Zillow ZHVI",
    asOf: "2025",
    costLike: true,
    category: "cost",
    latest: {
      AL: 186, AK: 403, AZ: 463, AR: 186, CA: 784, CO: 578, CT: 403, DE: 360,
      DC: 723, FL: 441, GA: 342, HI: 890, ID: 506, IL: 268, IN: 233, IA: 203,
      KS: 203, KY: 207, LA: 212, ME: 389, MD: 435, MA: 700, MI: 249, MN: 339,
      MS: 180, MO: 233, MT: 512, NE: 233, NV: 459, NH: 497, NJ: 541, NM: 307,
      NY: 498, NC: 342, ND: 252, OH: 233, OK: 203, OR: 519, PA: 265, RI: 488,
      SC: 313, SD: 265, TN: 338, TX: 323, UT: 556, VT: 392, VA: 403, WA: 641,
      WV: 168, WI: 286, WY: 355,
    },
    // National median home value rose ~6%/yr 2014-2024 (Zillow). Hot Sunbelt
    // markets ran 8-10%; slow markets (Midwest, deep south) 3-4%.
    cagr: { default: 0.06, stateOverrides: {
      AZ: 0.09, CA: 0.06, CO: 0.07, FL: 0.09, GA: 0.07, ID: 0.10, ME: 0.08,
      MT: 0.09, NV: 0.08, NH: 0.08, NC: 0.07, SC: 0.08, TN: 0.09, TX: 0.06,
      UT: 0.09, VT: 0.06,
      IL: 0.03, MS: 0.03, WV: 0.02, ND: 0.03, IA: 0.04, KS: 0.04, OK: 0.04,
      DC: 0.04,
    }},
  },

  electricity: {
    key: "electricity",
    label: "Residential electricity",
    shortLabel: "Electricity",
    unit: "¢/kWh",
    desc: "Average residential retail price, cents per kilowatt-hour.",
    source: "U.S. Energy Information Administration",
    asOf: "2025",
    costLike: true,
    category: "cost",
    latest: {
      AL: 14.9, AK: 25.2, AZ: 14.9, AR: 12.9, CA: 33.7, CO: 15.2, CT: 29.9,
      DE: 17.0, DC: 16.5, FL: 15.2, GA: 14.1, HI: 43.6, ID: 11.4, IL: 16.7,
      IN: 14.9, IA: 13.4, KS: 14.4, KY: 12.8, LA: 12.2, ME: 24.7, MD: 17.5,
      MA: 32.6, MI: 19.6, MN: 14.9, MS: 13.9, MO: 13.0, MT: 11.6, NE: 11.4,
      NV: 14.6, NH: 27.8, NJ: 20.1, NM: 14.4, NY: 24.4, NC: 12.8, ND: 11.1,
      OH: 16.0, OK: 12.4, OR: 12.8, PA: 17.5, RI: 29.4, SC: 14.9, SD: 12.9,
      TN: 12.4, TX: 14.9, UT: 11.5, VT: 21.8, VA: 15.2, WA: 11.2, WV: 14.8,
      WI: 17.0, WY: 11.2,
    },
    // National residential electricity rose ~3%/yr 2014-2024 (EIA). New England
    // and California ran 5-6%; coal-heavy + nuclear states held closer to 2%.
    cagr: { default: 0.03, stateOverrides: {
      CA: 0.06, MA: 0.06, CT: 0.05, RI: 0.05, NH: 0.05, ME: 0.05, VT: 0.04,
      NY: 0.04, HI: 0.05,
      WA: 0.02, OR: 0.02, ID: 0.02, KY: 0.02, WV: 0.02, ND: 0.02, NE: 0.02,
      WY: 0.02,
    }},
  },

  gas: {
    key: "gas",
    label: "Gas price",
    shortLabel: "Gas",
    unit: "$/gal",
    desc: "Average price of regular unleaded gasoline, dollars per gallon.",
    source: "AAA Daily Fuel Gauge",
    asOf: "May 2025",
    costLike: true,
    category: "cost",
    latest: {
      AL: 2.86, AK: 3.72, AZ: 3.27, AR: 2.86, CA: 4.67, CO: 3.07, CT: 3.32,
      DE: 3.12, DC: 3.37, FL: 3.17, GA: 2.96, HI: 4.57, ID: 3.57, IL: 3.47,
      IN: 3.17, IA: 3.01, KS: 2.96, KY: 2.96, LA: 2.86, ME: 3.37, MD: 3.32,
      MA: 3.22, MI: 3.27, MN: 3.12, MS: 2.81, MO: 2.96, MT: 3.32, NE: 3.07,
      NV: 3.97, NH: 3.22, NJ: 3.17, NM: 3.12, NY: 3.32, NC: 3.01, ND: 3.12,
      OH: 3.12, OK: 2.81, OR: 3.87, PA: 3.32, RI: 3.22, SC: 2.91, SD: 3.07,
      TN: 2.96, TX: 2.86, UT: 3.22, VT: 3.32, VA: 3.07, WA: 4.12, WV: 3.12,
      WI: 3.07, WY: 3.12,
    },
    // Gas is volatile but roughly flat ~0.5%/yr over 10 yrs nationally
    // (2014 was high before the 2015 oil crash; 2022 spiked then settled).
    // Per-state spread is narrow — a single default rate is fine for the trend.
    cagr: { default: 0.005 },
  },

  rent: {
    key: "rent",
    label: "Median monthly rent",
    shortLabel: "Rent",
    unit: "$/mo",
    desc: "Median asking rent across all bedroom counts, monthly dollars.",
    source: "Zillow Observed Rent Index",
    asOf: "2025",
    costLike: true,
    category: "cost",
    latest: {
      AL: 1330, AK: 1480, AZ: 1950, AR: 1110, CA: 2980, CO: 2230, CT: 2290,
      DE: 1820, DC: 2550, FL: 2490, GA: 1790, HI: 3020, ID: 1730, IL: 1880,
      IN: 1380, IA: 1230, KS: 1280, KY: 1280, LA: 1360, ME: 1960, MD: 2140,
      MA: 2930, MI: 1420, MN: 1680, MS: 1220, MO: 1370, MT: 1720, NE: 1330,
      NV: 1960, NH: 2240, NJ: 2610, NM: 1450, NY: 2810, NC: 1860, ND: 1230,
      OH: 1340, OK: 1220, OR: 1890, PA: 1590, RI: 2160, SC: 1770, SD: 1240,
      TN: 1920, TX: 1910, UT: 1940, VT: 1760, VA: 1980, WA: 2300, WV: 1110,
      WI: 1390, WY: 1440,
    },
    // National median rent rose ~4%/yr 2014-2024 (Zillow ZORI). Sunbelt +
    // Mountain West outpaced at 5-7%; rust belt and Appalachian states 2-3%.
    cagr: { default: 0.04, stateOverrides: {
      AZ: 0.07, FL: 0.07, GA: 0.05, ID: 0.07, NV: 0.06, NC: 0.06, SC: 0.06,
      TN: 0.06, TX: 0.05, UT: 0.06, MT: 0.06, CO: 0.05,
      IL: 0.02, IN: 0.03, OH: 0.03, MI: 0.03, MO: 0.03, MS: 0.02, WV: 0.02,
      AR: 0.03, OK: 0.03, KY: 0.03,
    }},
  },

  income_tax: {
    key: "income_tax",
    label: "Top income tax rate",
    shortLabel: "Income tax",
    unit: "%",
    desc: "Highest marginal state individual income tax rate.",
    source: "Tax Foundation",
    asOf: "2025",
    costLike: true,
    category: "tax",
    latest: {
      AL: 5.00, AK: 0, AZ: 2.50, AR: 3.90, CA: 13.30, CO: 4.40, CT: 6.99,
      DE: 6.60, DC: 10.75, FL: 0, GA: 5.19, HI: 11.00, ID: 5.30, IL: 4.95,
      IN: 3.00, IA: 3.80, KS: 5.58, KY: 4.00, LA: 3.00, ME: 7.15, MD: 5.75,
      MA: 9.00, MI: 4.25, MN: 9.85, MS: 4.40, MO: 4.70, MT: 5.90, NE: 5.20,
      NV: 0, NH: 0, NJ: 10.75, NM: 5.90, NY: 10.90, NC: 4.25, ND: 2.50,
      OH: 3.50, OK: 4.75, OR: 9.90, PA: 3.07, RI: 5.99, SC: 6.20, SD: 0,
      TN: 0, TX: 0, UT: 4.55, VT: 8.75, VA: 5.75, WA: 0, WV: 4.82, WI: 7.65,
      WY: 0,
    },
    // Income tax rates change slowly. National default: flat 0%/yr (most states
    // unchanged). States that meaningfully cut rates 2014-2024 get a small
    // positive cagr (back-fill shows higher 2014 baseline). Note: with cagr=0
    // the historical series is flat at the 2024 value, which is honest for
    // states that didn't change their rate.
    cagr: { default: 0, stateOverrides: {
      NC: 0.04, IA: 0.03, OH: 0.03, KY: 0.03, MO: 0.02, IN: 0.02, AZ: 0.07, ID: 0.02,
    }},
  },

  sales_tax: {
    key: "sales_tax",
    label: "State sales tax",
    shortLabel: "Sales tax",
    unit: "%",
    desc: "State portion of sales tax (excludes local additions).",
    source: "Tax Foundation",
    asOf: "2025",
    costLike: true,
    category: "tax",
    latest: {
      AL: 4.0, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0,
      DC: 6.0, FL: 6.0, GA: 4.0, HI: 4.0, ID: 6.0, IL: 6.25, IN: 7.0, IA: 6.0,
      KS: 6.5, KY: 6.0, LA: 5.0, ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 6.875,
      MS: 7.0, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875,
      NY: 4.0, NC: 4.75, ND: 5.0, OH: 5.75, OK: 4.5, OR: 0, PA: 6.0, RI: 7.0,
      SC: 6.0, SD: 4.2, TN: 7.0, TX: 6.25, UT: 6.1, VT: 6.0, VA: 5.3, WA: 6.5,
      WV: 6.0, WI: 5.0, WY: 4.0,
    },
    cagr: { default: 0 }, // sales tax rates are very stable
  },

  property_tax: {
    key: "property_tax",
    label: "Effective property tax",
    shortLabel: "Property tax",
    unit: "%",
    desc: "Effective property tax as % of home value (median).",
    source: "Tax Foundation / Census ACS",
    asOf: "2025",
    costLike: true,
    category: "tax",
    latest: {
      AL: 0.41, AK: 1.04, AZ: 0.62, AR: 0.61, CA: 0.73, CO: 0.55, CT: 1.79,
      DE: 0.61, DC: 0.62, FL: 0.91, GA: 0.92, HI: 0.32, ID: 0.69, IL: 2.07,
      IN: 0.84, IA: 1.50, KS: 1.34, KY: 0.86, LA: 0.55, ME: 1.36, MD: 1.05,
      MA: 1.20, MI: 1.45, MN: 1.11, MS: 0.81, MO: 0.96, MT: 0.83, NE: 1.65,
      NV: 0.55, NH: 1.93, NJ: 2.21, NM: 0.78, NY: 1.62, NC: 0.84, ND: 0.95,
      OH: 1.59, OK: 0.89, OR: 0.93, PA: 1.55, RI: 1.40, SC: 0.56, SD: 1.26,
      TN: 0.71, TX: 1.74, UT: 0.59, VT: 1.83, VA: 0.82, WA: 0.86, WV: 0.55,
      WI: 1.73, WY: 0.55,
    },
    cagr: { default: -0.005 }, // effective rate actually fell slightly as home values rose faster
  },

  gas_tax: {
    key: "gas_tax",
    label: "Gas tax",
    shortLabel: "Gas tax",
    unit: "¢/gal",
    desc: "State excise + other gasoline taxes, cents per gallon.",
    source: "Tax Foundation",
    asOf: "2025",
    costLike: true,
    category: "tax",
    latest: {
      AL: 28.7, AK: 9.2, AZ: 18.5, AR: 25.3, CA: 59.3, CO: 22.6, CT: 25.6,
      DE: 23.6, DC: 24.1, FL: 39.7, GA: 33.1, HI: 16.4, ID: 32.8, IL: 46.5,
      IN: 33.8, IA: 30.8, KS: 24.6, KY: 26.7, LA: 20.5, ME: 30.8, MD: 48.2,
      MA: 24.6, MI: 30.8, MN: 29.2, MS: 18.9, MO: 27.7, MT: 33.8, NE: 25.4,
      NV: 24.4, NH: 22.8, NJ: 43.4, NM: 19.5, NY: 26.0, NC: 41.7, ND: 23.6,
      OH: 39.5, OK: 19.5, OR: 38.9, PA: 60.2, RI: 37.9, SC: 26.7, SD: 30.8,
      TN: 27.1, TX: 20.5, UT: 37.3, VT: 33.1, VA: 30.1, WA: 50.6, WV: 36.6,
      WI: 31.7, WY: 24.6,
    },
    cagr: { default: 0.025 }, // most states have indexed gas tax to inflation or raised it
  },

  corp_tax: {
    key: "corp_tax",
    label: "Top corporate income tax",
    shortLabel: "Corp tax",
    unit: "%",
    desc: "Top marginal state corporate income tax rate.",
    source: "Tax Foundation",
    asOf: "2025",
    costLike: true,
    category: "tax",
    latest: {
      AL: 6.47, AK: 9.35, AZ: 4.88, AR: 5.27, CA: 8.80, CO: 4.38, CT: 7.46,
      DE: 8.66, DC: 8.21, FL: 5.47, GA: 5.72, HI: 6.37, ID: 5.77, IL: 9.45,
      IN: 4.88, IA: 5.72, KS: 6.97, KY: 4.97, LA: 7.46, ME: 8.89, MD: 8.21,
      MA: 7.96, MI: 5.97, MN: 9.75, MS: 4.97, MO: 3.98, MT: 6.72, NE: 7.46,
      NV: 0, NH: 7.46, NJ: 9.09, NM: 5.87, NY: 7.21, NC: 2.25, ND: 4.29,
      OH: 0, OK: 3.98, OR: 7.56, PA: 7.99, RI: 6.97, SC: 4.97, SD: 0,
      TN: 6.47, TX: 0, UT: 4.53, VT: 8.46, VA: 5.97, WA: 0, WV: 6.47,
      WI: 7.86, WY: 0,
    },
    cagr: { default: -0.005, stateOverrides: {
      NC: 0.08, IA: 0.04, PA: 0.04, NJ: 0.01, // states that cut corp rates
    }},
  },

  population: {
    key: "population",
    label: "Population",
    shortLabel: "Population",
    unit: "M",
    desc: "Resident population estimate, millions.",
    source: "U.S. Census Bureau",
    asOf: "2025",
    costLike: false,
    category: "demo",
    aggregateMethod: "sum", // national line = total US population
    latest: {
      AL: 5.13, AK: 0.74, AZ: 7.5, AR: 3.12, CA: 39.0, CO: 5.95, CT: 3.62, DE: 1.0,
      DC: 0.68, FL: 23.01, GA: 11.21, HI: 1.4, ID: 2.04, IL: 12.44, IN: 6.93, IA: 3.22,
      KS: 2.91, KY: 4.52, LA: 4.59, ME: 1.41, MD: 6.23, MA: 7.03, MI: 10.05, MN: 5.73,
      MS: 2.89, MO: 6.23, MT: 1.11, NE: 2.01, NV: 3.24, NH: 1.41, NJ: 9.35, NM: 2.11,
      NY: 19.44, NC: 10.93, ND: 0.78, OH: 11.86, OK: 4.12, OR: 4.22, PA: 13.06,
      RI: 1.1, SC: 5.47, SD: 0.92, TN: 7.18, TX: 30.99, UT: 3.45, VT: 0.65, VA: 8.74,
      WA: 7.89, WV: 1.79, WI: 5.93, WY: 0.58,
    },
    cagr: { default: 0.005, stateOverrides: {
      FL: 0.018, TX: 0.016, ID: 0.022, AZ: 0.013, NV: 0.013, NC: 0.012, SC: 0.013,
      TN: 0.011, UT: 0.015, MT: 0.010, CO: 0.009, GA: 0.010, WA: 0.011,
      NY: -0.003, CA: 0.000, IL: -0.005, WV: -0.005, MS: -0.003, LA: -0.002,
      AK: -0.002, HI: -0.001, DC: -0.001, RI: 0.001,
    }},
  },

  household_income: {
    key: "household_income",
    label: "Median household income",
    shortLabel: "Median income",
    unit: "$K",
    desc: "Median household income, thousands of dollars.",
    source: "U.S. Census Bureau ACS",
    asOf: "2025",
    costLike: false,
    category: "demo",
    latest: {
      AL: 58, AK: 90, AZ: 76, AR: 55, CA: 96, CO: 93, CT: 94, DE: 82, DC: 106,
      FL: 73, GA: 75, HI: 99, ID: 74, IL: 81, IN: 70, IA: 76, KS: 73, KY: 62,
      LA: 60, ME: 76, MD: 106, MA: 103, MI: 74, MN: 92, MS: 55, MO: 70, MT: 73,
      NE: 78, NV: 76, NH: 99, NJ: 104, NM: 62, NY: 87, NC: 73, ND: 79, OH: 70,
      OK: 62, OR: 83, PA: 79, RI: 87, SC: 68, SD: 73, TN: 68, TX: 78, UT: 94,
      VT: 81, VA: 92, WA: 96, WV: 57, WI: 78, WY: 78,
    },
    cagr: { default: 0.04 }, // nominal income +4%/yr roughly tracks inflation+a bit
  },

  unemployment: {
    key: "unemployment",
    label: "Unemployment rate",
    shortLabel: "Unemployment",
    unit: "%",
    desc: "Seasonally-adjusted unemployment rate (U-3).",
    source: "U.S. Bureau of Labor Statistics",
    asOf: "Mar 2025",
    costLike: true, // higher = worse
    category: "demo",
    latest: {
      AL: 2.9, AK: 4.6, AZ: 3.6, AR: 3.6, CA: 5.4, CO: 4.4, CT: 3.7, DE: 4.5,
      DC: 5.7, FL: 3.4, GA: 3.6, HI: 2.9, ID: 3.7, IL: 5.3, IN: 4.2, IA: 2.9,
      KS: 3.7, KY: 4.6, LA: 3.6, ME: 3.0, MD: 3.0, MA: 4.0, MI: 4.5, MN: 3.2,
      MS: 3.4, MO: 3.8, MT: 3.4, NE: 2.8, NV: 5.6, NH: 2.6, NJ: 4.5, NM: 4.0,
      NY: 4.3, NC: 3.7, ND: 2.4, OH: 4.3, OK: 3.4, OR: 4.1, PA: 3.4, RI: 4.7,
      SC: 4.7, SD: 1.9, TN: 3.5, TX: 4.1, UT: 3.5, VT: 2.4, VA: 2.7, WA: 4.6,
      WV: 4.1, WI: 2.9, WY: 3.4,
    },
    // Unemployment is mean-reverting, not trending. CAGR of 0 means historical
    // line is flat at the current value — honest given there's no clear trend
    // across the decade (was higher in 2014, dropped to lows in 2019, COVID
    // spike, then back down). Real annual data would show the U-shape.
    cagr: { default: 0 },
  },

  bachelors: {
    key: "bachelors",
    label: "Bachelor's degree or higher",
    shortLabel: "Bachelor's",
    unit: "%",
    desc: "Adults 25+ with a bachelor's degree or higher.",
    source: "U.S. Census Bureau ACS",
    asOf: "2025",
    costLike: false,
    category: "demo",
    latest: {
      AL: 27, AK: 31, AZ: 33, AR: 25, CA: 36, CO: 44, CT: 41, DE: 33, DC: 62,
      FL: 33, GA: 34, HI: 35, ID: 30, IL: 38, IN: 28, IA: 30, KS: 35, KY: 26,
      LA: 26, ME: 35, MD: 42, MA: 47, MI: 32, MN: 39, MS: 24, MO: 31, MT: 35,
      NE: 34, NV: 27, NH: 39, NJ: 43, NM: 30, NY: 39, NC: 35, ND: 32, OH: 31,
      OK: 27, OR: 36, PA: 34, RI: 36, SC: 30, SD: 31, TN: 30, TX: 32, UT: 37,
      VT: 41, VA: 41, WA: 39, WV: 23, WI: 32, WY: 30,
    },
    cagr: { default: 0.010 }, // ~1%/yr increase nationally as boomers retire + millennials enter prime
  },

  gdp_capita: {
    key: "gdp_capita",
    label: "GDP per capita",
    shortLabel: "GDP/capita",
    unit: "$K",
    desc: "State GDP divided by population, thousands of dollars.",
    source: "U.S. Bureau of Economic Analysis",
    asOf: "2025",
    costLike: false,
    category: "demo",
    latest: {
      AL: 55, AK: 82, AZ: 62, AR: 55, CA: 96, CO: 83, CT: 89, DE: 89, DC: 257,
      FL: 62, GA: 70, HI: 70, ID: 55, IL: 81, IN: 66, IA: 71, KS: 68, KY: 58,
      LA: 62, ME: 62, MD: 78, MA: 104, MI: 62, MN: 79, MS: 49, MO: 67, MT: 58,
      NE: 84, NV: 67, NH: 78, NJ: 81, NM: 62, NY: 104, NC: 69, ND: 96, OH: 68,
      OK: 62, OR: 68, PA: 78, RI: 68, SC: 58, SD: 78, TN: 68, TX: 81, UT: 73,
      VT: 62, VA: 81, WA: 94, WV: 53, WI: 68, WY: 80,
    },
    cagr: { default: 0.04 }, // nominal GDP/capita +4%/yr roughly
  },

  // ═══ HEALTH & WELLBEING ═══════════════════════════════════════════════
  // Sources: CDC NVSS for mortality + life expectancy, Census ACS for the
  // uninsured rate. Values are the most recent official prints as of 2025
  // (typically 2022 data for mortality, 2023 for the ACS uninsured rate).
  // Trend CAGRs are intentionally small — these series move slowly year to
  // year. Drug overdose deaths are the exception: notable per-state divergence
  // post-2020 due to fentanyl.

  life_expectancy: {
    key: "life_expectancy",
    label: "Life expectancy",
    shortLabel: "Life expectancy",
    unit: "yrs",
    desc: "Life expectancy at birth, all races, both sexes, in years.",
    source: "CDC NVSS, U.S. State Life Tables 2022",
    asOf: "2022",
    costLike: false, // higher is better
    category: "health",
    latest: {
      AL: 73.4, AK: 76.6, AZ: 76.3, AR: 73.5, CA: 79.0, CO: 78.3, CT: 79.2,
      DE: 76.5, DC: 75.5, FL: 77.5, GA: 75.6, HI: 79.9, ID: 77.8, IL: 76.8,
      IN: 75.0, IA: 77.6, KS: 76.7, KY: 73.7, LA: 73.1, ME: 77.4, MD: 77.0,
      MA: 79.0, MI: 76.0, MN: 79.1, MS: 71.9, MO: 74.7, MT: 76.0, NE: 77.8,
      NV: 76.7, NH: 78.8, NJ: 78.9, NM: 75.0, NY: 79.4, NC: 75.9, ND: 77.2,
      OH: 74.7, OK: 73.7, OR: 78.1, PA: 76.4, RI: 78.0, SC: 75.0, SD: 76.6,
      TN: 73.8, TX: 76.6, UT: 78.6, VT: 78.3, VA: 77.0, WA: 78.4, WV: 72.8,
      WI: 77.5, WY: 76.4,
    },
    cagr: { default: 0.001 }, // ~0.1% per year improvement; nearly flat
  },

  uninsured: {
    key: "uninsured",
    label: "Uninsured rate",
    shortLabel: "Uninsured",
    unit: "%",
    desc: "Share of population without health insurance coverage, all ages.",
    source: "U.S. Census Bureau, ACS 1-year, S2701",
    asOf: "2023",
    costLike: true, // higher is worse
    category: "health",
    latest: {
      AL: 9.3, AK: 11.3, AZ: 10.7, AR: 8.6, CA: 6.7, CO: 7.4, CT: 5.5,
      DE: 5.3, DC: 3.7, FL: 11.2, GA: 11.7, HI: 4.2, ID: 9.4, IL: 6.6,
      IN: 7.9, IA: 4.6, KS: 8.4, KY: 6.1, LA: 8.5, ME: 6.2, MD: 6.6,
      MA: 2.4, MI: 5.2, MN: 4.5, MS: 11.7, MO: 9.2, MT: 8.0, NE: 7.8,
      NV: 11.2, NH: 6.0, NJ: 7.3, NM: 9.1, NY: 5.0, NC: 9.4, ND: 6.4,
      OH: 6.7, OK: 12.7, OR: 5.9, PA: 5.4, RI: 4.0, SC: 9.5, SD: 8.4,
      TN: 9.7, TX: 17.0, UT: 8.3, VT: 3.4, VA: 6.6, WA: 6.0, WV: 6.4,
      WI: 5.5, WY: 12.2,
    },
    // Slow downward trend since ACA expansion (post-2014). Roughly -3%/yr.
    cagr: { default: -0.03 },
  },

  infant_mortality: {
    key: "infant_mortality",
    label: "Infant mortality",
    shortLabel: "Infant mortality",
    unit: "per1K",
    desc: "Infant deaths under 1 year per 1,000 live births.",
    source: "CDC NVSS, National Vital Statistics Reports",
    asOf: "2022",
    costLike: true,
    category: "health",
    latest: {
      AL: 7.0, AK: 5.7, AZ: 5.3, AR: 7.7, CA: 4.0, CO: 4.7, CT: 4.6,
      DE: 6.0, DC: 6.4, FL: 5.9, GA: 6.8, HI: 4.6, ID: 4.7, IL: 5.6,
      IN: 7.2, IA: 5.0, KS: 5.7, KY: 6.8, LA: 7.6, ME: 5.0, MD: 6.0,
      MA: 4.0, MI: 6.2, MN: 4.6, MS: 9.4, MO: 5.9, MT: 5.0, NE: 5.7,
      NV: 5.6, NH: 4.0, NJ: 4.3, NM: 5.5, NY: 4.4, NC: 6.8, ND: 5.4,
      OH: 7.0, OK: 6.8, OR: 4.6, PA: 5.7, RI: 5.0, SC: 6.8, SD: 6.4,
      TN: 6.7, TX: 5.7, UT: 5.3, VT: 4.0, VA: 5.6, WA: 4.0, WV: 6.6,
      WI: 5.8, WY: 5.7,
    },
    cagr: { default: -0.01 }, // slow decline
  },

  drug_deaths: {
    key: "drug_deaths",
    label: "Drug overdose deaths",
    shortLabel: "Overdose deaths",
    unit: "per100K",
    desc: "Age-adjusted drug overdose death rate per 100,000 population.",
    source: "CDC WONDER, Multiple Cause of Death",
    asOf: "2022",
    costLike: true,
    category: "health",
    latest: {
      AL: 36.0, AK: 38.6, AZ: 34.5, AR: 27.2, CA: 27.8, CO: 30.6, CT: 41.0,
      DE: 50.6, DC: 65.2, FL: 35.0, GA: 23.6, HI: 16.6, ID: 19.6, IL: 35.7,
      IN: 39.7, IA: 14.4, KS: 18.8, KY: 53.0, LA: 50.0, ME: 39.5, MD: 47.0,
      MA: 37.0, MI: 33.7, MN: 24.9, MS: 25.8, MO: 35.7, MT: 22.4, NE: 11.7,
      NV: 30.6, NH: 36.0, NJ: 33.6, NM: 50.2, NY: 27.1, NC: 39.7, ND: 17.8,
      OH: 47.6, OK: 26.0, OR: 26.6, PA: 43.0, RI: 41.0, SC: 36.0, SD: 12.4,
      TN: 56.6, TX: 16.3, UT: 22.0, VT: 50.0, VA: 32.6, WA: 32.3, WV: 80.9,
      WI: 30.0, WY: 17.0,
    },
    // Rapid rise 2014-2022 with fentanyl crisis; ~+8%/yr nationally.
    cagr: { default: 0.08, stateOverrides: {
      WV: 0.12, KY: 0.10, TN: 0.12, OH: 0.09, DE: 0.11, DC: 0.12, NM: 0.10,
      // States that have plateaued or improved
      NE: 0.02, IA: 0.02, SD: 0.01, HI: 0.02,
    }},
  },

  maternal_mortality: {
    key: "maternal_mortality",
    label: "Maternal mortality",
    shortLabel: "Maternal mortality",
    unit: "per100K",
    desc: "Maternal deaths per 100,000 live births (pregnancy-related).",
    source: "CDC NVSS",
    asOf: "2022",
    costLike: true,
    category: "health",
    latest: {
      // Many small states have suppressed values due to small sample sizes.
      // We use the 3-year national or regional estimate where state-specific
      // numbers are too sparse to publish.
      AL: 64.6, AK: 27.0, AZ: 21.7, AR: 43.5, CA: 12.8, CO: 16.6, CT: 14.9,
      DE: 24.0, DC: 27.0, FL: 24.0, GA: 33.9, HI: 18.0, ID: 18.0, IL: 25.0,
      IN: 43.6, IA: 23.0, KS: 24.0, KY: 36.8, LA: 58.1, ME: 20.0, MD: 23.5,
      MA: 8.4, MI: 26.4, MN: 16.0, MS: 82.5, MO: 32.6, MT: 22.0, NE: 21.0,
      NV: 18.0, NH: 18.0, NJ: 38.1, NM: 24.0, NY: 18.9, NC: 26.5, ND: 22.0,
      OH: 23.2, OK: 28.0, OR: 19.0, PA: 27.0, RI: 22.0, SC: 31.0, SD: 22.0,
      TN: 41.7, TX: 18.5, UT: 19.0, VT: 18.0, VA: 21.3, WA: 13.0, WV: 28.0,
      WI: 16.0, WY: 22.0,
    },
    cagr: { default: 0.03 },
  },

  // ═══ POLITICS & CIVIC LIFE ════════════════════════════════════════════
  // 2024 certified general election results. Margin is Trump minus Harris
  // in percentage points (positive = Trump won). Turnout is total votes
  // cast / voting-eligible population.
  // Sources: state SoS-certified results aggregated by MIT Election Lab /
  // Cook Political Report. Turnout from the US Elections Project.

  presidential_margin: {
    key: "presidential_margin",
    label: "2024 Presidential margin",
    shortLabel: "2024 margin",
    unit: "±pp",
    desc: "Trump margin over Harris in percentage points (positive = Trump won, negative = Harris won).",
    source: "State SoS certified results, 2024 General Election",
    asOf: "2024",
    costLike: false, // bipolar metric — no "good/bad" direction
    category: "politics",
    latest: {
      AL: 30.4, AK: 13.1, AZ: 5.5, AR: 21.0, CA: -20.0, CO: -11.0, CT: -14.5,
      DE: -14.7, DC: -86.0, FL: 13.0, GA: 2.2, HI: -23.0, ID: 36.7, IL: -10.9,
      IN: 19.0, IA: 13.2, KS: 16.0, KY: 30.5, LA: 22.0, ME: -7.0, MD: -29.0,
      MA: -25.0, MI: 1.4, MN: -4.3, MS: 21.5, MO: 18.5, MT: 20.0, NE: 20.5,
      NV: 3.1, NH: -2.8, NJ: -5.9, NM: -6.0, NY: -12.8, NC: 3.2, ND: 36.5,
      OH: 11.0, OK: 33.7, OR: -14.0, PA: 1.7, RI: -14.0, SC: 18.0, SD: 29.0,
      TN: 30.4, TX: 13.7, UT: 22.0, VT: -32.0, VA: -5.8, WA: -18.0, WV: 41.9,
      WI: 0.9, WY: 46.0,
    },
    cagr: { default: 0 }, // election results aren't a continuous trend
  },

  voter_turnout: {
    key: "voter_turnout",
    label: "Voter turnout (2024)",
    shortLabel: "Turnout",
    unit: "%",
    desc: "Total votes cast as a share of the voting-eligible population, 2024 general election.",
    source: "United States Elections Project (Michael McDonald)",
    asOf: "2024",
    costLike: false, // higher = more civic participation
    category: "politics",
    latest: {
      AL: 60.0, AK: 60.8, AZ: 65.0, AR: 53.0, CA: 65.0, CO: 73.0, CT: 70.5,
      DE: 68.0, DC: 67.0, FL: 68.0, GA: 67.0, HI: 50.0, ID: 64.0, IL: 64.0,
      IN: 60.0, IA: 70.0, KS: 64.0, KY: 61.0, LA: 63.0, ME: 73.0, MD: 67.0,
      MA: 67.0, MI: 72.0, MN: 74.5, MS: 56.0, MO: 67.0, MT: 71.0, NE: 67.0,
      NV: 70.0, NH: 73.0, NJ: 67.5, NM: 64.0, NY: 60.0, NC: 71.0, ND: 64.0,
      OH: 67.0, OK: 56.0, OR: 70.0, PA: 71.0, RI: 65.0, SC: 65.0, SD: 65.0,
      TN: 56.0, TX: 60.0, UT: 65.0, VT: 65.0, VA: 71.0, WA: 70.0, WV: 56.0,
      WI: 75.0, WY: 64.0,
    },
    // Turnout is cyclic with elections, not a continuous trend; use ~0%.
    cagr: { default: 0 },
  },

  // ═══ CRIME & SAFETY ═══════════════════════════════════════════════════
  // FBI Uniform Crime Reporting (UCR) program, 2023 data — the latest full
  // year published. Incarceration rates from BJS National Prisoner Statistics
  // (most recent year-end count). Per 100K residents in all cases.
  //
  // IMPORTANT: violent crime trends ARE rising across many states post-2020.
  // Property crime is more mixed. Murder rates spiked 2020-2022 then partly
  // receded by 2023. CAGRs reflect the longer post-2014 trend.

  violent_crime: {
    key: "violent_crime",
    label: "Violent crime rate",
    shortLabel: "Violent crime",
    unit: "per100K",
    desc: "FBI-defined violent offenses (murder, rape, robbery, aggravated assault) per 100,000 residents.",
    source: "FBI Uniform Crime Reporting Program",
    asOf: "2023",
    costLike: true,
    category: "crime",
    latest: {
      AL: 446, AK: 759, AZ: 392, AR: 663, CA: 510, CO: 466, CT: 169,
      DE: 421, DC: 1019, FL: 259, GA: 369, HI: 245, ID: 215, IL: 411,
      IN: 327, IA: 287, KS: 401, KY: 254, LA: 543, ME: 119, MD: 432,
      MA: 318, MI: 469, MN: 257, MS: 281, MO: 502, MT: 459, NE: 327,
      NV: 460, NH: 144, NJ: 184, NM: 781, NY: 339, NC: 363, ND: 286,
      OH: 280, OK: 412, OR: 297, PA: 326, RI: 192, SC: 471, SD: 412,
      TN: 621, TX: 432, UT: 247, VT: 175, VA: 215, WA: 314, WV: 282,
      WI: 282, WY: 195,
    },
    cagr: { default: 0.01 }, // mostly flat 2014-2023; some states up
  },

  murder_rate: {
    key: "murder_rate",
    label: "Murder rate",
    shortLabel: "Murder rate",
    unit: "per100K",
    desc: "Murder and non-negligent manslaughter offenses per 100,000 residents.",
    source: "FBI Uniform Crime Reporting Program",
    asOf: "2023",
    costLike: true,
    category: "crime",
    latest: {
      AL: 11.2, AK: 9.2, AZ: 7.4, AR: 11.4, CA: 5.0, CO: 4.8, CT: 3.1,
      DE: 6.1, DC: 40.9, FL: 4.9, GA: 7.5, HI: 2.4, ID: 2.5, IL: 7.1,
      IN: 6.6, IA: 2.5, KS: 5.6, KY: 5.4, LA: 14.4, ME: 1.7, MD: 9.1,
      MA: 1.8, MI: 6.4, MN: 3.5, MS: 14.4, MO: 9.0, MT: 4.6, NE: 3.4,
      NV: 6.5, NH: 1.4, NJ: 3.4, NM: 9.7, NY: 4.0, NC: 7.7, ND: 3.7,
      OH: 6.3, OK: 6.7, OR: 4.5, PA: 6.6, RI: 2.8, SC: 10.2, SD: 4.1,
      TN: 10.0, TX: 6.4, UT: 2.5, VT: 1.8, VA: 5.7, WA: 4.3, WV: 4.8,
      WI: 4.1, WY: 2.5,
    },
    // Murder spiked 2020-2021 with pandemic disruption; partial recovery by 2023.
    cagr: { default: 0.03 },
  },

  property_crime: {
    key: "property_crime",
    label: "Property crime rate",
    shortLabel: "Property crime",
    unit: "per100K",
    desc: "Burglary, larceny-theft, and motor vehicle theft per 100,000 residents.",
    source: "FBI Uniform Crime Reporting Program",
    asOf: "2023",
    costLike: true,
    category: "crime",
    latest: {
      AL: 2530, AK: 2841, AZ: 3033, AR: 2856, CA: 2348, CO: 2727, CT: 1611,
      DE: 1825, DC: 5117, FL: 1830, GA: 2185, HI: 2654, ID: 1397, IL: 1851,
      IN: 1991, IA: 1605, KS: 2192, KY: 1809, LA: 2818, ME: 1227, MD: 2008,
      MA: 1257, MI: 1668, MN: 1972, MS: 1932, MO: 2511, MT: 2298, NE: 2102,
      NV: 2477, NH: 1083, NJ: 1290, NM: 3175, NY: 1845, NC: 2129, ND: 1924,
      OH: 1858, OK: 2664, OR: 2812, PA: 1331, RI: 1370, SC: 2541, SD: 1664,
      TN: 2659, TX: 2382, UT: 2208, VT: 1320, VA: 1535, WA: 3157, WV: 1417,
      WI: 1383, WY: 1593,
    },
    cagr: { default: -0.02 }, // long-term decline
  },

  incarceration: {
    key: "incarceration",
    label: "Incarceration rate",
    shortLabel: "Incarceration",
    unit: "per100K",
    desc: "State + federal prisoners under jurisdiction per 100,000 residents (year-end).",
    source: "Bureau of Justice Statistics, National Prisoner Statistics",
    asOf: "2022",
    costLike: true,
    category: "crime",
    latest: {
      AL: 690, AK: 470, AZ: 565, AR: 615, CA: 320, CO: 380, CT: 240,
      DE: 380, DC: 130, FL: 460, GA: 580, HI: 230, ID: 470, IL: 245,
      IN: 425, IA: 280, KS: 360, KY: 575, LA: 685, ME: 145, MD: 280,
      MA: 130, MI: 320, MN: 145, MS: 690, MO: 470, MT: 350, NE: 295,
      NV: 460, NH: 175, NJ: 165, NM: 285, NY: 175, NC: 290, ND: 215,
      OH: 380, OK: 660, OR: 290, PA: 295, RI: 130, SC: 415, SD: 415,
      TN: 410, TX: 565, UT: 195, VT: 165, VA: 410, WA: 195, WV: 365,
      WI: 365, WY: 360,
    },
    cagr: { default: -0.01 }, // gradual decline since 2010s reforms
  },

};

// Metric ordering — grouped by category for the picker. Order within each
// group is "most asked about / most universal" first.
// Display order for the picker. metricsForCategory() filters this list by
// category, so ANY new metric added to STATE_METRICS must also appear here
// or it won't render in the UI. (Found-and-fixed: an earlier PR added the
// Health / Politics / Crime metrics to STATE_METRICS but missed this list,
// so those categories showed up empty in the picker.)
export const STATE_METRIC_ORDER = [
  // Cost of living
  "median_home", "rent", "gas", "electricity",
  // Tax
  "income_tax", "sales_tax", "property_tax", "gas_tax", "corp_tax",
  // Demographics
  "population", "household_income", "unemployment", "bachelors", "gdp_capita",
  // Health & wellbeing
  "life_expectancy", "uninsured", "infant_mortality", "drug_deaths", "maternal_mortality",
  // Politics & civic life
  "presidential_margin", "voter_turnout",
  // Crime & safety
  "violent_crime", "murder_rate", "property_crime", "incarceration",
];

export function metricsForCategory(cat: StateMetricCategory): string[] {
  return STATE_METRIC_ORDER.filter(k => STATE_METRICS[k].category === cat);
}

// Compute the unweighted national mean across the 50 states + DC for a metric.
export function metricMean(m: StateMetric): number {
  const vals = Object.values(m.latest) as number[];
  if (vals.length === 0) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// Compute min/max across the dataset (useful for color scale extents).
export function metricExtent(m: StateMetric): [number, number] {
  const vals = Object.values(m.latest) as number[];
  return [Math.min(...vals), Math.max(...vals)];
}

// Format a metric value for display.
export function formatMetricValue(m: StateMetric, v: number | undefined | null): string {
  if (v === undefined || v === null || !isFinite(v)) return "—";
  switch (m.unit) {
    case "$K":     return "$" + Math.round(v) + "K";
    case "¢/kWh":  return v.toFixed(1) + "¢/kWh";
    case "$/gal":  return "$" + v.toFixed(2);
    case "$/mo":   return "$" + Math.round(v).toLocaleString();
    case "%":      return v.toFixed(2) + "%";
    case "M":      return v.toFixed(2) + "M";
    case "¢/gal":  return v.toFixed(1) + "¢";
    case "yrs":    return v.toFixed(1) + " yrs";
    case "per100K":return v.toFixed(1) + " per 100K";
    case "per1K":  return v.toFixed(1) + " per 1K";
    case "±pp":    return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " pp";
  }
}

// Format a deviation from the national mean (signed) for the vs-average view.
export function formatDeviation(m: StateMetric, dev: number): string {
  const sign = dev >= 0 ? "+" : "−";
  const av = Math.abs(dev);
  switch (m.unit) {
    case "$K":     return sign + "$" + Math.round(av) + "K";
    case "¢/kWh":  return sign + av.toFixed(1) + "¢";
    case "$/gal":  return sign + "$" + av.toFixed(2);
    case "$/mo":   return sign + "$" + Math.round(av).toLocaleString();
    case "%":      return sign + av.toFixed(1) + " pp";
    case "M":      return sign + av.toFixed(2) + "M";
    case "¢/gal":  return sign + av.toFixed(1) + "¢";
    case "yrs":    return sign + av.toFixed(1) + " yrs";
    case "per100K":return sign + av.toFixed(1) + " per 100K";
    case "per1K":  return sign + av.toFixed(2) + " per 1K";
    case "±pp":    return sign + av.toFixed(1) + " pp";
  }
}
