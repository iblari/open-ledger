"use client";

import { useEffect, useState } from "react";
import type { Radar, RadarRow, RadarEntity } from "@/lib/agenda-radar";

/**
 * Agenda radar: which subjects, companies and countries officials are
 * talking about MORE (lib/agenda-radar.ts has the method). Fetched after
 * paint so it never slows the page it sits on.
 */
const C = {
  card: "#FFFEFC", ink: "#14110E", secondary: "#5F5850", muted: "#8C8479", rule: "#DFD9CF",
  up: "#0E7477", upBg: "#E3F1EE", down: "#B45309", downBg: "#F6EBDD", newc: "#C0392B", newBg: "#F8E4E1",
};
const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,monospace";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const stamp = (t: number | null) => t == null ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 0.1);
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 22 }}>
      {data.map((v, i) => (
        <span key={i} style={{ width: 5, height: v > 0 ? Math.max(2, (v / max) * 22) : 1, background: v > 0 ? color : C.rule, borderRadius: 1, opacity: i === data.length - 1 ? 1 : 0.75 }} />
      ))}
    </span>
  );
}

function Badge({ s }: { s: RadarRow["status"] }) {
  if (s === "steady") return null;
  const [label, fg, bg] = s === "new" ? ["NEW", C.newc, C.newBg] : s === "rising" ? ["▲ RISING", C.up, C.upBg] : ["▼ FADING", C.down, C.downBg];
  return <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: fg, background: bg, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{label}</span>;
}

function ThemeCard({ t }: { t: RadarRow }) {
  const mult = t.baseRate > 0 ? t.recentRate / t.baseRate : null;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 16.5, fontWeight: 500, color: C.ink, flex: 1, minWidth: 0 }}>{t.label}</span>
        <Badge s={t.status} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.secondary, lineHeight: 1.35 }}>
          <b style={{ fontFamily: MONO, fontWeight: 500, color: C.ink }}>{mult ? `${mult >= 10 ? Math.round(mult) : mult.toFixed(1)}×` : "new"}</b> {mult ? "the earlier rate" : "this fortnight"}<br />
          in {t.recentBroadcasts} recent broadcast{t.recentBroadcasts === 1 ? "" : "s"}
        </span>
        <Spark data={t.weekly} color={t.status === "fading" ? C.down : C.up} />
      </div>
      {t.sectors.length > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted }}>
          Sectors it touches: <span style={{ color: C.ink }}>{t.sectors.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

function EntityRow({ e, open, onToggle }: { e: RadarEntity; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 9, padding: "9px 11px" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", width: "100%" }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink }}>{e.name}</span>
        {e.ticker && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "1px 5px" }}>{e.ticker}</span>}
        <Badge s={e.status} />
        <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 12, color: C.secondary, whiteSpace: "nowrap" }}>
          <b style={{ color: C.ink }}>{e.recentCount}</b> recent · {e.totalBroadcasts} broadcast{e.totalBroadcasts === 1 ? "" : "s"}
        </span>
      </button>
      {open && e.last && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.rule}`, fontFamily: SANS, fontSize: 12.5, color: C.secondary, lineHeight: 1.5 }}>
          <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink }}>“…{e.last.text}…”</div>
          <div style={{ marginTop: 5 }}>
            {fmtDay(e.last.date)} · {e.last.title.replace(/,? (?:Sep|Oct|Aug|Nov|Dec)\.? \d+, \d{4}$/, "")}
            {" · "}<a href={`/live?v=${encodeURIComponent(e.last.videoId)}`} style={{ color: C.up, fontWeight: 600 }}>▶ Watch{e.last.t != null ? ` at ${stamp(e.last.t)}` : ""}</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgendaRadar() {
  const [r, setR] = useState<Radar | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [allCos, setAllCos] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/radar").then(x => x.json()).then(d => { if (alive) { if (d && !d.error) setR(d); else setErr(true); } }).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, []);
  if (err) return null;
  if (!r) return <div style={{ minHeight: 120 }} />;

  const market = r.themes.filter(t => t.market);
  const up = market.filter(t => t.status === "rising" || t.status === "new");
  const down = r.themes.filter(t => t.status === "fading");
  const cos = r.companies.filter(c => c.recentCount > 0);
  const shownCos = allCos ? cos : cos.slice(0, 6);
  const ctry = r.countries.filter(c => c.recentCount > 0).slice(0, 10);

  return (
    <section aria-labelledby="radar-h" style={{ fontFamily: SANS }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Agenda radar</div>
      <h2 id="radar-h" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 24, margin: "4px 0 4px", color: C.ink }}>What they&rsquo;re talking about more</h2>
      <div style={{ fontSize: 12.5, color: C.secondary, lineHeight: 1.5 }}>
        Last 14 days ({r.window.recentBroadcasts} broadcasts, {Math.round(r.window.recentWords / 1000)}k words) against the {r.window.baseBroadcasts} before, measured per 10,000 words of full transcript.
      </div>

      {up.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8, marginTop: 14 }}>
          {up.slice(0, 6).map(t => <ThemeCard key={t.key} t={t} />)}
        </div>
      )}
      {down.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 10, lineHeight: 1.6 }}>
          <span style={{ color: C.down, fontWeight: 700 }}>▼ Fading:</span>{" "}
          {down.map(t => `${t.label} (${t.baseRate} → ${t.recentRate})`).join(" · ")}
        </div>
      )}

      {cos.length > 0 && (
        <>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, margin: "22px 0 8px", color: C.ink }}>Companies named on air</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shownCos.map(e => <EntityRow key={e.name} e={e} open={open === e.name} onToggle={() => setOpen(o => (o === e.name ? null : e.name))} />)}
          </div>
          {cos.length > 6 && (
            <button type="button" onClick={() => setAllCos(v => !v)} style={{ background: "none", border: "none", padding: "8px 0 0", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.up }}>
              {allCos ? "Show fewer" : `Show all ${cos.length} companies`}
            </button>
          )}
        </>
      )}

      {ctry.length > 0 && (
        <>
          <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, margin: "20px 0 8px", color: C.ink }}>Countries</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ctry.map(c => (
              <span key={c.name} style={{ fontSize: 12.5, background: C.card, border: `1px solid ${C.rule}`, borderRadius: 99, padding: "5px 10px", color: C.ink }}>
                {c.name} <b style={{ fontFamily: MONO, fontWeight: 500 }}>{c.recentCount}</b>
                {c.status === "rising" || c.status === "new" ? <span style={{ color: C.up, fontWeight: 700 }}> ▲</span> : c.status === "fading" ? <span style={{ color: C.down, fontWeight: 700 }}> ▼</span> : null}
              </span>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, marginTop: 14 }}>
        Rising = a statistically clear jump in rate (Poisson z ≥ 2) that shows up in at least two separate broadcasts, so one long speech can&rsquo;t fake a trend.
        Mentions include everyone on stage, not only the principal. Full transcripts for {r.coverage.withTranscript} of {r.coverage.total} broadcasts so far; the rest are being added.
        What was said and which sectors it touches — not investment advice.
      </p>
    </section>
  );
}
