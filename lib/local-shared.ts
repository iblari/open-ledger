
/**
 * Localize the data — the official numbers for where a reader lives.
 *
 * What exists, and nothing finer than it does:
 *   Prices   BLS CPI for the 4 Census regions (no state CPI exists).
 *            All items since 1966, rent since 1977, owners' equivalent rent since 1982.
 *   Gas      EIA weekly regular gasoline for the 5 PADD regions (since 1992).
 *   Wages    BLS state average hourly earnings, private sector (since 2007).
 *   Homes    FHFA house price index by state, quarterly (since 1975).
 *
 * All series are fetched from FRED. Year-over-year changes use the
 * not-seasonally-adjusted series on both sides (region and US), the basis
 * BLS uses for its headline 12-month change. The verdict on a claim is never
 * localized — claims are about national figures; this is context only.
 */

export type Housing = "renter" | "owner";
export interface StateInfo { code: string; name: string; fips: string; cpi: CpiRegion; padd: Padd }
export type CpiRegion = "northeast" | "midwest" | "south" | "west";
export type Padd = "east" | "midwest" | "gulf" | "rocky" | "west";

export const CPI_REGION: Record<CpiRegion, { name: string; code: string }> = {
  northeast: { name: "Northeast", code: "0100" },
  midwest: { name: "Midwest", code: "0200" },
  south: { name: "South", code: "0300" },
  west: { name: "West", code: "0400" },
};
export const PADD: Record<Padd, { name: string; fred: string }> = {
  east: { name: "East Coast", fred: "GASREGECW" },
  midwest: { name: "Midwest", fred: "GASREGMWW" },
  gulf: { name: "Gulf Coast", fred: "GASREGGCW" },
  rocky: { name: "Rocky Mountain", fred: "GASREGRMW" },
  west: { name: "West Coast", fred: "GASREGWCW" },
};

// code, name, FIPS, Census region (BLS CPI), PADD (EIA gasoline)
const S: [string, string, string, CpiRegion, Padd][] = [
  ["AL", "Alabama", "01", "south", "gulf"], ["AK", "Alaska", "02", "west", "west"], ["AZ", "Arizona", "04", "west", "west"],
  ["AR", "Arkansas", "05", "south", "gulf"], ["CA", "California", "06", "west", "west"], ["CO", "Colorado", "08", "west", "rocky"],
  ["CT", "Connecticut", "09", "northeast", "east"], ["DE", "Delaware", "10", "south", "east"], ["DC", "District of Columbia", "11", "south", "east"],
  ["FL", "Florida", "12", "south", "east"], ["GA", "Georgia", "13", "south", "east"], ["HI", "Hawaii", "15", "west", "west"],
  ["ID", "Idaho", "16", "west", "rocky"], ["IL", "Illinois", "17", "midwest", "midwest"], ["IN", "Indiana", "18", "midwest", "midwest"],
  ["IA", "Iowa", "19", "midwest", "midwest"], ["KS", "Kansas", "20", "midwest", "midwest"], ["KY", "Kentucky", "21", "south", "midwest"],
  ["LA", "Louisiana", "22", "south", "gulf"], ["ME", "Maine", "23", "northeast", "east"], ["MD", "Maryland", "24", "south", "east"],
  ["MA", "Massachusetts", "25", "northeast", "east"], ["MI", "Michigan", "26", "midwest", "midwest"], ["MN", "Minnesota", "27", "midwest", "midwest"],
  ["MS", "Mississippi", "28", "south", "gulf"], ["MO", "Missouri", "29", "midwest", "midwest"], ["MT", "Montana", "30", "west", "rocky"],
  ["NE", "Nebraska", "31", "midwest", "midwest"], ["NV", "Nevada", "32", "west", "west"], ["NH", "New Hampshire", "33", "northeast", "east"],
  ["NJ", "New Jersey", "34", "northeast", "east"], ["NM", "New Mexico", "35", "west", "gulf"], ["NY", "New York", "36", "northeast", "east"],
  ["NC", "North Carolina", "37", "south", "east"], ["ND", "North Dakota", "38", "midwest", "midwest"], ["OH", "Ohio", "39", "midwest", "midwest"],
  ["OK", "Oklahoma", "40", "south", "midwest"], ["OR", "Oregon", "41", "west", "west"], ["PA", "Pennsylvania", "42", "northeast", "east"],
  ["RI", "Rhode Island", "44", "northeast", "east"], ["SC", "South Carolina", "45", "south", "east"], ["SD", "South Dakota", "46", "midwest", "midwest"],
  ["TN", "Tennessee", "47", "south", "midwest"], ["TX", "Texas", "48", "south", "gulf"], ["UT", "Utah", "49", "west", "rocky"],
  ["VT", "Vermont", "50", "northeast", "east"], ["VA", "Virginia", "51", "south", "east"], ["WA", "Washington", "53", "west", "west"],
  ["WV", "West Virginia", "54", "south", "east"], ["WI", "Wisconsin", "55", "midwest", "midwest"], ["WY", "Wyoming", "56", "west", "rocky"],
];
export const STATES: StateInfo[] = S.map(([code, name, fips, cpi, padd]) => ({ code, name, fips, cpi, padd }));
export const STATE_BY_CODE = new Map(STATES.map(s => [s.code, s]));

