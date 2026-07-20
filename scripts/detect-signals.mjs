#!/usr/bin/env node
/**
 * detect-signals.mjs — deterministic signal detection over the observation
 * store (product plan §4). Code decides what is notable; templates render
 * the copy; every number in the output is arithmetic over sourced data.
 *
 * v1 trend score (per plan): 30% magnitude + 25% acceleration +
 * 20% persistence + 15% peer divergence + 10% recency, minus confidence
 * penalties (preliminary data, small samples, series gaps). Weights are a
 * starting point to be tuned by backtesting — documented, not editorial.
 *
 * Input:  public/observations/laus-county.json
 * Output: public/observations/signals.json (ranked feed for /today)
 */
import { readFile, writeFile } from "fs/promises";
import path from "path";

const clamp01 = v => Math.max(0, Math.min(1, v));
const r1 = v => Math.round(v * 10) / 10;

const laus = JSON.parse(await readFile(path.join(process.cwd(), "public/observations/laus-county.json"), "utf8"));
const P = laus.periods;
const last = P.length - 1;              // 2026-05 (preliminary)
const yoyIdx = P.indexOf(`${Number(P[last].slice(0, 4)) - 1}-${P[last].slice(5)}`); // 2025-05
const prevYoYIdx = yoyIdx - 1 >= 0 ? { now: last - 1, ago: yoyIdx - 1 } : null;     // Apr/Apr

// ── Per-county features ──
const rowsAll = [];
for (const [fips, c] of Object.entries(laus.counties)) {
  const rate = c.rate, lf = c.lf[last] ?? c.lf[last - 1];
  if (rate[last] == null || rate[yoyIdx] == null || !lf) continue;
  const yoy = rate[last] - rate[yoyIdx];
  const yoyPrev = prevYoYIdx && rate[prevYoYIdx.now] != null && rate[prevYoYIdx.ago] != null
    ? rate[prevYoYIdx.now] - rate[prevYoYIdx.ago] : null;
  // Acceleration: change over the last 3 months vs the prior 3 months.
  const seg = (a, b) => (rate[a] != null && rate[b] != null ? rate[a] - rate[b] : null);
  const recent3 = seg(last, last - 3), prior3 = seg(last - 3, last - 6);
  const accel = recent3 != null && prior3 != null ? recent3 - prior3 : null;
  const gaps = rate.filter(v => v == null).length;
  rowsAll.push({ fips, name: c.name, st: c.st, lf, rate, yoy, yoyPrev, accel, gaps, level: rate[last] });
}

// ── State context for peer divergence ──
const byState = {};
for (const r of rowsAll) (byState[r.st] ||= []).push(r);
const stateStats = {};
for (const [st, rs] of Object.entries(byState)) {
  // Labor-force-weighted state mean YoY — a person-representative baseline.
  const w = rs.reduce((s, r) => s + r.lf, 0);
  const mean = rs.reduce((s, r) => s + r.yoy * r.lf, 0) / w;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r.yoy - mean) ** 2, 0) / rs.length) || 1;
  stateStats[st] = { mean, sd, n: rs.length };
}
const usW = rowsAll.reduce((s, r) => s + r.lf, 0);
const usYoY = rowsAll.reduce((s, r) => s + r.yoy * r.lf, 0) / usW;

// ── Score ──
function score(r) {
  const magnitude = clamp01(Math.abs(r.yoy) / 2.0);                       // 2pp YoY = max
  const accel = r.accel == null ? 0.3 : clamp01(Math.abs(r.accel) / 1.5); // 1.5pp swing = max
  const persistence = r.yoyPrev == null ? 0.5
    : Math.sign(r.yoyPrev) === Math.sign(r.yoy) ? 1 : 0.25;
  const st = stateStats[r.st];
  const divergence = clamp01(Math.abs(r.yoy - st.mean) / (2.5 * st.sd));
  const recency = 1; // all LAUS rows share the same vintage; matters cross-source
  let s = 100 * (0.30 * magnitude + 0.25 * accel + 0.20 * persistence + 0.15 * divergence + 0.10 * recency);
  // Confidence penalties (documented on every card)
  const caveats = [];
  if (laus.preliminary_periods.includes(P[last])) { s -= 5; caveats.push("Latest month is preliminary (will be revised)."); }
  if (r.lf < 5000) { s -= 20; caveats.push("Small labor force (<5K) — rates are volatile."); }
  else if (r.lf < 20000) { s -= 8; caveats.push("Modest labor force (<20K) — some volatility expected."); }
  if (r.gaps > 0) { s -= 5; caveats.push("Series has a gap from the 2025 federal appropriations lapse."); }
  return { s: Math.max(0, Math.round(s)), caveats };
}

