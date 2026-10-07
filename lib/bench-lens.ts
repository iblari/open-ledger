/**
 * The two lenses of the Data tab, computed from /api/benchmark-data (live
 * FRED, month 0 = inauguration month).
 *
 *  - samePoint(): every administration at the month the CURRENT one has
 *    reached for this metric, ranked best → worst.
 *  - trump2SoFar(): the current term's "so far" cell for the whole-terms
 *    heatmap, for metrics the live feed carries.
 *
 * Kept out of the components so both the desktop table and the phone cards
 * read the same numbers.
 */

export interface BenchPoint { month: number; value: number }
export interface BenchSeries { id: string; name: string; party: string; current: boolean; data: BenchPoint[] }
export interface BenchMetric {
  label: string; short: string; unit: string; lowerBetter: boolean; cat: string; series: BenchSeries[];
  /** From the full monthly history (months as y*12+m): the latest reading and
   *  the last earlier month at/above (high) and at/below (low) it. */
  hist?: { t: number; v: number; high: number | null; low: number | null; start: number } | null;
}
export interface Bench {
  lastUpdated: string;
  currentMonth: number;
  admins: { id: string; name: string; party: string; current: boolean }[];
  categories: Record<string, string>;
  metrics: Record<string, BenchMetric>;
}

/** The value at `month`, or the nearest earlier reading within 2 months
 *  (quarterly series and publication lags leave gaps). */
function valueAt(data: BenchPoint[], month: number): number | null {
  for (let m = month; m >= month - 2; m--) {
    const p = data.find(d => d.month === m);
    if (p && Number.isFinite(p.value)) return p.value;
  }
  return null;
}

/**
 * Measures whose LEVEL mostly tracks the calendar — the economy, prices and
 * nominal dollars all grow over decades — so ranking the level would just
 * rank the years (every recent president "#1" on real GDP). These rank on
 * the % change since that president's own month 0 instead.
 */
export const RANK_BY_CHANGE = new Set(["real_gdp", "retail", "purchasing", "mfg", "gas", "trade"]);

export interface SamePointRow { id: string; name: string; value: number; change: number | null; rank: number }
export interface SamePoint { month: number; n: number; rows: SamePointRow[]; avg: number | null; avgChange: number | null; current: SamePointRow | null; byChange: boolean }

export function samePoint(bench: Bench, key: string): SamePoint | null {
  const m = bench.metrics[key];
  if (!m) return null;
  const cur = m.series.find(s => s.current);
  if (!cur || !cur.data.length) return null;
  // The current term's latest reading for THIS metric — quarterly and
  // lagging series stop earlier than the calendar month.
  const month = Math.max(...cur.data.map(d => d.month));
  const byChange = RANK_BY_CHANGE.has(key);
  const vals = m.series
    .map(s => {
      const value = valueAt(s.data, month);
      const base = valueAt(s.data, 0);
      const change = value != null && base != null && base !== 0 ? ((value - base) / Math.abs(base)) * 100 : null;
      return { id: s.id, name: s.name, value, change };
    })
    .filter((r): r is { id: string; name: string; value: number; change: number | null } =>
      r.value != null && (!byChange || r.change != null));
  const score = (r: { value: number; change: number | null }) => (byChange ? (r.change as number) : r.value);
  const sorted = [...vals].sort((a, b) => (m.lowerBetter ? score(a) - score(b) : score(b) - score(a)));
  const rows = vals.map(r => ({ ...r, rank: sorted.findIndex(x => x.id === r.id) + 1 }));
  const others = rows.filter(r => r.id !== cur.id);
  const avg = others.length ? others.reduce((s, r) => s + r.value, 0) / others.length : null;
  const ch = others.map(r => r.change).filter((c): c is number => c != null);
  const avgChange = ch.length ? ch.reduce((s, c) => s + c, 0) / ch.length : null;
  return { month, n: rows.length, rows, avg, avgChange, current: rows.find(r => r.id === cur.id) ?? null, byChange };
}

