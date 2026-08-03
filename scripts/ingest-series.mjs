#!/usr/bin/env node
/**
 * ingest-series.mjs — national time series for the multi-topic trends page.
 *
 * The existing pipeline (ingest-laus -> detect-signals) models GEOGRAPHIC
 * observations: one value per county per month, scored against peer counties.
 * The series here are national and have no peers, so they get their own store
 * and their own score. Keeping them separate means neither pipeline has to
 * grow a "sometimes there is no geography" branch.
 *
 * SOURCES — every one is public domain or explicitly licensed. Nothing here
 * is taken from a site whose terms forbid it.
 *
 *   FRED CSV     keyless download endpoint. No API key, no quota. Underlying
 *                data is US government work (Census, FHFA, FHWA).
 *   Census BTOS  experimental data product, public domain.
 *   Epoch AI     CC-BY 4.0 — free to reproduce WITH CREDIT. The attribution
 *                travels inside the series record so the UI cannot render
 *                the data without it.
 *
 * Output: public/observations/series.json
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "observations");
const OUT = path.join(OUT_DIR, "series.json");
const UA = "VoteUnbiased/1.0 (+https://voteunbiased.org) data ingest";

async function get(url, { asBuffer = false, timeout = 45000 } = {}) {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(resp.status + " " + url);
  return asBuffer ? Buffer.from(await resp.arrayBuffer()) : await resp.text();
}

// ── FRED ───────────────────────────────────────────────────────────────
// fredgraph.csv needs no API key. That keeps a secret out of the ingest path
// entirely: this runs anywhere, including a fork, and a rotated key can never
// silently break the refresh.
async function fredSeries(id) {
  const csv = await get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id);
  const out = [];
  for (const line of csv.trim().split("\n").slice(1)) {
    const parts = line.split(",");
    const date = (parts[0] || "").trim();
    const v = Number(parts[1]);
    if (!date || !Number.isFinite(v)) continue; // FRED writes "." for missing
    out.push({ t: date, v });
  }
  if (!out.length) throw new Error("FRED " + id + ": no usable observations");
  return out;
}

// ── Census BTOS ────────────────────────────────────────────────────────
// The workbook is a matrix: rows are (question, answer) pairs, columns are
// biweekly collection periods keyed YYYYNN. We want one row — Q7 "used AI in
// the last two weeks" = Yes — as a time series.
function colName(i) {
  let s = "", n = i;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
async function btosAiAdoption() {
  const buf = await get("https://www.census.gov/hfp/btos/downloads/National.xlsx", { asBuffer: true });
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);

  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedXml = sharedFile ? await sharedFile.async("string") : "";
  const shared = [...sharedXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m =>
    decodeEntities([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join(""))
  );

  const readGrid = async (name) => {
    const f = zip.file("xl/worksheets/" + name + ".xml");
    if (!f) return null;
    const xml = await f.async("string");
    const grid = [];
    for (const rowM of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
      const cells = {};
      for (const cM of rowM[2].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]*)")?[^>]*>(.*?)<\/c>/gs)) {
        const type = cM[2];
        const body = cM[3];
        let val = null;
        if (type === "inlineStr") {
          // This workbook embeds its strings in the cell rather than using a
          // shared-string table, so a <v>-only reader sees an empty sheet.
          const iM = body.match(/<is>(.*?)<\/is>/s);
          if (iM) val = decodeEntities([...iM[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join(""));
        } else {
          const vM = body.match(/<v>(.*?)<\/v>/s);
          if (vM) val = type === "s" ? (shared[Number(vM[1])] || "") : vM[1];
        }
        if (val !== null) cells[cM[1]] = val;
      }
      grid[Number(rowM[1])] = cells;
    }
    return grid;
  };

  const grid = await readGrid("sheet1"); // "Response Estimates"
  if (!grid) throw new Error("BTOS: sheet1 missing");

  // Columns E onward hold period ids. Sheet order is NEWEST FIRST, so we sort
  // by date afterwards rather than trusting column order.
  const header = grid[1] || {};
  const periodCols = [];
  for (let i = 4; i < 120; i++) {
    const c = colName(i);
    const raw = header[c];
    if (raw && /^\d{6}$/.test(String(raw).trim())) periodCols.push({ col: c, period: String(raw).trim() });
  }

  let target = null;
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r];
    if (row && String(row.A).trim() === "7" && String(row.C).trim() === "1") { target = row; break; }
  }
  if (!target) throw new Error("BTOS: Q7 / answer 1 (AI use = Yes) not found");

  // Map period id -> real date. A point stamped "202615" is useless on a chart.
  const dateBy = new Map();
  for (const nm of ["sheet5", "sheet6", "sheet4", "sheet7"]) {
    const g = await readGrid(nm);
    if (!g) continue;
    let hit = false;
    for (const row of g) {
      if (!row) continue;
      const vals = Object.values(row);
      const smp = vals.find(c => /^\d{6}$/.test(String(c).trim()));
      if (!smp) continue;
      // Two encodings in the wild: an Excel serial number, or an ISO-ish
      // datetime string. Handle both rather than assuming one.
      let iso = null;
      const isoText = vals.find(c => /^\d{4}-\d{2}-\d{2}/.test(String(c).trim()));
      if (isoText) {
        iso = String(isoText).trim().slice(0, 10);
      } else {
        // 25569 is the offset from Excel's 1900 epoch to the Unix epoch.
        const serial = vals.map(Number).find(n => Number.isFinite(n) && n > 40000 && n < 60000);
        if (serial) iso = new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
      }
      if (iso) { dateBy.set(String(smp).trim(), iso); hit = true; }
    }
    if (hit) break;
  }

  const points = periodCols.map(({ col, period }) => {
    const raw = target[col];
    if (raw == null || raw === "") return null;
    const n = Number(String(raw).replace("%", ""));
    if (!Number.isFinite(n)) return null;
    // Stored as a fraction (0.215) in the XML but displayed as 21.5% in Excel.
    const pct = n <= 1 ? n * 100 : n;
    return { t: dateBy.get(period) || period, v: Math.round(pct * 10) / 10 };
  }).filter(Boolean).sort((a, b) => String(a.t).localeCompare(String(b.t)));

  if (points.length < 10) throw new Error("BTOS: only " + points.length + " points parsed");
  return points;
}

// ── Epoch AI (CC-BY) ───────────────────────────────────────────────────
// We do NOT mirror their table. We compute a derived trend — the training
// compute of the largest notable model published each quarter — which is the
// trajectory the dataset exists to show. Credit travels with the series.
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
async function epochFrontierCompute() {
  const rows = parseCsv(await get("https://epoch.ai/data/notable_ai_models.csv"));
  const hdr = rows[0].map(h => h.trim());
  const iDate = hdr.indexOf("Publication date");
  const iFlop = hdr.indexOf("Training compute (FLOP)");
  const iName = hdr.indexOf("Model");
  const iOrg = hdr.indexOf("Organization");
  if (iDate < 0 || iFlop < 0) throw new Error("Epoch: expected columns missing");

  const byQuarter = new Map();
  for (const r of rows.slice(1)) {
    const d = (r[iDate] || "").trim();
    const flop = Number(r[iFlop]);
    if (!/^\d{4}-\d{2}/.test(d) || !Number.isFinite(flop) || flop <= 0) continue;
    const y = Number(d.slice(0, 4));
    if (y < 2015) continue; // deep-learning era; earlier points are too sparse
    const q = Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
    const key = y + "-Q" + q;
    const prev = byQuarter.get(key);
    if (!prev || flop > prev.flop) {
      byQuarter.set(key, {
        flop,
        model: (r[iName] || "").trim(),
        org: (r[iOrg] || "").trim(),
        t: y + "-" + String((q - 1) * 3 + 1).padStart(2, "0") + "-01",
      });
    }
  }

  // CUMULATIVE RUNNING MAXIMUM — the largest model trained UP TO each date.
  //
  // Two weaker versions were wrong. A per-quarter max, and then a trailing
  // 12-month max, both showed the frontier FALLING more than an order of
  // magnitude during 2026. That did not happen. Frontier labs increasingly
  // decline to publish training compute, so Epoch's estimates thin out for
  // recent models — a gap in REPORTING that a windowed maximum silently
  // reports as a gap in CAPABILITY. Publishing "AI compute is shrinking" on
  // a site about accurate numbers would have been a bad way to find that out.
  //
  // A running maximum cannot fall, because "the largest model trained so
  // far" cannot fall. When disclosure dries up the line goes flat, which is
  // the honest rendering of "nothing larger has been catalogued since".
  const quarters = [...byQuarter.values()].sort((a, b) => a.t.localeCompare(b.t));
  const points = [];
  let best = null;
  for (const q of quarters) {
    if (!best || q.flop > best.flop) best = q;
    const top = best;
    points.push({
      t: q.t,
      // log10: raw FLOP spans ten orders of magnitude, so a linear axis is a
      // flat line with one spike at the end.
      v: Math.round(Math.log10(top.flop) * 100) / 100,
      label: top.model + (top.org ? " · " + top.org : ""),
    });
  }
  if (points.length < 8) throw new Error("Epoch: only " + points.length + " quarters");
  return points;
}

// ── Series definitions ─────────────────────────────────────────────────
const DEFS = [
  {
    id: "ai_business_adoption", topic: "ai", label: "Businesses using AI",
    unit: "%", cadence: "biweekly", geography: "national",
    source: {
      id: "census_btos",
      name: "U.S. Census Bureau, Business Trends and Outlook Survey",
      url: "https://www.census.gov/programs-surveys/btos.html",
      licence: "public-domain",
      note: "Share of businesses reporting AI use in the last two weeks. Sample ~1.2M firms.",
    },
    load: btosAiAdoption,
  },
  {
    id: "ecommerce_share", topic: "commerce", label: "E-commerce share of retail sales",
    unit: "%", cadence: "quarterly", geography: "national",
    source: {
      id: "census_ecommerce",
      name: "U.S. Census Bureau, Quarterly Retail E-Commerce Sales (via FRED)",
      url: "https://fred.stlouisfed.org/series/ECOMPCTSA",
      licence: "public-domain",
      note: "Seasonally adjusted e-commerce sales as a percent of total retail sales.",
    },
    load: () => fredSeries("ECOMPCTSA"),
  },
  {
    id: "vehicle_miles", topic: "traffic", label: "Vehicle miles travelled",
    unit: "M miles", cadence: "monthly", geography: "national",
    source: {
      id: "fhwa_vmt",
      name: "Federal Highway Administration, Traffic Volume Trends (via FRED)",
      url: "https://www.fhwa.dot.gov/policyinformation/travel_monitoring/tvt.cfm",
      licence: "public-domain",
      note: "Monthly, seasonally adjusted, millions of miles on all roads and streets.",
    },
    load: () => fredSeries("TRFVOLUSM227SFWA"),
  },
  {
    id: "house_price_index", topic: "housing", label: "House price index",
    unit: "index", cadence: "quarterly", geography: "national",
    source: {
      id: "fhfa_hpi",
      name: "FHFA All-Transactions House Price Index (via FRED)",
      url: "https://fred.stlouisfed.org/series/USSTHPI",
      licence: "public-domain",
      // Verified against FRED's own series title. An earlier draft of this
      // said "purchase-only, 1991 Q1 = 100" — wrong index and wrong base
      // year. That number feeds the live fact-checker, so a mislabelled
      // series would let it refute a politician with the wrong measure.
      note: "All-transactions index, United States, 1980 Q1 = 100.",
    },
    load: () => fredSeries("USSTHPI"),
  },
  {
    id: "frontier_training_compute", topic: "ai", label: "Largest model trained to date",
    unit: "log10 FLOP", cadence: "quarterly", geography: "global", scale: "log",
    source: {
      id: "epoch_ai",
      name: "Epoch AI, Data on AI Models",
      url: "https://epoch.ai/data/ai-models",
      licence: "CC-BY-4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Epoch AI, 'Data on AI Models'. Published online at epoch.ai.",
      note: "Running maximum training compute among notable models, by publication quarter. Flat stretches mean no larger model has been catalogued — frontier labs increasingly do not disclose compute.",
    },
    load: epochFrontierCompute,
  },
];

// ── Trend score ────────────────────────────────────────────────────────
/**
 * The geographic score is 30% magnitude + 25% acceleration + 20% persistence
 * + 15% PEER DIVERGENCE + 10% recency. A national series has no peers, and
 * dropping that 15% is not an option: the remaining weights would no longer
 * sum to 1, so every national signal would score systematically below every
 * county one and get buried on a shared feed.
 *
 * The peer term is instead replaced by SELF-divergence — how unusual the
 * current change is against this series' own history. Same question ("is
 * this abnormal?"), asked of the only reference class that exists.
 */
