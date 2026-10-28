"use client";
import { useEffect, useState } from "react";
import { useLoc } from "@/lib/local-client";
import type { LocalBench as LB } from "@/lib/local";
import LocationPicker, { LOCAL_INK } from "./LocationPicker";

/** Your region at the same month of every term, next to the US figure.
 *  Without a saved location: a quiet prompt that opens the picker. */
export default function LocalBench({ metric, month, admins }: { metric: "inflation" | "gas"; month: number; admins: { id: string; name: string }[] }) {
  const loc = useLoc();
  const [d, setD] = useState<LB | null>(null);
  useEffect(() => {
    if (!loc) { setD(null); return; }
    let on = true;
    fetch(`/api/local/bench?metric=${metric}&state=${loc.state.code}&month=${month}`).then(r => (r.ok ? r.json() : null)).then(j => { if (on) setD(j?.ok ? j : null); }).catch(() => {});
    return () => { on = false; };
  }, [loc?.state.code, metric, month]);

  const box = { background: "#fff", border: "1px solid #e2ded6", borderLeft: `3px solid ${LOCAL_INK}`, borderRadius: 0, padding: "12px 16px", marginTop: 16 } as const;
  if (!loc) return (
    <div data-nosnippet style={{ ...box, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
      <span style={{ color: "#5c5856" }}>{metric === "gas" ? "Gas prices differ by region." : "Inflation differs by region."} See yours next to the national figure.</span>
      <LocationPicker cta="Set your location" />
    </div>
  );
  if (!d) return <div data-nosnippet style={{ ...box, fontSize: 13, color: "#8c8479" }}>Loading {loc.state.name}'s region…</div>;
  const f = (v: number | null) => (v == null ? "—" : d.unit === "%" ? `${v.toFixed(1)}%` : `$${v.toFixed(2)}`);
  const name = (id: string) => admins.find(a => a.id === id)?.name ?? id;
  const shown = d.rows.filter(r => r.us != null);
  return (
    <div data-nosnippet style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: LOCAL_INK }}>{d.place} vs US at month {month + 1} of each term</div>
        <LocationPicker compact />
      </div>
      <div style={{ fontSize: 12, color: "#8c8479", margin: "2px 0 8px" }}>{loc.state.name} is in the {d.place}. {d.source}.</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 300 }}>
          <thead><tr style={{ color: "#8c8479", fontSize: 12, textAlign: "left" }}><th style={{ padding: "4px 0", fontWeight: 600 }}>Administration</th><th style={{ fontWeight: 600, textAlign: "right" }}>{d.place.replace(" region", "").replace(" (PADD)", "")}</th><th style={{ fontWeight: 600, textAlign: "right" }}>US</th><th style={{ fontWeight: 600, textAlign: "right" }}>Gap</th></tr></thead>
          <tbody>{shown.map(r => {
            const gap = r.local != null && r.us != null ? r.local - r.us : null;
            return (
              <tr key={r.admin} style={{ borderTop: "1px solid #efebe4" }}>
                <td style={{ padding: "6px 0" }}>{name(r.admin)}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: LOCAL_INK }}>{f(r.local)}{r.local != null && r.localDate && r.localDate !== r.date && <sup title={`Nearest published month: ${r.localDate}`} style={{ fontWeight: 400, color: "#8c8479" }}> *</sup>}</td>
                <td style={{ textAlign: "right", color: "#5c5856" }}>{f(r.us)}</td>
                <td style={{ textAlign: "right", color: "#5c5856" }}>{gap == null ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${d.unit === "%" ? Math.abs(gap).toFixed(1) + " pts" : "$" + Math.abs(gap).toFixed(2)}`}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: "#8c8479", marginTop: 8 }}>Regional data starts in {d.since}; earlier terms show “—”.{shown.some(r => r.local != null && r.localDate && r.localDate !== r.date) && " * Early regional figures were published every other month; the nearest month is shown."} US figures here use the same basis as the regional ones, so they can differ slightly from the chart above. <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>Source</a> · <a href="/methodology#localize" style={{ color: "inherit" }}>How we localize</a></div>
    </div>
  );
}
