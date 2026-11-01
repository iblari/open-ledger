"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { monthlySeries, fmtBench, type Bench } from "@/lib/bench-lens";
import type { TrendingClaim } from "@/lib/trending-claims";
import type { ClaimChart } from "@/lib/claim-chart";
import { fmtU, unitOf } from "@/lib/chart-format";
import type { ClaimSeries } from "@/lib/claim-series";
import type { SeriesData } from "@/lib/series";
import ProChart from "./ProChart";
import { useIsMobileViewport } from "@/lib/viewport";
import InlinePlayer from "./InlinePlayer";
import ShareClaimButton from "@/components/ShareClaimButton";

/**
 * Trending tab: every True / Mostly true / False claim, newest first, each
 * with a chart of the figure behind the verdict.
 *  - Claims checked against our own series: the real FRED line, with what
 *    was said drawn across it.
 *  - Claims checked on the web: said vs data, plus the dated figures the
 *    cited sources give (each verified word-for-word; lib/claim-chart).
 * Polls every minute, so claims from a live broadcast arrive on their own.
 */
const C = {
  bg: "#f8f5f0", card: "#FFFEFC", ink: "#14110E", sub: "#5F5850", mute: "#8C8479", rule: "#E2DED6",
  false: "#B8372D", falseBg: "#F8E4E1", true: "#0E7477", trueBg: "#E3F1EE", mostly: "#3F8F7E", said: "#9A948C",
};
const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,monospace";

const isTrue = (r: string) => r === "TRUE" || r === "MOSTLY TRUE";
const tone = (r: string) => (isTrue(r) ? C.true : C.false);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const stamp = (t?: number) => t == null ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/* ── Interactive line (hover / drag) ───────────────────────────────── */
function Line({ pts, color, said, fmt, caption }: {
  pts: { label: string; v: number }[]; color: string; said?: number | null; fmt: (v: number) => string; caption: string;
}) {
  const [i, setI] = useState<number | null>(null);
  // Drawn at the container's real width so text stays 11–13px on phones
  // (a fixed viewBox scaled down to 340px shrank labels to ~6px).
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(es => { const w = Math.round(es[0].contentRect.width); if (w > 0) setW(w); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 140 : 150, L = 8, R = 8, T = 26, B = 22;
  const vals = pts.map(p => p.v).concat(said != null ? [said] : []);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn || Math.abs(mx) || 1) * 0.12; mn -= pad; mx += pad;
  const X = (k: number) => L + (pts.length === 1 ? (W - L - R) / 2 : (k / (pts.length - 1)) * (W - L - R));
  const Y = (v: number) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const pick = (cx: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const k = Math.round(((cx - r.left) / r.width * W - L) / (W - L - R) * (pts.length - 1));
    setI(Math.max(0, Math.min(pts.length - 1, k)));
  };
  const sel = i ?? pts.length - 1;
  const few = pts.length <= 8;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", touchAction: "pan-y", cursor: "crosshair", overflow: "visible" }}
        role="img" aria-label={caption}
        onPointerDown={e => { if (e.pointerType !== "mouse") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ } } pick(e.clientX, e.currentTarget); }}
        onPointerMove={e => { if (e.pointerType === "mouse" || e.buttons) pick(e.clientX, e.currentTarget); }}
        onPointerLeave={e => { if (e.pointerType === "mouse") setI(null); }}>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.rule} />
        {said != null && <>
          <line x1={L} x2={W - R} y1={Y(said)} y2={Y(said)} stroke={C.said} strokeDasharray="6 5" strokeWidth={1.5} />
          <text x={W - R} y={Y(said) - 6} textAnchor="end" fontSize={12} fill={C.sub} fontFamily={SANS}>Said: {fmt(said)}</text>
        </>}
        <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        {few && pts.map((p, k) => <circle key={k} cx={X(k)} cy={Y(p.v)} r={k === sel ? 5 : 3.5} fill={color} stroke="#fff" strokeWidth={1.5} />)}
        {!few && <circle cx={X(sel)} cy={Y(pts[sel].v)} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />}
        {i != null && <line x1={X(i)} x2={X(i)} y1={T - 4} y2={H - B} stroke={C.rule} />}
        <text x={L} y={14} fontSize={13} fill={C.ink} fontFamily={SANS} fontWeight={600}>
          {pts[sel].label}: {fmt(pts[sel].v)}
          {said != null && <tspan fill={C.sub} fontWeight={400}>{`  ·  said ${fmt(said)}`}</tspan>}
        </text>
        <text x={L} y={H - 6} fontSize={11} fill={C.mute} fontFamily={SANS}>{pts[0].label}</text>
        <text x={W - R} y={H - 6} fontSize={11} fill={C.mute} fontFamily={SANS} textAnchor="end">{pts[pts.length - 1].label}</text>
      </svg>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.mute, marginTop: 2 }}>{caption}</div>
    </div>
  );
}

