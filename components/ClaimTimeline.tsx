import Link from "next/link";
import type { ClaimTimeline as T } from "@/lib/claim-timeline";
import { toOutcome, VERDICT_COLOR, VERDICT_LABEL } from "@/lib/live-design";

/**
 * "Every time it was said" — server-rendered. With a series: the official
 * line (as revised today), the claimed value, and one dot per time it was
 * said, placed at the figure published that day and coloured by the verdict
 * given then. Without a series: the same dots on a time axis.
 * Two drawings (wide / phone), switched by CSS like BenchChart.
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ny = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
const nyShort = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const obsLabel = (d: string, id: string) => (id === "gas" || id === "diesel" ? `week of ${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`);

function fmt(v: number, unit: string, dec: number) {
  const n = v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (unit === "%") return `${n}%`;
  if (unit.startsWith("$")) return `$${n}${unit === "$" ? "" : unit.slice(1)}`;
  return `${n} ${unit}`;
}

/** Short axis label: the number with a compact unit ("159.1M", "3.7%", "$4.27"). */
function axis(v: number, unit: string) {
  const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  const n = v.toFixed(unit === "%" ? 1 : d);
  if (unit === "%") return `${n}%`;
  if (unit.startsWith("$")) return `$${n}`;
  const m = unit.match(/^(K|M|B|T)\b/);
  return m ? `${v.toFixed(1)}${m[1]}` : n;
}

export default function ClaimTimeline({ t }: { t: T }) {
  const counts = new Map<string, number>();
  for (const o of t.occ) { const v = toOutcome(o.rating); counts.set(v, (counts.get(v) || 0) + 1); }
  const order = ["true", "misleading", "false", "projection", "unconfirmed", "unverifiable"] as const;
  const tally = order.filter(v => counts.get(v)).map(v => `${counts.get(v)} ${VERDICT_LABEL[v].toLowerCase()}`).join(" · ");
  const differ = counts.size > 1;
  const first = t.occ[0].date, last = t.occ[t.occ.length - 1].date;

  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontFamily: "var(--font-serif, Georgia, serif)", fontWeight: 500, fontSize: 21, margin: "0 0 4px" }}>Every time it was said</h2>
      <div style={{ fontSize: 13.5, color: "#5F5850", marginBottom: 12 }}>
        {t.occ.length} times, {ny(first)} to {ny(last)} · {tally}{t.series ? <> · against {t.series.label} ({t.series.source})</> : null}
      </div>
      <div style={{ background: "#fff", border: "1px solid #E2DED6", borderRadius: 10, padding: "12px 12px 8px" }}>
        <style>{`.ct-n{display:none}@media (max-width:640px){.ct-w{display:none}.ct-n{display:block}}`}</style>
        <div className="ct-w"><Chart t={t} W={680} H={t.series ? 240 : 96} /></div>
        <div className="ct-n" aria-hidden data-nosnippet><Chart t={t} W={360} H={t.series ? 220 : 96} /></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11.5, color: "#6F675E", padding: "4px 4px 2px" }}>
          {t.series && <span><span style={{ display: "inline-block", width: 14, borderTop: "2px solid #14110E", verticalAlign: "middle" }} /> {t.series.label}, as revised today</span>}
          {t.series && t.said != null && <span><span style={{ display: "inline-block", width: 14, borderTop: "1.5px dashed #8C8479", verticalAlign: "middle" }} /> the claimed figure</span>}
          {t.series && <span>● figure published the day it was said</span>}
          {order.filter(v => counts.get(v)).map(v => <span key={v}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: VERDICT_COLOR[v], marginRight: 4 }} />{VERDICT_LABEL[v].charAt(0) + VERDICT_LABEL[v].slice(1).toLowerCase()}</span>)}
        </div>
      </div>
      {differ && (
        <p style={{ fontSize: 12.5, color: "#6F675E", lineHeight: 1.55, margin: "10px 0 0" }}>
          The verdicts differ. {t.series ? "Some differences can come from new data between dates (see the figure published each day); others" : "Differences"} come from changes in the wording or in what each check found. Each check is linked below.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {t.occ.map(o => {
          const v = toOutcome(o.rating);
          const row = (
            <span style={{ display: "grid", gridTemplateColumns: "88px minmax(0,1fr) auto", alignItems: "center", gap: 10, background: o.here ? "#FFFEFC" : "#fff", border: `1px solid ${o.here ? "#14110E" : "#E2DED6"}`, borderRadius: 8, padding: "8px 12px", fontSize: 13.5, color: "#14110E" }}>
              <span style={{ color: "#6F675E" }}>{ny(o.date)}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.series && o.published ? <><b style={{ fontWeight: 600 }}>{fmt(o.published.v, t.series.unit, t.series.decimals)}</b> <span style={{ color: "#8C8479" }}>({obsLabel(o.published.d, t.series.id)}) · </span></> : null}
                <span style={{ color: t.series ? "#8C8479" : "#14110E" }}>{o.here ? "This page" : o.title}</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: VERDICT_COLOR[v] }}>{VERDICT_LABEL[v]}</span>
            </span>
          );
          return o.here ? <div key={o.date + "h"}>{row}</div> : <Link key={o.path} href={o.path} style={{ textDecoration: "none" }}>{row}</Link>;
        })}
      </div>
      {t.series && <div style={{ fontSize: 11.5, color: "#8C8479", marginTop: 8 }}>Figures published each day come from <a href={t.series.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{t.series.source}</a> archives (ALFRED), before later revisions.</div>}
    </section>
  );
}

