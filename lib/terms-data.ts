import { unstable_cache } from "next/cache";
import { fredSeries } from "./local";
import { POVERTY, INEQUALITY } from "./annual-only";

/**
 * Whole-terms data: one value per calendar year, per metric, from the same
 * official series the "same point in office" view uses — so both views show
 * the same measures, defined the same way.
 *
 * Rule: a year's value is the annual average of the monthly (or quarterly)
 * series, except where an average is the wrong statistic:
 *   jobs      jobs added in the year (December to December), millions
 *   gdp       BEA's annual real GDP growth (not an average of quarterly rates)
 *   inflation / core / wages   % change in the annual average
 *   trade     the year's total, $B
 *   deficit   the fiscal year's total (Oct–Sep), $B
 * The year in progress is marked partial with the months it covers.
 *
 * Years are attributed to the president in office for most of the year:
 * the inauguration year belongs to the new president; 1974 to Nixon (in
 * office until August), 1975–76 to Ford.
 */

export type TermPoint = { y: number; v: number; a: string; partial?: boolean; months?: number; note?: string };

export const TERM_ADMIN_YEARS: [string, number, number][] = [
  ["nixon", 1969, 1974], ["ford", 1975, 1976], ["carter", 1977, 1980], ["reagan", 1981, 1988], ["bush41", 1989, 1992],
  ["clinton", 1993, 2000], ["bush", 2001, 2008], ["obama", 2009, 2016], ["trump1", 2017, 2020], ["biden", 2021, 2024], ["trump2", 2025, 2028],
];
const adminFor = (y: number) => TERM_ADMIN_YEARS.find(([, a, b]) => y >= a && y <= b)?.[0] ?? null;
const FIRST = 1969;

type Pt = { d: string; v: number };
const byYear = (pts: Pt[]) => {
  const m = new Map<number, Pt[]>();
  for (const p of pts) { const y = +p.d.slice(0, 4); m.set(y, [...(m.get(y) || []), p]); }
  return m;
};
const mon = (d: string) => +d.slice(5, 7);
const r = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Annual average; `full` = observations in a complete year (12 or 4). */
function annualAvg(pts: Pt[], full: number, scale = 1, dp = 2): Map<number, { v: number; n: number }> {
  const out = new Map<number, { v: number; n: number }>();
  for (const [y, ps] of byYear(pts)) out.set(y, { v: r((ps.reduce((s, p) => s + p.v, 0) / ps.length) * scale, dp), n: ps.length });
  void full;
  return out;
}
/** % change of the annual average, comparing the same months for a partial year. */
function annualYoY(pts: Pt[], dp = 1): Map<number, { v: number; n: number }> {
  const by = byYear(pts), out = new Map<number, { v: number; n: number }>();
  for (const [y, ps] of by) {
    const prev = by.get(y - 1); if (!prev) continue;
    const months = new Set(ps.map(p => mon(p.d)));
    const pp = prev.filter(p => months.has(mon(p.d)));
    if (pp.length !== ps.length) continue;
    const a = ps.reduce((s, p) => s + p.v, 0), b = pp.reduce((s, p) => s + p.v, 0);
    out.set(y, { v: r((a / b - 1) * 100, dp), n: ps.length });
  }
  return out;
}

