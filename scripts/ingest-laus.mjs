#!/usr/bin/env node
/**
 * ingest-laus.mjs — BLS LAUS county unemployment (latest 14 months, monthly).
 *
 * The first MONTHLY-cadence source in the observation store: the freshness
 * layer the annual ACS can't provide. Downloads the official
 * laucntycur14.zip (all 3,14x counties), parses it, and writes canonical
 * observations per the product-plan data contract.
 *
 * BLS's WAF blocks datacenter IPs and bare clients — requests need browser
 * headers and (in CI) the residential proxy (BLS_PROXY_URL / YT_PROXY_URL).
 * Idempotent: same input month → identical output file (git is the
 * revision log; a re-released month shows up as a diff, not a silent edit).
 */
import { writeFile, mkdir } from "fs/promises";
import { execFileSync } from "child_process";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx"); // CJS build exposes readFile; the ESM wrapper doesn't

const URL = "https://www.bls.gov/web/metro/laucntycur14.zip";
const PROXY = process.env.BLS_PROXY_URL || process.env.YT_PROXY_URL || "";

// curl (not fetch): trivially proxy-able and lets us send the exact header
// set BLS's WAF accepts.
const args = [
  "-s", "--max-time", "60", "-o", "/tmp/laucntycur14.zip",
  "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "-H", "Accept-Language: en-US,en;q=0.9",
  "-H", "Referer: https://www.bls.gov/lau/",
  "--compressed",
];
if (PROXY) args.unshift("-x", PROXY);
execFileSync("curl", [...args, URL], { stdio: "inherit" });
execFileSync("unzip", ["-o", "/tmp/laucntycur14.zip", "-d", "/tmp/laus-x"], { stdio: "inherit" });

const wb = XLSX.readFile("/tmp/laus-x/laucntycur14.xlsx");
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

// Period strings like "Apr-25" / "May-26 p" → "2025-04"
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
function parsePeriod(s) {
  const m = String(s).match(/([A-Z][a-z]{2})-(\d{2})(\s*p)?/);
  if (!m) return null;
  return { key: `20${m[2]}-${MONTHS[m[1]]}`, preliminary: !!m[3] };
}

const byCounty = new Map(); // fips5 → { name, st, data: Map(period → {lf, rate, p}) }
const periods = new Set();
let prelimPeriods = new Set();

for (const r of rows) {
  if (!r || r.length < 9 || typeof r[1] !== "string" || !/^\d{2}$/.test(r[1])) continue;
  const fips = r[1] + r[2];
  const per = parsePeriod(r[4]);
  if (!per) continue;
  periods.add(per.key);
  if (per.preliminary) prelimPeriods.add(per.key);
  const nameRaw = String(r[3]);
  const stMatch = nameRaw.match(/,\s*([A-Z]{2})$/);
  if (!byCounty.has(fips)) {
    byCounty.set(fips, {
      name: nameRaw.replace(/ (County|Parish|Borough|Census Area|Municipality|city|City and Borough),?.*$/i, "").trim(),
      st: stMatch ? stMatch[1] : "",
      data: new Map(),
    });
  }
  const lf = typeof r[5] === "number" ? r[5] : null;
  const rate = typeof r[8] === "number" ? r[8] : null; // dash → string → null (2025 appropriations lapse)
  byCounty.get(fips).data.set(per.key, { lf, rate });
}

const orderedPeriods = [...periods].sort();
const counties = {};
for (const [fips, c] of byCounty) {
  counties[fips] = {
    name: c.name, st: c.st,
    lf: orderedPeriods.map(p => c.data.get(p)?.lf ?? null),
    rate: orderedPeriods.map(p => c.data.get(p)?.rate ?? null),
  };
}

const out = {
  // Canonical observation contract (product plan §4)
  metric_id: "unemployment_rate_laus",
  unit: "%", frequency: "monthly", seasonal_adjustment: "NSA",
  source: "BLS Local Area Unemployment Statistics (LAUS)",
  source_url: URL,
  geo_level: "county",
  retrieved_at: new Date().toISOString(),
  periods: orderedPeriods,
  preliminary_periods: [...prelimPeriods].sort(),
  caveats: [
    "Not seasonally adjusted — compare year-over-year, not month-over-month.",
    "Latest 1-2 months are preliminary and will be revised.",
    "Nulls reflect the 2025 federal appropriations lapse (data not produced).",
  ],
  counties,
};
const dir = path.join(process.cwd(), "public", "observations");
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "laus-county.json"), JSON.stringify(out));
console.error(`LAUS: ${Object.keys(counties).length} counties × ${orderedPeriods.length} months (${orderedPeriods[0]} → ${orderedPeriods.at(-1)}), prelim: ${[...prelimPeriods].join(",") || "none"}`);
