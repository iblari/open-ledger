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

export type StateMetric = {
  key: string;
  label: string;
  shortLabel: string;
  unit: "$K" | "¢/kWh" | "$/gal" | "$/mo" | "%";
  desc: string;          // short human-readable description for tooltips/legend
  source: string;        // canonical source attribution
  asOf: string;          // e.g., "Q3 2024" or "2024"
  costLike: boolean;     // true = higher value is "more expensive" (colors warm)
  latest: Partial<Record<StateCode, number>>;
};

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
    latest: {
      AL: 175, AK: 380, AZ: 425, AR: 175, CA: 740, CO: 540, CT: 380, DE: 340,
      DC: 695, FL: 405, GA: 320, HI: 840, ID: 460, IL: 260, IN: 220, IA: 195,
      KS: 195, KY: 195, LA: 200, ME: 360, MD: 410, MA: 660, MI: 235, MN: 320,
      MS: 175, MO: 220, MT: 470, NE: 220, NV: 425, NH: 460, NJ: 510, NM: 290,
      NY: 470, NC: 320, ND: 245, OH: 220, OK: 195, OR: 490, PA: 250, RI: 460,
      SC: 290, SD: 250, TN: 310, TX: 305, UT: 510, VT: 370, VA: 380, WA: 605,
      WV: 165, WI: 270, WY: 335,
    },
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
  },

};

export const STATE_METRIC_ORDER = ["median_home", "rent", "gas", "electricity", "income_tax"];

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
    case "$K":     return "$" + v.toFixed(0) + "K";
    case "¢/kWh":  return v.toFixed(1) + "¢/kWh";
    case "$/gal":  return "$" + v.toFixed(2);
    case "$/mo":   return "$" + v.toLocaleString();
    case "%":      return v.toFixed(2) + "%";
  }
}

// Format a deviation from the national mean (signed) for the vs-average view.
export function formatDeviation(m: StateMetric, dev: number): string {
  const sign = dev >= 0 ? "+" : "−";
  const av = Math.abs(dev);
  switch (m.unit) {
    case "$K":     return sign + "$" + av.toFixed(0) + "K";
    case "¢/kWh":  return sign + av.toFixed(1) + "¢";
    case "$/gal":  return sign + "$" + av.toFixed(2);
    case "$/mo":   return sign + "$" + Math.round(av).toLocaleString();
    case "%":      return sign + av.toFixed(1) + " pp";
  }
}
