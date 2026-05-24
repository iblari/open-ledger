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

export type StateMetricCategory = "cost" | "tax" | "demo";

export const STATE_CATEGORY_LABELS: Record<StateMetricCategory, string> = {
  cost: "Cost of living",
  tax: "Taxes",
  demo: "People & economy",
};

export type StateMetric = {
  key: string;
  label: string;
  shortLabel: string;
  unit: "$K" | "¢/kWh" | "$/gal" | "$/mo" | "%" | "M" | "¢/gal";
  desc: string;          // short human-readable description for tooltips/legend
  source: string;        // canonical source attribution
  asOf: string;          // e.g., "Q3 2024" or "2024"
  costLike: boolean;     // true = higher value is "more expensive" (colors warm)
  category: StateMetricCategory;  // groups metrics in the picker
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

// Unweighted national mean for each of the 11 years (used for the trend chart's
// always-on national line). Computed lazily, cached per metric.
const _nationalCache = new WeakMap<StateMetric, number[]>();
export function nationalHistory(m: StateMetric): number[] {
  const cached = _nationalCache.get(m);
  if (cached) return cached;
  const result: number[] = Array(12).fill(0);
  const counts: number[] = Array(12).fill(0);
  for (const code of Object.keys(m.latest) as StateCode[]) {
    const hist = stateHistory(m, code);
    if (!hist) continue;
    for (let i = 0; i < 12; i++) { result[i] += hist[i]; counts[i] += 1; }
  }
  for (let i = 0; i < 12; i++) result[i] = counts[i] ? result[i] / counts[i] : 0;
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

};

// Metric ordering — grouped by category for the picker. Order within each
// group is "most asked about / most universal" first.
export const STATE_METRIC_ORDER = [
  // Cost of living
  "median_home", "rent", "gas", "electricity",
  // Tax
  "income_tax", "sales_tax", "property_tax", "gas_tax", "corp_tax",
  // Demographics
  "population", "household_income", "unemployment", "bachelors", "gdp_capita",
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
  }
}