const scored = rowsAll.map(r => ({ ...r, ...score(r) })).sort((a, b) => b.s - a.s);

// ── Card assembly (deterministic templates; no generated numbers) ──
const fmtPer = p => new Date(p + "-15").toLocaleString("en-US", { month: "long", year: "numeric" });
const period = fmtPer(P[last]);
function countyCard(r, rank) {
  const dir = r.yoy > 0 ? "up" : "down";
  const stM = stateStats[r.st].mean;
  return {
    id: `laus-${r.fips}-${P[last]}`,
    rank, topic: "jobs", geo: { level: "county", fips: r.fips, name: r.name, st: r.st },
    headline: `Unemployment in ${r.name}, ${r.st} is ${dir} ${Math.abs(r1(r.yoy))}pp in a year`,
    direction: r.yoy > 0 ? "worsening" : "improving",
    stat: { value: `${r.level}%`, label: `unemployment rate, ${period}`, change: `${r.yoy > 0 ? "+" : "−"}${Math.abs(r1(r.yoy))}pp vs ${fmtPer(P[yoyIdx])}` },
    comparison: `${r.st} counties moved ${stM > 0 ? "+" : "−"}${Math.abs(r1(stM))}pp on average; U.S. ${usYoY > 0 ? "+" : "−"}${Math.abs(r1(usYoY))}pp.`,
    score: r.s, caveats: r.caveats,
    series: { periods: P, values: r.rate },
    source: { name: laus.source, url: "https://www.bls.gov/lau/", metric: "Unemployment rate (NSA)", period, retrieved: laus.retrieved_at.slice(0, 10) },
  };
}

// National breadth signal
const rising = rowsAll.filter(r => r.yoy >= 0.3), falling = rowsAll.filter(r => r.yoy <= -0.3);
const risingPop = rising.reduce((s, r) => s + r.lf, 0);
const breadth = {
  id: `laus-breadth-${P[last]}`,
  rank: 0, topic: "jobs", geo: { level: "nation", fips: "US", name: "United States", st: "" },
  headline: `Unemployment is rising in ${rising.length.toLocaleString()} counties and falling in ${falling.length.toLocaleString()}`,
  direction: rising.length > falling.length ? "worsening" : "improving",
  stat: { value: `${Math.round((risingPop / usW) * 100)}%`, label: `of the U.S. labor force lives where unemployment rose ≥0.3pp year-over-year (${period})`, change: `U.S. counties averaged ${usYoY > 0 ? "+" : "−"}${Math.abs(r1(usYoY))}pp` },
  comparison: `Threshold ±0.3pp screens out rounding noise; counties weighted by labor force.`,
  score: 90, caveats: laus.preliminary_periods.includes(P[last]) ? ["Latest month is preliminary."] : [],
  series: null,
  source: { name: laus.source, url: "https://www.bls.gov/lau/", metric: "Unemployment rate (NSA)", period, retrieved: laus.retrieved_at.slice(0, 10) },
};

// Feed: breadth + top movers (biggest scored, mixing directions, min lf 20K for the marquee)
const marquee = scored.filter(r => r.lf >= 20000);
const worsening = marquee.filter(r => r.yoy > 0).slice(0, 6);
const improving = marquee.filter(r => r.yoy < 0).slice(0, 6);
const feed = [breadth, ...[...worsening, ...improving].sort((a, b) => b.s - a.s).map((r, i) => countyCard(r, i + 1))];

// ── State composites (map layer): labor-force-weighted YoY per state ──
const stateComposites = {};
for (const [st, stats] of Object.entries(stateStats)) {
  stateComposites[st] = { yoy: r1(stats.mean * 10) / 10, counties: stats.n };
}

// ── Percentile of each county's YoY (for spotlight "peer momentum") ──
const yoySorted = rowsAll.map(r => r.yoy).sort((a, b) => a - b);
const pctile = v => Math.round((yoySorted.filter(x => x <= v).length / yoySorted.length) * 100);

