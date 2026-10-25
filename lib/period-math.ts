/**
 * Period-over-period math by DATE, not by array position.
 *
 * Official series have holes — FRED has no October 2025 CPI (the shutdown
 * cancelled it). Counting "12 points back" then compares Sept 2026 with Aug
 * 2025 and reports 4.0% where BLS says 3.7%. Every comparison here looks up
 * the same date one period earlier and gives up (null) when it's missing.
 *
 * Shared by the server (lib/series) and the chart (ProChart yearly view).
 */
export type Freq = "w" | "m" | "q" | "a";
export interface Pt { d: string; v: number }

const monthIndex = (d: string) => { const [y, m] = d.split("-").map(Number); return y * 12 + (m - 1); };
const dayIndex = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 864e5);

/** Value at the same point `months` earlier (weekly: the reading within ±3 days of a year/that many weeks back). */
export function lookbackFn(pts: Pt[], freq: Freq): (i: number, months: number) => number | null {
  if (freq === "w") {
    const byDay = new Map(pts.map(p => [dayIndex(p.d), p.v]));
    return (i, months) => {
      const target = dayIndex(pts[i].d) - Math.round(months * 30.4375 / 7) * 7;
      for (const off of [0, -1, 1, -2, 2, -3, 3]) { const v = byDay.get(target + off); if (v != null) return v; }
      return null;
    };
  }
  const byMonth = new Map(pts.map(p => [monthIndex(p.d), p.v]));
  return (i, months) => byMonth.get(monthIndex(pts[i].d) - months) ?? null;
}

/** Months in one step of the series (for "previous period"). */
export const stepMonths = (freq: Freq) => (freq === "q" ? 3 : freq === "a" ? 12 : 1);

export function yoy(pts: Pt[], freq: Freq): Pt[] {
  const back = lookbackFn(pts, freq);
  return pts.flatMap((p, i) => { const b = back(i, 12); return b ? [{ d: p.d, v: (p.v / b - 1) * 100 }] : []; });
}

export function periodTransform(pts: Pt[], t: "level" | "yoy" | "mom" | "diff" | "sum12", freq: Freq, scale = 1): Pt[] {
  const back = lookbackFn(pts, freq);
  const step = stepMonths(freq);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    let v: number | null = pts[i].v;
    if (t === "yoy") { const b = back(i, 12); v = b ? (pts[i].v / b - 1) * 100 : null; }
    else if (t === "mom") { const b = back(i, step); v = b ? (pts[i].v / b - 1) * 100 : null; }
    else if (t === "diff") { const b = back(i, step); v = b != null ? pts[i].v - b : null; }
    else if (t === "sum12") {
      // Twelve consecutive months, all present.
      let s = 0, ok = true;
      for (let k = 0; k < 12 && ok; k++) { const b = k === 0 ? pts[i].v : back(i, k); if (b == null) ok = false; else s += b; }
      v = ok ? s : null;
    }
    if (v != null && Number.isFinite(v)) out.push({ d: pts[i].d, v: v * scale });
  }
  return out;
}
