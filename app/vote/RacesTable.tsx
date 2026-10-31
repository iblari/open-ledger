"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { C, SANS, SERIF } from "@/lib/design-tokens";

export interface RaceRow {
  st: string; state: string; id: string; title: string; office: "senate" | "governor";
  cands: { name: string; p: string; raised: number | null; poll: number | null }[];
  lead: { name: string; margin: number } | null; polls: number; pollTo: string | null;
}
const PARTY: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
const tag = (p: string) => (
  <span style={{ display: "inline-block", minWidth: 16, textAlign: "center", fontSize: 10.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: PARTY[p] || "#9a7b4f", color: "#fff", marginRight: 5 }}>{p === "D" || p === "R" ? p : "I"}</span>
);
const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
const last = (n: string) => n.split(" ").slice(-1)[0];

/** Every race on one table: polls (Senate), money raised, sortable. */
export default function RacesTable({ rows }: { rows: RaceRow[] }) {
  const [sort, setSort] = useState<"close" | "money" | "state">("close");
  const [office, setOffice] = useState<"all" | "senate" | "governor">("all");
  const maxRaised = Math.max(1, ...rows.flatMap(r => r.cands.map(c => c.raised || 0)));
  const list = useMemo(() => {
    const l = rows.filter(r => office === "all" || r.office === office);
    const total = (r: RaceRow) => r.cands.reduce((n, c) => n + (c.raised || 0), 0);
    return [...l].sort((a, b) =>
      sort === "state" ? a.state.localeCompare(b.state) :
      sort === "money" ? total(b) - total(a) :
      ((a.lead ? a.lead.margin : 999) - (b.lead ? b.lead.margin : 999)) || a.state.localeCompare(b.state));
  }, [rows, sort, office]);
  const btn = (on: boolean): React.CSSProperties => ({ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.ink, cursor: "pointer" });
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 26, letterSpacing: "-0.015em", margin: "0 8px 0 0" }}>All races</h2>
        <button style={btn(sort === "close")} onClick={() => setSort("close")}>Closest polls</button>
        <button style={btn(sort === "money")} onClick={() => setSort("money")}>Most money</button>
        <button style={btn(sort === "state")} onClick={() => setSort("state")}>A–Z</button>
        <span style={{ width: 1, height: 18, background: C.rule, margin: "0 4px" }} />
        {(["all", "senate", "governor"] as const).map(o => <button key={o} style={btn(office === o)} onClick={() => setOffice(o)}>{o === "all" ? "All" : o === "senate" ? "Senate" : "Governor"}</button>)}
      </div>
      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
        <div className="rt-row rt-head" style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: C.mute, fontWeight: 600 }}>
          <span>Race</span><span>Candidates · raised</span><span>Polls</span>
        </div>
        {list.map(r => (
          <Link key={r.id} href={`/vote/${r.st.toLowerCase()}#${r.id}`} className="rt-row" style={{ textDecoration: "none", color: C.ink }}>
            <span><b style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 17 }}>{r.state}</b><span style={{ display: "block", fontSize: 12, color: C.sub }}>{r.title}</span></span>
            <span style={{ display: "grid", gap: 5 }}>
              {r.cands.map(c => (
                <span key={c.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 64px", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ whiteSpace: "nowrap" }}>{tag(c.p)}{c.name}</span>
                    {r.office === "senate" && <span style={{ display: "block", height: 4, borderRadius: 2, background: "#EFEBE4", marginTop: 3 }}><span style={{ display: "block", height: 4, borderRadius: 2, width: `${Math.max(1, ((c.raised || 0) / maxRaised) * 100)}%`, background: PARTY[c.p] || "#8a8378" }} /></span>}
                  </span>
                  <span style={{ textAlign: "right", fontSize: 12.5, color: C.sub, fontVariantNumeric: "tabular-nums" }}>{c.raised != null ? money(c.raised) : r.office === "senate" ? "—" : ""}</span>
                </span>
              ))}
            </span>
            <span style={{ fontSize: 13 }}>
              {r.lead ? (
                <>
                  <b style={{ fontWeight: 700, color: PARTY[r.cands.find(c => c.name === r.lead!.name)?.p || ""] || "#9a7b4f" }}>{last(r.lead.name)} +{r.lead.margin.toFixed(1)}</b>
                  <span style={{ display: "block", fontSize: 11.5, color: C.mute }}>{r.polls} poll{r.polls === 1 ? "" : "s"}</span>
                </>
              ) : <span style={{ color: C.mute, fontSize: 12 }}>—</span>}
            </span>
          </Link>
        ))}
      </div>
      <style>{`
        .rt-row{display:grid;grid-template-columns:150px minmax(0,1fr) 150px;gap:16px;align-items:center;padding:11px 14px;border-top:1px solid ${C.rule}}
        .rt-head{border-top:none;padding-top:9px;padding-bottom:9px;background:#fcfbf8}
        a.rt-row:hover{background:#faf8f4}
        @media(max-width:720px){.rt-row{grid-template-columns:minmax(0,1fr) 96px;gap:10px}.rt-row>span:nth-child(2){grid-column:1/-1;grid-row:2}.rt-head>span:nth-child(2){display:none}}
      `}</style>
    </section>
  );
}
