import { getTrendingClaims, type TrendingClaim } from "./trending-claims";
import { getSeries, CATALOG_BY_ID, type SeriesData } from "./series";
import { getRadar } from "./agenda-radar";
import { fmtVal } from "./chart-format";

/**
 * Data for the og:video renders (app/og-video/*): the brand loop and the
 * per-claim clips. Everything here is a real number from the site; the
 * pages only animate it.
 */
export const W = 600, H = 314;

export interface ChartGeo {
  path: string;                 // the series line, viewBox 0 0 600 314
  saidY: number | null;
  dot: [number, number];        // the reading at the claim
  peak: { x: number; y: number; label: string } | null;
  actual: string; said: string | null; gap: string | null;
  label: string; source: string;
  ticks: { y: number; label: string }[];
}

const t = (d: string) => Date.parse(d + "T12:00:00Z");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mlabel = (ms: number, freq: string) => { const d = new Date(ms); return freq === "a" ? String(d.getUTCFullYear()) : `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** Same rule as the chart on the site: draw a claimed value only if the series could take it. */
export function plausible(said: number | null | undefined, vals: number[], unit: string): number | null {
  if (said == null || !vals.length) return null;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if ((mn >= 0 && said < 0) || (mx <= 0 && said > 0)) return null;
  const big = Math.max(Math.abs(mn), Math.abs(mx)), small = Math.min(Math.abs(mn), Math.abs(mx));
  if (Math.abs(said) > (unit === "%" ? big * 12 + 10 : big * 4 + 1)) return null;
  if (mn > 0 && said < small * 0.2) return null;
  return said;
}

export function chartGeo(sd: SeriesData, saidIn: number | null, claimDate: string, lineKey?: string | null, years = 5): ChartGeo | null {
  const line = (lineKey && sd.lines.find(l => l.key === lineKey)) || sd.lines[0];
  if (!line || line.points.length < 4) return null;
  const claimMs = Date.parse(claimDate);
  const from = sd.freq === "a" ? -Infinity : claimMs - years * 365.25 * 864e5;
  const pts = line.points.map(p => ({ ms: t(p.d), v: p.v })).filter(p => p.ms >= from);
  if (pts.length < 4) return null;
  const said = plausible(saidIn, line.points.map(p => p.v), sd.unit);
  const at = pts.filter(p => p.ms <= claimMs + 864e5).slice(-1)[0] ?? pts[pts.length - 1];
  const vals = pts.map(p => p.v).concat(said != null ? [said] : []);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mn > 0 && mn / mx < 0.35) mn = 0;
  const pad = (mx - mn || 1) * 0.1; mn -= mn === 0 ? 0 : pad; mx += pad;
  const L = 30, R = 560, T = 70, B = 270;
  const x0 = pts[0].ms, x1 = Math.max(pts[pts.length - 1].ms, claimMs);
  const X = (ms: number) => L + ((ms - x0) / (x1 - x0 || 1)) * (R - L);
  const Y = (v: number) => B - ((v - mn) / (mx - mn || 1)) * (B - T);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.ms).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const peakP = pts.reduce((a, p) => (p.v > a.v ? p : a), pts[0]);
  const fv = (v: number) => fmtVal(v, sd.unit, sd.decimals);
  const showPeak = peakP !== at && Math.abs(X(peakP.ms) - X(at.ms)) > 120;
  const gap = said != null ? Math.abs(at.v - said) : null;
  const gapTxt = gap == null ? null : sd.unit === "%" ? `${gap.toFixed(sd.decimals)} pts` : fv(gap);
  const ticks = [0, 0.5, 1].map(f => mn + (mx - mn) * f).map(v => ({ y: Y(v), label: fv(v) }));
  return {
    path, saidY: said != null ? Y(said) : null, dot: [X(at.ms), Y(at.v)],
    peak: showPeak ? { x: X(peakP.ms), y: Y(peakP.v), label: `${fv(peakP.v)} · ${mlabel(peakP.ms, sd.freq)}` } : null,
    actual: fv(at.v), said: said != null ? fv(said) : null,
    gap: said != null && gap! > Math.max(Math.abs(said) * 0.05, sd.unit === "%" ? 0.15 : 0) ? gapTxt : null,
    label: sd.label, source: sd.source, ticks,
  };
}

export interface ClipData {
  key: string; quote: string; speaker: string | null; date: string; rating: string;
  geo: ChartGeo;
}

/** A trending claim with an official series, ready to animate. */
export async function clipData(c: TrendingClaim): Promise<ClipData | null> {
  const m = c.series;
  if (!m?.series) return null;
  const sd = await getSeries(m.series, m.countries).catch(() => null);
  if (!sd) return null;
  const geo = chartGeo(sd, m.said ?? c.claimedValue ?? null, c.date, m.saidCountry);
  if (!geo) return null;
  return { key: c.key, quote: c.quote, speaker: c.speaker, date: c.date, rating: c.rating, geo };
}

export async function clipForKey(key: string): Promise<ClipData | null> {
  const c = (await getTrendingClaims()).find(x => x.key === key);
  return c ? clipData(c) : null;
}

export interface Signal { label: string; value: string; note: string; hot: boolean }

/** The latest reading of a catalog series, with "N-yr high/low" when notable. */
async function latest(id: string, label: string): Promise<Signal | null> {
  const sd = await getSeries(id).catch(() => null);
  const pts = sd?.lines[0]?.points;
  if (!sd || !pts || pts.length < 3) return null;
  const last = pts[pts.length - 1];
  const fv = (v: number) => fmtVal(v, sd.unit, sd.decimals);
  let note = mlabel(t(last.d), sd.freq), hot = false;
  // How far back to find a higher (or lower) reading.
  const back = (cmp: (v: number) => boolean) => { for (let i = pts.length - 2; i >= 0; i--) if (cmp(pts[i].v)) return t(last.d) - t(pts[i].d); return t(last.d) - t(pts[0].d); };
  const yHi = back(v => v >= last.v) / (365.25 * 864e5), yLo = back(v => v <= last.v) / (365.25 * 864e5);
  if (yHi >= 3) { note = `${Math.floor(yHi)}-yr high`; hot = true; }
  else if (yLo >= 3) { note = `${Math.floor(yLo)}-yr low`; hot = true; }
  return { label, value: fv(last.v), note, hot };
}

export interface BrandData { hero: ClipData | null; signals: Signal[]; at: string }

export async function brandData(): Promise<BrandData> {
  const claims = await getTrendingClaims().catch(() => [] as TrendingClaim[]);
  // The hero: the newest FALSE claim whose number can be drawn against its series.
  // Prefer a monthly/weekly US series where the claim sits on the same
  // scale as the line (a 301% claim against a 40% line flattens the chart).
  let hero: ClipData | null = null, fallback: ClipData | null = null;
  // Claims about the present only: "said X, it's actually Y" is wrong framing
  // for claims comparing presidents or measuring from a past date.
  for (const c of claims.filter(x => x.rating === "FALSE" && x.series?.series && !x.series.terms && !x.series.since).slice(0, 30)) {
    const d = await clipData(c);
    if (!d || !d.geo.said || !d.geo.gap || d.geo.saidY == null) continue;
    if (/\.\.\.|…/.test(d.quote) || d.quote.length > 110) { fallback = fallback ?? d; continue; }   // halting or long quotes read badly
    // Level series where "said X, actually Y" reads cleanly at a glance.
    const HERO_OK = ["cpi_yoy", "core_cpi_yoy", "pce_yoy", "gas", "diesel", "unemployment", "mortgage", "treasury_10y", "fed_funds", "approval", "murder_rate", "eggs", "debt", "oil_wti"];
    const onScale = d.geo.saidY > 60 && d.geo.saidY < 280 && HERO_OK.includes(c.series!.series!);
    if (onScale) { hero = d; break; }
    if (!c.series!.series!.startsWith("wb_") && !["fdi_inflows", "factory_construction"].includes(c.series!.series!)) fallback = fallback ?? d;
  }
  hero = hero ?? fallback;
  const radar = await getRadar().catch(() => null);
  const top = radar?.themes.filter(th => th.market && (th.status === "rising" || th.status === "new")).sort((a, b) => b.z - a.z)[0];
  const sigs: (Signal | null)[] = [
    top ? { label: top.label, value: top.baseRate > 0 ? `↑ ${(top.recentRate / top.baseRate).toFixed(1)}×` : "new", note: "said on air", hot: true } : null,
    ...(await Promise.all([
      latest("treasury_10y", "10-yr Treasury"),
      latest("cpi_yoy", "Inflation"),
      latest("approval", "Approval"),
      latest("border_sw", "Border encounters"),
      latest("murder_rate", "Murder rate"),
      latest("oil_wti", "Oil (WTI)"),
    ])),
  ];
  return { hero, signals: sigs.filter((s): s is Signal => !!s).slice(0, 7), at: new Date().toISOString() };
}

export const CATALOG_LABEL = (id: string) => CATALOG_BY_ID.get(id)?.label || id;