function Chart({ t, W, H }: { t: T; W: number; H: number }) {
  const narrow = W < 500;
  const L = narrow ? 46 : 58, R = 12, Tp = 14, B = 22;
  const ms = (d: string) => Date.parse(d.length === 10 ? d + "T12:00:00Z" : d);
  const occMs = t.occ.map(o => ms(o.date));
  const s = t.series;
  const xs = [...occMs, ...(s ? s.points.map(p => ms(p.d)) : [])];
  let x0 = Math.min(...xs), x1 = Math.max(...xs, Date.now());
  if (!s) { const pad = Math.max((x1 - x0) * 0.06, 5 * 864e5); x0 -= pad; x1 = Math.max(...occMs) + pad; }
  const X = (m: number) => L + ((m - x0) / (x1 - x0 || 1)) * (W - L - R);
  const color = (r: string) => VERDICT_COLOR[toOutcome(r)];

  // Time axis ticks: months (or years for long spans).
  const span = x1 - x0;
  const ticks: { m: number; label: string }[] = [];
  const d0 = new Date(x0), d1 = new Date(x1);
  const stepM = span > 5 * 365 * 864e5 ? 12 : span > 18 * 30 * 864e5 ? (narrow ? 6 : 3) : span > 6 * 30 * 864e5 ? (narrow ? 2 : 1) : 1;
  for (let y = d0.getUTCFullYear(), mo = d0.getUTCMonth() + 1; ; mo += stepM) {
    const dt = Date.UTC(y + Math.floor(mo / 12), mo % 12, 1);
    if (dt > d1.getTime()) break;
    const dd = new Date(dt);
    ticks.push({ m: dt, label: stepM >= 12 || dd.getUTCMonth() === 0 ? `${MON[dd.getUTCMonth()]} ${String(dd.getUTCFullYear()).slice(2)}` : MON[dd.getUTCMonth()] });
    if (ticks.length > 40) break;
  }

  if (!s) {
    const yAx = H - B - 16;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Dates the claim was said, coloured by verdict`}>
        <line x1={L} x2={W - R} y1={yAx} y2={yAx} stroke="#E2DED6" />
        {ticks.map(k => <text key={k.m} x={X(k.m)} y={H - 6} textAnchor="middle" fontSize={11} fill="#8C8479">{k.label}</text>)}
        {t.occ.map((o, i) => (
          <g key={i}>
            <title>{`${ny(o.date)} — ${VERDICT_LABEL[toOutcome(o.rating)]}`}</title>
            <line x1={X(occMs[i])} x2={X(occMs[i])} y1={yAx - 22} y2={yAx} stroke={color(o.rating)} strokeWidth={1.5} />
            <circle cx={X(occMs[i])} cy={yAx - 26} r={o.here ? 7 : 5.5} fill={color(o.rating)} stroke={o.here ? "#14110E" : "#fff"} strokeWidth={o.here ? 2 : 1.5} />
          </g>
        ))}
      </svg>
    );
  }

  const vals = [...s.points.map(p => p.v), ...t.occ.flatMap(o => (o.published ? [o.published.v] : [])), ...(t.said != null ? [t.said] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12; lo -= pad; hi += pad;
  const Y = (v: number) => Tp + (1 - (v - lo) / (hi - lo)) * (H - Tp - B);
  const yTicks = [0, 0.5, 1].map(f => lo + pad + f * (hi - lo - 2 * pad));
  const path = s.points.map((p, i) => `${i ? "L" : "M"}${X(ms(p.d)).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const nearest = (m: number) => s.points.reduce((a, p) => (Math.abs(ms(p.d) - m) < Math.abs(ms(a.d) - m) ? p : a), s.points[0]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${s.label} with each date the claim was said`}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#F0ECE5" />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="#8C8479">{axis(v, s.unit)}</text>
        </g>
      ))}
      {ticks.map(k => <text key={k.m} x={X(k.m)} y={H - 6} textAnchor="middle" fontSize={11} fill="#8C8479">{k.label}</text>)}
      {t.said != null && (
        <g>
          <line x1={L} x2={W - R} y1={Y(t.said)} y2={Y(t.said)} stroke="#8C8479" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W - R - 2} y={Y(t.said) - 5} textAnchor="end" fontSize={11} fontWeight={700} fill="#6F675E" stroke="#fff" strokeWidth={3} paintOrder="stroke">Claimed: {fmt(t.said, s.unit, s.decimals)}</text>
        </g>
      )}
      <path d={path} fill="none" stroke="#14110E" strokeWidth={2} />
      {t.occ.map((o, i) => {
        const x = X(occMs[i]);
        const v = o.published?.v ?? nearest(occMs[i]).v;
        return (
          <g key={i}>
            <title>{`${ny(o.date)}: ${o.published ? `published figure ${fmt(o.published.v, s.unit, s.decimals)} (${obsLabel(o.published.d, s.id)})` : "no published figure found"} — ${VERDICT_LABEL[toOutcome(o.rating)]}`}</title>
            <line x1={x} x2={x} y1={Y(v)} y2={H - B} stroke={color(o.rating)} strokeOpacity={0.35} />
            <circle cx={x} cy={Y(v)} r={o.here ? 6.5 : 5} fill={color(o.rating)} stroke={o.here ? "#14110E" : "#fff"} strokeWidth={o.here ? 2 : 1.5} />
          </g>
        );
      })}
      {!narrow && t.occ.length <= 8 && occMs.every((m, i) => i === 0 || X(m) - X(occMs[i - 1]) > 56) && t.occ.map((o, i) => (
        <text key={"l" + i} x={X(occMs[i])} y={Tp + 2} textAnchor="middle" fontSize={10.5} fill="#8C8479">{nyShort(o.date)}</text>
      ))}
    </svg>
  );
}