export function fmtBench(v: number, unit: string, signed = false): string {
  const sign = signed && v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  switch (unit) {
    case "%": return `${sign}${a.toFixed(1)}%`;
    case "K": return `${sign}${Math.round(a).toLocaleString("en-US")}K`;
    case "M": return `${sign}${a < 1 ? a.toFixed(2) : a.toFixed(1)}M`;
    case "T": return `${sign}$${a.toFixed(1)}T`;
    case "B": return `${sign}$${Math.round(a).toLocaleString("en-US")}B`;
    case "$": return `${sign}$${a.toFixed(2)}`;
    case "x": return `${sign}${a.toFixed(2)}×`;
    case "pts": return `${v > 0 && signed ? "+" : sign}${a.toFixed(2)} pts`;
    case "idx": return `${sign}${Math.round(a).toLocaleString("en-US")}`;
    default: return `${sign}${a.toFixed(1)}`;
  }
}

/** Dashboard metric key → live feed key, for the "so far" column. Metrics
 *  without a live monthly series (income, poverty, inequality, deficit,
 *  S&P 500, and confidence — a different survey) are left out rather than
 *  approximated. */
const M_TO_BENCH: Record<string, { key: string; mode: "change" | "avg" }> = {
  real_gdp: { key: "real_gdp", mode: "change" },
  gdp: { key: "gdp_growth", mode: "change" },
  unemployment: { key: "unemployment", mode: "change" },
  lfpr: { key: "lfpr", mode: "change" },
  jobs: { key: "jobs", mode: "avg" },
  mfg: { key: "mfg", mode: "change" },
  inflation: { key: "inflation", mode: "avg" },
  gas: { key: "gas", mode: "change" },
  wages: { key: "wages", mode: "avg" },
  debt_gdp: { key: "debt_gdp", mode: "change" },
  trade: { key: "trade", mode: "avg" },
  fed_rate: { key: "fed_rate", mode: "change" },
  purchasing: { key: "purchasing", mode: "change" },
  sp500: { key: "sp500", mode: "change" },
  ten_year: { key: "ten_year", mode: "change" },
  five_year: { key: "five_year", mode: "change" },
  yield_curve: { key: "yield_curve", mode: "avg" },
  deficit: { key: "deficit", mode: "avg" },
};

export function benchKeyFor(dashKey: string): string | null {
  return M_TO_BENCH[dashKey]?.key ?? null;
}

export interface SoFarCell { headline: string; detail: string; improved: boolean | null; benchKey: string; month: number }

export function trump2SoFar(bench: Bench | null, dashKey: string): SoFarCell | null {
  const map = M_TO_BENCH[dashKey];
  if (!bench || !map) return null;
  const m = bench.metrics[map.key];
  const cur = m?.series.find(s => s.current);
  if (!m || !cur || cur.data.length < 2) return null;
  const pts = [...cur.data].sort((a, b) => a.month - b.month);
  const first = pts[0], last = pts[pts.length - 1];
  const rate = m.unit === "%";
  let headline: string;
  if (map.mode === "avg") {
    const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
    // Jobs: monthly change in thousands → millions a year, the unit the
    // finished terms are shown in.
    headline = m.unit === "K" ? `${fmtBench((avg * 12) / 1000, "M", true)}/yr avg`
      : m.unit === "B" ? `${fmtBench(avg, "B")}/mo`
      : `${fmtBench(avg, m.unit)} avg`;
  } else {
    const d = last.value - first.value;
    headline = rate ? `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)} pp` : fmtBench(d, m.unit, true);
  }
  const diff = last.value - first.value;
  const improved = Math.abs(diff) < 1e-9 ? null : m.lowerBetter ? diff < 0 : diff > 0;
  return {
    headline,
    detail: `${fmtBench(first.value, m.unit)} → ${fmtBench(last.value, m.unit)} · month ${last.month}`,
    improved, benchKey: map.key, month: last.month,
  };
}

