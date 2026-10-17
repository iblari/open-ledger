import { kvGet, kvSetMany } from "./live-kv";

/**
 * Real time series for claim charts — official data only.
 *
 *   FRED (St. Louis Fed)  prices, jobs, markets, rates, energy, trade, debt
 *   CDC VSRR              provisional drug-overdose deaths, 12-month totals
 *   World Bank            country comparisons (inflation, growth, unemployment)
 *
 * Each catalog entry is one measure with a fixed transform, so a claim is
 * always charted against a defined, citable number — never a model's guess.
 */
export type Transform = "level" | "yoy" | "mom" | "diff" | "sum12";
export interface SeriesDef {
  id: string;            // catalog key
  label: string;         // "US inflation (CPI, year over year)"
  unit: string;          // "%", "$", "$/gal", "K jobs", "deaths", "index", "$B"
  source: "FRED" | "CDC" | "World Bank";
  fred?: { id: string; freq?: "m" | "w" | "q" | "a"; agg?: "avg" | "eop" | "sum" };
  cdc?: { indicator: string };
  wb?: { indicator: string };
  transform: Transform;
  scale?: number;        // multiply after transform (e.g. 1/1000 for $M → $B)
  decimals?: number;
  url: string;           // human page for the source
  about: string;         // one line for the model: what claims this fits
}

/** Same-unit series worth overlaying ("+ Compare"). */
export const RELATED: Record<string, string> = {
  cpi_yoy: "wages_yoy", wages_yoy: "cpi_yoy", core_cpi_yoy: "cpi_yoy", pce_yoy: "cpi_yoy", food_yoy: "cpi_yoy",
  rent_yoy: "cpi_yoy", home_price_yoy: "cpi_yoy", gas: "diesel", diesel: "gas", oil_wti: "oil_brent", oil_brent: "oil_wti",
  fed_funds: "treasury_10y", treasury_10y: "mortgage", mortgage: "treasury_10y", payrolls: "private_jobs", private_jobs: "payrolls",
  mfg_jobs: "construction_jobs", construction_jobs: "mfg_jobs", overdose_fentanyl: "overdose_all", overdose_all: "overdose_fentanyl",
  nasdaq: "sp500", dow: "sp500",
};
/** Reference lines that give a number meaning. */
const REFS: Record<string, { v: number; label: string }> = {
  cpi_yoy: { v: 2, label: "Fed target 2%" }, core_cpi_yoy: { v: 2, label: "Fed target 2%" }, pce_yoy: { v: 2, label: "Fed target 2%" },
};
/** Level series where "back to the pre-pandemic level" is a meaningful yardstick. */
const PREPANDEMIC = new Set(["payrolls", "private_jobs", "mfg_jobs", "construction_jobs", "gas", "unemployment", "lfpr", "job_openings", "mortgage", "jobless_claims"]);

const F = (id: string, label: string, unit: string, fred: SeriesDef["fred"], transform: Transform, about: string, extra: Partial<SeriesDef> = {}): SeriesDef =>
  ({ id, label, unit, source: "FRED", fred, transform, about, url: `https://fred.stlouisfed.org/series/${fred!.id}`, ...extra });