async function build(): Promise<Record<string, TermPoint[]>> {
  const ids = ["GDPC1", "A191RL1A225NBEA", "A191RL1Q225SBEA", "UNRATE", "CIVPART", "PAYEMS", "MANEMP", "CPIAUCSL", "GASREGCOVM", "LES1252881600Q",
    "FEDFUNDS", "GFDEGDQ188S", "BOPGSTB", "FYFSD", "MTSDS133FMS", "UMCSENT", "GS10", "GS5", "T10Y2YM", "CPILFESL", "MORTGAGE30US", "HOUST", "RSAFS", "JTSJOL", "UNEMPLOY", "PSAVERT", "MEHOINUSA672N"];
  const got = await Promise.all(ids.map(id => fredSeries(id).catch(() => [] as Pt[])));
  const S: Record<string, Pt[]> = Object.fromEntries(ids.map((id, i) => [id, got[i]]));
  const now = new Date(), thisYear = now.getUTCFullYear();

  // metric → year → { v, n (observations), per (obs in a full year) }
  const out: Record<string, TermPoint[]> = {};
  const emit = (key: string, m: Map<number, { v: number; n: number }>, per: number, opts: { minYear?: number; noteFor?: (n: number) => string } = {}) => {
    const pts: TermPoint[] = [];
    for (const [y, { v, n }] of [...m].sort((a, b) => a[0] - b[0])) {
      if (y < Math.max(FIRST, opts.minYear ?? FIRST) || !Number.isFinite(v)) continue;
      const a = adminFor(y); if (!a) continue;
      // A finished year counts as complete with a month or two missing (the
      // Oct 2025 shutdown cancelled releases); a past year with fewer
      // observations is a series starting mid-year, and is skipped.
      const partial = y === thisYear;
      if (!partial && n < (per === 12 ? 10 : per)) continue;
      pts.push(partial ? { y, v, a, partial: true, months: per === 12 ? n : n * 3, ...(opts.noteFor ? { note: opts.noteFor(n) } : {}) } : { y, v, a });
    }
    if (pts.length) out[key] = pts;
  };

  emit("real_gdp", annualAvg(S.GDPC1, 4, 1 / 1000, 2), 4, { noteFor: n => `Average of ${n} quarter${n > 1 ? "s" : ""} so far` });
  // GDP growth: BEA's annual figure; the year in progress from the average of its quarterly annualized rates.
  {
    const m = new Map<number, { v: number; n: number }>();
    for (const p of S.A191RL1A225NBEA) m.set(+p.d.slice(0, 4), { v: r(p.v, 1), n: 4 });
    const q = byYear(S.A191RL1Q225SBEA).get(thisYear);
    if (q && !m.has(thisYear)) m.set(thisYear, { v: r(q.reduce((s, p) => s + p.v, 0) / q.length, 1), n: q.length });
    emit("gdp", m, 4, { noteFor: n => `Average annualized rate, ${n} quarter${n > 1 ? "s" : ""} so far` });
  }
  emit("unemployment", annualAvg(S.UNRATE, 12, 1, 1), 12);
  emit("lfpr", annualAvg(S.CIVPART, 12, 1, 1), 12);
  {
    // Jobs added: December to December (the year in progress: latest month vs last December).
    const m = new Map<number, { v: number; n: number }>(), by = byYear(S.PAYEMS);
    for (const [y, ps] of by) {
      const prevDec = by.get(y - 1)?.find(p => mon(p.d) === 12); if (!prevDec) continue;
      const last = ps[ps.length - 1];
      m.set(y, { v: r((last.v - prevDec.v) / 1000, 2), n: ps.length });
    }
    emit("jobs", m, 12, { noteFor: n => `Jobs added January–${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][n]}` });
  }
  emit("mfg", annualAvg(S.MANEMP, 12, 1 / 1000, 2), 12);
  emit("inflation", annualYoY(S.CPIAUCSL), 12);
  emit("gas", annualAvg(S.GASREGCOVM, 12, 1, 2), 12);
  emit("wages", annualYoY(S.LES1252881600Q), 4);
  {
    // Value of $1 in January 1969 dollars (same base as the same-point view).
    const base = S.CPIAUCSL.find(p => p.d.startsWith("1969-01"))?.v;
    if (base) emit("purchasing", annualAvg(S.CPIAUCSL.map(p => ({ d: p.d, v: base / p.v })), 12, 1, 3), 12);
  }
  emit("fed_rate", annualAvg(S.FEDFUNDS, 12, 1, 2), 12);
  emit("debt_gdp", annualAvg(S.GFDEGDQ188S, 4, 1, 1), 4);
  {
    const m = new Map<number, { v: number; n: number }>();
    for (const [y, ps] of byYear(S.BOPGSTB)) m.set(y, { v: Math.round(ps.reduce((s, p) => s + p.v, 0) / 1000), n: ps.length });
    emit("trade", m, 12, { noteFor: n => `Total for ${n} month${n > 1 ? "s" : ""} so far` });
  }
  {
    // Fiscal year totals; the fiscal year in progress from the Monthly Treasury Statement.
    const m = new Map<number, { v: number; n: number }>();
    for (const p of S.FYFSD) m.set(+p.d.slice(0, 4), { v: Math.round(p.v / 1000), n: 12 });
    const mts = S.MTSDS133FMS;
    const fy = (d: string) => (mon(d) >= 10 ? +d.slice(0, 4) + 1 : +d.slice(0, 4));
    const cur = mts.length ? fy(mts[mts.length - 1].d) : 0;
    if (cur && !m.has(cur)) {
      const ps = mts.filter(p => fy(p.d) === cur);
      if (ps.length) m.set(cur, { v: Math.round(ps.reduce((s, p) => s + p.v, 0) / 1000), n: ps.length });
    }
    // A fiscal year in progress is partial whatever the calendar says.
    const pts: TermPoint[] = [];
    for (const [y, { v, n }] of [...m].sort((a, b) => a[0] - b[0])) {
      const a = adminFor(y); if (!a || y < FIRST) continue;
      pts.push(n < 12 ? { y, v, a, partial: true, months: n, note: `Fiscal ${y} so far: ${n} month${n > 1 ? "s" : ""} (Oct–)` } : { y, v, a });
    }
    out.deficit = pts;
  }
  {
    // Michigan sentiment was quarterly before 1978: those years count as complete.
    const m = annualAvg(S.UMCSENT, 12, 1, 1);
    for (const [y, x] of m) if (y < 1978) m.set(y, { v: x.v, n: 12 });
    emit("consumer_conf", m, 12);
  }
  emit("ten_year", annualAvg(S.GS10, 12, 1, 2), 12);
  emit("five_year", annualAvg(S.GS5, 12, 1, 2), 12);
  emit("yield_curve", annualAvg(S.T10Y2YM, 12, 1, 2), 12);
  emit("core_cpi", annualYoY(S.CPILFESL), 12);
  {
    // Weekly series: average of the year's weeks; complete when it covers December.
    const m = new Map<number, { v: number; n: number }>();
    for (const [y, ps] of byYear(S.MORTGAGE30US)) m.set(y, { v: r(ps.reduce((s, p) => s + p.v, 0) / ps.length, 2), n: new Set(ps.map(p => mon(p.d))).size });
    emit("mortgage", m, 12);
  }
  emit("housing_starts", annualAvg(S.HOUST, 12, 1, 0), 12);
  emit("retail", annualAvg(S.RSAFS, 12, 1 / 1000, 1), 12);
  emit("openings", annualAvg(S.JTSJOL, 12, 1 / 1000, 2), 12);
  {
    const u = new Map(S.UNEMPLOY.map(p => [p.d, p.v]));
    emit("openings_per_worker", annualAvg(S.JTSJOL.filter(p => u.get(p.d)).map(p => ({ d: p.d, v: p.v / u.get(p.d)! })), 12, 1, 2), 12);
  }
  emit("saving", annualAvg(S.PSAVERT, 12, 1, 1), 12);
  // Yearly-only measures: one published figure per year.
  const yearly = (m: Record<number, number> | Pt[]) => {
    const mm = new Map<number, { v: number; n: number }>();
    if (Array.isArray(m)) for (const p of m) mm.set(+p.d.slice(0, 4), { v: Math.round(p.v), n: 12 });
    else for (const [y, v] of Object.entries(m)) mm.set(+y, { v, n: 12 });
    mm.delete(thisYear);   // never a partial year: the figure comes out the following September
    return mm;
  };
  emit("median_income", yearly(S.MEHOINUSA672N), 12);
  emit("poverty", yearly(POVERTY), 12);
  emit("inequality", yearly(INEQUALITY), 12);
  return out;
}

/** Cached for an hour (the same cadence as the same-point data). */
export const getTermsData = unstable_cache(build, ["terms-data-v2"], { revalidate: 3600 });