/* ── Live annual points for the year-by-year charts ─────────────────────
 *
 * The finished-term charts are annual series. The current term is folded in
 * from the live monthly feed: each calendar year becomes one point, the year
 * in progress marked `partial`. How a year is summarised follows how the
 * historical series is defined (average level, December level, or a yearly
 * total), and series whose live source sits on a different base (chain-year
 * dollars, a different deflator or survey basis) are spliced: scaled by the
 * ratio of the historical 2024 value to the live feed's 2024 value, so the
 * line joins without a fake jump.
 */
const ANNUAL: Record<string, { key: string; agg: "avg" | "last" | "sum" | "fy"; splice?: boolean; scale?: number }> = {
  // Year-end level; FRED's series is the monthly average of daily closes,
  // so December's average stands in for the year-end close.
  sp500: { key: "sp500", agg: "last" },
  // Treasury yields: annual average of the monthly series, as the historical
  // points are built.
  ten_year: { key: "ten_year", agg: "avg" },
  five_year: { key: "five_year", agg: "avg" },
  yield_curve: { key: "yield_curve", agg: "avg" },
  // Fiscal year (Oct–Sep), the basis the historical deficits are stated on.
  deficit: { key: "deficit", agg: "fy" },
  real_gdp: { key: "real_gdp", agg: "avg", splice: true },
  gdp: { key: "gdp_growth", agg: "avg" },
  unemployment: { key: "unemployment", agg: "avg" },
  lfpr: { key: "lfpr", agg: "avg" },
  jobs: { key: "jobs", agg: "sum", scale: 1 / 1000 },        // thousands/month → millions/yr
  mfg: { key: "mfg", agg: "avg" },
  inflation: { key: "inflation", agg: "avg" },
  gas: { key: "gas", agg: "avg", splice: true },
  wages: { key: "wages", agg: "avg" },
  debt_gdp: { key: "debt_gdp", agg: "avg", splice: true },
  trade: { key: "trade", agg: "sum", splice: true },
  fed_rate: { key: "fed_rate", agg: "last" },
  purchasing: { key: "purchasing", agg: "avg", splice: true },
};

const START_YEAR: Record<string, number> = { biden: 2021, trump2: 2025 };

function yearAgg(data: BenchPoint[], startYear: number, year: number, agg: "avg" | "last" | "sum" | "fy") {
  if (agg === "fy") {
    // Trailing-12-month series: September's value IS the fiscal-year total.
    // For the fiscal year in progress, the latest 12-month figure.
    const sep = (year - startYear) * 12 + 8, from = sep - 11;
    const pts = data.filter(d => d.month >= from && d.month <= sep && Number.isFinite(d.value)).sort((a, b) => a.month - b.month);
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    return { v: last.value, months: last.month === sep ? 12 : pts.length, ttm: last.month !== sep ? last.month : undefined };
  }
  const lo = (year - startYear) * 12, hi = lo + 11;
  const pts = data.filter(d => d.month >= lo && d.month <= hi && Number.isFinite(d.value)).sort((a, b) => a.month - b.month);
  if (!pts.length) return null;
  const n = pts.length;
  const sum = pts.reduce((s, p) => s + p.value, 0);
  // A part-year total is annualised so it sits on the same scale as full years.
  const v = agg === "avg" ? sum / n : agg === "last" ? pts[n - 1].value : (sum / n) * 12;
  return { v, months: n };
}

export interface LivePoint { y: number; v: number; a: "trump2"; partial?: boolean; months?: number; note?: string }

