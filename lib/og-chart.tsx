/**
 * Shared drawing for the 1200×630 share cards (claim cards and metric
 * cards). The image renderer (next/og) has no charting library, so a series
 * is drawn as plain SVG paths.
 */
import { markSvg } from "./cheetah-mark";
import { fmtVal } from "./chart-format";
import { plausible } from "./og-video";
import type { SeriesData } from "./series";

export const OG_SIZE = { width: 1200, height: 630 };
export const MARK = "data:image/svg+xml;base64," + Buffer.from(markSvg({ bars: 7, id: "cog", width: 120, height: 40 })).toString("base64");
export const fit = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

async function font(family: string, spec: string): Promise<ArrayBuffer | null> {
  try {
    // No browser UA → Google serves TrueType, which the image renderer reads.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:${spec}`)).text();
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch { return null; }
}
export async function ogFonts() {
  const [serif, sans] = await Promise.all([font("Source+Serif+4", "wght@400"), font("DM+Sans", "wght@500")]);
  return [
    ...(serif ? [{ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Sans", data: sans, weight: 500 as const, style: "normal" as const }] : []),
  ];
}

export interface OgChart {
  W: number; H: number;
  path: string; area: string;
  sayY: number | null; dot: [number, number];
  said: string | null; value: string; valueDate: string;
  label: string; source: string; from: string; to: string;
  /** Change vs the same period a year earlier, e.g. "▲ 0.4 pts vs a year earlier". */
  change: string | null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dlabel = (ms: number, freq: string) => { const d = new Date(ms); return freq === "a" ? String(d.getUTCFullYear()) : freq === "w" ? `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** Five years of a series up to `anchor` (a claim date, or now), with an
 *  optional claimed value drawn as a dashed line. */
export function buildOgChart(sd: SeriesData, opts: { lineKey?: string | null; anchor?: string; said?: number | null; W?: number; H?: number; years?: number } = {}): OgChart | null {
  const W = opts.W ?? 700, H = opts.H ?? 200;
  const line = (opts.lineKey && sd.lines.find(l => l.key === opts.lineKey)) || sd.lines[0];
  if (!line || line.points.length < 4) return null;
  const anchorMs = opts.anchor ? Date.parse(opts.anchor) : Date.now();
  const from = sd.freq === "a" ? -Infinity : anchorMs - (opts.years ?? 5) * 365.25 * 864e5;
  const pts = line.points.map(p => ({ ms: Date.parse(p.d + "T12:00:00Z"), v: p.v })).filter(p => p.ms >= from && p.ms <= anchorMs + 864e5);
  if (pts.length < 4) return null;
  const at = pts[pts.length - 1];
  const said = plausible(opts.said ?? null, line.points.map(p => p.v), sd.unit);
  const vals = pts.map(p => p.v).concat(said != null ? [said] : []);
  let mn = Math.min(...vals), mx = Math.max(...vals); const pad = (mx - mn || 1) * 0.08; mn -= pad; mx += pad;
  const x0 = pts[0].ms, x1 = Math.max(at.ms, opts.anchor ? anchorMs : at.ms);
  const X = (ms: number) => ((ms - x0) / (x1 - x0 || 1)) * W;
  const Y = (v: number) => H - ((v - mn) / (mx - mn || 1)) * H;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.ms).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const yr = (ms: number) => String(new Date(ms).getUTCFullYear());
  // Same period a year earlier (never a neighbour of a missing month).
  const prev = line.points.map(p => ({ ms: Date.parse(p.d + "T12:00:00Z"), v: p.v }))
    .find(p => Math.abs(p.ms - (at.ms - 365.25 * 864e5)) <= (sd.freq === "w" ? 4 : sd.freq === "a" ? 40 : 16) * 864e5);
  let change: string | null = null;
  if (prev) {
    const d = at.v - prev.v;
    // A % change of a change (jobs added, rolling deficit) means nothing:
    // show last year's reading instead.
    if (sd.unit !== "%" && (sd.transform === "diff" || sd.transform === "sum12" || prev.v <= 0 || at.v <= 0)) {
      change = `a year earlier: ${fmtVal(prev.v, sd.unit, sd.decimals)}`;
    } else {
      const mag = sd.unit === "%" ? `${Math.abs(d).toFixed(sd.decimals)} pts` : `${Math.abs((at.v / prev.v - 1) * 100).toFixed(1)}%`;
      change = Math.abs(d) < 1e-9 ? "unchanged from a year earlier" : `${d > 0 ? "▲" : "▼"} ${mag} vs a year earlier`;
    }
  }
  return {
    W, H, path, area: `${path} L${X(at.ms).toFixed(1)},${H} L0,${H} Z`,
    sayY: said != null ? Y(said) : null, dot: [X(at.ms), Y(at.v)],
    said: said != null ? fmtVal(said, sd.unit, sd.decimals) : null,
    value: fmtVal(at.v, sd.unit, sd.decimals), valueDate: dlabel(at.ms, sd.freq),
    label: sd.label, source: sd.source, from: yr(x0), to: yr(x1), change,
  };
}

/** The chart itself, for next/og. */
export function OgChartSvg({ c, color }: { c: OgChart; color: string }) {
  return (
    <svg width={c.W} height={c.H} viewBox={`0 0 ${c.W} ${c.H}`}>
      <path d={c.area} fill={color} fillOpacity={0.14} />
      <path d={c.path} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
      {c.sayY != null && <line x1={0} x2={c.W} y1={c.sayY} y2={c.sayY} stroke="#A39D93" strokeWidth={3} strokeDasharray="12 10" />}
      {c.sayY != null && <line x1={c.dot[0]} x2={c.dot[0]} y1={c.sayY} y2={c.dot[1]} stroke={color} strokeWidth={4} strokeOpacity={0.5} />}
      <circle cx={c.dot[0]} cy={c.dot[1]} r={10} fill={color} stroke="#0C0A08" strokeWidth={4} />
    </svg>
  );
}

export function OgBrand({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} width={size * 2.8} height={size * 0.93} alt="" />
      <div style={{ display: "flex", fontFamily: "Serif", fontSize: size }}>Vote&nbsp;<span style={{ color: "#E0493A" }}>Unbiased</span></div>
    </div>
  );
}
