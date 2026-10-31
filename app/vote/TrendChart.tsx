"use client";
import { useState } from "react";
import { C, SERIF, SANS } from "@/lib/design-tokens";

export interface TrendLite { key: string; label: string; unit: string; points: { y: number; v: number | null; partial?: boolean }[]; source: string; url: string; scope?: string; note?: string }
const fmt = (t: TrendLite, v: number) => `${t.unit === "%" && t.key !== "jobs" && t.key !== "taxes" && v > 0 ? "+" : ""}${v.toFixed(1)}${t.unit === "%" ? "%" : ""}`;

/** Small bar chart; hover or tap a year to read it. Shows the latest year by default. */
export default function TrendChart({ t }: { t: TrendLite }) {
  const real = t.points.filter(p => p.v != null) as { y: number; v: number; partial?: boolean }[];
  const [sel, setSel] = useState<number | null>(null);
  if (!real.length) return null;
  const last = real[real.length - 1];
  const cur = real.find(p => p.y === sel) ?? last;
  const max = Math.max(...real.map(p => Math.abs(p.v))) || 1;
  const neg = real.some(p => p.v < 0);
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(t.points.length - 1, Math.floor(((e.clientX - r.left) / r.width) * t.points.length)));
    const p = t.points[i]; if (p && p.v != null) setSel(p.y);
  };
  return (
    <div style={{ fontFamily: SANS, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.note}>{t.label}{t.scope ? ` · ${t.scope}` : ""}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20 }}>{fmt(t, cur.v)}{t.unit !== "%" ? <span style={{ fontSize: 11.5, color: C.sub }}>{t.unit}</span> : null}</span>
        <span style={{ fontSize: 11.5, color: C.mute }}>{cur.y}{cur.partial ? " so far" : ""}</span>
      </div>
      <div
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={e => { if (e.pointerType === "mouse") setSel(null); }}
        role="img" aria-label={`${t.label}: ${real.map(p => `${p.y} ${fmt(t, p.v)}`).join(", ")}`}
        style={{ display: "flex", gap: 2, height: 64, marginTop: 6, position: "relative", touchAction: "pan-y", cursor: "crosshair", paddingTop: 18 }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: neg ? "calc(50% + 9px)" : "100%", borderTop: `1px solid ${C.rule}` }} />
        {t.points.map((p, i) => {
          const on = sel != null && p.y === cur.y;
          const isLast = sel == null && p.y === last.y;
          if (p.v == null) return <span key={p.y} style={{ flex: 1 }} />;
          const h = Math.max(4, (Math.abs(p.v) / max) * (neg ? 50 : 100));
          return (
            <span key={p.y} style={{ flex: 1, position: "relative" }}>
              {on && <span style={{ position: "absolute", left: "50%", top: -18, bottom: 0, width: 1, background: "rgba(20,17,14,.25)" }} />}
              <span style={{ position: "absolute", left: 0, right: 0, height: `${h}%`, ...(p.v >= 0 ? { bottom: neg ? "50%" : 0 } : { top: "50%" }), background: on || isLast ? C.accent : C.ink, opacity: on || isLast ? 1 : sel != null ? 0.25 : p.v < 0 ? 0.3 : 0.5, borderRadius: 2, transition: "opacity .12s" }} />
              {on && (
                <span style={{ position: "absolute", top: -20, left: "50%", transform: `translateX(${i < 2 ? "-15%" : i > t.points.length - 3 ? "-85%" : "-50%"})`, background: C.ink, color: "#fff", fontSize: 11.5, fontWeight: 600, padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 2 }}>
                  {p.y}{p.partial ? " so far" : ""} · {fmt(t, p.v)}{t.unit !== "%" ? t.unit : ""}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.mute, marginTop: 2 }}>
        <span>{t.points[0].y}</span><a href={t.url} style={{ color: C.mute }}>{t.source} ↗</a><span>{t.points[t.points.length - 1].y}</span>
      </div>
    </div>
  );
}
