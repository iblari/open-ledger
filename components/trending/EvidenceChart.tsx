"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClaimChart } from "@/lib/claim-chart";
import type { SeriesData } from "@/lib/series";
import ProChart from "./ProChart";
import { saneContext } from "@/lib/chart-format";

/**
 * Evidence chart — for claims about a single figure (a pledge, a count, a
 * record) that no official time series covers. Every bar is a number found
 * word-for-word in the cited sources (lib/claim-chart):
 *   Said · Data (split into its parts when the sources give them) · figures
 *   that give it scale (a previous record, another country, the total).
 * Tap or hover a bar to read the sentence it came from, with its source.
 * Log scale when the figures span orders of magnitude; a dated series from
 * the sources is drawn as a full interactive chart underneath.
 */
const C = { ink: "#14110E", sub: "#5F5850", mute: "#8C8479", rule: "#E8E3DA", said: "#9A948C", soft: "#F3EFE8" };
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,monospace";
const PART_SHADES = [1, 0.72, 0.52, 0.38, 0.28];

function compact(v: number, unit: string): string {
  const u = unit.trim(), a = Math.abs(v), sg = v < 0 ? "−" : "";
  if (u === "%") return `${sg}${+a.toFixed(a < 10 ? 1 : 0)}%`;
  const n = a >= 1e12 ? `${+(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${+(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B` : a >= 1e6 ? `${+(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`
    : a >= 1e4 ? `${+(a / 1e3).toFixed(0)}K` : a >= 100 ? Math.round(a).toLocaleString("en-US") : `${+a.toFixed(2)}`;
  if (u === "$" || u.toLowerCase().startsWith("usd")) return `${sg}$${n}`;
  return u && !/^(count|number|people|units?)$/i.test(u) ? `${sg}${n} ${u}` : `${sg}${n}`;
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function labelToDate(l: string): string | null {
  const y = l.match(/\b(19|20)\d{2}\b/)?.[0]; if (!y) return null;
  const lo = l.toLowerCase(); const q = lo.match(/\bq([1-4])\b/); const mi = MONTHS.findIndex(m => lo.includes(m));
  const m = q ? (+q[1] - 1) * 3 + 1 : mi >= 0 ? mi + 1 : 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

interface Row { key: string; label: string; value: number; kind: "said" | "data" | "compare"; src?: number; span?: string; parts?: { label: string; value: number; src: number; span: string }[] }

export default function EvidenceChart({ chart, tone, claimDate, watchHref }: { chart: ClaimChart; tone: string; claimDate: string; watchHref?: string }) {
  const unit = chart.unit;
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const ctx = saneContext(chart.context, chart.data?.value, chart.said?.value);
    const parts = ctx.filter(x => x.kind === "part");
    if (chart.said) out.push({ key: "said", label: "Said", value: chart.said.value, kind: "said" });
    if (chart.data) out.push({ key: "data", label: "Data", value: chart.data.value, kind: "data", src: chart.data.src, span: chart.data.span, parts: parts.length ? parts : undefined });
    for (const [i, x] of ctx.filter(x => x.kind === "compare" || !chart.data).entries())
      out.push({ key: `c${i}`, label: x.label, value: x.value, kind: "compare", src: x.src, span: x.span });
    return out;
  }, [chart]);

  const vals = rows.map(r => r.value);
  const allPos = vals.every(v => v > 0);
  const spread = allPos ? Math.max(...vals) / Math.min(...vals) : 1;
  const [log, setLog] = useState(spread >= 25);
  const [sel, setSel] = useState<string>(rows.find(r => r.kind === "data")?.key || rows[0]?.key || "");
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, []);

  // A dated series in the sources → a full interactive chart.
  const series: SeriesData | null = useMemo(() => {
    const pts = chart.points.map(p => ({ d: labelToDate(p.label), v: p.value })).filter((p): p is { d: string; v: number } => !!p.d);
    if (pts.length < 4) return null;
    const src = chart.sources[chart.points[0].src];
    return {
      id: "cited", label: chart.metric || "Figures from the cited sources", unit: unit === "%" ? "%" : unit.startsWith("$") ? "$" : unit, source: src?.url ? host(src.url) : "our fact-check",
      url: src?.url || "", decimals: 1, freq: pts.every(p => p.d.endsWith("-01-01")) ? "a" : "m",
      lines: [{ key: "cited", name: chart.metric, points: pts }], fetchedAt: "",
    };
  }, [chart, unit]);

  if (!rows.length) return null;
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const lmin = allPos ? Math.pow(10, Math.floor(Math.log10(Math.min(...vals)))) : 1;
  const lmax = allPos ? Math.pow(10, Math.ceil(Math.log10(Math.max(...vals)))) : 1;
  // Position (0–100%) of a value on the axis.
  const pos = (v: number) => log && allPos ? ((Math.log10(v) - Math.log10(lmin)) / (Math.log10(lmax) - Math.log10(lmin))) * 100 : ((v - lo) / (hi - lo || 1)) * 100;
  const zero = log && allPos ? 0 : pos(0);
  const ticks = log && allPos
    ? Array.from({ length: Math.round(Math.log10(lmax / lmin)) + 1 }, (_, i) => lmin * Math.pow(10, i))
    : [0, 0.25, 0.5, 0.75, 1].map(f => lo + (hi - lo) * f);

  // Headline comparison.
  const s = chart.said?.value, d = chart.data?.value;
  let verdict: string | null = null;
  if (s != null && d != null) {
    if (s === 0 && d !== 0) verdict = `Claimed zero — the data shows ${compact(d, unit)}`;
    else if (d === 0 && s !== 0) verdict = `The data shows zero, not ${compact(s, unit)}`;
    else if (Math.sign(s) !== Math.sign(d)) verdict = `Opposite direction: ${compact(s, unit)} said, ${compact(d, unit)} in the data`;
    else {
      const r = s / d;
      verdict = Math.abs(r - 1) <= 0.05 ? "Matches the data" : unit === "%" ? `${Math.abs(s - d).toFixed(1)} pts ${Math.abs(s) > Math.abs(d) ? "higher" : "lower"} than the data`
        : r > 1 ? `Claim is ${r >= 10 ? Math.round(r) : r.toFixed(1)}× the data` : `Claim is ${Math.round((1 - r) * 100)}% below the data`;
    }
  }
  const match = verdict === "Matches the data";
  const selRow = rows.find(r => r.key === sel);
  const srcOf = (n?: number) => (n != null ? chart.sources[n] : undefined);

  return (
    <div style={{ fontFamily: SANS }}>
      {/* headline */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          {chart.metric && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.mute }}>{chart.metric}</div>}
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 2 }}>
            {s != null && <span style={{ fontFamily: MONO, fontSize: 22, color: C.said }}>{compact(s, unit)} <span style={{ fontFamily: SANS, fontSize: 12, color: C.mute }}>said</span></span>}
            {d != null && <span style={{ fontFamily: MONO, fontSize: 28, color: C.ink, letterSpacing: "-0.02em" }}>{compact(d, unit)} <span style={{ fontFamily: SANS, fontSize: 12, color: C.mute }}>in the data</span></span>}
            {verdict && <span style={{ fontSize: 12.5, fontWeight: 600, color: match ? "#0E7477" : "#B8372D", background: match ? "#E3F1EE" : "#F8E4E1", padding: "3px 9px", borderRadius: 99 }}>{verdict}</span>}
          </div>
        </div>
        {allPos && spread >= 8 && (
          <div role="tablist" aria-label="Scale" style={{ display: "flex", background: "#F1ECE4", borderRadius: 99, padding: 2 }}>
            {([[false, "Linear"], [true, "Log scale"]] as const).map(([k, l]) => (
              <button key={l} type="button" role="tab" aria-selected={log === k} onClick={() => setLog(k)} style={{
                border: "none", cursor: "pointer", borderRadius: 99, padding: "4px 10px", fontFamily: SANS, fontSize: 12, fontWeight: log === k ? 700 : 500,
                background: log === k ? "#fff" : "transparent", color: log === k ? C.ink : C.sub, boxShadow: log === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {/* bars */}
      <div style={{ position: "relative", paddingTop: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(64px, 26%) 1fr", columnGap: 12, rowGap: 8 }}>
          <div />
          <div style={{ position: "relative", height: 0 }}>
            {ticks.map((tv, i) => (
              <span key={i} style={{ position: "absolute", left: `${pos(tv)}%`, top: -18, transform: "translateX(-50%)", fontSize: 10.5, color: C.mute, whiteSpace: "nowrap" }}>{compact(tv, unit === "%" ? "%" : unit.startsWith("$") ? "$" : "")}</span>
            ))}
          </div>
          {rows.map(r => {
            const on = sel === r.key;
            const a = Math.min(pos(r.value), zero), w = Math.abs(pos(r.value) - zero);
            const fill = r.kind === "data" ? tone : r.kind === "said" ? C.said : "#B9B1A5";
            return [
              <button key={`${r.key}-l`} type="button" onClick={() => setSel(r.key)} onMouseEnter={() => setSel(r.key)} style={{
                all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: r.kind === "compare" ? 500 : 700, color: r.kind === "data" ? C.ink : C.sub,
                textAlign: "right", alignSelf: "center", lineHeight: 1.25,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }} title={r.label}>{r.label}</button>,
              <button key={`${r.key}-b`} type="button" aria-label={`${r.label}: ${compact(r.value, unit)}`} onClick={() => setSel(r.key)} onMouseEnter={() => setSel(r.key)} style={{
                all: "unset", cursor: "pointer", position: "relative", height: 30, display: "block", borderRadius: 6,
                background: on ? C.soft : "transparent", backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), ${C.rule} calc(25% - 1px) 25%)`,
              }}>
                {/* zero line */}
                {zero > 0 && <span style={{ position: "absolute", left: `${zero}%`, top: -4, bottom: -4, width: 1, background: "#CFC8BC" }} />}
                <span style={{
                  position: "absolute", top: 5, height: 20, left: `${a}%`, width: grown ? `${Math.max(0.6, w)}%` : 0, transition: "width .8s cubic-bezier(.2,.7,.2,1)",
                  borderRadius: 4, overflow: "hidden", display: "flex",
                  background: r.kind === "said" ? `repeating-linear-gradient(135deg, ${fill} 0 6px, #B5AFA7 6px 9px)` : r.parts ? "transparent" : fill,
                  opacity: r.kind === "compare" ? 0.85 : 1, boxShadow: on ? `0 0 0 2px ${r.kind === "data" ? tone : "#8C8479"}55` : "none",
                }}>
                  {r.parts && r.parts.map((p, i) => (
                    <span key={i} title={`${p.label}: ${compact(p.value, unit)}`} style={{ width: `${(Math.abs(p.value) / Math.abs(r.value)) * 100}%`, background: tone, opacity: PART_SHADES[i % PART_SHADES.length], borderRight: "1px solid #fff" }} />
                  ))}
                  {r.parts && <span style={{ flex: 1, background: tone, opacity: 0.18 }} />}
                </span>
                {/* value: after the bar, or inside its end when the bar is long */}
                <span style={{
                  position: "absolute", top: 7, fontFamily: MONO, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  ...(a + w > 80
                    ? { right: `calc(${100 - (a + w)}% + 8px)`, color: r.kind === "compare" ? C.ink : "#fff", textShadow: r.kind === "compare" ? "none" : "0 1px 2px rgba(0,0,0,.25)" }
                    : { left: `calc(${Math.max(a + w, zero)}% + 6px)`, color: r.kind === "data" ? tone : C.sub }),
                }}>{compact(r.value, unit)}</span>
              </button>,
            ];
          })}
        </div>
      </div>

      {/* parts legend */}
      {rows.find(r => r.parts) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 12, color: C.sub }}>
          {rows.find(r => r.parts)!.parts!.map((p, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: tone, opacity: PART_SHADES[i % PART_SHADES.length] }} />{p.label} {compact(p.value, unit)}
            </span>
          ))}
        </div>
      )}

      {/* where the selected number comes from */}
      {selRow && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: C.soft, borderRadius: 8, fontSize: 13, lineHeight: 1.5, color: C.sub, minHeight: 40 }}>
          {selRow.kind === "said" ? (
            <>What was said on air{watchHref && <> · <a href={watchHref} style={{ color: "#0E7477", fontWeight: 600, textDecoration: "none" }}>▶ watch the moment</a></>}</>
          ) : (
            <>
              <span style={{ fontStyle: "italic", color: C.ink }}>&ldquo;{selRow.span}&rdquo;</span>{" "}
              {(() => { const s0 = srcOf(selRow.src); return s0?.url
                ? <a href={s0.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0E7477", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>— {host(s0.url)} ↗</a>
                : <span style={{ whiteSpace: "nowrap" }}>— our fact-check finding</span>; })()}
            </>
          )}
        </div>
      )}

      {series && (
        <div style={{ marginTop: 16 }}>
          <ProChart data={series} said={s ?? null} claimDate={claimDate} tone={tone} watchHref={watchHref} fullRange />
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>Every bar is a figure quoted word-for-word from the cited sources · tap a bar to see where it comes from</div>
    </div>
  );
}
