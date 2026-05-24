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

export const METRICS_DATA: Record<MetricKey, MetricDef> = {
  gdp: {
    key: "gdp", label: "GDP Growth", unit: "%", inverse: false, category: "Growth", source: "BEA",
    hints: ["gdp", "gross domestic product", "economic growth", "economy grew", "economy contracted", "real gdp"],
    data: [
      { y: 1993, v: 2.7, a: "clinton" }, { y: 1994, v: 4.0, a: "clinton" }, { y: 1995, v: 2.7, a: "clinton" },
      { y: 1996, v: 3.8, a: "clinton" }, { y: 1997, v: 4.5, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" },
      { y: 1999, v: 4.7, a: "clinton" }, { y: 2000, v: 4.1, a: "clinton" },
      { y: 2001, v: 1.0, a: "bush" }, { y: 2002, v: 1.7, a: "bush" }, { y: 2003, v: 2.8, a: "bush" },
      { y: 2004, v: 3.8, a: "bush" }, { y: 2005, v: 3.5, a: "bush" }, { y: 2006, v: 2.8, a: "bush" },
      { y: 2007, v: 2.0, a: "bush" }, { y: 2008, v: -0.1, a: "bush" },
      { y: 2009, v: -2.6, a: "obama" }, { y: 2010, v: 2.7, a: "obama" }, { y: 2011, v: 1.5, a: "obama" },
      { y: 2012, v: 2.3, a: "obama" }, { y: 2013, v: 1.8, a: "obama" }, { y: 2014, v: 2.3, a: "obama" },
      { y: 2015, v: 2.7, a: "obama" }, { y: 2016, v: 1.7, a: "obama" },
      { y: 2017, v: 2.2, a: "trump1" }, { y: 2018, v: 2.9, a: "trump1" }, { y: 2019, v: 2.3, a: "trump1" },
      { y: 2020, v: -2.8, a: "trump1" },
      { y: 2021, v: 5.9, a: "biden" }, { y: 2022, v: 1.9, a: "biden" }, { y: 2023, v: 2.5, a: "biden" },
      { y: 2024, v: 2.8, a: "biden" },
    ],
  },
  unemployment: {
    key: "unemployment", label: "Unemployment", unit: "%", inverse: true, category: "Jobs", source: "BLS",
    hints: ["unemployment", "jobless rate", "out of work", "u-3"],
    data: [
      { y: 1993, v: 6.9, a: "clinton" }, { y: 1994, v: 6.1, a: "clinton" }, { y: 1995, v: 5.6, a: "clinton" },
      { y: 1996, v: 5.4, a: "clinton" }, { y: 1997, v: 4.9, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" },
      { y: 1999, v: 4.2, a: "clinton" }, { y: 2000, v: 4.0, a: "clinton" },
      { y: 2001, v: 4.7, a: "bush" }, { y: 2002, v: 5.8, a: "bush" }, { y: 2003, v: 6.0, a: "bush" },
      { y: 2004, v: 5.5, a: "bush" }, { y: 2005, v: 5.1, a: "bush" }, { y: 2006, v: 4.6, a: "bush" },
      { y: 2007, v: 4.6, a: "bush" }, { y: 2008, v: 5.8, a: "bush" },
      { y: 2009, v: 9.3, a: "obama" }, { y: 2010, v: 9.6, a: "obama" }, { y: 2011, v: 8.9, a: "obama" },
      { y: 2012, v: 8.1, a: "obama" }, { y: 2013, v: 7.4, a: "obama" }, { y: 2014, v: 6.2, a: "obama" },
      { y: 2015, v: 5.3, a: "obama" }, { y: 2016, v: 4.9, a: "obama" },
      { y: 2017, v: 4.4, a: "trump1" }, { y: 2018, v: 3.9, a: "trump1" }, { y: 2019, v: 3.7, a: "trump1" },
      { y: 2020, v: 8.1, a: "trump1" },
      { y: 2021, v: 5.4, a: "biden" }, { y: 2022, v: 3.6, a: "biden" }, { y: 2023, v: 3.6, a: "biden" },
      { y: 2024, v: 4.0, a: "biden" },
    ],
  },
  inflation: {
    key: "inflation", label: "Inflation (CPI)", unit: "%", inverse: true, category: "Prices", source: "BLS CPI-U",
    hints: ["inflation", "cpi", "consumer price", "prices rose", "prices fell", "cost of living"],
    data: [
      { y: 1993, v: 3.0, a: "clinton" }, { y: 1994, v: 2.6, a: "clinton" }, { y: 1995, v: 2.8, a: "clinton" },
      { y: 1996, v: 2.9, a: "clinton" }, { y: 1997, v: 2.3, a: "clinton" }, { y: 1998, v: 1.5, a: "clinton" },
      { y: 1999, v: 2.2, a: "clinton" }, { y: 2000, v: 3.4, a: "clinton" },
      { y: 2001, v: 2.8, a: "bush" }, { y: 2002, v: 1.6, a: "bush" }, { y: 2003, v: 2.3, a: "bush" },
      { y: 2004, v: 2.7, a: "bush" }, { y: 2005, v: 3.4, a: "bush" }, { y: 2006, v: 3.2, a: "bush" },
      { y: 2007, v: 2.9, a: "bush" }, { y: 2008, v: 3.8, a: "bush" },
      { y: 2009, v: -0.3, a: "obama" }, { y: 2010, v: 1.6, a: "obama" }, { y: 2011, v: 3.2, a: "obama" },
      { y: 2012, v: 2.1, a: "obama" }, { y: 2013, v: 1.5, a: "obama" }, { y: 2014, v: 1.6, a: "obama" },
      { y: 2015, v: 0.1, a: "obama" }, { y: 2016, v: 1.3, a: "obama" },
      { y: 2017, v: 2.1, a: "trump1" }, { y: 2018, v: 2.4, a: "trump1" }, { y: 2019, v: 1.8, a: "trump1" },
      { y: 2020, v: 1.2, a: "trump1" },
      { y: 2021, v: 4.7, a: "biden" }, { y: 2022, v: 8.0, a: "biden" }, { y: 2023, v: 4.1, a: "biden" },
      { y: 2024, v: 2.9, a: "biden" },
    ],
  },
  sp500: {
    key: "sp500", label: "S&P 500", unit: "idx", inverse: false, category: "Markets", source: "Yahoo Finance",
    hints: ["s&p", "s&p 500", "stock market", "wall street", "market cap", "stocks"],
    data: [
      { y: 1993, v: 452, a: "clinton" }, { y: 1994, v: 460, a: "clinton" }, { y: 1995, v: 615, a: "clinton" },
      { y: 1996, v: 741, a: "clinton" }, { y: 1997, v: 970, a: "clinton" }, { y: 1998, v: 1229, a: "clinton" },
      { y: 1999, v: 1469, a: "clinton" }, { y: 2000, v: 1320, a: "clinton" },
      { y: 2001, v: 1148, a: "bush" }, { y: 2002, v: 880, a: "bush" }, { y: 2003, v: 1112, a: "bush" },
      { y: 2004, v: 1212, a: "bush" }, { y: 2005, v: 1249, a: "bush" }, { y: 2006, v: 1418, a: "bush" },
      { y: 2007, v: 1468, a: "bush" }, { y: 2008, v: 903, a: "bush" },
      { y: 2009, v: 1115, a: "obama" }, { y: 2010, v: 1258, a: "obama" }, { y: 2011, v: 1258, a: "obama" },
      { y: 2012, v: 1426, a: "obama" }, { y: 2013, v: 1848, a: "obama" }, { y: 2014, v: 2059, a: "obama" },
      { y: 2015, v: 2044, a: "obama" }, { y: 2016, v: 2239, a: "obama" },
      { y: 2017, v: 2674, a: "trump1" }, { y: 2018, v: 2507, a: "trump1" }, { y: 2019, v: 3231, a: "trump1" },
      { y: 2020, v: 3756, a: "trump1" },
      { y: 2021, v: 4766, a: "biden" }, { y: 2022, v: 3840, a: "biden" }, { y: 2023, v: 4770, a: "biden" },
      { y: 2024, v: 5881, a: "biden" },
    ],
  },
  debt_gdp: {
    key: "debt_gdp", label: "Debt-to-GDP", unit: "%", inverse: true, category: "Fiscal", source: "FRED / Treasury",
    hints: ["debt", "national debt", "debt-to-gdp", "federal debt"],
    data: [
      { y: 1993, v: 64.4, a: "clinton" }, { y: 1994, v: 64.0, a: "clinton" }, { y: 1995, v: 64.2, a: "clinton" },
      { y: 1996, v: 63.3, a: "clinton" }, { y: 1997, v: 60.3, a: "clinton" }, { y: 1998, v: 57.2, a: "clinton" },
      { y: 1999, v: 55.3, a: "clinton" }, { y: 2000, v: 54.7, a: "clinton" },
      { y: 2001, v: 54.3, a: "bush" }, { y: 2002, v: 56.8, a: "bush" }, { y: 2003, v: 59.1, a: "bush" },
      { y: 2004, v: 61.0, a: "bush" }, { y: 2005, v: 60.9, a: "bush" }, { y: 2006, v: 61.1, a: "bush" },
      { y: 2007, v: 62.0, a: "bush" }, { y: 2008, v: 67.7, a: "bush" },
      { y: 2009, v: 82.4, a: "obama" }, { y: 2010, v: 91.4, a: "obama" }, { y: 2011, v: 95.6, a: "obama" },
      { y: 2012, v: 99.7, a: "obama" }, { y: 2013, v: 100.4, a: "obama" }, { y: 2014, v: 103.4, a: "obama" },
      { y: 2015, v: 100.8, a: "obama" }, { y: 2016, v: 105.6, a: "obama" },
      { y: 2017, v: 105.0, a: "trump1" }, { y: 2018, v: 106.1, a: "trump1" }, { y: 2019, v: 107.2, a: "trump1" },
      { y: 2020, v: 129.2, a: "trump1" },
      { y: 2021, v: 126.4, a: "biden" }, { y: 2022, v: 120.6, a: "biden" }, { y: 2023, v: 122.3, a: "biden" },
      { y: 2024, v: 124.0, a: "biden" },
    ],
  },
  median_income: {
    key: "median_income", label: "Median Income", unit: "$K", inverse: false, category: "Wages", source: "Census ACS",
    hints: ["median income", "household income", "family income", "real wages", "wages"],
    data: [
      { y: 1993, v: 52.3, a: "clinton" }, { y: 1994, v: 53.2, a: "clinton" }, { y: 1995, v: 54.5, a: "clinton" },
      { y: 1996, v: 55.9, a: "clinton" }, { y: 1997, v: 57.6, a: "clinton" }, { y: 1998, v: 59.5, a: "clinton" },
      { y: 1999, v: 60.1, a: "clinton" }, { y: 2000, v: 59.5, a: "clinton" },
      { y: 2001, v: 58.1, a: "bush" }, { y: 2002, v: 57.4, a: "bush" }, { y: 2003, v: 56.5, a: "bush" },
      { y: 2004, v: 56.1, a: "bush" }, { y: 2005, v: 56.2, a: "bush" }, { y: 2006, v: 56.4, a: "bush" },
      { y: 2007, v: 57.4, a: "bush" }, { y: 2008, v: 55.3, a: "bush" },
      { y: 2009, v: 55.7, a: "obama" }, { y: 2010, v: 54.2, a: "obama" }, { y: 2011, v: 53.4, a: "obama" },
      { y: 2012, v: 53.6, a: "obama" }, { y: 2013, v: 54.5, a: "obama" }, { y: 2014, v: 55.6, a: "obama" },
      { y: 2015, v: 58.5, a: "obama" }, { y: 2016, v: 60.3, a: "obama" },
      { y: 2017, v: 61.4, a: "trump1" }, { y: 2018, v: 63.2, a: "trump1" }, { y: 2019, v: 68.7, a: "trump1" },
      { y: 2020, v: 67.5, a: "trump1" },
      { y: 2021, v: 70.8, a: "biden" }, { y: 2022, v: 74.6, a: "biden" }, { y: 2023, v: 80.6, a: "biden" },
      { y: 2024, v: 81.5, a: "biden" },
    ],
  },
};

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
