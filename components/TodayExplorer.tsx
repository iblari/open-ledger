"use client";

/**
 * TodayExplorer — the client island on /today: place search + county
 * spotlight. Search lazily loads a slim index of every county (name, latest
 * rate, YoY, percentile) and selecting a result swaps the spotlight card —
 * search → evidence in one motion, no dead links while /places is unbuilt.
 */

import { useEffect, useRef, useState } from "react";
import { C, SERIF, SANS } from "@/lib/design-tokens";

interface Row { f: string; n: string; s: string; rate: number; yoy: number; p: number; lf: number }
export interface SpotlightData {
  fips: string; name: string; st: string; rate: number; yoy: number; pctile: number; lf: number;
  series: { periods: string[]; values: (number | null)[] };
}

function Spark({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const W = 260, H = 44;
  const segs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v == null) { if (cur.length > 1) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${(i / (values.length - 1)) * W},${H - 4 - ((v - lo) / span) * (H - 8)}`);
  });
  if (cur.length > 1) segs.push(cur.join(" "));
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {segs.map((pts, i) => <polyline key={i} points={pts} fill="none" stroke={C.accent} strokeWidth={2} />)}
    </svg>
  );
}

export default function TodayExplorer({ initial, periods }: { initial: SpotlightData | null; periods: string[] }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Row[] | null>(null);
  const [spot, setSpot] = useState<SpotlightData | null>(initial);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadIndex = () => {
    if (index) return;
    fetch("/observations/search-index.json").then(r => r.json()).then(setIndex).catch(() => {});
  };
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  const matches = q.length >= 2 && index
    ? index.filter(r => `${r.n} ${r.s}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  const pick = async (r: Row) => {
    setOpen(false); setQ(`${r.n}, ${r.s}`);
    // Full series comes from the LAUS store (one shared file, CDN-cached).
    try {
      const laus = await fetch("/observations/laus-county.json").then(x => x.json());
      const c = laus.counties[r.f];
      setSpot({ fips: r.f, name: r.n, st: r.s, rate: r.rate, yoy: r.yoy, pctile: r.p, lf: r.lf, series: { periods: laus.periods, values: c?.rate ?? [] } });
    } catch {
      setSpot({ fips: r.f, name: r.n, st: r.s, rate: r.rate, yoy: r.yoy, pctile: r.p, lf: r.lf, series: { periods, values: [] } });
    }
  };

  return (
    <div>
      {/* Search */}
      <div ref={boxRef} style={{ position: "relative", marginBottom: 14 }}>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { loadIndex(); setOpen(true); }}
          placeholder="Search any county…"
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 6, border: `1px solid ${C.rule}`,
            background: "#fff", fontFamily: SANS, fontSize: 16, color: C.ink, outline: "none",
          }}
        />
        {open && matches.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30, marginTop: 4,
            background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6,
            boxShadow: "0 8px 30px rgba(0,0,0,0.1)", overflow: "hidden",
          }}>
            {matches.map(r => (
              <button key={r.f} onClick={() => pick(r)} style={{
                display: "flex", justifyContent: "space-between", gap: 8, width: "100%",
                padding: "9px 13px", background: "none", border: "none", borderBottom: `1px solid ${C.paper}`,
                fontFamily: SANS, fontSize: 12.5, color: C.ink, cursor: "pointer", textAlign: "left",
              }}>
                <span>{r.n}, {r.s}</span>
                <span style={{ color: C.mute, fontVariantNumeric: "tabular-nums" }}>{r.rate}% · {r.yoy > 0 ? "+" : ""}{r.yoy}pp</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spotlight */}
      {spot && (
        <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600 }}>{spot.name}, {spot.st}</div>
            <span style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, textTransform: "uppercase", letterSpacing: "0.08em" }}>County spotlight</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "12px 0" }}>
            {[
              [`${spot.rate}%`, "unemployment, latest month"],
              [`${spot.yoy > 0 ? "+" : ""}${spot.yoy}pp`, "change vs a year ago"],
              [spot.yoy <= 0 ? `Top ${Math.max(1, spot.pctile)}%` : `Bottom ${Math.max(1, 100 - spot.pctile)}%`, spot.yoy <= 0 ? "biggest improvers nationally" : "counties by rising unemployment"],
            ].map(([v, l]) => (
              <div key={l as string}>
                <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: spot.yoy > 0 ? C.declineStrong : C.improveStrong, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, lineHeight: 1.4 }}>{l}</div>
              </div>
            ))}
          </div>
          <Spark values={spot.series.values} />
          <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, marginTop: 6 }}>
            BLS LAUS · monthly, NSA · labor force {spot.lf >= 1e6 ? `${(spot.lf / 1e6).toFixed(1)}M` : `${Math.round(spot.lf / 1000)}K`}
          </div>
        </div>
      )}
    </div>
  );
}