/* ── Said vs data bars ─────────────────────────────────────────────── */
function Compare({ said, data, color, fmt }: { said: number | null; data: number; color: string; fmt: (v: number) => string }) {
  const rows: [string, number, string][] = [];
  if (said != null) rows.push(["Said", said, C.said]);
  rows.push(["Data", data, color]);
  const mx = Math.max(...rows.map(r => Math.abs(r[1])), 1e-9);
  return (
    <div style={{ display: "grid", gap: 6, margin: "4px 0 8px" }}>
      {rows.map(([l, v, c]) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "42px 1fr auto", alignItems: "center", gap: 10, fontFamily: SANS }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.mute }}>{l}</span>
          <span style={{ height: 10, background: "#EFEAE2", borderRadius: 5, overflow: "hidden" }}>
            <span style={{ display: "block", height: 10, width: `${Math.max(3, (Math.abs(v) / mx) * 100)}%`, background: c, borderRadius: 5, transition: "width .5s" }} />
          </span>
          <b style={{ fontFamily: MONO, fontWeight: 500, fontSize: 14, color: l === "Data" ? c : C.sub, minWidth: 70, textAlign: "right" }}>{fmt(v)}</b>
        </div>
      ))}
    </div>
  );
}

/* ── One claim ─────────────────────────────────────────────────────── */
function WebChart({ c, color }: { c: TrendingClaim; color: string }) {
  const [chart, setChart] = useState<ClaimChart | null | undefined>(c.chart ?? undefined);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chart !== undefined || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      fetch(`/api/claim-chart?key=${c.key}&v=5`).then(r => r.json()).then(d => { if (alive) setChart(d?.chart ?? null); }).catch(() => alive && setChart(null));
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
  }, [chart, c.key]);

  if (chart === undefined) return (
    <div ref={ref} style={{ padding: "6px 0 10px" }}>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.mute, marginBottom: 6 }}>Reading the sources…</div>
      {[70, 52].map(w => <div key={w} className="tc-skel" style={{ height: 10, width: `${w}%`, background: "#EFEAE2", borderRadius: 5, margin: "6px 0" }} />)}
    </div>
  );
  if (!chart || (!chart.data && chart.points.length < 2)) return null;
  const unit = unitOf(chart);
  const fmt = (v: number) => fmtU(v, unit);
  const src = (n: number) => chart.sources[n];
  return (
    <div style={{ margin: "6px 0 4px" }}>
      {chart.metric && <div style={{ fontFamily: SANS, fontSize: 12, color: C.sub, marginBottom: 4 }}>{chart.metric}</div>}
      {chart.data && <Compare said={chart.said?.value ?? null} data={chart.data.value} color={color} fmt={fmt} />}
      {chart.points.length >= 2 && (
        <Line pts={chart.points.map(p => ({ label: p.label, v: p.value }))} color={color} fmt={fmt}
          said={!chart.data && chart.said && sameScale(chart.said.value, chart.points.map(p => p.value)) ? chart.said.value : null}
          caption={`Hover or drag · figures as published by ${[...new Set(chart.points.map(p => src(p.src)?.url ? host(src(p.src).url) : "our fact-check"))].join(", ")}`} />
      )}
    </div>
  );
}

