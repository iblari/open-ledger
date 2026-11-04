"use client";
import { useEffect, useState } from "react";
import type { RaceResult } from "@/lib/results";

/**
 * Election-night board: every Senate and governor race that has official counts,
 * refreshing every 30 s. Your state first, then the closest races. Official counts
 * as reported, no projections; a race only appears once it has counts.
 */
type Row = { id: string; st: string; state: string; office: string; title: string; cands: { name: string; p: string }[]; result: RaceResult | null };
const PARTY: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
const col = (p: string) => PARTY[p] || "#7a7368";
const INK = "#14110E", SUB = "#6B655C", MUTE = "#8A8378", RULE = "#E6E0D6";
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };

export default function ResultsBoard({ myState }: { myState?: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | "senate" | "governor">("all");
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/results/all").then(r => r.json()).then(j => { if (alive) setRows(j.races); }).catch(() => {});
    load(); const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!rows) return null;
  const live = rows.filter(r => r.result && r.result.cands.some(c => c.votes > 0));
  if (!live.length) return null;

  const view = live.map(r => {
    const tot = r.result!.cands.reduce((s, c) => s + c.votes, 0);
    const cs = [...r.result!.cands].map(c => ({ ...c, pct: tot ? (c.votes / tot) * 100 : 0 })).sort((a, b) => b.votes - a.votes);
    return { ...r, tot, cs, margin: cs.length > 1 ? cs[0].pct - cs[1].pct : 100 };
  }).filter(r => filter === "all" || r.office === filter)
    .sort((a, b) => (a.st === myState ? -1 : b.st === myState ? 1 : a.margin - b.margin));

  return (
    <section style={{ marginTop: 22, fontFamily: "'DM Sans',system-ui,sans-serif", color: INK }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 500, fontSize: 26, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span className="vu-rb-dot" style={{ width: 9, height: 9, borderRadius: "50%", background: "#C1272D" }} />Live results
        </h2>
        <span style={{ fontSize: 12.5, color: MUTE }}>{live.length} of {rows.length} races reporting · official counts, closest first</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {(["all", "senate", "governor"] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${filter === f ? INK : "#D9D2C7"}`, background: filter === f ? INK : "#fff", color: filter === f ? "#fff" : INK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {f === "all" ? "All" : f === "senate" ? "Senate" : "Governor"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10, marginTop: 12 }}>
        {view.map(r => (
          <a key={r.id} href={`/vote/${r.st.toLowerCase()}`} style={{ display: "block", background: "#fff", border: `1px solid ${r.st === myState ? INK : RULE}`, borderRadius: 12, padding: "11px 13px", textDecoration: "none", color: INK }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, letterSpacing: ".07em", color: MUTE }}>
              <span>{r.state.toUpperCase()} · {r.office === "senate" ? "SENATE" : "GOVERNOR"}{r.title.includes("special") ? " (SPECIAL)" : ""}{r.st === myState ? " · YOUR STATE" : ""}</span>
              <span>{r.result!.pctCounted != null ? `${Math.round(r.result!.pctCounted)}% IN` : ""}</span>
            </div>
            {r.cs.slice(0, 2).map((c, i) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: i ? 2 : 7, fontSize: 14.5 }}>
                <span style={{ fontWeight: i ? 500 : 700 }}><span style={{ display: "inline-block", minWidth: 16, textAlign: "center", fontSize: 10, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: col(c.p), color: "#fff", marginRight: 6 }}>{c.p === "D" || c.p === "R" ? c.p : "I"}</span>{c.name}</span>
                <span style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 16, color: i ? SUB : INK }}>{c.pct.toFixed(1)}%</span>
              </div>
            ))}
            <div style={{ display: "flex", height: 7, borderRadius: 2, overflow: "hidden", marginTop: 8, background: "#ECE7DF", position: "relative" }}>
              {r.cs.map(c => <div key={c.name} style={{ width: `${c.pct}%`, background: col(c.p), opacity: c === r.cs[0] ? 1 : 0.75 }} />)}
              <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1.5, background: INK }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTE, marginTop: 6 }}>
              <span>{r.tot.toLocaleString("en-US")} votes counted</span><span suppressHydrationWarning>{ago(r.result!.updatedAt)}</span>
            </div>
          </a>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8 }}>Unofficial counts from state and county election offices, as reported. No projections. Tap a race for the full ballot.</div>
      <style>{`@keyframes vuRb{50%{opacity:.25}}.vu-rb-dot{animation:vuRb 1.4s infinite}`}</style>
    </section>
  );
}