const DAY = 86400000;
const asTime = (t) => new Date(String(t).slice(0, 10) + "T00:00:00Z").getTime();

/** The observation closest to `daysBack` before `from`, with its real age. */
function lookback(points, from, daysBack) {
  const target = from - daysBack * DAY;
  let best = null, bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(asTime(p.t) - target);
    if (gap < bestGap) { bestGap = gap; best = p; }
  }
  if (!best) return null;
  return { point: best, days: (from - asTime(best.t)) / DAY };
}

/**
 * Trend score for a national series.
 *
 * TWO DEPARTURES from the geographic scorer, both forced by real data:
 *
 * 1. DATE-BASED LOOKBACK, not index-based. The county scorer can step back
 *    12 rows to move a year because LAUS is strictly monthly. BTOS is not:
 *    Census rotates the AI question through some biweekly waves and not
 *    others, so "26 rows back" lands wherever the gaps happen to put it.
 *    We find the observation nearest the target DATE and measure its real
 *    age, then annualise. Wrong-by-a-few-weeks becomes impossible.
 *
 * 2. SELF-DIVERGENCE replaces PEER DIVERGENCE. A national series has no
 *    peers, and dropping that 15% is not an option — the weights would stop
 *    summing to 1, so every national signal would score below every county
 *    one and get buried on a shared feed. We ask the same question ("is this
 *    change abnormal?") against the only reference class there is: the
 *    series' own history.
 *
 * Series shorter than a year (BTOS starts Nov 2025) use their full span and
 * annualise, with a confidence penalty so a 3-month series cannot out-shout
 * a 20-year one on a short burst.
 */