/** Is a claimed value on the same scale as a line (worth drawing across it)? */
function sameScale(v: number, vals: number[]): boolean {
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || Math.abs(hi) || 1;
  return v >= lo - 3 * span && v <= hi + 3 * span;
}

function MetricChart({ c, bench, color }: { c: TrendingClaim; bench: Bench | null; color: string }) {
  const m = bench && c.metricKey ? bench.metrics[c.metricKey] : null;
  if (!m) return null;
  const s = monthlySeries(m).slice(-36);
  if (s.length < 3) return null;
  const said = c.claimedValue;
  // Draw what was said across the line only when it is on the same scale.
  const show = said != null && sameScale(said, s.map(p => p.v));
  return <Line pts={s.map(p => ({ label: p.label, v: p.v }))} color={color} said={show ? said : null}
    fmt={v => fmtBench(v, m.unit)} caption={`${m.label} · monthly, last 3 years · FRED · hover or drag`} />;
}

/** A claimed percentage change ("plunged 22%", "up 56%"), signed. */
function saidChangeOf(c: TrendingClaim): number | null {
  if (c.claimedValue == null || !/%|percent/i.test(c.quote)) return null;
  const down = /\b(down|drop|dropp|plung|fell|fall|declin|reduc|cut|lower|decreas|shrank|less)/i.test(c.quote);
  return down && c.claimedValue > 0 ? -c.claimedValue : c.claimedValue;
}

/** The official series for this claim (mapped once, server-side), drawn
 *  with ProChart; falls back to the source-figure chart when nothing fits. */
function SeriesChart({ c, color, fallback, onEmpty, compact }: { c: TrendingClaim; color: string; fallback: React.ReactNode; onEmpty?: () => void; compact?: boolean }) {
  const [map, setMap] = useState<ClaimSeries | null | undefined>(c.series ?? undefined);
  const [data, setData] = useState<SeriesData | null | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(ref.current); return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen || map !== undefined) return;
    let alive = true;
    fetch(`/api/claim-series?key=${c.key}`).then(r => r.json()).then(d => { if (alive) setMap(d?.series ?? null); }).catch(() => alive && setMap(null));
    return () => { alive = false; };
  }, [seen, map, c.key]);
  useEffect(() => {
    if (!seen || !map?.series) return;
    let alive = true;
    fetch(`/api/series?id=${map.series}${map.countries.length ? `&c=${map.countries.join(",")}` : ""}`).then(r => r.json())
      .then(d => { if (alive) setData(d && !d.error ? d as SeriesData : null); }).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [seen, map]);

  const loading = map === undefined || (!!map?.series && data === undefined);
  // Line charts only: without an official series the card is dropped.
  const empty = !loading && !(map?.series && data);
  useEffect(() => { if (empty) onEmpty?.(); }, [empty, onEmpty]);
  return (
    <div ref={ref} style={{ margin: compact ? "4px 0 0" : "8px 0 4px" }}>
      {loading ? (
        <div className="tc-skel" style={{ height: compact ? 140 : 250, background: "#F3EFE8", borderRadius: 10 }} />
      ) : map?.series && data ? (
        <ProChart compact={compact} data={data} said={map.said ?? c.claimedValue ?? null} saidChange={saidChangeOf(c)} saidLine={map.saidCountry} claimDate={c.date} since={map.since} terms={map.terms} tone={color}
          repeats={c.repeats} watchHref={`/live?v=${c.videoId}${c.videoTime != null ? `&t=${Math.max(0, Math.floor(c.videoTime))}` : ""}`} />
      ) : fallback}
    </div>
  );
}