export const CATALOG: SeriesDef[] = [
  // Prices
  F("cpi_yoy", "US inflation (CPI, year over year)", "%", { id: "CPIAUCSL" }, "yoy", "headline US inflation rate, 'inflation is X%'", { decimals: 1 }),
  F("cpi_mom", "US inflation, month over month (CPI)", "%", { id: "CPIAUCSL" }, "mom", "monthly US price change, 'prices rose X% last month'", { decimals: 1 }),
  F("core_cpi_yoy", "US core inflation (ex food & energy, YoY)", "%", { id: "CPILFESL" }, "yoy", "core inflation", { decimals: 1 }),
  F("pce_yoy", "US PCE inflation (Fed's target measure, YoY)", "%", { id: "PCEPI" }, "yoy", "PCE inflation, the Fed's 2% target", { decimals: 1 }),
  F("gas", "US regular gasoline, average price", "$/gal", { id: "GASREGW", freq: "w" }, "level", "gas / gasoline prices per gallon", { decimals: 2 }),
  F("diesel", "US diesel, average price", "$/gal", { id: "GASDESW", freq: "w" }, "level", "diesel prices", { decimals: 2 }),
  F("oil_wti", "Crude oil, WTI", "$/bbl", { id: "DCOILWTICO", freq: "w", agg: "avg" }, "level", "oil price per barrel (US benchmark)", { decimals: 0 }),
  F("oil_brent", "Crude oil, Brent", "$/bbl", { id: "DCOILBRENTEU", freq: "w", agg: "avg" }, "level", "world oil price (Brent)", { decimals: 0 }),
  F("natgas", "Natural gas, Henry Hub", "$/MMBtu", { id: "DHHNGSP", freq: "w", agg: "avg" }, "level", "natural gas price", { decimals: 2 }),
  F("eggs", "Eggs, grade A large, per dozen", "$", { id: "APU0000708111" }, "level", "egg prices", { decimals: 2 }),
  F("beef", "Ground beef, per lb", "$", { id: "APU0000703112" }, "level", "beef / meat prices", { decimals: 2 }),
  F("electricity", "Electricity, per kWh", "$", { id: "APU000072610" }, "level", "electricity / power bills", { decimals: 3 }),
  F("food_yoy", "US food prices (CPI food, YoY)", "%", { id: "CPIUFDSL" }, "yoy", "grocery / food price inflation", { decimals: 1 }),
  F("rent_yoy", "US rent (CPI rent, YoY)", "%", { id: "CUUR0000SEHA" }, "yoy", "rent increases", { decimals: 1 }),
  // Jobs & pay
  F("unemployment", "US unemployment rate", "%", { id: "UNRATE" }, "level", "unemployment rate", { decimals: 1 }),
  F("payrolls_chg", "US jobs added per month (nonfarm payrolls)", "K jobs", { id: "PAYEMS" }, "diff", "jobs added / lost in a month", { decimals: 0 }),
  F("payrolls", "US total jobs (nonfarm payrolls)", "M jobs", { id: "PAYEMS" }, "level", "total jobs, 'record number of jobs', jobs created since a date", { scale: 0.001, decimals: 1 }),
  F("private_jobs", "US private-sector jobs", "M jobs", { id: "USPRIV" }, "level", "private sector jobs created", { scale: 0.001, decimals: 1 }),
  F("mfg_jobs", "US manufacturing jobs", "M jobs", { id: "MANEMP" }, "level", "manufacturing / factory jobs", { scale: 0.001, decimals: 2 }),
  F("construction_jobs", "US construction jobs", "M jobs", { id: "USCONS" }, "level", "construction jobs", { scale: 0.001, decimals: 2 }),
  F("wages_yoy", "US average hourly earnings, YoY", "%", { id: "CES0500000003" }, "yoy", "wage growth (nominal)", { decimals: 1 }),
  F("real_wages", "US real weekly earnings (inflation-adjusted)", "$", { id: "LES1252881600Q", freq: "q" }, "level", "real wages / take-home pay after inflation", { decimals: 0 }),
  F("jobless_claims", "US initial jobless claims", "K", { id: "ICSA", freq: "w" }, "level", "weekly unemployment claims, layoffs", { scale: 0.001, decimals: 0 }),
  F("job_openings", "US job openings", "M", { id: "JTSJOL" }, "level", "job openings / vacancies", { scale: 0.001, decimals: 1 }),
  F("lfpr", "US labor force participation", "%", { id: "CIVPART" }, "level", "labor force participation", { decimals: 1 }),
  // Growth & spending
  F("gdp_growth", "US real GDP growth (annualized, quarterly)", "%", { id: "A191RL1Q225SBEA", freq: "q" }, "level", "GDP growth, economy growing X%", { decimals: 1 }),
  F("retail_sales", "US retail sales", "$B", { id: "RSAFS" }, "level", "retail sales, consumer spending", { scale: 0.001, decimals: 0 }),
  F("consumer_sentiment", "Consumer sentiment (U. Michigan)", "index", { id: "UMCSENT" }, "level", "consumer confidence / sentiment", { decimals: 1 }),
  F("housing_starts", "US housing starts", "K", { id: "HOUST" }, "level", "home building, housing starts", { decimals: 0 }),
  F("home_price_yoy", "US home prices (Case-Shiller, YoY)", "%", { id: "CSUSHPINSA" }, "yoy", "home prices", { decimals: 1 }),
  F("mortgage", "30-year mortgage rate", "%", { id: "MORTGAGE30US", freq: "w" }, "level", "mortgage rates", { decimals: 2 }),
  F("factory_construction", "US manufacturing construction spending", "$B", { id: "TLMFGCONS" }, "level", "factory construction, building plants (annual rate)", { scale: 0.001, decimals: 0 }),
  F("industrial_production", "US industrial production", "index", { id: "INDPRO" }, "level", "industrial / factory output", { decimals: 1 }),
  // Markets & rates
  F("sp500", "S&P 500", "index", { id: "SP500", freq: "w", agg: "eop" }, "level", "stock market, S&P 500, record highs, 401(k)s", { decimals: 0 }),
  F("nasdaq", "Nasdaq Composite", "index", { id: "NASDAQCOM", freq: "w", agg: "eop" }, "level", "Nasdaq, tech stocks", { decimals: 0 }),
  F("dow", "Dow Jones Industrial Average", "index", { id: "DJIA", freq: "w", agg: "eop" }, "level", "the Dow", { decimals: 0 }),
  F("fed_funds", "Federal funds rate", "%", { id: "FEDFUNDS" }, "level", "interest rates, the Fed, rate cuts", { decimals: 2 }),
  F("treasury_10y", "10-year Treasury yield", "%", { id: "DGS10", freq: "w", agg: "avg" }, "level", "bond yields, 10-year, borrowing costs", { decimals: 2 }),
  F("bitcoin", "Bitcoin price", "$", { id: "CBBTCUSD", freq: "w", agg: "eop" }, "level", "bitcoin, crypto", { decimals: 0 }),
  F("dollar", "US dollar index (broad)", "index", { id: "DTWEXBGS", freq: "w", agg: "avg" }, "level", "strength of the dollar", { decimals: 1 }),
  // Government & trade
  F("deficit_12m", "US federal budget balance, rolling 12 months (− = deficit)", "$B", { id: "MTSDS133FMS" }, "sum12", "federal deficit / budget surplus", { scale: 0.001, decimals: 0 }),
  F("debt", "US federal debt, total", "$T", { id: "GFDEBTN", freq: "q" }, "level", "national debt", { scale: 0.000001, decimals: 1 }),
  F("trade_balance", "US trade balance (goods & services)", "$B", { id: "BOPGSTB" }, "level", "trade deficit", { scale: 0.001, decimals: 1 }),
  F("customs_duties", "US customs duties (tariff revenue), annual rate", "$B", { id: "B235RC1Q027SBEA", freq: "q" }, "level", "tariff revenue, money taken in from tariffs", { decimals: 0 }),
  F("imports", "US imports of goods & services", "$B", { id: "IMPGS", freq: "q" }, "level", "imports", { decimals: 0 }),
  F("exports", "US exports of goods & services", "$B", { id: "EXPGS", freq: "q" }, "level", "exports, record exports", { decimals: 0 }),
  // Health & safety
  { id: "overdose_all", label: "US drug overdose deaths, 12 months ending", unit: "deaths", source: "CDC", cdc: { indicator: "Number of Drug Overdose Deaths" }, transform: "level", decimals: 0, url: "https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm", about: "drug overdose deaths" },
  { id: "overdose_fentanyl", label: "US fentanyl (synthetic opioid) deaths, 12 months ending", unit: "deaths", source: "CDC", cdc: { indicator: "Synthetic opioids, excl. methadone (T40.4)" }, transform: "level", decimals: 0, url: "https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm", about: "fentanyl deaths, synthetic opioids" },
  // Country comparisons (annual)
  { id: "wb_inflation", label: "Inflation, consumer prices (annual %)", unit: "%", source: "World Bank", wb: { indicator: "FP.CPI.TOTL.ZG" }, transform: "level", decimals: 1, url: "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG", about: "inflation in ANOTHER country, or comparing countries" },
  { id: "wb_gdp_growth", label: "GDP growth (annual %)", unit: "%", source: "World Bank", wb: { indicator: "NY.GDP.MKTP.KD.ZG" }, transform: "level", decimals: 1, url: "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG", about: "growth of another country, or 'fastest growing economy' comparisons" },
  { id: "wb_unemployment", label: "Unemployment (% of labor force)", unit: "%", source: "World Bank", wb: { indicator: "SL.UEM.TOTL.ZS" }, transform: "level", decimals: 1, url: "https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS", about: "unemployment in another country / comparisons" },
];
export const CATALOG_BY_ID = new Map(CATALOG.map(s => [s.id, s]));