// ── Search index: every county, slim (name lookup → inline stats) ──
const searchIndex = rowsAll
  .map(r => ({ f: r.fips, n: r.name, s: r.st, rate: r.level, yoy: r1(r.yoy), p: pctile(r.yoy), lf: r.lf }))
  .sort((a, b) => a.n.localeCompare(b.n));
await writeFile(path.join(process.cwd(), "public/observations/search-index.json"), JSON.stringify(searchIndex));

// ── Slower ACS signals (annual cadence, from the existing county store) ──
const acsSignals = [];
try {
  const { readdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "county-data");
  const rows2 = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    const d = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    for (const c of Object.values(d.counties)) rows2.push(c);
  }
  const I18 = 2, I23 = 4;
  const popOf = c => c.m.pop[I23] ?? c.m.pop[I18] ?? 0;
  const usPop = rows2.reduce((s2, c) => s2 + popOf(c), 0);
  // Housing: rent growth vs income growth 2018→2023
  const elig = rows2.filter(c => popOf(c) >= 10000 && c.m.rent[I18] && c.m.rent[I23] && c.m.income[I18] && c.m.income[I23]);
  const worse = elig.filter(c => (c.m.rent[I23] / c.m.rent[I18]) > (c.m.income[I23] / c.m.income[I18]));
  const worsePop = worse.reduce((s2, c) => s2 + popOf(c), 0);
  acsSignals.push({
    id: "acs-affordability", rank: 90, topic: "housing",
    geo: { level: "nation", fips: "US", name: "United States", st: "" },
    headline: `Rents outran incomes in ${worse.length.toLocaleString()} counties over five years`,
    direction: "worsening",
    stat: { value: `${Math.round((worsePop / usPop) * 100)}%`, label: "of the U.S. population lives where rent grew faster than income, 2018→2023", change: `${worse.length.toLocaleString()} of ${elig.length.toLocaleString()} measurable counties` },
    comparison: "Census ACS 5-year vintages; counties ≥10K population. Full analysis on the Trends page.",
    score: 78, caveats: ["Annual data — a slower signal than the monthly jobs feed."],
    series: null,
    source: { name: "Census ACS 5-year", url: "https://www.census.gov/programs-surveys/acs", metric: "Median gross rent vs median household income", period: "2018 → 2023", retrieved: new Date().toISOString().slice(0, 10) },
  });
  // Population breadth
  const eligP = rows2.filter(c => (c.m.pop[I18] || 0) >= 1000 && c.m.pop[I23]);
  const losing = eligP.filter(c => c.m.pop[I23] < c.m.pop[I18]);
  acsSignals.push({
    id: "acs-population", rank: 91, topic: "population",
    geo: { level: "nation", fips: "US", name: "United States", st: "" },
    headline: `${Math.round((losing.length / eligP.length) * 100)}% of counties lost population since 2018`,
    direction: "mixed",
    stat: { value: losing.length.toLocaleString(), label: `counties shrinking of ${eligP.length.toLocaleString()} — growth concentrates in the South and West`, change: "2018 → 2023" },
    comparison: "Census ACS 5-year total population. Full analysis on the Trends page.",
    score: 74, caveats: ["Annual data — a slower signal than the monthly jobs feed."],
    series: null,
    source: { name: "Census ACS 5-year", url: "https://www.census.gov/programs-surveys/acs", metric: "Total population", period: "2018 → 2023", retrieved: new Date().toISOString().slice(0, 10) },
  });
} catch (e) { console.error("ACS slow signals skipped:", e.message); }

const out = {
  generatedAt: new Date().toISOString(),
  formula: "score = 30% magnitude + 25% acceleration + 20% persistence + 15% peer divergence + 10% recency − confidence penalties. Weights are v1 defaults pending backtests.",
  universe: { counties: rowsAll.length, source: laus.source, period },
  stateComposites,
  spotlight: (() => {
    const r = marquee[0];
    return r ? { fips: r.fips, name: r.name, st: r.st, rate: r.level, yoy: r1(r.yoy), pctile: pctile(r.yoy), lf: r.lf, series: { periods: P, values: r.rate } } : null;
  })(),
  signals: [...feed, ...acsSignals],
};
await writeFile(path.join(process.cwd(), "public/observations/signals.json"), JSON.stringify(out, null, 1));
console.error(`signals: ${feed.length} cards | breadth: ${rising.length}↑ ${falling.length}↓ | top: ${feed[1]?.headline}`);