/* ── Cookie ───────────────────────────────────────────────────────── */

export const LOC_COOKIE = "vu_loc";
export interface Loc { state: StateInfo; housing: Housing }
/** "OH:r" → Ohio, renter. Anything else → null (national only). */
export function parseLoc(v: string | undefined | null): Loc | null {
  const m = (v || "").match(/^([A-Z]{2}):([ro])$/);
  const st = m ? STATE_BY_CODE.get(m[1]) : undefined;
  return st ? { state: st, housing: m![2] === "o" ? "owner" : "renter" } : null;
}
export const locValue = (code: string, h: Housing) => `${code}:${h === "owner" ? "o" : "r"}`;

/* ── Snapshot ─────────────────────────────────────────────────────── */

export interface Reading { value: number; date: string; label: string }
export interface Pair { local: Reading; us: Reading; place: string; source: string; url: string }
export interface LocalSnapshot {
  state: string; stateName: string; housing: Housing;
  region: string; padd: string;
  cpi: Pair | null;          // all items, 12-month % change
  shelter: Pair | null;      // rent (renter) or owners' equivalent rent (owner), 12-month %
  homes: Pair | null;        // owner only: FHFA state house prices, 12-month %
  gas: Pair | null;          // $/gal, latest week
  wages: Pair | null;        // average hourly earnings, 12-month %
  payVsPrices: { local: number; us: number } | null;   // wages − CPI, points
}

/* ── Which local figure fits a claim ─────────────────────────────── */

export type LocalTopic = "cpi" | "shelter" | "gas" | "wages" | "homes";
const SERIES_TOPIC: Record<string, LocalTopic> = {
  cpi_yoy: "cpi", core_cpi_yoy: "cpi", pce_yoy: "cpi", food_yoy: "cpi", cpi_mom: "cpi",
  rent_yoy: "shelter", home_price_yoy: "homes", gas: "gas", wages_yoy: "wages", real_wages: "wages",
};
/** From the claim's mapped series when there is one, else from its words. */
export function localTopic(seriesId: string | null | undefined, quote: string): LocalTopic | null {
  if (seriesId && SERIES_TOPIC[seriesId]) return SERIES_TOPIC[seriesId];
  const q = quote.toLowerCase();
  if (/\b(gas|gasoline|at the pump|a gallon)\b/.test(q)) return "gas";
  if (/\b(rent|rents|renters)\b/.test(q)) return "shelter";
  if (/\b(home prices?|house prices?|housing prices?|cost of a (median )?(price )?home)\b/.test(q)) return "homes";
  if (/\b(wages?|paychecks?|earnings|pay raise)\b/.test(q)) return "wages";
  if (/\b(inflation|prices|cost of living|cpi)\b/.test(q)) return "cpi";
  return null;
}

/** One plain line for a topic, or null when there's no local figure. */
export function localLine(s: LocalSnapshot, topic: LocalTopic): { head: string; tail: string; source: string; url: string } | null {
  const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  const own = s.housing === "owner";
  if (topic === "gas" && s.gas) return { head: `${s.padd} gas: $${s.gas.local.value.toFixed(2)}`, tail: `US $${s.gas.us.value.toFixed(2)}, ${s.gas.local.label}`, source: s.gas.source, url: s.gas.url };
  if (topic === "wages" && s.wages) return { head: `${s.stateName} pay: ${pct(s.wages.local.value)} in a year`, tail: `US ${pct(s.wages.us.value)}, ${s.wages.local.label}`, source: s.wages.source, url: s.wages.url };
  if (topic === "homes" && own && s.homes) return { head: `${s.stateName} home prices: ${pct(s.homes.local.value)} in a year`, tail: `US ${pct(s.homes.us.value)}, ${s.homes.local.label}`, source: s.homes.source, url: s.homes.url };
  if ((topic === "shelter" || topic === "homes") && s.shelter) return { head: `${s.region} ${own ? "owners' equivalent rent" : "rent"}: ${pct(s.shelter.local.value)} in a year`, tail: `US ${pct(s.shelter.us.value)}, ${s.shelter.local.label}`, source: s.shelter.source, url: s.shelter.url };
  if (topic === "cpi" && s.cpi) {
    const extra = s.shelter ? ` · ${own ? "owners' equivalent rent" : "rent"} ${pct(s.shelter.local.value)}` : "";
    return { head: `${s.region} inflation: ${s.cpi.local.value.toFixed(1)}%${extra}`, tail: `US ${s.cpi.us.value.toFixed(1)}%, ${s.cpi.local.label}`, source: s.cpi.source, url: s.cpi.url };
  }
  return null;
}

