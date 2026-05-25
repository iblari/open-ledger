#!/usr/bin/env node

/**
 * refresh-data.mjs — pulls the 6 landing/dashboard headline metrics from FRED,
 * aggregates to annual, writes data/fred-snapshot.json.
 *
 * Run by .github/workflows/refresh-data.yml every Monday morning. The
 * workflow then commits any changes and opens a PR.
 *
 * REQUIRED ENV:
 *   FRED_API_KEY — same key used by /api/benchmark-data. Already in Vercel.
 *
 * LOCAL USAGE:
 *   FRED_API_KEY=xxx node scripts/refresh-data.mjs
 *
 * The script is idempotent — running twice produces identical output (modulo
 * the generatedAt timestamp). If FRED is down or rate-limits, it errors out
 * and the snapshot is NOT overwritten, so we degrade to whatever was last
 * committed rather than blanking the data.
 *
 * METRIC CONTRACT:
 *   Each metric becomes a MetricPoint[] of { y, v, a } where:
 *     y = calendar year (int)
 *     v = annual value (number; meaning depends on the metric — see PIPELINES)
 *     a = admin id ("clinton" | "bush" | "obama" | "trump1" | "biden" | "trump2")
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Config ──────────────────────────────────────────────────────

const FRED_API_KEY = process.env.FRED_API_KEY;
if (!FRED_API_KEY) {
  console.error("ERROR: FRED_API_KEY env var not set.");
  console.error("Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html");
  process.exit(1);
}

// Year range to publish. Site shows 1993-onwards (post-Clinton). We pull
// from 1993 and let FRED give us whatever it has, then we aggregate.
const FIRST_YEAR = 1993;

// Admin terms (must stay in sync with ADMINS_DATA in lib/metrics-data.ts).
const ADMINS = [
  { id: "clinton", start: 1993, end: 2000 },
  { id: "bush",    start: 2001, end: 2008 },
  { id: "obama",   start: 2009, end: 2016 },
  { id: "trump1",  start: 2017, end: 2020 },
  { id: "biden",   start: 2021, end: 2024 },
  { id: "trump2",  start: 2025, end: 2028 },
];

function adminForYear(year) {
  return ADMINS.find(a => year >= a.start && year <= a.end)?.id ?? null;
}

// ── FRED helper ──────────────────────────────────────────────────

async function fredObservations(seriesId) {
  const url = `https://api.stlouisfed.org/fred/series/observations`
    + `?series_id=${seriesId}`
    + `&api_key=${FRED_API_KEY}`
    + `&file_type=json`
    + `&observation_start=${FIRST_YEAR}-01-01`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status} — ${await res.text().catch(() => "")}`);
  }
  const json = await res.json();
  // FRED returns missing values as ".", filter them out.
  return (json.observations || [])
    .filter(o => o.value !== ".")
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => Number.isFinite(o.value));
}

// ── Pipelines: how each metric aggregates monthly/quarterly → annual ──
//
// Each pipeline owns a metric key, a FRED series id, and a function that
// turns the raw FRED observations into [{ y, v, a }] annual rows.

/** Aggregate by averaging all values within each calendar year. */
function annualMean(observations) {
  const byYear = new Map();
  for (const o of observations) {
    const year = parseInt(o.date.slice(0, 4), 10);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(o.value);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, vs]) => ({ y, v: vs.reduce((s, v) => s + v, 0) / vs.length, a: adminForYear(y) }))
    .filter(p => p.a !== null);
}

/** Take each calendar year's LAST observation (typically year-end Dec / Q4). */
function annualLast(observations) {
  const byYear = new Map();
  for (const o of observations) {
    const year = parseInt(o.date.slice(0, 4), 10);
    const cur = byYear.get(year);
    if (!cur || o.date > cur.date) byYear.set(year, o);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, o]) => ({ y, v: o.value, a: adminForYear(y) }))
    .filter(p => p.a !== null);
}

