#!/usr/bin/env node
/**
 * fetch-county-data.mjs — builds public/county-data/{STATE}.json for the
 * State Atlas "dive deeper" 3D county explorer.
 *
 * Sources:
 *  - Census ACS 5-year detailed tables (api.census.gov, requires CENSUS_API_KEY)
 *    Years: 2012, 2015, 2018, 2021, 2023 — five snapshots for the time slider.
 *    Variables (stable across all five years):
 *      B01003_001E  total population
 *      B19013_001E  median household income ($)
 *      B25077_001E  median home value ($)
 *      B25064_001E  median gross rent ($/mo)
 *      B23025_003E  civilian labor force   ┐ unemployment rate =
 *      B23025_005E  unemployed             ┘ 005/003 × 100
 *      B17001_001E  poverty universe       ┐ poverty rate =
 *      B17001_002E  below poverty          ┘ 002/001 × 100
 *  - Cities: top places by population (latest ACS) + TIGERweb centroids (no key).
 *
 * Usage: CENSUS_API_KEY=xxx node scripts/fetch-county-data.mjs [STATE_CODE ...]
 * Output: public/county-data/AL.json … WY.json  (+ DC)
 */
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const KEY = process.env.CENSUS_API_KEY;
if (!KEY) { console.error("CENSUS_API_KEY env var required"); process.exit(1); }

const YEARS = [2012, 2015, 2018, 2021, 2023];
const LATEST = YEARS[YEARS.length - 1];
const VARS = "B01003_001E,B19013_001E,B25077_001E,B25064_001E,B23025_003E,B23025_005E,B17001_001E,B17001_002E";
const CITIES_PER_STATE = 8;

