#!/usr/bin/env node

/**
 * refresh-state-data.mjs — pulls real annual per-state history for State Atlas
 * metrics from official sources and writes data/state-snapshot.json.
 *
 * Run by .github/workflows/refresh-state-data.yml on a weekly cron. lib/state-data
 * imports the snapshot at build time; when a metric has a `history` entry for
 * a state, that real series wins over the CAGR back-fill.
 *
 * USAGE (local):
 *   node scripts/refresh-state-data.mjs
 *
 * No API keys required for the currently-wired sources.
 *
 * CURRENTLY WIRED:
 *   - median_home (Zillow ZHVI state-level CSV)
 *
 * PIPELINES TO ADD (each is its own ~50-line block):
 *   - unemployment   → BLS LAUS API (state-level monthly, free key)
 *   - household_income, bachelors, uninsured → Census ACS 1-year API (free key)
 *   - life_expectancy, infant_mortality, drug_deaths, maternal_mortality → CDC
 *   - violent_crime, murder_rate, property_crime → FBI Crime Data Explorer API
 *   - electricity, gas → EIA API (free key)
 *   - presidential_margin, voter_turnout → MIT Election Lab CSV
 *
 * Output shape (data/state-snapshot.json):
 *   {
 *     generatedAt: "2026-05-25T...",
 *     source: "real-annual",
 *     metrics: {
 *       median_home: {
 *         history: { AL: [...12 values 2014..2025...], AK: [...], ... }
 *       },
 *       ...
 *     }
 *   }
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 2014..2025 — must match HISTORY_YEARS in lib/state-data.ts.
const YEARS = Array.from({ length: 12 }, (_, i) => 2014 + i);

// 51-jurisdiction mapping: USPS code → Zillow's "RegionName" column value.
// DC is "District of Columbia" in Zillow's CSV.
const STATE_NAME = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const NAME_TO_CODE = Object.fromEntries(
  Object.entries(STATE_NAME).map(([code, name]) => [name, code]),
);

// ── Minimal CSV parser — handles Zillow's format (no quoted fields). ──
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  return lines.map(l => l.split(","));
}

// ── Generic Zillow CSV extractor — shared between ZHVI (home value) + ZORI (rent) ──
// Both CSVs share the same shape: one row per state, columns for every month.
// Returns a per-state-code array of year-end values for YEARS, or null if any
// year missing for a given state.
async function pullZillowSeries(url, label, divisor) {
  process.stdout.write(`   pulling ${label}… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`${label}: empty CSV`);

  const header = rows[0];
  const yearColIdx = {};
  for (const y of YEARS) {
    const idx = header.findIndex(h => h.startsWith(`${y}-12-`));
    if (idx > -1) yearColIdx[y] = idx;
  }
  // Current-year December may not exist yet — fall back to most recent month.
  if (!yearColIdx[2025]) {
    let lastIdx = -1;
    header.forEach((h, i) => { if (h.startsWith("2025-")) lastIdx = i; });
    if (lastIdx > -1) yearColIdx[2025] = lastIdx;
  }

  const RegionNameIdx = header.indexOf("RegionName");
  const RegionTypeIdx = header.indexOf("RegionType");

  const history = {};
  let stateCount = 0;
  for (const row of rows.slice(1)) {
    if (row[RegionTypeIdx] !== "state") continue;
    const code = NAME_TO_CODE[row[RegionNameIdx]];
    if (!code) continue;
    const series = YEARS.map(y => {
      const idx = yearColIdx[y];
      if (idx === undefined) return null;
      const raw = parseFloat(row[idx]);
      if (!Number.isFinite(raw)) return null;
      return divisor === 1 ? Math.round(raw) : Math.round(raw / divisor);
    });
    if (series.every(v => v != null)) {
      history[code] = series;
      stateCount++;
    }
  }
  if (stateCount < 40) {
    throw new Error(`${label}: only ${stateCount} states parsed — refusing to write a sparse series`);
  }
  console.log(`${stateCount} states, ${YEARS.length} years`);
  return history;
}

// median_home: Zillow ZHVI, divide by 1000 to match metric unit ($K).
const pullZillowHomeValues = () => pullZillowSeries(
  "https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
  "Zillow ZHVI (home values)",
  1000,
);

// TODO: rent via Zillow ZORI — the public CSV URL pattern has moved (404 on
// all the common naming variants tried). Need to scrape the actual link from
// https://www.zillow.com/research/data/ or use their newer Snowflake share.
// Skipping for v1; rent stays on CAGR back-fill.

// ── Census ACS pipeline (4 metrics) ──
// Requires CENSUS_API_KEY env var (free at https://api.census.gov/data/key_signup.html).
// If the key isn't set, this pipeline is SKIPPED gracefully — the metric
// continues using its CAGR back-fill instead of crashing the whole refresh.
//
// FIPS code mapping: Census uses 2-digit numeric state codes (01 = Alabama).
// We need to translate FIPS → USPS code (AL) to write into the snapshot.
const FIPS_TO_CODE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY",
};

// Pull one ACS variable across all states for one year. Returns { CODE: value }
// or null if the year isn't available (Census skips ACS 1-year in 2020 because
// of COVID data quality — that's the only known gap).
async function censusFetchYearVar(year, variable, apiKey, transform = (v) => v) {
  const url = `https://api.census.gov/data/${year}/acs/acs1`
    + `?get=NAME,${variable}&for=state:*&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  // Response shape: [["NAME", "VARIABLE", "state"], [name, value, fips], ...]
  const out = {};
  for (const row of json.slice(1)) {
    const fips = row[2];
    const code = FIPS_TO_CODE[fips];
    if (!code) continue;
    const raw = parseFloat(row[1]);
    if (Number.isFinite(raw)) out[code] = transform(raw);
  }
  return out;
}

// Build a per-state YEARS-length array from a year→value lookup. Missing
// years get null; if all years null, return null so caller skips this state.
function assembleSeries(yearMap, allStates) {
  const out = {};
  for (const code of allStates) {
    const series = YEARS.map(y => {
      const yr = yearMap[y];
      if (!yr || yr[code] === undefined) return null;
      return yr[code];
    });
    // Fill 2020 gap from 2019 if needed (Census skipped ACS 1-year that year).
    const idx2020 = YEARS.indexOf(2020);
    const idx2019 = YEARS.indexOf(2019);
    if (series[idx2020] == null && series[idx2019] != null) {
      series[idx2020] = series[idx2019];
    }
    if (series.every(v => v != null)) out[code] = series;
  }
  return out;
}

async function pullCensusACS() {
  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) {
    console.log("   skipping Census ACS (set CENSUS_API_KEY to enable)");
    return null;
  }
  console.log("   pulling Census ACS (population, income, education, uninsured)…");
  // Per-year per-variable fetch. Census ACS 1-year is annual, published
  // ~September of the following year.
  const yearMaps = {
    population: {},
    household_income: {},
    bachelors: {},
    uninsured: {},
  };
  for (const y of YEARS) {
    if (y === 2020) continue; // skipped year (no ACS 1-year)
    if (y > new Date().getFullYear() - 1) continue; // not yet published

    // B01003_001E: total population (raw count → millions)
    const pop = await censusFetchYearVar(y, "B01003_001E", apiKey, v => Math.round(v / 100000) / 10);
    if (pop) yearMaps.population[y] = pop;

    // B19013_001E: median household income (dollars → $K)
    const inc = await censusFetchYearVar(y, "B19013_001E", apiKey, v => Math.round(v / 1000));
    if (inc) yearMaps.household_income[y] = inc;

    // S1501_C02_015E (5-year only) — for 1-year use composite B15003 counts.
    // For simplicity: pull B15003_001E (total 25+) + sum bachelor's-and-above codes.
    // The composite is heavy; for v1 we skip and use 5-year endpoint:
    //   /data/{y}/acs/acs1/subject?get=NAME,S1501_C02_015E&for=state:*
    const eduUrl = `https://api.census.gov/data/${y}/acs/acs1/subject`
      + `?get=NAME,S1501_C02_015E&for=state:*&key=${apiKey}`;
    const eduRes = await fetch(eduUrl);
    if (eduRes.ok) {
      const eduJson = await eduRes.json();
      const out = {};
      for (const row of eduJson.slice(1)) {
        const code = FIPS_TO_CODE[row[2]];
        const v = parseFloat(row[1]);
        if (code && Number.isFinite(v)) out[code] = Math.round(v * 10) / 10;
      }
      yearMaps.bachelors[y] = out;
    }

    // S2701_C05_001E: % uninsured (already a percentage)
    const insUrl = `https://api.census.gov/data/${y}/acs/acs1/subject`
      + `?get=NAME,S2701_C05_001E&for=state:*&key=${apiKey}`;
    const insRes = await fetch(insUrl);
    if (insRes.ok) {
      const insJson = await insRes.json();
      const out = {};
      for (const row of insJson.slice(1)) {
        const code = FIPS_TO_CODE[row[2]];
        const v = parseFloat(row[1]);
        if (code && Number.isFinite(v)) out[code] = Math.round(v * 10) / 10;
      }
      yearMaps.uninsured[y] = out;
    }
  }

  const allStates = Object.values(FIPS_TO_CODE);
  return {
    population: assembleSeries(yearMaps.population, allStates),
    household_income: assembleSeries(yearMaps.household_income, allStates),
    bachelors: assembleSeries(yearMaps.bachelors, allStates),
    uninsured: assembleSeries(yearMaps.uninsured, allStates),
  };
}


// ── BLS LAUS pipeline — state unemployment ──
// Local Area Unemployment Statistics. Series ID format:
//   LASST + 2-digit FIPS + 10 zeros + "03"   (03 = unemployment rate)
// The public BLS API needs no key for our volume (~6 queries per refresh,
// well under the 25/day key-less quota), but with a free BLS_API_KEY the
// quota lifts to 500/day. Either works — we use the key if present.
//
// The API caps each request at 10 years and 25 series, so we do 6 queries:
// 3 batches of ~17 states × 2 year windows (2014-2023, 2024-2025).
const BLS_FIPS = Object.keys(FIPS_TO_CODE); // 51 entries (50 states + DC)
const blsSeries = (fips) => `LASST${fips}0000000000003`;

async function blsFetch(seriesIds, startYear, endYear) {
  const body = {
    seriesid: seriesIds,
    startyear: String(startYear),
    endyear: String(endYear),
  };
  const key = process.env.BLS_API_KEY;
  if (key) body.registrationkey = key;
  const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BLS HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS API: ${(json.message || []).join("; ")}`);
  }
  return json.Results?.series ?? [];
}

// Aggregate monthly readings → annual mean. Need ≥6 months to count a year.
function monthlyToAnnual(rows) {
  const byYear = {};
  for (const x of rows) {
    if (x.value === "-" || x.value == null) continue;
    const v = parseFloat(x.value);
    if (!Number.isFinite(v)) continue;
    const y = parseInt(x.year, 10);
    (byYear[y] = byYear[y] || []).push(v);
  }
  const out = {};
  for (const [y, vs] of Object.entries(byYear)) {
    if (vs.length >= 6) out[y] = +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2);
  }
  return out;
}

async function pullBLSUnemployment() {
  // Build series-id → state-code lookup.
  const idToCode = {};
  for (const fips of BLS_FIPS) idToCode[blsSeries(fips)] = FIPS_TO_CODE[fips];
  const allIds = Object.keys(idToCode);

  // Split 51 series into batches of 25 (API cap).
  const batches = [];
  for (let i = 0; i < allIds.length; i += 25) batches.push(allIds.slice(i, i + 25));

  // Two year windows to cover 2014-2025 within the 10-year-per-query cap.
  const windows = [[2014, 2023], [2024, 2025]];

  // Accumulate { CODE: { year: value } }
  const stateYearMap = {};
  for (const [start, end] of windows) {
    for (const batch of batches) {
      const series = await blsFetch(batch, start, end);
      for (const s of series) {
        const code = idToCode[s.seriesID];
        if (!code) continue;
        const annual = monthlyToAnnual(s.data);
        (stateYearMap[code] = stateYearMap[code] || {});
        Object.assign(stateYearMap[code], annual);
      }
      // Tiny pause between batches — BLS is generous but be polite.
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // Project to YEARS-length arrays. Drop any state missing any year.
  const out = {};
  for (const [code, ym] of Object.entries(stateYearMap)) {
    const series = YEARS.map(y => ym[y] ?? null);
    if (series.every(v => v != null)) out[code] = series;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("🗺️  Vote Unbiased — refreshing state-level snapshot");
  console.log("");

  const metrics = {};

  // PIPELINE 1: median_home from Zillow ZHVI (no key)
  try {
    metrics.median_home = { history: await pullZillowHomeValues() };
  } catch (e) {
    console.error(`   FAILED: ${e.message}`);
    process.exit(2);
  }

  // PIPELINE 2 (placeholder): Zillow ZORI for rent — URL needs research.
  // See TODO above pullZillowSeries.

  // PIPELINE 3: Census ACS — population, household_income, bachelors, uninsured
  // Skips gracefully if CENSUS_API_KEY missing.
  try {
    const census = await pullCensusACS();
    if (census) {
      for (const [key, history] of Object.entries(census)) {
        if (history && Object.keys(history).length >= 40) {
          metrics[key] = { history };
          console.log(`   ✓ ${key}: ${Object.keys(history).length} states`);
        }
      }
    }
  } catch (e) {
    console.error(`   Census ACS failed: ${e.message} — continuing without it`);
  }

  // PIPELINE 4: BLS LAUS — state unemployment (key-less, but BLS_API_KEY ups the quota)
  try {
    const history = await pullBLSUnemployment();
    if (history && Object.keys(history).length >= 40) {
      metrics.unemployment = { history };
      console.log(`   ✓ unemployment: ${Object.keys(history).length} states, ${YEARS.length} years (BLS LAUS)`);
    } else {
      console.log(`   BLS LAUS returned only ${Object.keys(history || {}).length} complete states — skipping`);
    }
  } catch (e) {
    console.error(`   BLS LAUS failed: ${e.message} — continuing without it`);
  }

  // (Pipelines to add — each follows the pattern above and is mostly mechanical:
  //  - EIA: gas, electricity (needs EIA_API_KEY)
  //  - FBI Crime Data Explorer: violent_crime, murder_rate, property_crime
  //  - CDC NVSS / WONDER: life_expectancy, infant_mortality, drug_deaths, maternal_mortality
  //  - MIT Election Lab: presidential_margin, voter_turnout
  //  - BEA SAGDP: gdp_capita (needs BEA_API_KEY))

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = `${here}/../data/state-snapshot.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "real-annual",
    metrics,
  };
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("");
  console.log(`✓ wrote ${outPath}`);
  console.log(`  ${Object.keys(metrics).length} metric${Object.keys(metrics).length === 1 ? "" : "s"} with real history`);
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
