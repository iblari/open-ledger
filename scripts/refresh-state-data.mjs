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

// ── Zillow ZHVI: state-level home value index, monthly, 2000-present. ──
async function pullZillowHomeValues() {
  process.stdout.write("   pulling Zillow ZHVI (state)… ");
  const url = "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    + "State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zillow ZHVI: HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Zillow ZHVI: empty CSV");

  const header = rows[0];
  // Find the column index for each target year's December reading.
  // Zillow's columns are "YYYY-MM-DD" with end-of-month dates.
  const yearColIdx = {};
  for (const y of YEARS) {
    const idx = header.findIndex(h => h.startsWith(`${y}-12-`));
    if (idx > -1) yearColIdx[y] = idx;
  }
  // If 2025 December isn't published yet, fall back to most recent month of 2025.
  if (!yearColIdx[2025]) {
    const idx2025 = header.findIndex((h, i) => h.startsWith("2025-") && i > 4);
    let lastIdx = -1;
    header.forEach((h, i) => { if (h.startsWith("2025-")) lastIdx = i; });
    if (lastIdx > -1) yearColIdx[2025] = lastIdx;
    // Note: idx2025 is unused — kept for symmetry above; eslint will tolerate.
    void idx2025;
  }

  const RegionNameIdx = header.indexOf("RegionName");
  const RegionTypeIdx = header.indexOf("RegionType");

  const history = {};
  let stateCount = 0;
  for (const row of rows.slice(1)) {
    if (row[RegionTypeIdx] !== "state") continue;
    const stateName = row[RegionNameIdx];
    const code = NAME_TO_CODE[stateName];
    if (!code) continue; // skip US national row, territories, etc.
    const series = YEARS.map(y => {
      const idx = yearColIdx[y];
      if (idx === undefined) return null;
      const raw = parseFloat(row[idx]);
      if (!Number.isFinite(raw)) return null;
      return Math.round(raw / 1000); // dollars → $K (matches metric unit)
    });
    // Only include if all 12 years have data (avoid mid-series gaps).
    if (series.every(v => v != null)) {
      history[code] = series;
      stateCount++;
    }
  }
  if (stateCount < 40) {
    throw new Error(`Zillow ZHVI: only ${stateCount} states parsed — refusing to write a sparse series`);
  }
  console.log(`${stateCount} states, ${YEARS.length} years`);
  return history;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("🗺️  Vote Unbiased — refreshing state-level snapshot");
  console.log("");

  const metrics = {};

  // PIPELINE 1: median_home from Zillow ZHVI
  try {
    metrics.median_home = { history: await pullZillowHomeValues() };
  } catch (e) {
    console.error(`   FAILED: ${e.message}`);
    process.exit(2);
  }

  // (Future pipelines append to `metrics` here. Each follows the pattern:
  //  try { metrics.KEY = { history: await pullSource() } } catch { exit 2 })

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
