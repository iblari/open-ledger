"use client";

import { useEffect, useState } from "react";
import { useIsMobileViewport } from "@/lib/viewport";
import type { Radar, RadarRow, RadarEntity } from "@/lib/agenda-radar";

/**
 * Agenda radar: which subjects, companies and countries officials are
 * talking about MORE (lib/agenda-radar.ts has the method). Fetched after
 * paint so it never slows the page it sits on.
 */
const C = {
  card: "#FFFEFC", ink: "#14110E", secondary: "#5F5850", muted: "#8C8479", rule: "#DFD9CF",
  up: "#0E7477", upBg: "#E3F1EE", down: "#B45309", downBg: "#F6EBDD", newc: "#C0392B", newBg: "#F8E4E1",
  watch: "#4A6E8A", watchBg: "#E4ECF2",
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
  const [label, fg, bg] = s === "new" ? ["NEW", C.newc, C.newBg] : s === "rising" ? ["▲ RISING", C.up, C.upBg]
    : s === "watch" ? ["WATCH", C.watch, C.watchBg] : ["▼ FADING", C.down, C.downBg];
  return <span style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: fg, background: bg, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{label}</span>;
}

/** "9.4×" up, "↓ 6.2×" down (earlier rate ÷ recent), "new" from nothing. */
function fmtMult(t: RadarRow): string {
  if (t.status === "fading") {
    if (!t.recentRate) return "gone";
    const d = t.baseRate / t.recentRate;
    return `↓ ${d >= 10 ? Math.round(d) : d.toFixed(1)}×`;
  }
  if (!t.baseRate) return "new";
  const m = t.recentRate / t.baseRate;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1)}×`;
}

function ThemeRow({ t, first }: { t: RadarRow; first: boolean }) {
  const down = t.status === "fading";
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${C.rule}`, padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: C.ink, flex: 1, minWidth: 0 }}>{t.label}</span>
        <b style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 500, color: down ? C.down : C.up }}>{fmtMult(t)}</b>
        <Spark data={t.weekly.slice(-5)} color={down ? C.down : C.up} />
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted, marginTop: 2 }}>
        {down ? `${t.baseRate} → ${t.recentRate} per 10k words` : `${t.sectors.length ? t.sectors.join(" · ") + " · " : ""}${t.recentBroadcasts} broadcasts`}
      </div>
    </div>
  );
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
          <b style={{ fontFamily: MONO, fontWeight: 500, color: C.ink }}>{fmtMult(t)}</b> {t.status === "fading" ? `(${t.baseRate} → ${t.recentRate} per 10k)` : mult ? "the earlier rate" : "this fortnight"}<br />
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

