"use client";
import { useEffect, useRef, useState } from "react";
import type { RaceResult } from "@/lib/results";

/**
 * Election-night card(s) for the visitor's state: candidates side by side,
 * countdown until polls close, then official counts as reported (refreshing
 * every 30 s), then the winner once a call is recorded with its source.
 * Photos: /candidates/<slug>.jpg if present (added by the site owner), else initials.
 */
type Cand = { name: string; p: string };
type RaceIn = { id: string; title: string; cands: Cand[] };
const INK = "#14110E", SUB = "#6B655C", MUTE = "#8A8378", RULE = "#E6E0D6";
const PARTY: Record<string, string> = { D: "#4361a6", R: "#b8372d" };
const col = (p: string) => PARTY[p] || "#6b655c";
const slug = (n: string) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const fmt = (n: number) => n.toLocaleString("en-US");
const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

function Face({ c, dim }: { c: Cand; dim?: boolean }) {
  const [bad, setBad] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A missing photo can fail before React hydrates (onError never fires), so check on mount too.
  useEffect(() => { const el = img.current; if (el && el.complete && el.naturalWidth === 0) setBad(true); }, []);
  return (
    <span style={{ position: "relative", width: 64, height: 64, flexShrink: 0, opacity: dim ? 0.5 : 1 }}>
      {!bad
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img ref={img} src={`/candidates/${slug(c.name)}.jpg`} alt={c.name} onError={() => setBad(true)} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", display: "block", background: "#ECE7DF" }} />
        : <span style={{ width: 64, height: 64, borderRadius: "50%", background: col(c.p), color: "#fff", display: "grid", placeItems: "center", fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 23 }}>{initials(c.name)}</span>}
      <span style={{ position: "absolute", right: -3, bottom: -3, width: 21, height: 21, borderRadius: 5, background: col(c.p), color: "#fff", fontSize: 11, fontWeight: 600, display: "grid", placeItems: "center", border: "2px solid #fff" }}>{c.p === "D" || c.p === "R" ? c.p : "I"}</span>
    </span>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, Date.parse(to) - now);
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return <span suppressHydrationWarning>{d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, "0")}s`}</span>;
}

export default function LiveRaceCards({ st, stateName, races, initialClosesAt }: { st: string; stateName: string; races: RaceIn[]; initialClosesAt: string }) {
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [res, setRes] = useState<Record<string, RaceResult | null>>({});
  const [now, setNow] = useState(() => Date.now());
  const closed = now >= Date.parse(closesAt);

  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/results?st=${st}`).then(r => r.json()).then(j => {
      if (!alive) return;
      setClosesAt(j.closesAt);
      setRes(Object.fromEntries((j.races || []).map((r: { id: string; result: RaceResult | null }) => [r.id, r.result])));
    }).catch(() => {});
    load();
    // Refresh every 30 s from an hour before polls close; once a minute otherwise.
    const t = setInterval(() => { setNow(Date.now()); if (Date.parse(closesAt) - Date.now() < 3600_000) load(); }, 30_000);
    const t2 = setInterval(load, 60_000 * 5);
    return () => { alive = false; clearInterval(t); clearInterval(t2); };
  }, [st, closesAt]);

  const closeLabel = new Date(closesAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {races.map(race => {
        const r = res[race.id];
        const main = race.cands.slice(0, 2);
        const total = r ? r.cands.reduce((s, c) => s + c.votes, 0) : 0;
        const pct = (name: string) => { const c = r?.cands.find(x => x.name.toLowerCase() === name.toLowerCase()); return c && total ? (c.votes / total) * 100 : null; };
        const votes = (name: string) => r?.cands.find(x => x.name.toLowerCase() === name.toLowerCase())?.votes ?? null;
        const live = closed && r && total > 0;
        const winner = r?.called?.name?.toLowerCase();
        return (
          <section key={race.id} style={{ background: "#fff", border: `1px solid ${RULE}`, borderRadius: 14, padding: "14px 16px", fontFamily: "'DM Sans',system-ui,sans-serif", color: INK }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: MUTE }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {live && !winner && <span className="vu-live-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#C1272D" }} />}
                {live && !winner ? "LIVE · " : ""}{st} · {race.title.toUpperCase()}
              </span>
              <span>{!closed ? `RESULTS AT ${closeLabel} ET` : r?.pctCounted != null ? `${Math.round(r.pctCounted)}% COUNTED` : live ? "COUNTING" : "POLLS CLOSED"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12, gap: 10 }}>
              {main.map((c, i) => (
                <div key={c.name} style={{ display: "flex", flexDirection: "column", alignItems: i ? "flex-end" : "flex-start", textAlign: i ? "right" : "left", flex: 1, minWidth: 0 }}>
                  <Face c={c} dim={!!winner && winner !== c.name.toLowerCase()} />
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>{c.name}</div>
                  {winner === c.name.toLowerCase() && <span style={{ fontSize: 11, background: INK, color: "#fff", borderRadius: 4, padding: "2px 7px", marginTop: 5 }}>✓ Winner · {r!.called!.by}</span>}
                  {live && pct(c.name) != null && <>
                    <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 28, lineHeight: 1, marginTop: 8, color: col(c.p), opacity: winner && winner !== c.name.toLowerCase() ? 0.6 : 1 }}>{pct(c.name)!.toFixed(1)}%</div>
                    <div style={{ fontSize: 12, color: SUB, marginTop: 3 }}>{fmt(votes(c.name)!)} votes</div>
                  </>}
                </div>
              ))}
            </div>
            {live ? (
              <>
                <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", marginTop: 10, background: "#ECE7DF", position: "relative" }}>
                  <div style={{ width: `${pct(main[0].name) ?? 0}%`, background: col(main[0].p) }} />
                  <div style={{ flex: 1 }} />
                  <div style={{ width: `${pct(main[1]?.name ?? "") ?? 0}%`, background: col(main[1]?.p ?? "") }} />
                  <span style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: INK }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTE, marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                  <span>Official counts as reported · {r!.sourceUrl ? <a href={r!.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: MUTE }}>{r!.source}</a> : r!.source}</span>
                  <span suppressHydrationWarning>Updated {ago(r!.updatedAt)}</span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                {!closed ? <>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: MUTE }}>MOST {stateName.toUpperCase()} POLLS CLOSE IN</div>
                  <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 30, marginTop: 3 }}><Countdown to={closesAt} /></div>
                  <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>Live official counts appear here when polls close.</div>
                </> : <div style={{ fontSize: 13, color: SUB }}>Polls have closed. Waiting for the first official counts…</div>}
              </div>
            )}
          </section>
        );
      })}
      <style>{`@keyframes vuPulse{50%{opacity:.25}}.vu-live-dot{animation:vuPulse 1.4s infinite}`}</style>
    </div>
  );
}