function scoreSeries(points, opts = {}) {
  const isLog = opts.scale === "log";
  if (points.length < 4) return null;
  const sorted = [...points].sort((a, b) => asTime(a.t) - asTime(b.t));
  const latest = sorted[sorted.length - 1];
  const now = asTime(latest.t);
  const spanDays = (now - asTime(sorted[0].t)) / DAY;
  if (spanDays < 60) return null;

  const window = Math.min(365, Math.floor(spanDays));
  const back = lookback(sorted.slice(0, -1), now, window);
  if (!back || !back.days || !Number.isFinite(back.point.v) || back.point.v === 0) return null;

  // Annualised change, so an 8-month and a 10-year series sit on one axis.
  //
  // For a LOG-SCALED series the value is already an exponent, so a percent
  // change on it is arithmetic nonsense: 10^26.7 -> 10^25.3 is a 96% fall in
  // FLOP but reads as "-5.2%" if you treat the exponents as ordinary
  // numbers. Log series therefore report the DIFFERENCE — orders of
  // magnitude per year — which is the unit the quantity is actually measured
  // in.
  const yoy = isLog
    ? (latest.v - back.point.v) * (365 / back.days)
    : (((latest.v - back.point.v) / Math.abs(back.point.v)) * 100) * (365 / back.days);

  // Prior period of the same length, for acceleration.
  const prior = lookback(sorted, asTime(back.point.t), window);
  let yoyPrev = null;
  if (prior && prior.days > 30 && prior.point.v) {
    yoyPrev = isLog
      ? (back.point.v - prior.point.v) * (365 / prior.days)
      : (((back.point.v - prior.point.v) / Math.abs(prior.point.v)) * 100) * (365 / prior.days);
  }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  // An order of magnitude a year is a huge move; 20% a year is a huge move
  // for a normal series. Different units need different full-scale points.
  const FULL = isLog ? 1 : 20;
  const magnitude = clamp01(Math.abs(yoy) / FULL);
  const accel = yoyPrev == null ? 0.5 : clamp01(Math.abs(yoy - yoyPrev) / FULL);
  const persistence = yoyPrev == null ? 0.5 : (Math.sign(yoyPrev) === Math.sign(yoy) ? 1 : 0.25);

  // Distribution of every same-length change in the series' history.
  const hist = [];
  for (const p of sorted) {
    const t = asTime(p.t);
    const b = lookback(sorted.filter(x => asTime(x.t) < t), t, window);
    if (b && b.days > window * 0.5 && b.point.v) {
      hist.push(isLog
        ? (p.v - b.point.v) * (365 / b.days)
        : (((p.v - b.point.v) / Math.abs(b.point.v)) * 100) * (365 / b.days));
    }
  }
  let divergence = 0.5;
  if (hist.length >= 4) {
    const mean = hist.reduce((s, x) => s + x, 0) / hist.length;
    const sd = Math.sqrt(hist.reduce((s, x) => s + (x - mean) ** 2, 0) / hist.length) || 1;
    divergence = clamp01(Math.abs(yoy - mean) / (2.5 * sd));
  }

  let score = 100 * (0.30 * magnitude + 0.25 * accel + 0.20 * persistence + 0.15 * divergence + 0.10 * 1);

  // Confidence penalties, stated rather than hidden: a short series and a
  // stale one are both less trustworthy than the raw score implies.
  const notes = [];
  if (spanDays < 365) { score *= 0.85; notes.push("series shorter than a year"); }
  // Staleness is relative to how often the source publishes. A quarterly
  // series is normally ~4 months old the day it lands; flagging that as
  // stale, as a flat 200-day rule did, libels a perfectly current release.
  const expected = { biweekly: 14, monthly: 31, quarterly: 92, annual: 365 }[opts.cadence] || 31;
  const ageDays = (Date.now() - now) / DAY;
  if (ageDays > expected * 2.5) {
    score *= 0.9;
    notes.push("no update in " + Math.round(ageDays / 30) + " months");
  }

  return {
    score: Math.round(score * 10) / 10,
    yoy: Math.round(yoy * 10) / 10,
    changeUnit: isLog ? "oom" : "percent",
    changeWindowDays: Math.round(back.days),
    comparedWith: { t: back.point.t, v: back.point.v },
    confidenceNotes: notes,
  };
}

