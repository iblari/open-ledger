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
  return (
    <div style={{ fontFamily: SANS, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.note}>{t.label}{t.scope ? ` · ${t.scope}` : ""}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20 }}>{fmt(t, cur.v)}{t.unit !== "%" ? <span style={{ fontSize: 11.5, color: C.sub }}>{t.unit}</span> : null}</span>
        <span style={{ fontSize: 11.5, color: C.mute }}>{cur.y}{cur.partial ? " so far" : ""}</span>
      </div>
      <div onMouseLeave={() => setSel(null)} role="img" aria-label={`${t.label}: ${real.map(p => `${p.y} ${fmt(t, p.v)}`).join(", ")}`}
        style={{ display: "flex", gap: 2, height: 40, marginTop: 4, position: "relative", touchAction: "pan-y" }}>
        <span style={{ position: "absolute", left: 0, right: 0, top: neg ? "50%" : "100%", borderTop: `1px solid ${C.rule}` }} />
        {t.points.map(p => {
          const on = p.y === cur.y;
          if (p.v == null) return <span key={p.y} style={{ flex: 1 }} />;
          const h = Math.max(4, (Math.abs(p.v) / max) * (neg ? 50 : 100));
          return (
            <span key={p.y} onMouseEnter={() => setSel(p.y)} onClick={() => setSel(p.y)} style={{ flex: 1, position: "relative", cursor: "pointer" }}>
              <span style={{ position: "absolute", left: 0, right: 0, height: `${h}%`, ...(p.v >= 0 ? { bottom: neg ? "50%" : 0 } : { top: "50%" }), background: on ? C.accent : C.ink, opacity: on ? 1 : p.v < 0 ? 0.3 : 0.55, borderRadius: 1 }} />
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