export interface SeriesLine { key: string; name: string; points: { d: string; v: number }[] }
export interface SeriesData {
  id: string; label: string; unit: string; source: string; url: string; decimals: number;
  freq: "w" | "m" | "q" | "a";
  lines: SeriesLine[];
  fetchedAt: string;
  recessions?: [string, string][];          // NBER recessions (start, end) — US series
  ref?: { v: number; label: string } | null;
  prepandemic?: { d: string; v: number } | null;
  related?: { id: string; label: string } | null;
}

/* ── Fetchers ──────────────────────────────────────────────────────── */

async function fred(def: SeriesDef, opts: { asOf?: string; start?: string } = {}): Promise<{ d: string; v: number }[]> {
  const key = process.env.FRED_API_KEY;
  if (!key || !def.fred) return [];
  const f = def.fred;
  const freq = f.freq || "m";
  const q = new URLSearchParams({ series_id: f.id, api_key: key, file_type: "json", observation_start: opts.start || "1990-01-01" });
  // ALFRED: the series exactly as it was published on that day.
  if (opts.asOf) { q.set("realtime_start", opts.asOf); q.set("realtime_end", opts.asOf); }
  if (f.agg || f.freq) { q.set("frequency", freq); q.set("aggregation_method", f.agg || "avg"); }
  const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?${q}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`FRED ${f.id} ${r.status}`);
  const j = await r.json() as { observations?: { date: string; value: string }[] };
  return (j.observations || []).map(o => ({ d: o.date, v: parseFloat(o.value) })).filter(o => Number.isFinite(o.v));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
