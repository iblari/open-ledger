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

// Years covered by historical data. Indexed 0..10 = 2014..2024.
export const HISTORY_YEARS: number[] = Array.from({ length: 11 }, (_, i) => 2014 + i);

// Back-fill an 11-element series (2014..2024) from a 2024 anchor using a CAGR.
// values[i] = latest / (1+cagr)^(10-i). Returns plain number[] indexed by HISTORY_YEARS.
export function buildHistory(latest: number, cagr: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const yearsAgo = 10 - i;
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
  const result: number[] = Array(11).fill(0);
  const counts: number[] = Array(11).fill(0);
  for (const code of Object.keys(m.latest) as StateCode[]) {
    const hist = stateHistory(m, code);
    if (!hist) continue;
    for (let i = 0; i < 11; i++) { result[i] += hist[i]; counts[i] += 1; }
  }
  for (let i = 0; i < 11; i++) result[i] = counts[i] ? result[i] / counts[i] : 0;
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
    asOf: "2024",
    costLike: true,
    category: "cost",
    latest: {
      AL: 175, AK: 380, AZ: 425, AR: 175, CA: 740, CO: 540, CT: 380, DE: 340,
      DC: 695, FL: 405, GA: 320, HI: 840, ID: 460, IL: 260, IN: 220, IA: 195,
      KS: 195, KY: 195, LA: 200, ME: 360, MD: 410, MA: 660, MI: 235, MN: 320,
      MS: 175, MO: 220, MT: 470, NE: 220, NV: 425, NH: 460, NJ: 510, NM: 290,
      NY: 470, NC: 320, ND: 245, OH: 220, OK: 195, OR: 490, PA: 250, RI: 460,
      SC: 290, SD: 250, TN: 310, TX: 305, UT: 510, VT: 370, VA: 380, WA: 605,
      WV: 165, WI: 270, WY: 335,
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
    asOf: "2024",
    costLike: true,
    category: "cost",
    latest: {
      AL: 14.5, AK: 24.5, AZ: 14.5, AR: 12.5, CA: 31.8, CO: 14.8, CT: 28.5,
      DE: 16.5, DC: 16.0, FL: 14.8, GA: 13.7, HI: 41.5, ID: 11.2, IL: 16.2,
      IN: 14.5, IA: 13.0, KS: 14.0, KY: 12.5, LA: 11.8, ME: 23.5, MD: 17.0,
      MA: 30.8, MI: 19.0, MN: 14.5, MS: 13.5, MO: 12.6, MT: 11.3, NE: 11.2,
      NV: 14.2, NH: 26.5, NJ: 19.5, NM: 14.0, NY: 23.5, NC: 12.4, ND: 10.9,
      OH: 15.5, OK: 12.0, OR: 12.5, PA: 17.0, RI: 28.0, SC: 14.5, SD: 12.5,
      TN: 12.0, TX: 14.5, UT: 11.2, VT: 21.0, VA: 14.8, WA: 11.0, WV: 14.5,
      WI: 16.5, WY: 11.0,
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
    asOf: "2024",
    costLike: true,
    category: "cost",
    latest: {
      AL: 2.85, AK: 3.70, AZ: 3.25, AR: 2.85, CA: 4.65, CO: 3.05, CT: 3.30,
      DE: 3.10, DC: 3.35, FL: 3.15, GA: 2.95, HI: 4.55, ID: 3.55, IL: 3.45,
      IN: 3.15, IA: 3.00, KS: 2.95, KY: 2.95, LA: 2.85, ME: 3.35, MD: 3.30,
      MA: 3.20, MI: 3.25, MN: 3.10, MS: 2.80, MO: 2.95, MT: 3.30, NE: 3.05,
      NV: 3.95, NH: 3.20, NJ: 3.15, NM: 3.10, NY: 3.30, NC: 3.00, ND: 3.10,
      OH: 3.10, OK: 2.80, OR: 3.85, PA: 3.30, RI: 3.20, SC: 2.90, SD: 3.05,
      TN: 2.95, TX: 2.85, UT: 3.20, VT: 3.30, VA: 3.05, WA: 4.10, WV: 3.10,
      WI: 3.05, WY: 3.10,
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
    asOf: "2024",
    costLike: true,
    category: "cost",
    latest: {
      AL: 1280, AK: 1420, AZ: 1820, AR: 1080, CA: 2870, CO: 2120, CT: 2200,
      DE: 1750, DC: 2450, FL: 2330, GA: 1700, HI: 2900, ID: 1620, IL: 1840,
      IN: 1340, IA: 1180, KS: 1230, KY: 1240, LA: 1310, ME: 1880, MD: 2060,
      MA: 2820, MI: 1380, MN: 1620, MS: 1200, MO: 1330, MT: 1620, NE: 1280,
      NV: 1850, NH: 2150, NJ: 2510, NM: 1390, NY: 2700, NC: 1750, ND: 1180,
      OH: 1300, OK: 1180, OR: 1820, PA: 1530, RI: 2080, SC: 1670, SD: 1190,
      TN: 1810, TX: 1820, UT: 1830, VT: 1690, VA: 1900, WA: 2210, WV: 1090,
      WI: 1340, WY: 1380,
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
    asOf: "2024",
    costLike: true,
    category: "tax",
    latest: {
      AL: 5.00, AK: 0, AZ: 2.50, AR: 4.40, CA: 13.30, CO: 4.40, CT: 6.99,
      DE: 6.60, DC: 10.75, FL: 0, GA: 5.39, HI: 11.00, ID: 5.80, IL: 4.95,
      IN: 3.05, IA: 5.70, KS: 5.70, KY: 4.00, LA: 4.25, ME: 7.15, MD: 5.75,
      MA: 9.00, MI: 4.25, MN: 9.85, MS: 4.70, MO: 4.80, MT: 5.90, NE: 5.84,
      NV: 0, NH: 0, NJ: 10.75, NM: 5.90, NY: 10.90, NC: 4.50, ND: 2.50,
      OH: 3.50, OK: 4.75, OR: 9.90, PA: 3.07, RI: 5.99, SC: 6.40, SD: 0,
      TN: 0, TX: 0, UT: 4.55, VT: 8.75, VA: 5.75, WA: 0, WV: 5.12, WI: 7.65,
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
    asOf: "2024",
    costLike: true,
    category: "tax",
    latest: {
      AL: 4.0, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0,
      DC: 6.0, FL: 6.0, GA: 4.0, HI: 4.0, ID: 6.0, IL: 6.25, IN: 7.0, IA: 6.0,
      KS: 6.5, KY: 6.0, LA: 4.45, ME: 5.5, MD: 6.0, MA: 6.25, MI: 6.0, MN: 6.875,
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
    asOf: "2024",
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
    asOf: "2024",
    costLike: true,
    category: "tax",
    latest: {
      AL: 28.0, AK: 8.95, AZ: 18.0, AR: 24.7, CA: 57.9, CO: 22.0, CT: 25.0,
      DE: 23.0, DC: 23.5, FL: 38.7, GA: 32.3, HI: 16.0, ID: 32.0, IL: 45.4,
      IN: 33.0, IA: 30.0, KS: 24.0, KY: 26.0, LA: 20.0, ME: 30.0, MD: 47.0,
      MA: 24.0, MI: 30.0, MN: 28.5, MS: 18.4, MO: 27.0, MT: 33.0, NE: 24.8,
      NV: 23.8, NH: 22.2, NJ: 42.3, NM: 19.0, NY: 25.4, NC: 40.7, ND: 23.0,
      OH: 38.5, OK: 19.0, OR: 38.0, PA: 58.7, RI: 37.0, SC: 26.0, SD: 30.0,
      TN: 26.4, TX: 20.0, UT: 36.4, VT: 32.3, VA: 29.4, WA: 49.4, WV: 35.7,
      WI: 30.9, WY: 24.0,
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
    asOf: "2024",
    costLike: true,
    category: "tax",
    latest: {
      AL: 6.5, AK: 9.4, AZ: 4.9, AR: 5.3, CA: 8.84, CO: 4.4, CT: 7.5, DE: 8.7,
      DC: 8.25, FL: 5.5, GA: 5.75, HI: 6.4, ID: 5.8, IL: 9.5, IN: 4.9, IA: 5.5,
      KS: 7.0, KY: 5.0, LA: 7.5, ME: 8.93, MD: 8.25, MA: 8.0, MI: 6.0, MN: 9.8,
      MS: 5.0, MO: 4.0, MT: 6.75, NE: 7.5, NV: 0, NH: 7.5, NJ: 9.0, NM: 5.9,
      NY: 7.25, NC: 2.5, ND: 4.31, OH: 0, OK: 4.0, OR: 7.6, PA: 8.49, RI: 7.0,
      SC: 5.0, SD: 0, TN: 6.5, TX: 0, UT: 4.55, VT: 8.5, VA: 6.0, WA: 0,
      WV: 6.5, WI: 7.9, WY: 0,
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
    asOf: "2024",
    costLike: false,
    category: "demo",
    latest: {
      AL: 5.1, AK: 0.74, AZ: 7.4, AR: 3.1, CA: 39.0, CO: 5.9, CT: 3.6, DE: 1.0,
      DC: 0.68, FL: 22.6, GA: 11.1, HI: 1.4, ID: 2.0, IL: 12.5, IN: 6.9, IA: 3.2,
      KS: 2.9, KY: 4.5, LA: 4.6, ME: 1.4, MD: 6.2, MA: 7.0, MI: 10.0, MN: 5.7,
      MS: 2.9, MO: 6.2, MT: 1.1, NE: 2.0, NV: 3.2, NH: 1.4, NJ: 9.3, NM: 2.1,
      NY: 19.5, NC: 10.8, ND: 0.78, OH: 11.8, OK: 4.1, OR: 4.2, PA: 13.0,
      RI: 1.1, SC: 5.4, SD: 0.92, TN: 7.1, TX: 30.5, UT: 3.4, VT: 0.65, VA: 8.7,
      WA: 7.8, WV: 1.8, WI: 5.9, WY: 0.58,
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
    asOf: "2024",
    costLike: false,
    category: "demo",
    latest: {
      AL: 56, AK: 87, AZ: 73, AR: 53, CA: 92, CO: 89, CT: 90, DE: 79, DC: 102,
      FL: 70, GA: 72, HI: 95, ID: 71, IL: 78, IN: 67, IA: 73, KS: 70, KY: 60,
      LA: 58, ME: 73, MD: 102, MA: 99, MI: 71, MN: 88, MS: 53, MO: 67, MT: 70,
      NE: 75, NV: 73, NH: 95, NJ: 100, NM: 60, NY: 84, NC: 70, ND: 76, OH: 67,
      OK: 60, OR: 80, PA: 76, RI: 84, SC: 65, SD: 70, TN: 65, TX: 75, UT: 90,
      VT: 78, VA: 88, WA: 92, WV: 55, WI: 75, WY: 75,
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
    asOf: "Sept 2024",
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
    asOf: "2024",
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
    asOf: "2024",
    costLike: false,
    category: "demo",
    latest: {
      AL: 53, AK: 79, AZ: 60, AR: 53, CA: 92, CO: 80, CT: 86, DE: 86, DC: 247,
      FL: 60, GA: 67, HI: 67, ID: 53, IL: 78, IN: 63, IA: 68, KS: 65, KY: 56,
      LA: 60, ME: 60, MD: 75, MA: 100, MI: 60, MN: 76, MS: 47, MO: 64, MT: 56,
      NE: 81, NV: 64, NH: 75, NJ: 78, NM: 60, NY: 100, NC: 66, ND: 92, OH: 65,
      OK: 60, OR: 65, PA: 75, RI: 65, SC: 56, SD: 75, TN: 65, TX: 78, UT: 70,
      VT: 60, VA: 78, WA: 90, WV: 51, WI: 65, WY: 77,
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
