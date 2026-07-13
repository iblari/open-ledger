#!/usr/bin/env node
/**
 * detect-trends.mjs — the "What's Changing in America" detection pass.
 *
 * Reads public/county-data/*.json (3,144 counties × 6 metrics × 5 ACS
 * snapshots) and computes ranked, method-transparent developments:
 * every headline number is deterministic arithmetic over Census data —
 * the AI narrative layer (added by /api/admin/trends) explains figures,
 * it never generates them.
 *
 * Output: trends-computed.json (stdout with --stdout)
 * Usage:  node scripts/detect-trends.mjs [--out FILE]
 */
import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";

const DIR = path.join(process.cwd(), "public", "county-data");
const YEARS = [2012, 2015, 2018, 2021, 2023];
const I18 = 2, I23 = 4; // snapshot indices for the 2018→2023 window

// CPI-U annual averages (BLS, all urban consumers). Used to deflate income.
const CPI = { 2012: 229.594, 2018: 251.107, 2023: 304.702 };
const INFL_18_23 = (CPI[2023] / CPI[2018] - 1) * 100; // ≈ 21.3%

// Census regions for aggregation color.
const REGION = {
  CT:"Northeast",ME:"Northeast",MA:"Northeast",NH:"Northeast",RI:"Northeast",VT:"Northeast",NJ:"Northeast",NY:"Northeast",PA:"Northeast",
  IL:"Midwest",IN:"Midwest",MI:"Midwest",OH:"Midwest",WI:"Midwest",IA:"Midwest",KS:"Midwest",MN:"Midwest",MO:"Midwest",NE:"Midwest",ND:"Midwest",SD:"Midwest",
  DE:"South",DC:"South",FL:"South",GA:"South",MD:"South",NC:"South",SC:"South",VA:"South",WV:"South",AL:"South",KY:"South",MS:"South",TN:"South",AR:"South",LA:"South",OK:"South",TX:"South",
  AZ:"West",CO:"West",ID:"West",MT:"West",NV:"West",NM:"West",UT:"West",WY:"West",AK:"West",CA:"West",HI:"West",OR:"West",WA:"West",
};

