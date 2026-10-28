/**
 * Server-side reads of the month-aligned benchmark for the indexable pages.
 * Same data and the same ranking rules as the dashboard's "same point in
 * office" view (lib/bench-lens), so a page never disagrees with the chart.
 */
import type { Bench, BenchMetric } from "./bench-lens";
import { RANK_BY_CHANGE, fmtBench } from "./bench-lens";
import { ADMINS, type MetricInfo } from "./seo-catalog";

export async function getBench(): Promise<Bench | null> {
  try {
    const r = await fetch("https://voteunbiased.org/api/benchmark-data", { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return (await r.json()) as Bench;
  } catch { return null; }
}

/** Value at month, or the nearest earlier reading within 2 months (quarterly series). */
export function valueAt(data: { month: number; value: number }[], month: number): number | null {
  for (let m = month; m >= month - 2; m--) {
    const p = data.find(d => d.month === m);
    if (p && Number.isFinite(p.value)) return p.value;
  }
  return null;
}

export interface RankRow { id: string; name: string; value: number; start: number | null; change: number | null; rank: number; current: boolean; lastMonth: number; last: number | null }
export interface RankTable { month: number; n: number; byChange: boolean; lowerBetter: boolean; rows: RankRow[]; mean: number | null; meanChange: number | null }

/** Every administration with data at `month`, ranked best → worst. */
export function rankAt(m: BenchMetric, key: string, month: number): RankTable {
  const byChange = RANK_BY_CHANGE.has(key);
  const rows0 = m.series.map(s => {
    const value = valueAt(s.data, month);
    const start = valueAt(s.data, 0);
    const change = value != null && start != null && start !== 0 ? ((value - start) / Math.abs(start)) * 100 : null;
    const lastMonth = s.data.length ? Math.max(...s.data.map(d => d.month)) : -1;
    return { id: s.id, name: s.name, value, start, change, current: s.current, lastMonth, last: lastMonth >= 0 ? valueAt(s.data, lastMonth) : null };
  }).filter(r => r.value != null && (!byChange || r.change != null)) as Omit<RankRow, "rank">[];
  const score = (r: { value: number; change: number | null }) => (byChange ? (r.change as number) : r.value);
  const sorted = [...rows0].sort((a, b) => (m.lowerBetter ? score(a) - score(b) : score(b) - score(a)));
  const rows = sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  const vals = rows.map(r => r.value);
  const chs = rows.map(r => r.change).filter((c): c is number => c != null);
  return { month, n: rows.length, byChange, lowerBetter: m.lowerBetter, rows,
    mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    meanChange: chs.length ? chs.reduce((a, b) => a + b, 0) / chs.length : null };
}

/** The month the current administration has reached for this metric. */
export function currentMonth(m: BenchMetric): number | null {
  const cur = m.series.find(s => s.current);
  return cur && cur.data.length ? Math.max(...cur.data.map(d => d.month)) : null;
}

export const fmtV = (m: BenchMetric, v: number) => fmtBench(v, m.unit);
export const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
export const ordinal = (n: number) => `#${n}`;
export const adminName = (id: string) => ADMINS.find(a => a.id === id)?.name ?? id;
export const monthLabel = (month: number) => `month ${month + 1}`;

/** One-sentence summary used in descriptions, citations and share cards. */
export function benchSummary(info: MetricInfo, m: BenchMetric, t: RankTable): string {
  const cur = t.rows.find(r => r.current);
  if (!cur) return `${info.name} across ${t.n} U.S. presidential administrations at the same point in office. Official ${info.agency} data.`;
  const val = t.byChange ? `${fmtPct(cur.change)} since taking office` : fmtV(m, cur.value);
  const mean = t.byChange ? (t.meanChange != null ? fmtPct(t.meanChange) : null) : (t.mean != null ? fmtV(m, t.mean) : null);
  return `At ${monthLabel(t.month)} in office, ${adminName(cur.id)} is at ${val}: ${ordinal(cur.rank)} of ${t.n} administrations${mean ? ` (average ${mean})` : ""}. Official ${info.agency} data.`;
}

/** Change from start to value: percentage POINTS for metrics already in %
 *  (4% → 5% unemployment is +1.0 pts, not +25%), % change otherwise. */
export function fmtChange(m: BenchMetric, start: number | null, value: number | null): string {
  if (start == null || value == null) return "—";
  if (m.unit === "%" || m.unit === "pts") { const d = value - start; return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)} pts`; }
  if (start === 0) return "—";
  return fmtPct(((value - start) / Math.abs(start)) * 100);
}
