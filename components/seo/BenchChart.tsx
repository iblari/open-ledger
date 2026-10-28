import type { BenchMetric } from "@/lib/bench-lens";
import { fmtBench } from "@/lib/bench-lens";
import { RANK_BY_CHANGE } from "@/lib/bench-lens";
import { valueAt } from "@/lib/seo-bench";

/**
 * Server-rendered, month-aligned comparison: one line per administration
 * from inauguration (month 1) to month 48. Rank-by-change metrics are drawn
 * as % change since month 1, the same basis they're ranked on.
 * Hover any point for its value (native SVG titles; no JavaScript needed).
 */
export default function BenchChart(props: { m: BenchMetric; metricKey: string; highlight?: string | null; height?: number }) {
  // Two drawings of the same chart: wide for desktop, narrow (bigger text)
  // for phones. CSS shows one; the phone copy is hidden from snippets.
  return (
    <>
      <style>{`.bc-n{display:none}@media (max-width:640px){.bc-w{display:none}.bc-n{display:block}}`}</style>
      <div className="bc-w"><Chart {...props} W={760} /></div>
      <div className="bc-n" aria-hidden data-nosnippet><Chart {...props} W={400} height={Math.round((props.height ?? 300) * 0.82)} /></div>
    </>
  );
}

function Chart({ m, metricKey, highlight, height = 300, W }: { m: BenchMetric; metricKey: string; highlight?: string | null; height?: number; W: number }) {
  const byChange = RANK_BY_CHANGE.has(metricKey);
  const narrow = W < 500;
  const H = height, L = 8, R = narrow ? 64 : 110, T = 14, B = 26;
  const fs = narrow ? 11 : 11;
  const lines = m.series.filter(s => s.data.length > 1).map(s => {
    const base = valueAt(s.data, 0);
    const pts = [...s.data].sort((a, b) => a.month - b.month).filter(p => p.month <= 47)
      .map(p => ({ month: p.month, v: byChange ? (base ? ((p.value - base) / Math.abs(base)) * 100 : NaN) : p.value }))
      .filter(p => Number.isFinite(p.v));
    return { id: s.id, name: s.name, current: s.current, pts };
  }).filter(l => l.pts.length > 1);
  if (!lines.length) return null;
  const vals = lines.flatMap(l => l.pts.map(p => p.v));
  let mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn || 1) * 0.08; mn -= pad; mx += pad;
  const X = (mo: number) => L + (mo / 47) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - mn) / (mx - mn || 1)) * (H - T - B);
  const fmt = (v: number) => byChange ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : fmtBench(v, m.unit);
  const focus = highlight ?? lines.find(l => l.current)?.id;
  const order = [...lines].sort((a, b) => (a.id === focus ? 1 : 0) - (b.id === focus ? 1 : 0));
  // End labels: nudge apart so names never overlap (min 12px apart).
  const ends = lines.map(l => ({ id: l.id, y: Y(l.pts[l.pts.length - 1].v) + 4 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  const labelY = new Map(ends.map(e => [e.id, e.y]));
  const ticks = [mn + (mx - mn) * 0.1, (mn + mx) / 2, mx - (mx - mn) * 0.1];
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${m.label} by month in office for ${lines.length} administrations`} style={{ display: "block", overflow: "visible" }}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#ece7df" /><text x={L} y={Y(t) - 4} fontSize={fs} fill="#9a9490" stroke="#fff" strokeWidth={3} paintOrder="stroke">{fmt(t)}</text></g>)}
        {byChange && mn < 0 && mx > 0 && <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="#cfc8bd" strokeDasharray="3 3" />}
        {(narrow ? [0, 24, 47] : [0, 12, 24, 36, 47]).map(mo => <text key={mo} x={X(mo)} y={H - 6} fontSize={fs} fill="#9a9490" textAnchor={mo === 0 ? "start" : mo === 47 ? "end" : "middle"}>{mo === 0 ? "Month 1" : `Month ${mo + 1}`}</text>)}
        {order.map(l => {
          const on = l.id === focus;
          const d = l.pts.map((p, i) => `${i ? "L" : "M"}${X(p.month).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
          const last = l.pts[l.pts.length - 1];
          return (
            <g key={l.id}>
              <path d={d} fill="none" stroke={on ? "#b8372d" : "#c9c2b8"} strokeWidth={on ? 3 : 1.4} strokeLinejoin="round" />
              {l.pts.filter((_, i) => i % 3 === 0 || i === l.pts.length - 1).map(p => (
                <circle key={p.month} cx={X(p.month)} cy={Y(p.v)} r={on ? 3.5 : 2.5} fill={on ? "#b8372d" : "#c9c2b8"} opacity={on ? 1 : 0.0}>
                  <title>{`${l.name}, month ${p.month + 1}: ${fmt(p.v)}`}</title>
                </circle>
              ))}
              <text x={X(last.month) + 6} y={last.month >= 44 ? labelY.get(l.id) : Y(last.v) + 4} fontSize={on ? 12.5 : 11} fontWeight={on ? 700 : 400} fill={on ? "#b8372d" : "#9a9490"} stroke="#fff" strokeWidth={3} paintOrder="stroke">{l.name}</text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: 12, color: "#9a9490", marginTop: 4 }}>
        {byChange ? "% change since each president's first month in office" : m.label}, months 1–48 of each term. Highlighted: {lines.find(l => l.id === focus)?.name ?? "current term"}.
      </figcaption>
    </figure>
  );
}