export function liveAnnual(bench: Bench | null, dashKey: string, hist2024: number | null): LivePoint[] {
  const cfg = ANNUAL[dashKey];
  if (!bench || !cfg) return [];
  const m = bench.metrics[cfg.key];
  const cur = m?.series.find(s => s.id === "trump2");
  if (!m || !cur) return [];
  let ratio = 1;
  if (cfg.splice && hist2024 != null) {
    const b = m.series.find(s => s.id === "biden");
    const b24 = b ? yearAgg(b.data, START_YEAR.biden, 2024, cfg.agg) : null;
    if (b24 && b24.v !== 0) ratio = hist2024 / b24.v;
  }
  const scale = (cfg.scale ?? 1) * ratio;
  // A finished calendar year counts as complete even with a month missing
  // (the Oct 2025 shutdown left gaps); only the year in progress is partial.
  const thisYear = new Date(bench.lastUpdated || Date.now()).getUTCFullYear();
  const out: LivePoint[] = [];
  for (let y = 2025; y <= 2028; y++) {
    const r = yearAgg(cur.data, START_YEAR.trump2, y, cfg.agg);
    if (!r) break;
    // Match the historical series' precision: whole numbers for large
    // figures ($B, index points), three decimals for rates and ratios.
    const raw = r.v * scale;
    const v = Math.abs(raw) >= 100 ? Math.round(raw) : Math.round(raw * 1000) / 1000;
    if (cfg.agg === "fy") {
      // Fiscal years end in September; done once September is reported.
      const ttm = (r as { ttm?: number }).ttm;
      if (ttm === undefined) out.push({ y, v, a: "trump2" });
      else {
        const d = new Date(Date.UTC(2025, ttm, 1));
        out.push({ y, v, a: "trump2", partial: true, months: 12, note: `12 months to ${d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })} · live` });
      }
      continue;
    }
    out.push(y >= thisYear ? { y, v, a: "trump2", partial: true, months: r.months } : { y, v, a: "trump2" });
  }
  return out;
}

/* ── Trending: data signals ─────────────────────────────────────────────
 *
 * Turning points in the live data, worded for a homepage card:
 *  - a reading that's the highest/lowest in at least two years
 *  - three or more monthly moves in the same direction
 * Every administration's series is laid on one calendar so "highest since"
 * reaches back across presidents.
 */
export interface TrendCard {
  id: string;
  kicker: string;
  headline: string;
  badge: string;
  tone: "good" | "bad" | "neutral";
  /** ISO date the card is about (data period, or broadcast day). */
  date: string;
  dateLabel: string;
  note?: string;
  href: string;
  score: number;
}