// State code → FIPS
const FIPS = {
  AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",
  GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",
  MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",
  NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",
  SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (r.status === 204) return null; // no content (e.g. no places)
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

const num = v => {
  const n = Number(v);
  // Census uses large negative sentinels (-666666666) for suppressed values.
  return v == null || v === "" || !Number.isFinite(n) || n < -1000 ? null : n;
};
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

function shape(row, hdr) {
  const g = k => num(row[hdr.indexOf(k)]);
  const lf = g("B23025_003E"), un = g("B23025_005E");
  const pu = g("B17001_001E"), pb = g("B17001_002E");
  return {
    pop: g("B01003_001E"),
    income: g("B19013_001E"),
    home: g("B25077_001E"),
    rent: g("B25064_001E"),
    unemp: lf && un != null ? r1((un / lf) * 100) : null,
    poverty: pu && pb != null ? r1((pb / pu) * 100) : null,
  };
}

// Connecticut replaced its 8 counties with 9 planning regions in ACS 2022+
// (new FIPS 09110-09190). The map topology (and 2012-2021 data) uses the old
// counties, so post-2021 values are carried down to each old county from the
// planning region containing the majority of its population. Documented
// approximation — region medians assigned to overlapping legacy counties.
const CT_XWALK = {
  "09001": "09190", // Fairfield → Western CT (Stamford/Norwalk/Danbury bulk)
  "09003": "09110", // Hartford → Capitol
  "09005": "09160", // Litchfield → Northwest Hills
  "09007": "09130", // Middlesex → Lower CT River Valley
  "09009": "09170", // New Haven → South Central
  "09011": "09180", // New London → Southeastern
  "09013": "09110", // Tolland → Capitol
  "09015": "09150", // Windham → Northeastern
};

async function fetchState(code) {
  const fips = FIPS[code];

  // ── Counties, per snapshot year (parallel) ──
  const counties = {}; // fips5 → { name, m: { metric: [v2012, …, v2023] } }
  const yearRows = await Promise.all(YEARS.map(y => getJson(
    `https://api.census.gov/data/${y}/acs/acs5?get=NAME,${VARS}&for=county:*&in=state:${fips}&key=${KEY}`
  ).catch(() => null)));
  for (let yi = 0; yi < YEARS.length; yi++) {
    const rows = yearRows[yi];
    if (!rows) continue;
    const hdr = rows[0];
    for (const row of rows.slice(1)) {
      const cty = row[hdr.indexOf("county")];
      const id = fips + cty;
      const name = row[hdr.indexOf("NAME")].split(",")[0]
        .replace(/ County$| Parish$| Borough$| Census Area$| Municipality$| City and Borough$/i, "");
      if (!counties[id]) {
        counties[id] = { name, m: { pop: Array(YEARS.length).fill(null), income: Array(YEARS.length).fill(null), home: Array(YEARS.length).fill(null), rent: Array(YEARS.length).fill(null), unemp: Array(YEARS.length).fill(null), poverty: Array(YEARS.length).fill(null) } };
      }
      const s = shape(row, hdr);
      for (const k of Object.keys(s)) counties[id].m[k][yi] = s[k];
    }
  }

  // ── Cities: top places by population (latest year) ──
  let cities = [];
  const placeRows = await getJson(
    `https://api.census.gov/data/${LATEST}/acs/acs5?get=NAME,${VARS}&for=place:*&in=state:${fips}&key=${KEY}`
  );
  if (placeRows) {
    const hdr = placeRows[0];
    cities = placeRows.slice(1)
      .map(row => ({
        geoid: fips + row[hdr.indexOf("place")],
        name: row[hdr.indexOf("NAME")].split(",")[0]
          .replace(/ (city|town|village|CDP|municipality|borough|urbana|zona urbana|comunidad)$/i, ""),
        ...shape(row, hdr),
      }))
      .filter(c => c.pop != null)
      .sort((a, b) => b.pop - a.pop)
      .slice(0, CITIES_PER_STATE);

    // Centroids from TIGERweb (keyless) — layer 4 = incorporated places,
    // layer 3 = consolidated cities, CDPs in layer 5; query all in one pass.
    const geoids = cities.map(c => `'${c.geoid}'`).join(",");
    for (const layer of [4, 5, 3]) {
      const missing = cities.filter(c => c.lat == null);
      if (!missing.length) break;
      const q = await getJson(
        `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/${layer}/query?where=GEOID%20IN%20(${encodeURIComponent(geoids)})&outFields=GEOID,CENTLAT,CENTLON&returnGeometry=false&f=json`
      ).catch(() => null);
      for (const f of q?.features || []) {
        const c = cities.find(x => x.geoid === f.attributes.GEOID);
        if (c && c.lat == null) {
          c.lat = Number(f.attributes.CENTLAT);
          c.lon = Number(f.attributes.CENTLON);
        }
      }
    }
    cities = cities.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }

  // CT: fill legacy-county gaps from planning-region rows, then drop the
  // region rows (they have no geometry in the county topology).
  if (code === "CT") {
    for (const [oldF, regF] of Object.entries(CT_XWALK)) {
      const oldC = counties[oldF], reg = counties[regF];
      if (!oldC || !reg) continue;
      for (const k of Object.keys(oldC.m)) {
        for (let i = 0; i < YEARS.length; i++) {
          if (oldC.m[k][i] == null && reg.m[k][i] != null) oldC.m[k][i] = reg.m[k][i];
        }
      }
    }
    for (const f of Object.keys(counties)) {
      if (Number(f.slice(2)) >= 100) delete counties[f];
    }
  }

  return { state: code, years: YEARS, counties, cities, source: "Census ACS 5-year", built: new Date().toISOString().slice(0, 10) };
}

const outDir = path.join(process.cwd(), "public", "county-data");
await mkdir(outDir, { recursive: true });
const todo = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FIPS);
const queue = [...todo];
async function worker() {
  for (;;) {
    const code = queue.shift();
    if (!code) return;
    try {
      const data = await fetchState(code);
      const n = Object.keys(data.counties).length;
      await writeFile(path.join(outDir, `${code}.json`), JSON.stringify(data));
      console.log(`${code}: ${n} counties, ${data.cities.length} cities`);
    } catch (e) {
      console.error(`${code}: FAILED — ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log("done");
