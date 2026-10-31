"use client";
import { useState } from "react";
import Link from "next/link";
import { C, SANS } from "@/lib/design-tokens";

/** Type-to-filter state list. */
export default function StatePicker({ states }: { states: { st: string; name: string; races: string }[] }) {
  const [q, setQ] = useState("");
  const hits = q.trim() ? states.filter(s => s.name.toLowerCase().includes(q.trim().toLowerCase()) || s.st.toLowerCase() === q.trim().toLowerCase()) : [];
  return (
    <div style={{ position: "relative", fontFamily: SANS }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your state" aria-label="Search your state"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SANS, background: "#fff" }} />
      {hits.length > 0 && (
        <div style={{ position: "absolute", zIndex: 5, left: 0, right: 0, top: "calc(100% + 4px)", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 8, boxShadow: "0 10px 24px -12px rgba(20,17,14,.3)", maxHeight: 280, overflowY: "auto" }}>
          {hits.slice(0, 8).map(s => (
            <Link key={s.st} href={`/vote/${s.st.toLowerCase()}`} style={{ display: "block", padding: "9px 12px", textDecoration: "none", color: C.ink, borderTop: `1px solid ${C.rule}` }}>
              <b style={{ fontWeight: 700 }}>{s.name}</b> <span style={{ fontSize: 12.5, color: C.sub }}>· {s.races}</span>
            </Link>
          ))}
        </div>
      )}
      {q.trim() && !hits.length && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>No Senate or governor race in that state this year.</div>}
    </div>
  );
}