function EntityRow({ e, open, onToggle, first }: { e: RadarEntity; open: boolean; onToggle: () => void; first: boolean }) {
  const dot = e.status === "new" ? C.newc : e.status === "rising" ? C.up : e.status === "watch" ? C.watch : e.status === "fading" ? C.down : null;
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${C.rule}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{
        all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
        width: "100%", boxSizing: "border-box", padding: "8px 12px",
      }}>
        <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{e.name}</span>
        {e.ticker && e.ticker !== "private" && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{e.ticker}</span>}
        {e.role && <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{e.role}</span>}
        {dot && <span title={e.status} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: dot }}>{e.status === "new" ? "NEW" : e.status === "rising" ? "▲" : e.status === "watch" ? "WATCH" : "▼"}</span>}
        {e.firstSeen && <span title={`First named ${fmtDay(e.firstSeen)}`} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: C.newc, background: C.newBg, borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap" }}>1ST {fmtDay(e.firstSeen).toUpperCase()}</span>}
        <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 12, color: C.secondary, whiteSpace: "nowrap" }}>
          <b style={{ color: C.ink, fontFamily: MONO, fontWeight: 500 }}>{e.recentCount}</b>
          <span style={{ color: C.muted }}> · {e.totalBroadcasts}bc</span>
        </span>
        <span aria-hidden style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
      {open && e.last && (
        <div style={{ padding: "0 12px 10px", fontFamily: SANS, fontSize: 12.5, color: C.secondary, lineHeight: 1.5 }}>
          <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink }}>“…{e.last.text}…”</div>
          <div style={{ marginTop: 5 }}>
            {fmtDay(e.last.date)}{" · "}<a href={`/live?v=${encodeURIComponent(e.last.videoId)}`} style={{ color: C.up, fontWeight: 600 }}>▶ Watch{e.last.t != null ? ` at ${stamp(e.last.t)}` : ""}</a>
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
  const [tab, setTab] = useState<"cos" | "ppl" | "ctry">("cos");
  const [dir, setDir] = useState<"up" | "watch" | "down">("up");
  const phone = useIsMobileViewport(640);
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
  const watch = r.themes.filter(t => t.status === "watch");
  const rows = (dir === "up" ? up : dir === "watch" ? watch : down).slice(0, 10);
  const cos = r.companies.filter(c => c.recentCount > 0);
  const ppl = (r.people || []).filter(c => c.recentCount > 0);
  const ctry = r.countries.filter(c => c.recentCount > 0);
  const list = tab === "cos" ? cos : tab === "ppl" ? ppl : ctry;
  const shown = allCos ? list.slice(0, 20) : list.slice(0, 6);

  return (
    <section aria-labelledby="radar-h" style={{ fontFamily: SANS }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Agenda radar</div>
      <h2 id="radar-h" style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 24, margin: "4px 0 4px", color: C.ink }}>What they&rsquo;re talking about more, and less</h2>
      <div style={{ fontSize: 12.5, color: C.secondary, lineHeight: 1.5 }}>
        Last 14 days ({r.window.recentBroadcasts} broadcasts, {Math.round(r.window.recentWords / 1000)}k words) against the {r.window.baseBroadcasts} before, measured per 10,000 words of full transcript.
      </div>

      <div role="tablist" aria-label="Rising or fading" style={{ display: "flex", background: "#EFEAE2", borderRadius: 99, padding: 3, margin: "14px 0 8px", maxWidth: phone ? undefined : 420 }}>
        {([["up", "▲ Rising", up.length, C.up], ["watch", "● Watch", watch.length, C.watch], ["down", "▼ Fading", down.length, C.down]] as const).map(([k, l, n, c]) => (
          <button key={k} type="button" role="tab" aria-selected={dir === k} onClick={() => setDir(k)} style={{
            flex: 1, border: "none", cursor: "pointer", borderRadius: 99, padding: "7px 0",
            fontFamily: SANS, fontSize: 13, fontWeight: dir === k ? 700 : 500,
            background: dir === k ? "#fff" : "transparent", color: dir === k ? c : C.secondary,
            boxShadow: dir === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
          }}>{l} · {n}</button>
        ))}
      </div>
      {dir === "watch" && rows.length > 0 && (
        <div style={{ fontSize: 12, color: C.secondary, margin: "0 2px 8px" }}>Early signals: climbing fast in the last 3 broadcasts. Not confirmed yet.</div>
      )}
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.muted, padding: "8px 2px" }}>
          {dir === "watch" ? "No early signals right now. Themes climbing fast get flagged here before they count as Rising." : "Nothing moved clearly enough yet."}
        </div>
      ) : phone ? (
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden" }}>
          {rows.map((t, i) => <ThemeRow key={t.key} t={t} first={i === 0} />)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
          {rows.map(t => <ThemeCard key={t.key} t={t} />)}
        </div>
      )}

      <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 18, margin: "22px 0 8px", color: C.ink }}>Named on air</h3>
      <div role="tablist" aria-label="Named on air" style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {([["cos", `Companies · ${cos.length}`], ["ppl", `People · ${ppl.length}`], ["ctry", `Countries · ${ctry.length}`]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setAllCos(false); setOpen(null); }} style={{
            fontFamily: SANS, fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 99, cursor: "pointer",
            border: `1px solid ${tab === k ? C.ink : C.rule}`, background: tab === k ? C.ink : C.card, color: tab === k ? "#f8f5f0" : C.ink,
          }}>{l}</button>
        ))}
      </div>
      {list.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, padding: "0 12px 4px" }}>
            <span>{tab === "cos" ? "Company · ticker" : tab === "ppl" ? "Person · role" : "Country"}</span><span>Last 14 days · broadcasts</span>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden" }}>
            {shown.map((e, i) => <EntityRow key={e.name} first={i === 0} e={e} open={open === e.name} onToggle={() => setOpen(o => (o === e.name ? null : e.name))} />)}
          </div>
          {list.length > 6 && (
            <button type="button" onClick={() => setAllCos(v => !v)} style={{ background: "none", border: "none", padding: "8px 0 0", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.up }}>
              {allCos ? "Show fewer" : `Show more (${Math.min(list.length, 20)})`}
            </button>
          )}
        </>
      )}

    </section>
  );
}
