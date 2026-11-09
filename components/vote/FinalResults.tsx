import Link from "next/link";
import { C, SERIF } from "@/lib/design-tokens";
import type { RaceResult } from "@/lib/results";
import type { Race } from "@/lib/midterms";
import { raceTitle } from "@/lib/midterms";

/** Post-election results: shared pieces for /vote and /vote/[st]. Server components. */

export const PARTY_COLOR: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
export const partyColor = (p: string) => PARTY_COLOR[p] || "#8a8378";
const H: React.CSSProperties = { fontFamily: SERIF, fontWeight: 500, letterSpacing: "-0.015em", margin: 0 };
const fmt = (n: number) => n.toLocaleString("en-US");

export interface Outcome {
  race: Race; res: RaceResult | null;
  rows: { name: string; p: string; votes: number; pct: number }[];
  total: number; margin: number | null;           // lead in points, top two
  winner: { name: string; p: string; by: string; url?: string } | null;
}
export function outcomeOf(race: Race, res: RaceResult | null): Outcome {
  const cands = res?.cands ?? [];
  const total = cands.reduce((s, c) => s + c.votes, 0);
  const rows = [...cands].sort((a, b) => b.votes - a.votes).map(c => ({ name: c.name, p: c.p || race.candidates.find(k => k.name === c.name)?.p || "", votes: c.votes, pct: total ? (c.votes / total) * 100 : 0 }));
  const margin = total && rows.length > 1 ? rows[0].pct - rows[1].pct : null;
  const call = res?.called as (RaceResult["called"] & { url?: string }) | null | undefined;
  const p = call ? (rows.find(r => r.name === call.name)?.p || race.candidates.find(k => k.name === call.name)?.p || "") : "";
  return { race, res, rows, total, margin, winner: call ? { name: call.name, p, by: call.by, url: call.url } : null };
}
export const shortTitle = (r: Race) => r.office === "senate" ? `Senate${r.special ? " (special)" : ""}` : "Governor";
export const Tag = ({ p }: { p: string }) => <span style={{ display: "inline-block", minWidth: 16, textAlign: "center", fontSize: 10.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: partyColor(p), color: "#fff", marginLeft: 5, verticalAlign: 1 }}>{p === "D" || p === "R" ? p : p || "I"}</span>;

export function CallBadge({ o, plain }: { o: Outcome; plain?: boolean }) {
  if (o.winner) {
    const inner = <>Called by {o.winner.by}{o.winner.url ? " ↗" : ""}</>;
    const st: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "#EAF3EE", color: "#0E5C3A", textDecoration: "none", whiteSpace: "nowrap" };
    return o.winner.url && !plain ? <a href={o.winner.url} target="_blank" rel="noopener noreferrer nofollow" style={st}>{inner}</a> : <span style={st}>{inner}</span>;
  }
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "#FBF1DD", color: "#7A5300", whiteSpace: "nowrap" }}>Not called</span>;
}

/** One race: winner, bars, counted, source. */
export function ResultCard({ o, heading }: { o: Outcome; heading?: string }) {
  const { res, rows, total } = o;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: C.mute }}>{heading ?? raceTitle(o.race)}</div>
        <CallBadge o={o} />
      </div>
      {o.winner && <div style={{ ...H, fontSize: 22, marginTop: 6 }}>{o.winner.name}<Tag p={o.winner.p} /> <span style={{ fontSize: 14, color: C.sub }}>won</span></div>}
      {total > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {rows.filter(r => r.pct >= 1 || rows.length <= 3).slice(0, 4).map((r, i) => (
            <div key={r.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 14.5, fontWeight: i === 0 ? 700 : 500 }}>{r.name}<Tag p={r.p} /></span>
                <span style={{ fontFamily: SERIF, fontSize: 19 }}>{r.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "#EFEBE4", marginTop: 4, overflow: "hidden" }}><div style={{ width: `${r.pct}%`, height: "100%", background: partyColor(r.p), opacity: i === 0 ? 1 : 0.45 }} /></div>
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{fmt(r.votes)} votes</div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: C.sub, margin: "10px 0 0" }}>Statewide vote totals aren&apos;t posted in a form we could read yet.</p>
      )}
      {res && (
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 10, lineHeight: 1.5 }}>
          {res.pctCounted != null ? `${Math.round(res.pctCounted)}% counted · ` : ""}Source: {res.sourceUrl ? <a href={res.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.mute }}>{res.source}</a> : res.source}. Unofficial until certified.
        </div>
      )}
    </div>
  );
}

/** Compact row for the all-results list. */
export function ResultRow({ o }: { o: Outcome }) {
  const [a, b] = o.rows;
  return (
    <Link href={`/vote/${o.race.st.toLowerCase()}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,150px) minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink }}>
      <span style={{ fontSize: 13.5 }}><b style={{ fontWeight: 700 }}>{o.race.state}</b> <span style={{ color: C.sub }}>· {shortTitle(o.race)}</span></span>
      <span style={{ minWidth: 0 }}>
        {o.total > 0 && a ? (
          <>
            <span style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2, marginBottom: 4 }}>
              {o.rows.slice(0, 3).map(r => <span key={r.name} style={{ flex: r.votes, background: partyColor(r.p), opacity: r === a ? 1 : 0.45 }} />)}
            </span>
            <span style={{ fontSize: 12.5 }}><b style={{ fontWeight: o.winner?.name === a.name ? 700 : 500 }}>{a.name}</b><Tag p={a.p} /> {a.pct.toFixed(1)}%{b ? <span style={{ color: C.sub }}> · {b.name} {b.pct.toFixed(1)}%</span> : null}</span>
          </>
        ) : <span style={{ fontSize: 12.5, color: C.sub }}>{o.winner ? <><b style={{ color: C.ink }}>{o.winner.name}</b><Tag p={o.winner.p} /> · totals not posted yet</> : "Totals not posted yet"}</span>}
      </span>
      <CallBadge o={o} plain />
    </Link>
  );
}