async function cdc(def: SeriesDef): Promise<{ d: string; v: number }[]> {
  const q = new URLSearchParams({ state: "US", indicator: def.cdc!.indicator, $limit: "2000", $order: "year,month" });
  const r = await fetch(`https://data.cdc.gov/resource/xkb8-kh2a.json?${q}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`CDC ${r.status}`);
  const rows = await r.json() as { year: string; month: string; data_value?: string; predicted_value?: string }[];
  return rows.map(x => {
    const m = MONTHS.indexOf(x.month) + 1;
    const v = parseFloat(x.predicted_value || x.data_value || "");
    return { d: `${x.year}-${String(m).padStart(2, "0")}-01`, v };
  }).filter(p => Number.isFinite(p.v) && !p.d.includes("-00-")).sort((a, b) => a.d.localeCompare(b.d));
}

async function worldBank(def: SeriesDef, countries: string[]): Promise<SeriesLine[]> {
  const iso = countries.map(c => c.toUpperCase()).filter(c => /^[A-Z]{3}$/.test(c)).slice(0, 6);
  if (!iso.length) iso.push("USA");
  // The World Bank API is slow and occasionally drops requests: one retry.
  const url = `https://api.worldbank.org/v2/country/${iso.join(";")}/indicator/${def.wb!.indicator}?format=json&date=2000:2030&per_page=1000`;
  let r = await fetch(url, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!r || !r.ok) r = await fetch(url, { signal: AbortSignal.timeout(14_000) });
  if (!r.ok) throw new Error(`World Bank ${r.status}`);
  const j = await r.json() as [unknown, { countryiso3code: string; country: { value: string }; date: string; value: number | null }[]];
  const by = new Map<string, SeriesLine>();
  for (const x of j[1] || []) {
    if (x.value == null) continue;
    const l = by.get(x.countryiso3code) || { key: x.countryiso3code, name: x.country.value.replace(/, Islamic Rep\.|, RB| Federation/g, ""), points: [] };
    l.points.push({ d: `${x.date}-01-01`, v: x.value });
    by.set(x.countryiso3code, l);
  }
  return iso.map(c => by.get(c)).filter((l): l is SeriesLine => !!l).map(l => ({ ...l, points: l.points.sort((a, b) => a.d.localeCompare(b.d)) }));
}

function transform(pts: { d: string; v: number }[], t: Transform, per: number, scale = 1): { d: string; v: number }[] {
  const out: { d: string; v: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    let v: number | null = pts[i].v;
    if (t === "yoy") v = i >= per && pts[i - per].v ? (pts[i].v / pts[i - per].v - 1) * 100 : null;
    else if (t === "mom") v = i >= 1 && pts[i - 1].v ? (pts[i].v / pts[i - 1].v - 1) * 100 : null;
    else if (t === "diff") v = i >= 1 ? pts[i].v - pts[i - 1].v : null;
    else if (t === "sum12") v = i >= 11 ? pts.slice(i - 11, i + 1).reduce((s, p) => s + p.v, 0) : null;
    if (v != null && Number.isFinite(v)) out.push({ d: pts[i].d, v: v * scale });
  }
  return out;
}

/** NBER recession periods, from FRED's USREC (monthly 0/1). Cached a week. */
async function recessions(): Promise<[string, string][]> {
  try {
    const [hit] = await kvGet(["series:usrec:v1"]);
    if (hit) return JSON.parse(hit);
  } catch { /* refetch */ }
  const pts = await fred({ id: "usrec", label: "", unit: "", source: "FRED", fred: { id: "USREC" }, transform: "level", url: "", about: "" }).catch(() => []);
  const out: [string, string][] = [];
  let start: string | null = null;
  for (const p of pts) {
    if (p.v === 1 && !start) start = p.d;
    if (p.v === 0 && start) { out.push([start, p.d]); start = null; }
  }
  if (start) out.push([start, pts[pts.length - 1].d]);
  if (pts.length) await kvSetMany([["series:usrec:v1", JSON.stringify(out), 7 * 86400]]).catch(() => {});
  return out;
}

/** The value as it was PUBLISHED on a given day (before later revisions),
 *  for the latest observation available then. FRED series only. */
export async function getSeriesAsOf(id: string, asOf: string): Promise<{ d: string; v: number } | null> {
  const def = CATALOG_BY_ID.get(id);
  if (!def?.fred || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const ck = `series:asof:v1:${id}:${asOf}`;
  try { const [hit] = await kvGet([ck]); if (hit) return JSON.parse(hit); } catch { /* refetch */ }
  const freq = def.fred.freq || "m";
  const per = freq === "w" ? 52 : freq === "q" ? 4 : freq === "a" ? 1 : 12;
  const start = new Date(Date.parse(asOf) - 3 * 365 * 864e5).toISOString().slice(0, 10);
  const pts = transform(await fred(def, { asOf, start }), def.transform, per, def.scale);
  const last = pts[pts.length - 1] ?? null;
  if (last) await kvSetMany([[ck, JSON.stringify(last), 0]]).catch(() => {});
  return last;
}

/** One series (several lines for country comparisons). Cached 6 hours. */
export async function getSeries(id: string, countries: string[] = []): Promise<SeriesData | null> {
  const def = CATALOG_BY_ID.get(id);
  if (!def) return null;
  const cc = def.wb ? countries.map(c => c.toUpperCase()).filter(c => /^[A-Z]{3}$/.test(c)).slice(0, 6).sort() : [];
  const ck = `series:v2:${id}${cc.length ? ":" + cc.join(",") : ""}`;
  try {
    const [hit] = await kvGet([ck]);
    if (hit) { const s = JSON.parse(hit) as SeriesData; if (Date.now() - Date.parse(s.fetchedAt) < 6 * 3600_000) return s; }
  } catch { /* refetch */ }

  const freq = (def.fred?.freq || (def.wb ? "a" : "m")) as SeriesData["freq"];
  let lines: SeriesLine[] = [];
  if (def.source === "FRED") {
    const per = freq === "w" ? 52 : freq === "q" ? 4 : freq === "a" ? 1 : 12;
    lines = [{ key: id, name: def.label, points: transform(await fred(def), def.transform, per, def.scale) }];
  } else if (def.source === "CDC") {
    lines = [{ key: id, name: def.label, points: await cdc(def) }];
  } else {
    lines = await worldBank(def, cc.length ? cc : ["USA"]);
  }
  if (!lines.length || !lines.some(l => l.points.length > 2)) return null;
  const main = lines[0].points;
  const pre = PREPANDEMIC.has(id) ? main.filter(p => p.d <= "2020-02-29").slice(-1)[0] ?? null : null;
  const rel = RELATED[id] ? CATALOG_BY_ID.get(RELATED[id]) : undefined;
  const out: SeriesData = {
    id, label: def.label, unit: def.unit, source: def.source, url: def.url, decimals: def.decimals ?? 1,
    freq, lines, fetchedAt: new Date().toISOString(),
    recessions: def.wb ? [] : await recessions(),
    ref: REFS[id] ?? null,
    prepandemic: pre,
    related: rel ? { id: rel.id, label: rel.label } : null,
  };
  await kvSetMany([[ck, JSON.stringify(out), 7 * 86400]]).catch(() => {});
  return out;
}