/** CPI YoY% — derive from monthly CPI index by comparing Dec(y) vs Dec(y-1). */
function cpiYoY(observations) {
  const decByYear = new Map();
  for (const o of observations) {
    if (o.date.slice(5, 7) !== "12") continue; // only December prints
    decByYear.set(parseInt(o.date.slice(0, 4), 10), o.value);
  }
  const years = [...decByYear.keys()].sort((a, b) => a - b);
  const out = [];
  for (const y of years) {
    const prev = decByYear.get(y - 1);
    const cur = decByYear.get(y);
    if (prev === undefined || cur === undefined) continue;
    const yoy = ((cur - prev) / prev) * 100;
    const a = adminForYear(y);
    if (a) out.push({ y, v: Math.round(yoy * 10) / 10, a });
  }
  return out;
}

/** Median household income (real) — comes annually from FRED already.
 *  Convert from raw dollars to $K (e.g. 81234 → 81.2). */
function annualLastInThousands(observations) {
  return annualLast(observations).map(p => ({ ...p, v: Math.round(p.v / 100) / 10 }));
}

// Round to 1 decimal place (matches the precision shown on the site).
const round1 = (rows) => rows.map(p => ({ ...p, v: Math.round(p.v * 10) / 10 }));
// Round to integer (for big indices like S&P 500).
const roundInt = (rows) => rows.map(p => ({ ...p, v: Math.round(p.v) }));

const PIPELINES = [
  // GDP growth — FRED A191RL1Q225SBEA is real GDP % change at annual rate, quarterly.
  // Annual = mean of the four quarterly readings within the calendar year.
  { key: "gdp",            series: "A191RL1Q225SBEA", transform: o => round1(annualMean(o)) },

  // Unemployment — UNRATE is monthly. Annual = 12-month mean.
  { key: "unemployment",   series: "UNRATE",          transform: o => round1(annualMean(o)) },

  // Inflation — derive YoY% from CPIAUCSL (CPI-U index level, monthly).
  // Dec(y) vs Dec(y-1) is the conventional "year-over-year" the site shows.
  { key: "inflation",      series: "CPIAUCSL",        transform: o => cpiYoY(o) },

  // S&P 500 — daily index. Annual = the year's last trading day's close.
  { key: "sp500",          series: "SP500",           transform: o => roundInt(annualLast(o)) },

  // Federal debt as % of GDP — quarterly. Annual = the year's Q4 reading.
  { key: "debt_gdp",       series: "GFDEGDQ188S",     transform: o => round1(annualLast(o)) },

  // Real median household income — annual already, in 2023 dollars. Convert to $K.
  { key: "median_income",  series: "MEHOINUSA672N",   transform: o => annualLastInThousands(o) },
];

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("📊 Vote Unbiased — refreshing snapshot from FRED");
  console.log(`   ${PIPELINES.length} metrics, FRED start ${FIRST_YEAR}`);
  console.log("");

  const metrics = {};
  for (const p of PIPELINES) {
    process.stdout.write(`   pulling ${p.key} (${p.series}) … `);
    try {
      const observations = await fredObservations(p.series);
      const rows = p.transform(observations);
      if (rows.length < 10) {
        throw new Error(`only ${rows.length} annual rows produced — refusing to write a near-empty series`);
      }
      metrics[p.key] = rows;
      const last = rows[rows.length - 1];
      console.log(`${rows.length} rows · latest ${last.y}: ${last.v}`);
    } catch (e) {
      console.error(`FAILED — ${e.message}`);
      process.exit(2);
    }
  }

  // Resolve target path relative to this script: scripts/refresh-data.mjs →
  // ../data/fred-snapshot.json. Works regardless of where `node` is invoked from.
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = `${here}/../data/fred-snapshot.json`;
  mkdirSync(dirname(outPath), { recursive: true });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: "fred-api",
    metrics,
  };
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log("");
  console.log(`✓ wrote ${outPath}`);
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