const INAUG: Record<string, [number, number]> = {
  nixon: [1969, 0], carter: [1977, 0], reagan: [1981, 0], bush41: [1989, 0], clinton: [1993, 0],
  bush43: [2001, 0], obama: [2009, 0], trump1: [2017, 0], biden: [2021, 0], trump2: [2025, 0],
};
const KICKER: Record<string, string> = { growth: "Growth", labor: "Jobs", prices: "Prices", fiscal: "Fiscal", sentiment: "Sentiment" };
const KICKER_BY_KEY: Record<string, string> = { mortgage: "Housing", housing_starts: "Housing", sp500: "Markets", saving: "Households", ten_year: "Rates", five_year: "Rates", yield_curve: "Rates" };
// Levels that drift up (or down) with time — a "record" there is the calendar, not news.
// The 5-year moves with the 10-year; carding both would show one story twice.
const NO_RECORDS = new Set(["yield_curve", "five_year", "real_gdp", "retail", "purchasing", "deficit", "jobs", "trade"]);
const NO_STREAKS = new Set(["five_year", "jobs", "purchasing", "real_gdp", "retail", "debt_gdp", "deficit", "gdp_growth", "wages"]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (t: number) => `${MON[t % 12]} ${Math.floor(t / 12)}`;

export function dataSignals(bench: Bench | null): TrendCard[] {
  if (!bench) return [];
  const cards: TrendCard[] = [];
  for (const [key, m] of Object.entries(bench.metrics)) {
    // calendar month index → value (last reading in the month wins)
    const cal = new Map<number, number>();
    for (const s of m.series) {
      const st = INAUG[s.id]; if (!st) continue;
      for (const p of s.data) if (Number.isFinite(p.value)) cal.set(st[0] * 12 + st[1] + p.month, p.value);
    }
    const ts = [...cal.keys()].sort((a, b) => a - b);
    if (ts.length < 30) continue;
    const t = ts[ts.length - 1], v = cal.get(t)!;
    const label = m.label.replace(/\s*\(.*\)\s*$/, "");
    const kicker = KICKER_BY_KEY[key] || KICKER[m.cat] || "Economy";
    const value = fmtBench(v, m.unit);
    const iso = new Date(Date.UTC(Math.floor(t / 12), t % 12, 1)).toISOString();
    const dateLabel = `${MON[t % 12]} data`;
    const href = `/dashboard?view=month&metric=${key}`;

    // The yield curve's sign is the news, not its level: flag a flip
    // (inverted ↔ normal) within the last three months.
    if (key === "yield_curve") {
      const back = cal.get(t - 3);
      if (back != null && Math.sign(back) !== Math.sign(v) && v !== 0) {
        cards.push({
          id: "curve-flip", kicker: "Rates",
          headline: v < 0
            ? `The yield curve inverted — 10-year now ${fmtBench(-v, "pts")} below the 2-year`
            : `The yield curve is no longer inverted — 10-year ${fmtBench(v, "pts")} above the 2-year`,
          badge: v < 0 ? "Recession signal" : "Un-inverted",
          tone: v < 0 ? "bad" : "good", date: iso, dateLabel, href, score: 9,
        });
      }
    }
    if (!NO_RECORDS.has(key)) {
      for (const dir of ["high", "low"] as const) {
        let since: number | null = null, start: number;
        if (m.hist && m.hist.t === t) {
          // Full history from the server — the per-admin series have gaps
          // (second terms), so they can't answer "since when" on their own.
          since = dir === "high" ? m.hist.high : m.hist.low;
          start = m.hist.start;
        } else {
          // Fallback: walk back only through unbroken months; reaching a gap
          // means the answer is unknown, and no claim is made.
          let i = ts.length - 2, unknown = false;
          for (; i >= 0; i--) {
            if (ts[i] !== ts[i + 1] - 1) { unknown = true; break; }
            const x = cal.get(ts[i])!;
            if (dir === "high" ? x >= v : x <= v) { since = ts[i]; break; }
          }
          if (unknown || since == null) continue;
          start = ts[0];
        }
        const gap = since == null ? t - start : t - since;
        if (gap < 24) continue;
        const years = Math.floor(gap / 12);
        const good = m.lowerBetter ? dir === "low" : dir === "high";
        cards.push({
          id: `rec-${key}-${dir}`, kicker,
          headline: since == null
            ? `${label} at ${value} — the ${dir === "high" ? "highest" : "lowest"} on record`
            : `${label} at ${value} — the ${dir === "high" ? "highest" : "lowest"} since ${monthLabel(since)}`,
          badge: since == null ? `Record ${dir}` : `${years}-year ${dir}`,
          tone: good ? "good" : "bad", date: iso, dateLabel, href,
          score: 3 + Math.min(years, 15) / 2,
        });
      }
    }
    if (!NO_STREAKS.has(key)) {
      // consecutive month-on-month moves in one direction, ending now
      let n = 0, dirUp: boolean | null = null;
      for (let i = ts.length - 1; i > 0; i--) {
        if (ts[i] - ts[i - 1] !== 1) break;
        const d = cal.get(ts[i])! - cal.get(ts[i - 1])!;
        if (d === 0) break;
        const up = d > 0;
        if (dirUp == null) dirUp = up; else if (up !== dirUp) break;
        n++;
      }
      if (n >= 3 && dirUp != null) {
        const good = m.lowerBetter ? !dirUp : dirUp;
        cards.push({
          id: `streak-${key}`, kicker,
          headline: `${label} ${dirUp ? "rose" : "fell"} ${n} months in a row, to ${value}`,
          badge: `${dirUp ? "↑" : "↓"} ${n} months`,
          tone: good ? "good" : "bad", date: iso, dateLabel, href,
          score: 1.5 + n / 2,
        });
      }
    }
  }
  // One card per measure: keep its strongest.
  const best = new Map<string, TrendCard>();
  for (const c of cards) {
    const k = c.href;
    if (!best.has(k) || best.get(k)!.score < c.score) best.set(k, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
