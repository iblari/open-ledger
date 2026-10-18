"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import type { SeriesData } from "@/lib/series";
import { fmtVal } from "@/lib/chart-format";
export { fmtVal };

/**
 * The claim chart: the official series behind a verdict, with what was said
 * drawn on it.
 *   - range: 1Y / 5Y / 10Y / Max
 *   - crosshair + tooltip (mouse, touch-drag, ← → keys)
 *   - "Said" line and the gap to the real number at the time of the claim
 *   - claim-date marker; "since …" marker with the change since then
 *   - presidential terms shaded, with each term's average (when the claim
 *     compares administrations)
 *   - several countries as separate lines, toggled from the legend
 */
const C = {
  ink: "#14110E", sub: "#5F5850", mute: "#8C8479", rule: "#E8E3DA", grid: "#EFEAE2",
  said: "#6F6860", gapBad: "#B8372D", gapOk: "#0E7477",
};
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,monospace";
const LINE_COLORS = ["#B8372D", "#1F5F8B", "#0E7477", "#A67C00", "#6B4FA0"];
const TERMS = [
  { name: "Obama", from: "2009-01-20", to: "2017-01-20", party: "D" },
  { name: "Trump I", from: "2017-01-20", to: "2021-01-20", party: "R" },
  { name: "Biden", from: "2021-01-20", to: "2025-01-20", party: "D" },
  { name: "Trump II", from: "2025-01-20", to: "2029-01-20", party: "R" },
];
const RANGES = [["1Y", 1], ["5Y", 5], ["10Y", 10], ["Max", 99]] as const;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const t = (d: string) => Date.parse(d.length === 10 ? d + "T12:00:00Z" : d);
function dateLabel(ms: number, freq: SeriesData["freq"]): string {
  const d = new Date(ms);
  if (freq === "a") return String(d.getUTCFullYear());
  if (freq === "q") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (freq === "w") return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function fmtDiff(d: number, unit: string, dec: number): string {
  const a = Math.abs(d);
  if (unit === "%") return `${a.toFixed(dec)} pts`;
  return fmtVal(a, unit, dec);
}

export interface ProChartProps {
  data: SeriesData;
  said: number | null;
  saidLine?: string | null;      // line key the said value belongs to
  claimDate: string;             // ISO
  since?: string | null;
  terms?: boolean;
  tone: string;                  // verdict colour
  saidChange?: number | null;    // a claimed % change ("plunged 22%") — drawn on the yearly-change view
  repeats?: { date: string; videoId: string; t?: number; rating: string }[];   // same claim, other broadcasts
  watchHref?: string;            // the moment it was said
  fullRange?: boolean;           // start on "Max" (short series from cited sources)
  compact?: boolean;             // phone list view: reading + chart only
}

/** Year-over-year % change of a line (periods per year by frequency). */
function yoyLines(d: SeriesData): SeriesData {
  const per = d.freq === "w" ? 52 : d.freq === "q" ? 4 : d.freq === "a" ? 1 : 12;
  return {
    ...d, unit: "%", decimals: 1, label: `${d.label} — change vs a year earlier`,
    lines: d.lines.map(l => ({ ...l, points: l.points.flatMap((p, i) => i >= per && l.points[i - per].v ? [{ d: p.d, v: (p.v / l.points[i - per].v - 1) * 100 }] : []) })),
  };
}

/** Only draw a claimed value the series could actually take (a "-22%" on a
 *  count of deaths, or "$50,000" on the S&P 500 index, is a different measure). */
function plausible(said: number | null, vals: number[], unit = ""): number | null {
  if (said == null || !vals.length) return null;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mn >= 0 && said < 0) return null;
  if (mx <= 0 && said > 0) return null;
  const big = Math.max(Math.abs(mn), Math.abs(mx)), small = Math.min(Math.abs(mn), Math.abs(mx));
  // Rates can be claimed wildly wrong ("300% inflation" vs 42%); other units
  // that far off are a different measure.
  if (Math.abs(said) > (unit === "%" ? big * 12 + 10 : big * 4 + 1)) return null;
  if (mn > 0 && said < small * 0.2) return null;
  return said;
}

