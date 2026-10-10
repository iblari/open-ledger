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

const TONE: Record<string, [string, string, string]> = {
  positive: ["Positive", "#0E7477", "#E3F1EE"], neutral: ["Neutral", "#8C8479", "#EEEAE3"],
  concerned: ["Concerned", "#B45309", "#F6EBDD"], hostile: ["Hostile", "#C0392B", "#F8E4E1"],
};

function PriceLine({ closes, w = 76, h = 20 }: { closes: number[]; w?: number; h?: number }) {
  const mn = Math.min(...closes), mx = Math.max(...closes), r = mx - mn || 1;
  const up = closes[closes.length - 1] >= closes[0];
  const d = closes.map((v, i) => `${i ? "L" : "M"}${(2 + (i / (closes.length - 1)) * (w - 4)).toFixed(1)},${(h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", flex: "none" }}><path d={d} fill="none" stroke={up ? C.up : "#C2410C"} strokeWidth={1.7} strokeLinejoin="round" /></svg>;
}

function TonePill({ tone, compact }: { tone?: RadarEntity["tone"]; compact?: boolean }) {
  if (!tone) return <span style={{ width: compact ? 10 : 88, flex: "none" }} />;
  const [label, fg, bg] = TONE[tone.label];
  return (
    <span title={`Tone on air: ${label}`} style={{
      flex: "none", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: SANS, fontSize: 11, fontWeight: 600,
      color: fg, background: compact ? "transparent" : bg, borderRadius: 99, padding: compact ? 0 : "2px 8px",
      minWidth: compact ? undefined : 88, justifyContent: compact ? undefined : "center",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: fg }} />{compact ? null : label}
    </span>
  );
}

function EntityRow({ e, open, onToggle, first, phone, kind }: { e: RadarEntity; open: boolean; onToggle: () => void; first: boolean; phone: boolean; kind: "cos" | "ppl" | "ctry" }) {
  const dot = e.status === "new" ? C.newc : e.status === "rising" ? C.up : e.status === "watch" ? C.watch : e.status === "fading" ? C.down : null;
  const st = e.stock;
  const chg = st ? <span style={{ fontFamily: MONO, fontSize: 11.5, color: st.changePct >= 0 ? C.up : "#C2410C", width: 50, textAlign: "right", flex: "none" }}>{st.changePct >= 0 ? "+" : "−"}{Math.abs(st.changePct).toFixed(1)}%</span> : null;
  const counts = (
    <span style={{ fontFamily: SANS, fontSize: 12, color: C.secondary, whiteSpace: "nowrap" }}>
      <b style={{ color: C.ink, fontFamily: MONO, fontWeight: 500 }}>{e.recentCount}</b>
      <span style={{ color: C.muted }}> · {e.totalBroadcasts}bc</span>
    </span>
  );
  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${C.rule}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{
        all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
        width: "100%", boxSizing: "border-box", padding: "8px 12px",
      }}>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: phone ? "column" : "row", alignItems: phone ? "flex-start" : "center", gap: phone ? 1 : 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "100%" }}>
            <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{e.name}</span>
            {e.ticker && e.ticker !== "private" && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{e.ticker}</span>}
            {dot && <span title={e.status} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: dot, whiteSpace: "nowrap" }}>{e.status === "new" ? "NEW" : e.status === "rising" ? "▲" : e.status === "watch" ? "WATCH" : "▼"}</span>}
            {e.firstSeen && <span title={`First named ${fmtDay(e.firstSeen)}`} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: C.newc, background: C.newBg, borderRadius: 3, padding: "1px 4px", whiteSpace: "nowrap" }}>1ST {fmtDay(e.firstSeen).toUpperCase()}</span>}
          </span>
          {phone ? (
            <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
              {e.role ? `${e.role} · ` : ""}{e.recentCount} mentions · {e.totalBroadcasts}bc{e.tone ? ` · ${TONE[e.tone.label][0]}` : ""}
            </span>
          ) : e.role ? <span style={{ fontFamily: SANS, fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{e.role}</span> : null}
        </span>
        {!phone && counts}
        {kind === "cos" && (st ? <><PriceLine closes={st.closes} w={phone ? 56 : 76} />{chg}</> : <span style={{ width: phone ? 106 : 134, flex: "none", textAlign: "right", fontSize: 11, color: "#A69E92" }}>{e.ticker && e.ticker !== "private" ? "" : "private"}</span>)}
        <TonePill tone={e.tone} compact={phone} />
        <span aria-hidden style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </button>
      {open && (e.last || e.tone || st) && (
        <div style={{ padding: "0 12px 10px", fontFamily: SANS, fontSize: 12.5, color: C.secondary, lineHeight: 1.5 }}>
          {e.last && <>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink }}>“…{e.last.text}…”</div>
            <div style={{ marginTop: 5 }}>
              {fmtDay(e.last.date)}{" · "}<a href={`/live?v=${encodeURIComponent(e.last.videoId)}`} style={{ color: C.up, fontWeight: 600 }}>▶ Watch{e.last.t != null ? ` at ${stamp(e.last.t)}` : ""}</a>
            </div>
          </>}
          {e.tone && (
            <div style={{ marginTop: 6 }}>
              Tone on air: <b style={{ color: TONE[e.tone.label][1] }}>{TONE[e.tone.label][0]}</b>
              {" "}<span style={{ color: C.muted }}>({(["positive", "neutral", "concerned", "hostile"] as const).filter(l => e.tone!.counts[l]).map(l => `${e.tone!.counts[l]} ${TONE[l][0].toLowerCase()}`).join(", ")} across broadcasts)</span>
            </div>
          )}
          {st && (
            <div style={{ marginTop: 4 }}>
              {st.symbol}, last 14 days: ${st.closes[0].toLocaleString()} → ${st.closes[st.closes.length - 1].toLocaleString()} ({st.changePct >= 0 ? "+" : "−"}{Math.abs(st.changePct).toFixed(1)}%), close of {fmtDay(st.asOf)}. Context, not a cause, and not advice.
            </div>
          )}
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
            <span>{tab === "cos" ? "Company · ticker" : tab === "ppl" ? "Person · role" : "Country"}</span>
            <span>{phone ? (tab === "cos" ? "Price 14d · tone" : "Tone") : `Last 14 days · broadcasts${tab === "cos" ? " · price, 14 days" : ""} · tone on air`}</span>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden" }}>
            {shown.map((e, i) => <EntityRow key={e.name} first={i === 0} e={e} phone={phone} kind={tab} open={open === e.name} onToggle={() => setOpen(o => (o === e.name ? null : e.name))} />)}
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