async function main() {
  const series = [];
  const failures = [];

  for (const def of DEFS) {
    try {
      const points = await def.load();
      const scored = scoreSeries(points, { scale: def.scale, cadence: def.cadence });
      const { load, ...meta } = def;
      series.push({
        ...meta,
        points,
        latest: points[points.length - 1],
        first: points[0],
        ...(scored || {}),
      });
      const p = points[points.length - 1];
      console.log("  ok  " + def.id.padEnd(28) + String(points.length).padStart(4) + " pts   latest " +
        p.t + " = " + p.v + (def.unit === "%" ? "%" : "") + (scored ? "   score " + scored.score + "   yoy " + scored.yoy + "%" : ""));
    } catch (e) {
      failures.push({ id: def.id, error: String(e.message || e) });
      console.error("  FAIL " + def.id + ": " + (e.message || e));
    }
  }

  if (!series.length) {
    console.error("No series ingested — refusing to overwrite with an empty store.");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    series: series.sort((a, b) => (b.score || 0) - (a.score || 0)),
    failures,
  }, null, 2));

  console.log("\nWrote " + series.length + " series -> " + path.relative(ROOT, OUT));
  if (failures.length) console.log(failures.length + " failed; the site keeps the previous data for those.");
}

main().catch(e => { console.error(e); process.exit(1); });