export default function ProChart(props: ProChartProps) {
  const { saidLine, saidChange, repeats = [], watchHref } = props;
  // "+ Compare": a related same-unit series, or the US next to other countries.
  const [cmp, setCmp] = useState<SeriesData | null>(null);
  const [cmpOn, setCmpOn] = useState(false);
  const [cmpBusy, setCmpBusy] = useState(false);
  const base = props.data;
  const wbNoUS = base.source === "World Bank" && !base.lines.some(l => l.key === "USA");
  const toggleCmp = () => {
    if (cmpOn) { setCmpOn(false); return; }
    if (cmp) { setCmpOn(true); return; }
    const url = wbNoUS ? `/api/series?id=${base.id}&c=${[...base.lines.map(l => l.key), "USA"].join(",")}` : base.related ? `/api/series?id=${base.related.id}` : null;
    if (!url) return;
    setCmpBusy(true);
    fetch(url).then(r => r.json()).then(d => { if (d && !d.error) { setCmp(d); setCmpOn(true); } }).catch(() => {}).finally(() => setCmpBusy(false));
  };
  const raw: SeriesData = useMemo(() => {
    if (!cmpOn || !cmp) return base;
    if (wbNoUS) return { ...base, lines: cmp.lines };
    return { ...base, lines: [...base.lines, { key: "cmp", name: cmp.label, points: cmp.lines[0].points }] };
  }, [base, cmp, cmpOn, wbNoUS]);
  // The figure as PUBLISHED when the claim was made (FRED/ALFRED), to show
  // revisions since — sometimes the speaker had the number right at the time.
  const [asOf, setAsOf] = useState<{ d: string; v: number } | null>(null);
  useEffect(() => {
    if (base.source !== "FRED") return;
    let alive = true;
    fetch(`/api/series?id=${base.id}&asof=${props.claimDate.slice(0, 10)}`).then(r => r.json()).then(d => { if (alive && d?.asOf) setAsOf(d.asOf); }).catch(() => {});
    return () => { alive = false; };
  }, [base.id, base.source, props.claimDate]);
  // Level vs yearly-change view (non-rate series only). A claimed % change
  // opens on the change view, where it can be compared like for like.
  const canYoy = raw.unit !== "%" && raw.freq !== "a";
  const levelSaid = plausible(props.said, (raw.lines.find(l => l.key === saidLine) || raw.lines[0])?.points.map(p => p.v) || [], raw.unit);
  const [view, setView] = useState<"level" | "yoy">(canYoy && levelSaid == null && saidChange != null ? "yoy" : "level");
  const yoy = useMemo(() => (canYoy ? yoyLines(raw) : raw), [raw, canYoy]);
  const data = view === "yoy" ? yoy : raw;
  const said = view === "yoy" ? (saidChange ?? null) : levelSaid;
  const { claimDate, since, terms, tone } = props;
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(es => { const w = Math.round(es[0].contentRect.width); if (w > 0) setW(w); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const phone = W < 520;
  const compact = !!props.compact;
  const H = compact ? 150 : phone ? 230 : 280;
  const M = { l: phone ? 40 : 52, r: phone ? 10 : 16, t: 28, b: 26 };

  // Default range: enough to see the claim in context.
  const claimMs = t(claimDate);
  const defaultRange = useMemo(() => {
    if (data.freq === "a" || props.fullRange) return 99;
    if (terms) return 10;
    if (since) { const yrs = (claimMs - t(since)) / (365.25 * 864e5); return yrs < 0.9 ? 1 : yrs < 4.5 ? 5 : 10; }
    return 5;
  }, [data.freq, terms, since, claimMs, props.fullRange]);
  const [range, setRange] = useState<number>(defaultRange);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);   // ms
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { setDrawn(false); const id = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(id); }, [range, W, view]);

  const multi = data.lines.filter(l => l.key !== "cmp").length > 1;
  const color = (i: number) => (data.lines[i]?.key === "cmp" ? "#4A6E8A" : multi ? LINE_COLORS[i % LINE_COLORS.length] : tone);
  const allMax = Math.max(...data.lines.flatMap(l => l.points.map(p => t(p.d))));
  const x0 = range >= 99 ? Math.min(...data.lines.flatMap(l => l.points.map(p => t(p.d)))) : Math.min(allMax, claimMs) - range * 365.25 * 864e5;
  const x1 = Math.max(allMax, claimMs);
  const lines = data.lines.map((l, i) => ({ ...l, color: color(i), pts: l.points.map(p => ({ ms: t(p.d), v: p.v })).filter(p => p.ms >= x0 - 40 * 864e5) }))
    .filter(l => l.pts.length > 0);
  const visible = lines.filter(l => !hidden.has(l.key));
  if (!lines.length || !visible.length) return null;

  const vals = visible.flatMap(l => l.pts.map(p => p.v)).concat(said != null ? [said] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const y = scaleLinear().domain([Math.min(lo, lo >= 0 && hi > 0 && lo / hi < 0.35 ? 0 : lo), hi]).nice(5).range([H - M.b, M.t]);
  const x = scaleTime().domain([x0, x1]).range([M.l, W - M.r]);
  const yTicks = y.ticks(phone ? 4 : 5);
  const xTicks = x.ticks(phone ? 4 : 6);
  const xFmt = (d: Date) => (range <= 1 && data.freq !== "a" ? `${MON[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? " " + d.getUTCFullYear() : ""}` : String(d.getUTCFullYear()));
  const dec = data.decimals;
  const fv = (v: number) => fmtVal(v, data.unit, dec);
  const yFmt = (v: number) => {
    if (data.unit === "%") return `${+v.toFixed(2)}%`;
    const a = Math.abs(v), s = a >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : a >= 1e4 ? `${+(v / 1e3).toFixed(0)}K` : `${+v.toFixed(a < 10 ? 2 : 0)}`;
    return data.unit.startsWith("$") ? `$${s.replace("-", "")}`.replace("$", v < 0 ? "-$" : "$") : s;
  };

  const lineGen = d3line<{ ms: number; v: number }>().x(p => x(p.ms)).y(p => y(p.v)).curve(curveMonotoneX);
  const areaGen = d3area<{ ms: number; v: number }>().x(p => x(p.ms)).y0(H - M.b).y1(p => y(p.v)).curve(curveMonotoneX);

  // The reading in force when the claim was made (latest point on/before it).
  const saidL = (saidLine && lines.find(l => l.key === saidLine)) || lines[0];
  const atClaim = saidL?.pts.filter(p => p.ms <= claimMs + 864e5).slice(-1)[0] ?? saidL?.pts.slice(-1)[0];
  const gap = said != null && atClaim ? atClaim.v - said : null;
  const close = gap != null && Math.abs(gap) <= Math.max(Math.abs(said!) * 0.05, data.unit === "%" ? 0.15 : 0);
  const sinceMs = since ? t(since) : null;
  const atSince = sinceMs != null && saidL ? saidL.pts.filter(p => p.ms <= sinceMs + 20 * 864e5).slice(-1)[0] : null;
  const latest = saidL?.pts.slice(-1)[0];

  // Term bands + averages (single-line US series only).
  const bands = terms || (!multi && data.freq !== "a") ? TERMS.map(tm => ({ ...tm, a: Math.max(t(tm.from), x0), b: Math.min(t(tm.to), x1) })).filter(b => b.b > b.a) : [];
  const avgs = terms && !multi ? bands.map(b => {
    const ps = lines[0].pts.filter(p => p.ms >= t(b.from) && p.ms < t(b.to));
    return ps.length ? { ...b, avg: ps.reduce((s, p) => s + p.v, 0) / ps.length } : null;
  }).filter((b): b is NonNullable<typeof b> => !!b) : [];

  // ── When was the claim last TRUE? Over the whole history, mark readings
  // within a small tolerance of what was said, or where the line crossed it.
  const fullMain = (data.lines.find(l => l.key === saidL.key) || data.lines[0]).points.map(p => ({ ms: t(p.d), v: p.v }));
  const tol = said != null ? Math.max(Math.abs(said) * 0.03, data.unit === "%" ? 0.1 : 0) : 0;
  const trueIdx: boolean[] = said == null ? [] : fullMain.map((p, i) => Math.abs(p.v - said) <= tol
    || (i > 0 && Math.sign(fullMain[i - 1].v - said) !== Math.sign(p.v - said)));
  const trueSegs: [number, number][] = [];
  if (said != null) {
    let a: number | null = null;
    fullMain.forEach((p, i) => {
      if (trueIdx[i] && a == null) a = i;
      if ((!trueIdx[i] || i === fullMain.length - 1) && a != null) { const b = trueIdx[i] ? i : i - 1; trueSegs.push([fullMain[a].ms - 15 * 864e5, fullMain[b].ms + 15 * 864e5]); a = null; }
    });
  }
  const trueBefore = said != null ? fullMain.filter((p, i) => trueIdx[i] && p.ms <= claimMs + 864e5) : [];
  const lastTrue = trueBefore.length ? trueBefore[trueBefore.length - 1] : null;
  const trueNow = !!(lastTrue && atClaim && lastTrue.ms === atClaim.ms);
  const firstYear = fullMain.length ? new Date(fullMain[0].ms).getUTCFullYear() : null;

  // ── Rank: where the reading at the claim sits in all of history.
  const rank = atClaim && fullMain.length > 24 ? fullMain.filter(p => p.v < atClaim.v).length / fullMain.length : null;

  // ── Year-on-year change of the reading (level view, non-rate series).
  const yearAgo = atClaim ? fullMain.filter(p => p.ms <= atClaim.ms - 360 * 864e5).slice(-1)[0] : null;

  // ── Revisions: the value published then vs the same period now.
  const revisedNow = asOf && view === "level" ? fullMain.find(p => Math.abs(p.ms - t(asOf.d)) < 2 * 864e5) : null;
  const revised = asOf && revisedNow && Math.abs(revisedNow.v - asOf.v) >= Math.pow(10, -dec) * 0.6 ? revisedNow : null;

  // ── Recessions (US series), shaded.
  const recs = (raw.recessions || []).map(([a, b]) => [Math.max(t(a), x0), Math.min(t(b), x1)] as const).filter(([a, b]) => b > a);

  // ── Repeat trail: each other time the claim was made, on the line.
  const trail = repeats.map(r => ({ ...r, ms: t(r.date) })).filter(r => r.ms >= x0 && r.ms <= x1 + 864e5);

  // ── Plain-English caption, computed (never generated).
  const caption = (() => {
    if (!atClaim) return "";
    const parts: string[] = [];
    const when = atClaim.ms <= claimMs + 864e5 ? "when this was said" : "most recently";
    const name = raw.label.split(" (")[0].replace(/ — .*/, "");
    parts.push(view === "yoy" ? `The yearly change in ${name.replace(/^US /, "US ").toLowerCase()} was ${fv(atClaim.v)} ${when}` : `${name} was ${fv(atClaim.v)} ${when}`);
    if (said != null && gap != null) parts[0] += close ? ", in line with the claim" : `, ${fmtDiff(gap, data.unit, dec)} ${gap > 0 ? "above" : "below"} the claimed ${fv(said)}`;
    if (view === "level" && yearAgo && data.unit !== "%" && yearAgo.v) {
      const ch = (atClaim.v / yearAgo.v - 1) * 100;
      parts.push(`${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(1)}% from a year earlier`);
    } else if (yearAgo && data.unit === "%") {
      const ch = atClaim.v - yearAgo.v;
      parts.push(`${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(dec)} pts from a year earlier`);
    }
    return parts.join(", ") + ".";
  })();

  // Hover: nearest point per visible line.
  const nearest = (l: typeof lines[number], ms: number) => {
    let best = l.pts[0], bd = Infinity;
    for (const p of l.pts) { const d = Math.abs(p.ms - ms); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  const hoverMs = hover != null ? nearest(saidL, hover).ms : null;
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const ms = x.invert(((clientX - r.left) / r.width) * W).getTime();
    setHover(Math.max(x0, Math.min(x1, ms)));
  };
  const step = (dir: number) => {
    const pts = saidL.pts; const cur = hoverMs ?? pts[pts.length - 1].ms;
    const i = pts.findIndex(p => p.ms === cur);
    const n = pts[Math.max(0, Math.min(pts.length - 1, i + dir))];
    if (n && n.ms >= x0) setHover(n.ms);
  };

  // Header reading: hovered point, else the reading at the claim.
  const head = hoverMs != null ? hoverMs : atClaim?.ms ?? latest?.ms;
  const headVals = visible.map(l => ({ l, p: head != null ? nearest(l, head) : null }));
  const headMain = headVals.find(h => h.l.key === saidL.key) ?? headVals[0];

  const sayY = said != null ? y(said) : null;
  const claimX = x(Math.min(claimMs, x1));
  const tipX = hoverMs != null ? x(hoverMs) : null;

  return (
    <div ref={box} style={{ fontFamily: SANS, userSelect: "none" }}>
      {/* Reading */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.mute }}>
            {hoverMs != null ? dateLabel(hoverMs, data.freq) : atClaim && atClaim.ms <= claimMs + 864e5 ? `When it was said · ${dateLabel(atClaim.ms, data.freq)}` : `Latest · ${latest ? dateLabel(latest.ms, data.freq) : ""}`}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            {headMain?.p && <span style={{ fontFamily: MONO, fontSize: compact ? 20 : phone ? 24 : 28, fontWeight: 500, color: C.ink, letterSpacing: "-0.02em" }}>{fv(headMain.p.v)}</span>}
            {multi && headVals.filter(h => h !== headMain && h.p).map(h => (
              <span key={h.l.key} style={{ fontFamily: MONO, fontSize: 14, color: h.l.color }}>{h.l.name.split(",")[0]} {fv(h.p!.v)}</span>
            ))}
            {said != null && headMain?.p && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: Math.abs(headMain.p.v - said) <= Math.max(Math.abs(said) * 0.05, 0.15) ? C.gapOk : C.gapBad, background: Math.abs(headMain.p.v - said) <= Math.max(Math.abs(said) * 0.05, 0.15) ? "#E3F1EE" : "#F8E4E1", padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
                {Math.abs(headMain.p.v - said) <= Math.max(Math.abs(said) * 0.05, 0.15) ? "≈ what was said" : `${fmtDiff(headMain.p.v - said, data.unit, dec)} ${headMain.p.v > said ? "above" : "below"} what was said (${fv(said)})`}
              </span>
            )}
          </div>
          {!compact && hoverMs == null && caption && (
            <div style={{ fontSize: 13, color: C.sub, marginTop: 4, lineHeight: 1.45, maxWidth: 560 }}>{caption}</div>
          )}
          {!compact && hoverMs == null && (said != null || rank != null || revised || (asOf && view === "level")) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {said != null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: trueNow ? C.gapOk : "#5E7A3A", background: trueNow ? "#E3F1EE" : "#EEF3E3", padding: "3px 8px", borderRadius: 6 }}>
                  {trueNow ? "True at the time" : lastTrue ? `Last true: ${dateLabel(lastTrue.ms, data.freq)}` : `Not true at any point since ${firstYear}`}
                </span>
              )}
              {rank != null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, background: "#F1ECE4", padding: "3px 8px", borderRadius: 6 }}>
                  {rank === 0 ? `Lowest reading since ${firstYear}` : rank >= (fullMain.length - 1) / fullMain.length ? `Highest reading since ${firstYear}` : `${rank >= 0.5 ? `Higher than ${Math.round(rank * 100)}%` : `Lower than ${Math.round((1 - rank) * 100)}%`} of readings since ${firstYear}`}
                </span>
              )}
              {asOf && view === "level" && (
                <span title="The figure as first published, before later revisions (ALFRED)" style={{ fontSize: 12, fontWeight: 600, color: revised ? "#8A5A00" : C.sub, background: revised ? "#FBF1DC" : "#F1ECE4", padding: "3px 8px", borderRadius: 6 }}>
                  Published then: {fv(asOf.v)} ({dateLabel(t(asOf.d), data.freq)}){revised ? ` · since revised to ${fv(revised.v)}` : " · unrevised"}
                </span>
              )}
            </div>
          )}
          {!compact && atSince && latest && hoverMs == null && (
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
              Since {dateLabel(t(since!), data.freq === "a" ? "a" : "m")}: <b style={{ fontFamily: MONO, fontWeight: 500, color: C.ink }}>{fv(atSince.v)} → {fv(latest.v)}</b>{" "}
              ({latest.v >= atSince.v ? "+" : "−"}{fmtDiff(latest.v - atSince.v, data.unit, dec)}{data.unit !== "%" && atSince.v ? `, ${latest.v >= atSince.v ? "+" : "−"}${Math.abs((latest.v / atSince.v - 1) * 100).toFixed(1)}%` : ""})
            </div>
          )}
        </div>
        {!compact && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {canYoy && (
          <div role="tablist" aria-label="View" style={{ display: "flex", background: "#F1ECE4", borderRadius: 99, padding: 2 }}>
            {([["level", "Level"], ["yoy", "Yearly change"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} style={{
                border: "none", cursor: "pointer", borderRadius: 99, padding: "4px 10px", fontFamily: SANS, fontSize: 12, fontWeight: view === k ? 700 : 500,
                background: view === k ? "#fff" : "transparent", color: view === k ? C.ink : C.sub, boxShadow: view === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}>{l}</button>
            ))}
          </div>
        )}
        <div role="tablist" aria-label="Range" style={{ display: "flex", background: "#F1ECE4", borderRadius: 99, padding: 2 }}>
          {RANGES.filter(([, n]) => data.freq !== "a" || n >= 5).map(([l, n]) => (
            <button key={l} type="button" role="tab" aria-selected={range === n} onClick={() => setRange(n)} style={{
              border: "none", cursor: "pointer", borderRadius: 99, padding: "4px 10px", fontFamily: SANS, fontSize: 12, fontWeight: range === n ? 700 : 500,
              background: range === n ? "#fff" : "transparent", color: range === n ? C.ink : C.sub, boxShadow: range === n ? "0 1px 2px rgba(0,0,0,.08)" : "none",
            }}>{l}</button>
          ))}
        </div>
        </div>}
      </div>

      {/* Chart */}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
        aria-label={`${data.label}${said != null ? `, against the claimed ${fv(said)}` : ""}. Use arrow keys to read values.`}
        style={{ display: "block", touchAction: "pan-y", cursor: "crosshair", outline: "none", overflow: "visible" }}
        onPointerDown={e => { if (e.pointerType !== "mouse") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } } pick(e.clientX, e.currentTarget); }}
        onPointerMove={e => { if (e.pointerType === "mouse" || e.buttons) pick(e.clientX, e.currentTarget); }}
        onPointerLeave={e => { if (e.pointerType === "mouse") setHover(null); }}
        onPointerUp={e => { if (e.pointerType !== "mouse") setTimeout(() => setHover(null), 2500); }}
        onKeyDown={e => { if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); step(1); } else if (e.key === "Escape") setHover(null); }}>
        <defs>
          {lines.map(l => (
            <linearGradient key={l.key} id={`g-${uid}-${l.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={l.color} stopOpacity={multi ? 0 : 0.18} />
              <stop offset="100%" stopColor={l.color} stopOpacity={0} />
            </linearGradient>
          ))}
          <clipPath id={`clip-${uid}`}><rect x={M.l} y={0} width={drawn ? W - M.l - M.r : 0} height={H} style={{ transition: "width .9s cubic-bezier(.2,.7,.2,1)" }} /></clipPath>
        </defs>

        {/* term bands */}
        {bands.map(b => (
          <g key={b.name}>
            <rect x={x(b.a)} y={M.t} width={x(b.b) - x(b.a)} height={H - M.t - M.b} fill={b.party === "D" ? "#EAF0F7" : "#F7ECEA"} opacity={terms ? 0.9 : 0.45} />
            {x(b.b) - x(b.a) > 44 && <text x={(x(b.a) + x(b.b)) / 2} y={M.t + 12} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={b.party === "D" ? "#4A6E8A" : "#9A5A50"} letterSpacing=".06em">{b.name.toUpperCase()}</text>}
          </g>
        ))}

        {/* recessions */}
        {!multi && recs.map(([a, b], i) => (
          <g key={`r${i}`}>
            <rect x={x(a)} y={M.t} width={Math.max(2, x(b) - x(a))} height={H - M.t - M.b} fill="#8C8479" opacity={0.13} />
            {x(b) - x(a) > 30 && <text x={x(a) + 3} y={H - M.b - 6} fontSize={9.5} fontWeight={700} fill={C.mute} letterSpacing=".05em">RECESSION</text>}
          </g>
        ))}
        {/* when the claim was true */}
        {trueSegs.map(([a, b], i) => b >= x0 && a <= x1 ? (
          <rect key={`t${i}`} x={x(Math.max(a, x0))} y={M.t} width={Math.max(2, x(Math.min(b, x1)) - x(Math.max(a, x0)))} height={H - M.t - M.b} fill="#5E9A3A" opacity={0.16} />
        ) : null)}

        {/* grid */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#CFC8BC" : C.grid} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={C.mute}>{yFmt(v)}</text>
          </g>
        ))}
        {xTicks.map(d => <text key={+d} x={x(d)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.mute}>{xFmt(d)}</text>)}

        {/* term averages */}
        {avgs.map(a => (
          <g key={a.name}>
            <line x1={x(a.a)} x2={x(a.b)} y1={y(a.avg)} y2={y(a.avg)} stroke={a.party === "D" ? "#4A6E8A" : "#9A5A50"} strokeWidth={1.5} strokeDasharray="2 3" />
            {x(a.b) - x(a.a) > 60 && <text x={x(a.b) - 4} y={y(a.avg) - 5} textAnchor="end" fontSize={10.5} fontWeight={600} fill={a.party === "D" ? "#4A6E8A" : "#9A5A50"} stroke="#fff" strokeWidth={3} paintOrder="stroke">avg {fv(a.avg)}</text>}
          </g>
        ))}

        {/* reference lines */}
        {view === "level" && raw.ref && raw.ref.v >= y.domain()[0] && raw.ref.v <= y.domain()[1] && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(raw.ref.v)} y2={y(raw.ref.v)} stroke="#0E7477" strokeWidth={1.2} strokeDasharray="1 4" strokeLinecap="round" />
            <text x={W - M.r - 4} y={y(raw.ref.v) + 13} textAnchor="end" fontSize={10.5} fontWeight={600} fill="#0E7477" stroke="#fff" strokeWidth={3} paintOrder="stroke">{raw.ref.label}</text>
          </g>
        )}
        {view === "level" && raw.prepandemic && x0 <= t(raw.prepandemic.d) && raw.prepandemic.v >= y.domain()[0] && raw.prepandemic.v <= y.domain()[1] && (
          <g>
            <line x1={x(t(raw.prepandemic.d))} x2={W - M.r} y1={y(raw.prepandemic.v)} y2={y(raw.prepandemic.v)} stroke="#6B4FA0" strokeWidth={1.2} strokeDasharray="1 4" strokeLinecap="round" />
            <text x={W - M.r - 4} y={y(raw.prepandemic.v) - 5} textAnchor="end" fontSize={10.5} fontWeight={600} fill="#6B4FA0" stroke="#fff" strokeWidth={3} paintOrder="stroke">pre-pandemic {fv(raw.prepandemic.v)}</text>
          </g>
        )}

        {/* series */}
        <g clipPath={`url(#clip-${uid})`}>
          {visible.map(l => (
            <g key={l.key}>
              {!multi && <path d={areaGen(l.pts) || ""} fill={`url(#g-${uid}-${l.key})`} />}
              <path d={lineGen(l.pts) || ""} fill="none" stroke={l.color} strokeWidth={multi ? 2 : 2.4} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
        </g>

        {/* since marker */}
        {sinceMs != null && sinceMs >= x0 && (
          <g>
            <line x1={x(sinceMs)} x2={x(sinceMs)} y1={M.t} y2={H - M.b} stroke={C.sub} strokeDasharray="3 3" />
            <text x={x(sinceMs) + 4} y={H - M.b - 6} fontSize={10.5} fill={C.sub}>since</text>
          </g>
        )}

        {/* said line */}
        {sayY != null && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={sayY} y2={sayY} stroke={C.said} strokeWidth={1.6} strokeDasharray="6 5" />
            <g transform={`translate(${M.l + 4},${Math.max(M.t + 2, Math.min(H - M.b - 20, sayY - 22))})`}>
              <rect width={phone ? 92 : 112} height={18} rx={9} fill="#fff" stroke={C.said} strokeWidth={1} />
              <text x={(phone ? 92 : 112) / 2} y={12.5} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.said}>Said: {fv(said!)}</text>
            </g>
          </g>
        )}

        {/* repeat trail: the same claim said on other days */}
        {trail.map((r, i) => {
          const p = nearest(saidL, r.ms);
          return (
            <a key={i} href={`/live?v=${r.videoId}${r.t != null ? `&t=${Math.floor(r.t)}` : ""}`} onPointerDown={e => e.stopPropagation()}>
              <title>{`Said again ${dateLabel(r.ms, "w")} — watch`}</title>
              <line x1={x(p.ms)} x2={x(p.ms)} y1={y(p.v) - 14} y2={y(p.v) - 4} stroke={tone} strokeWidth={1.5} />
              <circle cx={x(p.ms)} cy={y(p.v) - 17} r={4} fill="#fff" stroke={tone} strokeWidth={2} style={{ cursor: "pointer" }} />
            </a>
          );
        })}

        {/* claim marker + gap */}
        {atClaim && (
          <g>
            <line x1={claimX} x2={claimX} y1={M.t} y2={H - M.b} stroke={C.ink} strokeOpacity={0.35} />
            {watchHref ? (
              <a href={watchHref} onPointerDown={e => e.stopPropagation()}>
                <title>Watch the moment it was said</title>
                <rect x={claimX - 64} y={M.t - 20} width={62} height={17} rx={8.5} fill={C.ink} />
                <text x={claimX - 33} y={M.t - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" letterSpacing=".04em" style={{ cursor: "pointer" }}>▶ CLAIM</text>
              </a>
            ) : (
              <text x={claimX - 4} y={M.t - 6} textAnchor="end" fontSize={10.5} fontWeight={700} fill={C.ink} letterSpacing=".04em">CLAIM</text>
            )}
            {sayY != null && gap != null && !close && Math.abs(sayY - y(atClaim.v)) >= 22 && (
              <g>
                <line x1={x(atClaim.ms)} x2={x(atClaim.ms)} y1={sayY} y2={y(atClaim.v)} stroke={C.gapBad} strokeWidth={3} strokeOpacity={0.35} />
                <text x={x(atClaim.ms) - 8} y={(sayY + y(atClaim.v)) / 2 + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={C.gapBad}
                  stroke="#fff" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">off by {fmtDiff(gap, data.unit, dec)}</text>
              </g>
            )}
            <circle cx={x(atClaim.ms)} cy={y(atClaim.v)} r={5.5} fill={saidL.color} stroke="#fff" strokeWidth={2} />
            {sayY != null && <circle cx={x(atClaim.ms)} cy={sayY} r={4.5} fill="#fff" stroke={C.said} strokeWidth={2} />}
          </g>
        )}

        {/* crosshair */}
        {tipX != null && (
          <g pointerEvents="none">
            <line x1={tipX} x2={tipX} y1={M.t} y2={H - M.b} stroke={C.ink} strokeOpacity={0.5} />
            {visible.map(l => { const p = nearest(l, hoverMs!); return <circle key={l.key} cx={x(p.ms)} cy={y(p.v)} r={4.5} fill={l.color} stroke="#fff" strokeWidth={2} />; })}
          </g>
        )}
      </svg>

      {/* legend / source */}
      {!compact && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11.5, color: C.mute }}>
        {multi && lines.map(l => (
          <button key={l.key} type="button" onClick={() => setHidden(h => { const n = new Set(h); if (n.has(l.key)) n.delete(l.key); else if (n.size < lines.length - 1) n.add(l.key); return n; })}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.rule}`, background: hidden.has(l.key) ? "transparent" : "#fff", borderRadius: 99, padding: "3px 9px", cursor: "pointer", fontFamily: SANS, fontSize: 12, color: hidden.has(l.key) ? C.mute : C.ink, textDecoration: hidden.has(l.key) ? "line-through" : "none" }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: l.color }} />{l.name}
          </button>
        ))}
        {(base.related || wbNoUS) && (
          <button type="button" onClick={toggleCmp} disabled={cmpBusy} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${cmpOn ? "#4A6E8A" : C.rule}`, background: cmpOn ? "#E4ECF2" : "#fff", borderRadius: 99, padding: "3px 10px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, color: "#4A6E8A" }}>
            {cmpBusy ? "Loading…" : cmpOn ? "✓ " : "+ Compare: "}{!cmpBusy && (wbNoUS ? "United States" : base.related!.label.replace(/^US /, ""))}
          </button>
        )}
        {cmpOn && !wbNoUS && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
            <span style={{ width: 12, height: 3, borderRadius: 2, background: tone }} />{base.label.replace(/^US /, "")}
            <span style={{ width: 12, height: 3, borderRadius: 2, background: "#4A6E8A", marginLeft: 6 }} />{cmp?.label.replace(/^US /, "")}
          </span>
        )}
        {trail.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
            <span style={{ width: 8, height: 8, borderRadius: 5, border: `2px solid ${tone}` }} />said {trail.length + 1} times — tap a dot to watch
          </span>
        )}
        {said != null && trueSegs.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.sub }}>
            <span style={{ width: 10, height: 10, background: "#5E9A3A", opacity: 0.35, borderRadius: 2 }} />when the claim held
          </span>
        )}
        <span style={{ marginLeft: multi ? "auto" : 0 }}>
          {data.label} · <a href={data.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0E7477", textDecoration: "none" }}>{data.source} ↗</a>
          {!phone && " · drag or use ← → to read"}
        </span>
      </div>}
    </div>
  );
}