const pct = (a, b) => (a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
const r1 = v => Math.round(v * 10) / 10;

// ── Load every county into one flat list ──
const rows = [];
for (const f of await readdir(DIR)) {
  if (!f.endsWith(".json")) continue;
  const st = f.replace(".json", "");
  const d = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  for (const [fips, c] of Object.entries(d.counties)) {
    rows.push({ fips, st, region: REGION[st] || "—", name: c.name, m: c.m });
  }
}
const total = rows.length;
const popOf = r => r.m.pop[I23] ?? r.m.pop[I18] ?? 0;
const usPop = rows.reduce((s, r) => s + popOf(r), 0);

const topFmt = (list, val) => list.map(r => ({
  fips: r.fips, name: r.name, st: r.st, pop: popOf(r), ...val(r),
}));

const trends = [];

// ── 1. Housing affordability: rent growth vs income growth, 2018→2023 ──
{
  const elig = rows.filter(r => popOf(r) >= 10_000 && r.m.rent[I18] && r.m.rent[I23] && r.m.income[I18] && r.m.income[I23]);
  const scored = elig.map(r => {
    const rentG = pct(r.m.rent[I23], r.m.rent[I18]);
    const incG = pct(r.m.income[I23], r.m.income[I18]);
    return { ...r, rentG, incG, gap: rentG - incG };
  });
  const worse = scored.filter(r => r.gap > 0);
  const worsePop = worse.reduce((s, r) => s + popOf(r), 0);
  const gaps = worse.map(r => r.gap).sort((a, b) => a - b);
  const medGap = gaps[Math.floor(gaps.length / 2)];
  trends.push({
    id: "housing-affordability",
    kicker: "Housing",
    headline: `Rents outran incomes in ${worse.length.toLocaleString()} counties since 2018`,
    heroStat: { value: worse.length.toLocaleString(), label: `of ${scored.length.toLocaleString()} measurable counties (${Math.round((worsePop / usPop) * 100)}% of the US population)` },
    window: "2018 → 2023",
    breadth: { n: worse.length, total: scored.length, popShare: r1((worsePop / usPop) * 100) },
    facts: {
      medianGapPp: r1(medGap),
      note: `Median gap: rent grew ${r1(medGap)}pp faster than income in affected counties.`,
    },
    top: topFmt(scored.sort((a, b) => b.gap - a.gap).filter(r => popOf(r) >= 50_000).slice(0, 12),
      r => ({ metricLabel: "rent vs income growth", value: `+${r1(r.gap)}pp`, detail: `rent +${r1(r.rentG)}% · income +${r1(r.incG)}%` })),
    method: "Census ACS 5-year: % change in median gross rent minus % change in median household income, 2018 vs 2023 vintages, counties ≥10K population. Positive gap = affordability worsened.",
  });
}

// ── 2. Population shifts ──
{
  const elig = rows.filter(r => r.m.pop[I18] >= 1000 && r.m.pop[I23]);
  const scored = elig.map(r => ({ ...r, g: pct(r.m.pop[I23], r.m.pop[I18]) }));
  const losing = scored.filter(r => r.g < 0);
  const regGain = {};
  for (const r of scored) {
    const d = r.m.pop[I23] - r.m.pop[I18];
    regGain[r.region] = (regGain[r.region] || 0) + d;
  }
  const regTxt = Object.entries(regGain).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v / 1000)).toLocaleString()}K`).join(" · ");
  trends.push({
    id: "population-shift",
    kicker: "Migration",
    headline: `${Math.round((losing.length / scored.length) * 100)}% of US counties lost population since 2018`,
    heroStat: { value: `${losing.length.toLocaleString()}`, label: `counties shrinking of ${scored.length.toLocaleString()} — while growth concentrates in the South and West` },
    window: "2018 → 2023",
    breadth: { n: losing.length, total: scored.length, popShare: r1((losing.reduce((s, r) => s + popOf(r), 0) / usPop) * 100) },
    facts: { regionalNetChange: regTxt },
    top: topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => b.g - a.g).slice(0, 6),
      r => ({ metricLabel: "population growth", value: `+${r1(r.g)}%`, detail: `${(r.m.pop[I18] / 1000).toFixed(0)}K → ${(r.m.pop[I23] / 1000).toFixed(0)}K` }))
      .concat(topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => a.g - b.g).slice(0, 6),
        r => ({ metricLabel: "population decline", value: `${r1(r.g)}%`, detail: `${(r.m.pop[I18] / 1000).toFixed(0)}K → ${(r.m.pop[I23] / 1000).toFixed(0)}K` }))),
    method: "Census ACS 5-year total population, 2018 vs 2023 vintages, counties ≥1K. Regional net change sums county-level deltas by Census region.",
  });
}

// ── 3. Real income: who actually got a raise after inflation ──
{
  const elig = rows.filter(r => popOf(r) >= 10_000 && r.m.income[I18] && r.m.income[I23]);
  const scored = elig.map(r => ({ ...r, g: pct(r.m.income[I23], r.m.income[I18]), real: pct(r.m.income[I23], r.m.income[I18]) - INFL_18_23 }));
  const fell = scored.filter(r => r.real < 0);
  const fellPop = fell.reduce((s, r) => s + popOf(r), 0);
  trends.push({
    id: "real-income",
    kicker: "Income",
    headline: `Incomes trailed inflation in ${fell.length.toLocaleString()} counties`,
    heroStat: { value: `${Math.round((fellPop / usPop) * 100)}%`, label: `of Americans live where median income grew less than the ${r1(INFL_18_23)}% cumulative inflation since 2018` },
    window: "2018 → 2023",
    breadth: { n: fell.length, total: scored.length, popShare: r1((fellPop / usPop) * 100) },
    facts: { cumulativeCpiPct: r1(INFL_18_23) },
    top: topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => b.real - a.real).slice(0, 6),
      r => ({ metricLabel: "real income growth", value: `+${r1(r.real)}%`, detail: `nominal +${r1(r.g)}% vs ${r1(INFL_18_23)}% CPI` }))
      .concat(topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => a.real - b.real).slice(0, 6),
        r => ({ metricLabel: "real income decline", value: `${r1(r.real)}%`, detail: `nominal +${r1(r.g)}% vs ${r1(INFL_18_23)}% CPI` }))),
    method: `Census ACS 5-year median household income % change 2018→2023, deflated by CPI-U annual averages (BLS: ${CPI[2018]} → ${CPI[2023]}, +${r1(INFL_18_23)}%). Counties ≥10K population.`,
  });
}

// ── 4. Home-value surge relative to local incomes ──
{
  const elig = rows.filter(r => popOf(r) >= 10_000 && r.m.home[I18] && r.m.home[I23] && r.m.income[I18] && r.m.income[I23]);
  const scored = elig.map(r => {
    const ratio18 = r.m.home[I18] / r.m.income[I18];
    const ratio23 = r.m.home[I23] / r.m.income[I23];
    return { ...r, ratio18: r1(ratio18), ratio23: r1(ratio23), jump: pct(ratio23, ratio18) };
  });
  const surged = scored.filter(r => r.jump >= 15);
  trends.push({
    id: "home-price-to-income",
    kicker: "Housing",
    headline: `Home prices pulled away from local incomes in ${surged.length.toLocaleString()} counties`,
    heroStat: { value: surged.length.toLocaleString(), label: "counties where the home-value-to-income ratio jumped 15%+ in five years" },
    window: "2018 → 2023",
    breadth: { n: surged.length, total: scored.length, popShare: r1((surged.reduce((s, r) => s + popOf(r), 0) / usPop) * 100) },
    facts: {},
    top: topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => b.jump - a.jump).slice(0, 12),
      r => ({ metricLabel: "price-to-income ratio", value: `${r.ratio18}× → ${r.ratio23}×`, detail: `+${r1(r.jump)}%` })),
    method: "Median home value ÷ median household income per county (ACS 5-year), 2018 vs 2023 vintages. Ratio growth ≥15% flagged. Counties ≥10K population.",
  });
}

// ── 5. Poverty: divergence in both directions ──
{
  const elig = rows.filter(r => popOf(r) >= 10_000 && r.m.poverty[I18] != null && r.m.poverty[I23] != null);
  const scored = elig.map(r => ({ ...r, d: r1(r.m.poverty[I23] - r.m.poverty[I18]) }));
  const worse = scored.filter(r => r.d >= 2);
  const better = scored.filter(r => r.d <= -2);
  trends.push({
    id: "poverty-divergence",
    kicker: "Poverty",
    headline: `Poverty fell meaningfully in ${better.length} counties — and rose in ${worse.length}`,
    heroStat: { value: `${better.length} ↓ / ${worse.length} ↑`, label: "counties with ≥2-point poverty-rate moves since 2018" },
    window: "2018 → 2023",
    breadth: { n: worse.length + better.length, total: scored.length, popShare: r1(((worse.reduce((s, r) => s + popOf(r), 0) + better.reduce((s, r) => s + popOf(r), 0)) / usPop) * 100) },
    facts: {},
    top: topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => a.d - b.d).slice(0, 6),
      r => ({ metricLabel: "poverty change", value: `${r.d}pp`, detail: `${r1(r.m.poverty[I18])}% → ${r1(r.m.poverty[I23])}%` }))
      .concat(topFmt(scored.filter(r => popOf(r) >= 50_000).sort((a, b) => b.d - a.d).slice(0, 6),
        r => ({ metricLabel: "poverty change", value: `+${r.d}pp`, detail: `${r1(r.m.poverty[I18])}% → ${r1(r.m.poverty[I23])}%` }))),
    method: "Census ACS 5-year poverty rate (B17001), percentage-point change 2018→2023, counties ≥10K population, ±2pp threshold.",
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  window: "2018 → 2023",
  universe: { counties: total, population: usPop, source: "Census ACS 5-year (2012, 2015, 2018, 2021, 2023 vintages)" },
  trends,
};

const outFlag = process.argv.indexOf("--out");
const file = outFlag > -1 ? process.argv[outFlag + 1] : "trends-computed.json";
await writeFile(file, JSON.stringify(out, null, 1));
console.error(`wrote ${file}: ${trends.length} trends over ${total} counties`);