function Card({ c, bench, onEmpty }: { c: TrendingClaim; bench: Bench | null; onEmpty?: () => void }) {
  const color = tone(c.rating);
  const label = c.rating === "MOSTLY TRUE" ? "Mostly true" : isTrue(c.rating) ? "True" : "False";
  const watch = `/live?v=${c.videoId}${c.videoTime != null ? `&t=${Math.max(0, Math.floor(c.videoTime))}` : ""}`;
  // YouTube broadcasts play right here; a few seconds of lead-in before the quote.
  const [playing, setPlaying] = useState(false);
  const canEmbed = /^[A-Za-z0-9_-]{11}$/.test(c.videoId) && (c.embedStart != null || c.videoTime != null);
  const start = Math.max(0, Math.floor((c.embedStart ?? c.videoTime ?? 0) - 3));
  const srcs = (c.sources || []).filter(s => s.url).slice(0, 3);
  // Phones: a short card (quote + chart) so several fit on screen; "Details"
  // opens the full card.
  const phone = useIsMobileViewport(640);
  const [open, setOpen] = useState(false);
  const compact = phone && !open && !playing;
  return (
    <article style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 12, padding: compact ? "11px 13px" : "14px 16px", breakInside: "avoid", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 12, color: C.mute, flexWrap: phone ? "nowrap" : "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color, background: isTrue(c.rating) ? C.trueBg : C.falseBg, padding: "3px 8px", borderRadius: 5 }}>{label}</span>
        {c.live && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: "#fff", background: C.false, padding: "3px 7px", borderRadius: 5 }}>LIVE</span>}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[phone ? c.speaker?.split(" ").slice(-1)[0] : c.speaker, day(c.date), phone ? null : stamp(c.videoTime)].filter(Boolean).join(" · ")}</span>
        <span style={{ marginLeft: "auto" }}><ShareClaimButton small iconOnly={phone} variant="light" path={c.path} quote={c.quote} verdict={label} /></span>
        {canEmbed ? (
          <button type="button" onClick={() => setPlaying(p => !p)} aria-expanded={playing} style={{ all: "unset", cursor: "pointer", color: C.true, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            {playing
              ? <><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" /></svg>Close</>
              : <><svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>Watch</>}
          </button>
        ) : (
          <a href={watch} style={{ color: C.true, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>Watch
          </a>
        )}
      </div>
      {/* Inline player: the broadcast, from the moment the claim is said.
          Desktop: video beside the quote; phone: stacked. */}
      {playing && canEmbed ? (
        <div className="tc-play" style={{ marginTop: 12, display: "grid", gap: 16, alignItems: "start" }}>
          <InlinePlayer videoId={c.videoId} start={start} title={`${c.title} — from ${stamp(start)}`} />
          <div>
            <a href={c.path} style={{ textDecoration: "none", color: C.ink }}>
              <p style={{ fontFamily: SERIF, fontSize: 22, lineHeight: 1.3, margin: "0 0 10px", fontWeight: 500 }}>&ldquo;{c.quote}&rdquo;</p>
            </a>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.mute, lineHeight: 1.6 }}>
              {c.title}<br />Starts at {stamp(start)}, just before the claim
            </div>
            {c.actual && <p style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: C.sub, margin: "10px 0 0" }}>{c.actual}</p>}
            <a href={watch} style={{ display: "inline-block", marginTop: 12, fontFamily: SANS, fontSize: 13, color: C.true, fontWeight: 600, textDecoration: "none" }}>Watch with live fact-check →</a>
          </div>
        </div>
      ) : (
        <a href={c.path} style={{ textDecoration: "none", color: C.ink }}>
          <p style={{ fontFamily: SERIF, fontSize: compact ? 16.5 : 19, lineHeight: 1.3, margin: compact ? "8px 0 6px" : "10px 0 8px", fontWeight: 500,
            ...(compact ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}) }}>&ldquo;{c.quote}&rdquo;</p>
        </a>
      )}
      <SeriesChart compact={compact} c={c} color={color} onEmpty={onEmpty} fallback={c.metricKey ? <MetricChart c={c} bench={bench} color={color} /> : <WebChart c={c} color={color} />} />
      {compact && (
        <button type="button" onClick={() => setOpen(true)} style={{ all: "unset", cursor: "pointer", marginTop: 2, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: C.true }}>
          More ▾
        </button>
      )}
      {!compact && c.actual && !(playing && canEmbed) && <p style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: C.sub, margin: "8px 0 0" }}>{c.actual}</p>}
      {!compact && srcs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {srcs.map(s => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: SANS, fontSize: 11.5, color: C.true, border: `1px solid ${C.rule}`, borderRadius: 6, padding: "3px 8px", textDecoration: "none", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{host(s.url)} ↗</a>
          ))}
        </div>
      )}
    </article>
  );
}

