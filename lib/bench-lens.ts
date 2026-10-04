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
export interface BenchMetric { label: string; short: string; unit: string; lowerBetter: boolean; cat: string; series: BenchSeries[] }
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
    const v = Math.round(r.v * scale * 1000) / 1000;
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