/* ── Page body ─────────────────────────────────────────────────────── */
export default function ClaimsFeed({ embedded = false }: { embedded?: boolean } = {}) {
  const [items, setItems] = useState<TrendingClaim[] | null>(null);
  const [bench, setBench] = useState<Bench | null>(null);
  const [f, setF] = useState<"all" | "false" | "true">("all");
  const [n, setN] = useState(20);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/trending-claims").then(r => r.json()).then(d => { if (alive && d?.items) setItems(d.items); }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    fetch("/api/benchmark-data").then(r => r.json()).then(d => { if (alive && d && !d.error) setBench(d); }).catch(() => {});
    return () => { alive = false; clearInterval(id); };
  }, []);
  // Cards whose chart couldn't load are removed rather than shown without one.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const drop = useCallback((k: string) => setGone(g => (g.has(k) ? g : new Set(g).add(k))), []);
  const shown = useMemo(() => (items || []).filter(c => !gone.has(c.key)), [items, gone]);
  const counts = useMemo(() => ({
    all: shown.length,
    false: shown.filter(c => !isTrue(c.rating)).length,
    true: shown.filter(c => isTrue(c.rating)).length,
  }), [shown]);
  const list = shown.filter(c => f === "all" || (f === "true" ? isTrue(c.rating) : !isTrue(c.rating)));

  return (
    <div style={embedded ? { padding: "0 0 64px" } : { maxWidth: 1400, margin: "0 auto", padding: "22px 24px 64px" }}>
      <style>{`@keyframes tcPulse{0%,100%{opacity:1}50%{opacity:.45}}.tc-skel{animation:tcPulse 1.2s ease-in-out infinite}.tc-play{grid-template-columns:1fr}@media(min-width:900px){.tc-play{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr)}}`}</style>
      <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {([["all", "All"], ["false", "False"], ["true", "True"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={f === k} onClick={() => { setF(k); setN(20); }} style={{
            fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 99, cursor: "pointer",
            border: `1px solid ${f === k ? C.ink : C.rule}`, background: f === k ? C.ink : C.card, color: f === k ? "#f8f5f0" : C.ink,
          }}>{l}{items ? ` · ${counts[k]}` : ""}</button>
        ))}
      </div>
      {!items ? (
        [0, 1, 2].map(k => <div key={k} className="tc-skel" style={{ height: 180, background: "#EFEAE2", borderRadius: 12, marginBottom: 12 }} />)
      ) : list.length === 0 ? (
        <p style={{ fontFamily: SANS, color: C.mute }}>No claims here yet.</p>
      ) : (
        <>
          {list.slice(0, n).map(c => <Card key={c.key} c={c} bench={bench} onEmpty={() => drop(c.key)} />)}
          {list.length > n && (
            <button type="button" onClick={() => setN(x => x + 20)} style={{ width: "100%", fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: "12px", borderRadius: 10, border: `1px solid ${C.rule}`, background: C.card, color: C.ink, cursor: "pointer" }}>
              Show more ({list.length - n})
            </button>
          )}
        </>
      )}
      <p style={{ fontFamily: SANS, fontSize: 12, color: C.mute, marginTop: 18, lineHeight: 1.5 }}>
        How charts are made: claims checked against our own data show the official FRED series. For claims checked on the web, every figure is taken word-for-word from the cited sources; anything we can&rsquo;t find in the source text is left out.
      </p>
    </div>
  );
}
