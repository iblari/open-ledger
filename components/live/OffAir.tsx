"use client";

/**
 * State B — off air.
 *
 * The old idle page was a marketing hero, a card announcing that nothing was
 * live, and a schedule; the archive it told you to browse wasn't on it, and
 * neither was the "check any video" input. This replaces all of that with a
 * page that gets you to something worth watching.
 *
 * The differentiator made visible: every archive row carries a stacked
 * verdict bar, so you can see which broadcasts were contentious before
 * opening one.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useIsMobileViewport } from "@/lib/viewport";
import type { HomeArchiveItem, HomeScheduleItem, TopicTally } from "@/lib/live-home";
import TopicBreakdown from "./TopicBreakdown";
import AgendaRadar from "./AgendaRadar";
import type { MomentumResult, TopicShift } from "@/lib/topic-breadth";

const C = {
  // Same cream as the homepage. The old greyer #E7E2D9 made this page read
  // like an admin screen next to the rest of the site.
  bg: "#f8f5f0",
  paper: "#E7E2D9", card: "#FFFEFC", ink: "#14110E", secondary: "#5F5850",
  muted: "#8C8479", faint: "#A69E92", rule: "#DFD9CF", rule2: "#D6D0C5",
  ok: "#0E7477", mis: "#B45309", con: "#C2410C", accent: "#C0392B",
};
const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,monospace";

function VerdictBar({ counts, total }: { counts: HomeArchiveItem["counts"]; total: number }) {
  const sum = counts.match + counts.misleading + counts.contradicted;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", background: C.rule, flex: 1, minWidth: 80 }}>
        {sum === 0 ? null : ([["match", counts.match, C.ok], ["misleading", counts.misleading, C.mis], ["contradicted", counts.contradicted, C.con]] as const)
          .filter(([, n]) => n > 0)
          .map(([k, n, col]) => <div key={k} style={{ flex: n, background: col }} title={`${n} ${k}`} />)}
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, flexShrink: 0 }}>{total}</span>
    </div>
  );
}

// Pinned to Eastern: these are Washington events, and formatting in the
// viewer's zone made the server HTML (UTC) and the browser disagree on the
// text — React hydration error #418 — and could even shift the date.
const TZ = "America/New_York";
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ, timeZoneName: "short" });


/** One control, one promise. */
function AlertButton() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "open" | "busy" | "on">("idle");
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    const v = email.trim();
    // Tell people what's wrong instead of doing nothing. The old version
    // silently returned on an empty field, so a mis-typed address looked
    // identical to a broken button.
    if (!v) { setErr("Enter your email address first."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setErr("That doesn't look like an email address."); return; }
    setErr(null);
    setState("busy");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v, source: "live-alerts", liveAlerts: true }),
      });
      if (r.ok) setState("on");
      else { setState("open"); setErr("Couldn't sign you up just then — try again?"); }
    } catch { setState("open"); setErr("Network trouble — try again?"); }
  };

  if (state === "on") {
    return (
      <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "#7FD1C7", whiteSpace: "nowrap" }}>
        ✓ You&rsquo;re on the list — we&rsquo;ll email you when a broadcast starts
      </span>
    );
  }
  if (state === "idle") {
    return (
      <button onClick={() => setState("open")} style={{
        background: C.card, color: C.ink, border: "none", borderRadius: 5,
        padding: "9px 15px", fontFamily: SANS, fontSize: 12, fontWeight: 700,
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
      }}>Alert me when we go live</button>
    );
  }
  // Open state takes a FULL ROW of the strip rather than competing with the
  // schedule text for leftover space. Previously this sat in a flexShrink:0
  // span next to a flex:1 sibling, and on a wide screen with a long event
  // title the field collapsed to a bare caret — no visible box, no
  // placeholder, no clue what to type. That's what people were hitting.
  return (
    <div style={{ flexBasis: "100%", minWidth: 0 }}>
      <label htmlFor="vu-alert-email" style={{
        display: "block", fontFamily: SANS, fontSize: 11, fontWeight: 700,
        letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint, marginBottom: 7,
      }}>
        Your email address
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          id="vu-alert-email"
          autoFocus
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={e => { setEmail(e.target.value); if (err) setErr(null); }}
          onKeyDown={e => { if (e.key === "Enter") go(); }}
          placeholder="you@example.com"
          aria-label="Your email address"
          aria-invalid={err ? true : undefined}
          style={{
            flex: "1 1 240px", minWidth: 200, maxWidth: 340,
            padding: "10px 12px", borderRadius: 5,
            border: err ? "1.5px solid #E88A72" : "1.5px solid transparent",
            fontFamily: SANS, fontSize: 16, outline: "none",
            // Explicit, not inherited. This field sits on a near-black strip,
            // and with nothing declared the browser resolved it to dark text
            // on a dark box — you could not see what you were typing.
            // colorScheme pins it to light so a dark-mode OS can't restyle the
            // control back out from under us.
            background: "#FFFEFC",
            color: C.ink,
            caretColor: C.ink,
            colorScheme: "light",
          }}
        />
        <button onClick={go} disabled={state === "busy"} style={{
          background: C.ok, color: "#fff", border: "none", borderRadius: 5,
          padding: "10px 16px", fontFamily: SANS, fontSize: 12, fontWeight: 700,
          cursor: state === "busy" ? "default" : "pointer", whiteSpace: "nowrap",
        }}>{state === "busy" ? "Signing you up…" : "Email me when live"}</button>
        <button onClick={() => { setState("idle"); setErr(null); }} style={{
          background: "none", border: "none", color: C.faint,
          fontFamily: SANS, fontSize: 11.5, cursor: "pointer", padding: "10px 4px",
        }}>Cancel</button>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: err ? "#E88A72" : C.faint, marginTop: 7, lineHeight: 1.5 }}>
        {err || "One email when a broadcast starts. Nothing else, and you can unsubscribe from any of them."}
      </div>
    </div>
  );
}

/**
 * Titles arrive exactly as the channel wrote them: "LIVE: …" on recordings
 * that ended days ago, a trailing date the card already shows, and the
 * speaker's full title at the front of nearly every one. Split the speaker
 * out and trim the noise; the original stays in the tooltip.
 */
const SPEAKERS: [RegExp, string][] = [
  [/^President Trump(?:[‘'’]s)?\s+/i, "Trump"],
  [/^(?:Vice President\s+)?JD Vance(?:[‘'’]s)?\s+/i, "Vance"],
];
export function cleanTitle(raw: string): { title: string; speaker: string | null } {
  let t = raw.trim().replace(/^(?:WATCH\s+)?LIVE:\s*/i, "");
  let speaker: string | null = null;
  for (const [re, who] of SPEAKERS) {
    if (re.test(t)) { speaker = who; t = t.replace(re, ""); break; }
  }
  if (speaker) {
    if (/^and the First Lady\s+/i.test(t)) { speaker += " & First Lady"; t = t.replace(/^and the First Lady\s+/i, ""); }
    t = t.replace(/^(?:Delivers|Holds|Gives)\s+/i, "").replace(/^Participates? in (?:an?\s+|the\s+)?/i, "");
  }
  t = t
    .replace(/,?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s+\d{4}$/i, "")
    .replace(/\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/, "")
    .trim();
  if (!t) t = raw;
  return { title: t.charAt(0).toUpperCase() + t.slice(1), speaker };
}

const thumb = (id: string, size: "mq" | "hq") => `https://i.ytimg.com/vi/${id}/${size}default.jpg`;

function Thumb({ id, size, duration }: { id: string; size: "mq" | "hq"; duration: string }) {
  return (
    <span style={{ position: "relative", display: "block", aspectRatio: "16 / 9", background: "#1A1613", overflow: "hidden" }}>
      {/* hqdefault is 4:3 with letterbox bars baked in; cover crops them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb(id, size)} alt="" loading="lazy" decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <span style={{ position: "absolute", left: 8, bottom: 8, fontFamily: SANS, fontSize: 11, fontWeight: 600, color: "#fff", background: "rgba(12,10,8,.72)", padding: "3px 7px", borderRadius: 4 }}>
        ▶ {duration}
      </span>
    </span>
  );
}

function Tally({ counts, total, size = 11.5 }: { counts: HomeArchiveItem["counts"]; total: number; size?: number }) {
  return (
    <span style={{ fontFamily: SANS, fontSize: size, color: C.secondary }}>
      <b style={{ color: C.ok, fontWeight: 600 }}>{counts.match} true</b> · <b style={{ color: C.mis, fontWeight: 600 }}>{counts.misleading} misleading</b> · <b style={{ color: C.con, fontWeight: 600 }}>{counts.contradicted} false</b>
      <span style={{ color: C.muted }}> · {total} claims</span>
    </span>
  );
}

function BroadcastCarousel({ items, onWatch }: { items: HomeArchiveItem[]; onWatch: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const card = el.firstElementChild as HTMLElement | null; if (!card) return;
    const step = card.offsetWidth + 12;
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / step))));
  };
  const go = (i: number) => {
    const el = ref.current; const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  };
  return (
    <div>
      <style>{`
        .oa-car{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
          padding:4px 20px 8px;margin:0 -20px;scrollbar-width:none}
        .oa-car::-webkit-scrollbar{display:none}
        .oa-car>button{flex:0 0 84%;scroll-snap-align:center}
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ ...H2, margin: 0 }}>Broadcasts</h2>
        <span style={{ display: "flex", gap: 10, fontFamily: SANS, fontSize: 11, color: C.muted }}>
          {([["True", C.ok], ["Misleading", C.mis], ["False", C.con]] as const).map(([l, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>
          ))}
        </span>
      </div>
      <div ref={ref} className="oa-car" onScroll={onScroll} role="list" aria-label="Recent broadcasts">
        {items.map((a, i) => {
          const t = cleanTitle(a.title);
          return (
            <button key={a.id} role="listitem" onClick={() => onWatch(a.id)} title={a.title} aria-label={`${t.title}, ${fmtDate(a.date)}`} style={{
              display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer", padding: 0, font: "inherit",
              background: C.card, border: `1px solid ${C.rule}`, borderRadius: 18, overflow: "hidden", minWidth: 0,
            }}>
              <Thumb id={a.id} size={i === 0 ? "hq" : "mq"} duration={a.duration} />
              <span style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 16px 16px" }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted }}>
                  {i === 0 ? "Latest · " : ""}{fmtDate(a.date)}{t.speaker ? ` · ${t.speaker}` : ""}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, lineHeight: 1.2, color: C.ink, margin: "5px 0 14px", flex: 1 }}>
                  {t.title}
                </span>
                <VerdictBar counts={a.counts} total={a.total} />
                <span style={{ marginTop: 7 }}><Tally counts={a.counts} total={a.total} size={11.5} /></span>
                <span style={{ fontFamily: SANS, fontSize: 13.5, color: C.ok, fontWeight: 700, marginTop: 14 }}>Watch with fact-check →</span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Position pill, as on Apple's carousels; each dot jumps to its card. */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center", background: "#ECE7DF", borderRadius: 99, padding: "9px 14px" }}>
          {items.map((a, i) => (
            <button key={a.id} onClick={() => go(i)} aria-label={`Go to broadcast ${i + 1} of ${items.length}`} aria-current={i === active ? "true" : undefined} style={{
              width: i === active ? 22 : 7, height: 7, borderRadius: 99, border: "none", padding: 0, cursor: "pointer",
              background: i === active ? C.ink : "#B8B0A4", transition: "width .2s ease, background .2s ease",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Replays: every broadcast ever covered ─────────────────────────────
   Grouped by month, newest first; filter by speaker and subject; search
   what was actually said. Ceremonies with no economic claims stay behind a
   toggle so they don't read as empty cards. */
const VERD: Record<string, [string, string]> = {
  "TRUE": ["True", C.ok], "MOSTLY TRUE": ["True", C.ok], "MISLEADING": ["Misleading", C.mis], "FALSE": ["False", C.con],
};
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const monthOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" });

function ReplaysArchive({ items, onWatch }: { items: HomeArchiveItem[]; onWatch: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [speaker, setSpeaker] = useState<string>("all");
  const [topic, setTopic] = useState<string>("all");
  const [showQuiet, setShowQuiet] = useState(false);
  // Months fold up (only the newest open) on every screen — the full list
  // was dozens of screens on phones and several on desktop. Within an open
  // month, desktop shows two rows until asked for the rest.
  const phone = useIsMobileViewport(640);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const PEEK = 8;
  const [openMonths, setOpenMonths] = useState<Set<string> | null>(null);
  const toggleMonth = (m: string, first: string) => setOpenMonths(prev => {
    const cur = new Set(prev ?? [first]);
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    return cur;
  });

  const speakers = (() => {
    const m = new Map<string, number>();
    for (const a of items) if (a.total > 0) { const k = a.speaker || "Other speakers"; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => (a[0] === "Other speakers" ? 1 : b[0] === "Other speakers" ? -1 : b[1] - a[1]));
  })();
  const topics = (() => {
    const m = new Map<string, number>();
    for (const a of items) for (const t of a.topics || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();

  const term = q.trim().toLowerCase();
  const searching = term.length >= 2;
  const pool = items.filter(a =>
    (showQuiet || a.total > 0 || searching) &&
    (speaker === "all" || (a.speaker || "Other speakers") === speaker) &&
    (topic === "all" || (a.topics || []).includes(topic))
  );

  const hits = searching
    ? pool.map(a => ({ a, matches: (a.quotes || []).filter(x => x.q.toLowerCase().includes(term)) }))
        .filter(h => h.matches.length || h.a.title.toLowerCase().includes(term))
    : [];

  const groups: [string, HomeArchiveItem[]][] = [];
  if (!searching) for (const a of pool) {
    const m = monthOf(a.date);
    const g = groups.find(x => x[0] === m);
    if (g) g[1].push(a); else groups.push([m, [a]]);
  }
  const quietCount = items.filter(a => a.total === 0).length;

  const chip = (on: boolean): React.CSSProperties => ({
    flex: "none", border: `1px solid ${on ? C.ink : C.rule}`, background: on ? C.ink : C.card,
    color: on ? "#f8f5f0" : C.ink, borderRadius: 99, padding: "6px 12px",
    fontFamily: SANS, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <section aria-labelledby="replays-h" style={{ marginTop: 40 }}>
      <style>{`.rp-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.rp-chips::-webkit-scrollbar{display:none}
        .rp-ctl{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px}
        @media (max-width:560px){
          .rp-list{gap:8px!important}
          .rp-list .oa-row>.oa-th{width:96px!important}
          .rp-list .oa-row>.oa-th>span{min-height:64px!important}
          .rp-list .oa-row .oa-body{padding:8px 10px!important}
          .rp-list .oa-row .oa-t{font-size:14px!important;margin:2px 0 6px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        }
        @media (min-width:561px){
          .rp-list{gap:10px!important}
          .rp-list .oa-row .oa-body{padding:9px 12px 11px!important}
          .rp-list .oa-row .oa-t{font-size:14.5px!important;margin:2px 0 8px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        }
        @media (max-width:640px){.rp-ctl{grid-template-columns:1fr}}`}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 id="replays-h" style={{ ...H2, margin: 0 }}>Replays · {items.filter(a => a.total > 0).length} broadcasts</h2>
        <span style={{ display: "flex", gap: 14, fontFamily: SANS, fontSize: 11.5, color: C.muted }}>
          {([["True", C.ok], ["Misleading", C.mis], ["False", C.con]] as const).map(([l, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}</span>
          ))}
        </span>
      </div>

      <div className="rp-ctl">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search what was said"
          placeholder="Search what was said — tariffs, gas prices, jobs…"
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", border: `1px solid ${C.rule}`, borderRadius: 10, background: C.card, fontFamily: SANS, fontSize: 14, color: C.ink }} />
        <select value={topic} onChange={e => setTopic(e.target.value)} aria-label="Subject"
          style={{ padding: "11px 12px", border: `1px solid ${C.rule}`, borderRadius: 10, background: C.card, fontFamily: SANS, fontSize: 14, color: C.ink }}>
          <option value="all">All subjects</option>
          {topics.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
      </div>
      {speakers.length > 1 && (
        <div className="rp-chips" role="tablist" aria-label="Speaker" style={{ marginTop: 10 }}>
          <button type="button" role="tab" aria-selected={speaker === "all"} onClick={() => setSpeaker("all")} style={chip(speaker === "all")}>Everyone</button>
          {speakers.map(([sp, n]) => (
            <button key={sp} type="button" role="tab" aria-selected={speaker === sp} onClick={() => setSpeaker(sp)} style={chip(speaker === sp)}>{sp} · {n}</button>
          ))}
        </div>
      )}

      {searching ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
            {hits.reduce((n, h) => n + h.matches.length, 0)} checked {hits.reduce((n, h) => n + h.matches.length, 0) === 1 ? "claim" : "claims"} in {hits.length} {hits.length === 1 ? "broadcast" : "broadcasts"}
          </div>
          {hits.length === 0 && <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.secondary, padding: "18px 0" }}>Nothing checked matches “{q.trim()}”.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hits.map(({ a, matches }) => {
              const t = cleanTitle(a.title);
              return (
                <button key={a.id} onClick={() => onWatch(a.id)} className="oa-card" style={{
                  display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 0, textAlign: "left", cursor: "pointer", padding: 0, font: "inherit",
                  background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden",
                }}>
                  <Thumb id={a.id} size="mq" duration={a.duration} />
                  <span style={{ padding: "10px 14px", minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 11.5, color: C.muted }}>{fmtDate(a.date)}{t.speaker ? ` · ${t.speaker}` : ""}</span>
                    <span style={{ display: "block", fontFamily: SERIF, fontSize: 15.5, fontWeight: 600, color: C.ink, margin: "2px 0 6px" }}>{t.title}</span>
                    {matches.slice(0, 3).map((m, i) => {
                      const v = VERD[(m.r || "").toUpperCase()];
                      return (
                        <span key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontFamily: SANS, fontSize: 12.5, color: C.secondary, marginTop: 3 }}>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, flex: "none" }}>{mmss(m.t)}</span>
                          {v && <b style={{ color: v[1], fontWeight: 700, flex: "none", fontSize: 11 }}>{v[0].toUpperCase()}</b>}
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{m.q}”</span>
                        </span>
                      );
                    })}
                    {matches.length > 3 && <span style={{ display: "block", fontFamily: SANS, fontSize: 11.5, color: C.muted, marginTop: 3 }}>+{matches.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {groups.length === 0 && <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.secondary, padding: "22px 0" }}>No broadcasts match these filters.</div>}
          {groups.map(([month, list]) => {
            const first = groups[0][0];
            const open = (openMonths ?? new Set([first])).has(month);
            const capped = !phone && !expanded.has(month) && list.length > PEEK;
            const shown = capped ? list.slice(0, PEEK) : list;
            return (
            <div key={month} style={{ marginTop: phone ? 10 : 12 }}>
              <button type="button" onClick={() => toggleMonth(month, first)} aria-expanded={open} style={{
                display: "flex", alignItems: "baseline", gap: 10, width: "100%", textAlign: "left", font: "inherit",
                background: "none", border: "none", borderBottom: `1px solid ${C.rule}`, padding: "10px 0 8px",
                margin: open ? "0 0 10px" : 0, cursor: "pointer", color: "inherit",
              }}>
                <span style={{ fontFamily: SERIF, fontSize: phone ? 17 : 18, fontWeight: 600, color: C.ink }}>{month}</span>
                <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted }}>{list.length} {list.length === 1 ? "broadcast" : "broadcasts"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ marginLeft: "auto", alignSelf: "center", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
                  <path d="M2 4l4 4 4-4" fill="none" stroke={C.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && <div className="oa-grid rp-list">
                {shown.map(a => {
                  const t = cleanTitle(a.title);
                  return (
                    <button key={a.id} onClick={() => onWatch(a.id)} className="oa-card oa-row" title={a.title} style={{
                      display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer", padding: 0, font: "inherit",
                      background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden", minWidth: 0,
                    }}>
                      <span className="oa-th" style={{ display: "block" }}><Thumb id={a.id} size="mq" duration={a.duration} /></span>
                      <span className="oa-body" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, padding: "12px 14px 14px" }}>
                        <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted }}>{fmtDate(a.date)}{t.speaker ? ` · ${t.speaker}` : ""}</span>
                        <span className="oa-t" style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, lineHeight: 1.25, color: C.ink, margin: "4px 0 12px", flex: 1 }}>{t.title}</span>
                        {a.total > 0
                          ? <VerdictBar counts={a.counts} total={a.total} />
                          : <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted }}>No economic claims</span>}
                      </span>
                    </button>
                  );
                })}
              </div>}
              {open && capped && (
                <button type="button" onClick={() => setExpanded(prev => new Set(prev).add(month))} style={{
                  background: "none", border: "none", padding: "10px 0 0", cursor: "pointer", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.ok,
                }}>Show all {list.length} from {month.split(" ")[0]} →</button>
              )}
            </div>
            );
          })}
          {quietCount > 0 && (
            <button onClick={() => setShowQuiet(v => !v)} aria-expanded={showQuiet} style={{
              background: "none", border: "none", padding: "14px 0 0", cursor: "pointer", fontFamily: SANS, fontSize: 12.5, color: C.muted,
            }}>
              {quietCount} {quietCount === 1 ? "broadcast" : "broadcasts"} with no economic claims (ceremonies, arrivals) · <span style={{ color: C.ok, fontWeight: 600 }}>{showQuiet ? "Hide" : "Show"}</span>
            </button>
          )}
        </>
      )}
    </section>
  );
}

export default function OffAir({
  archive, schedule, topics, topicTail, topicMomentum, topicShift, topicTotals, onWatch,
  liveNow = null, onReturnLive,
}: {
  /** Set while a broadcast is live and the viewer stepped out to browse:
   *  the band becomes a "live now — return" bar instead of "off air". */
  liveNow?: { title: string } | null;
  onReturnLive?: () => void;
  archive: HomeArchiveItem[]; schedule: HomeScheduleItem[];
  topics: TopicTally[];
  topicTail: TopicTally | null;
  topicMomentum: MomentumResult[];
  topicShift?: TopicShift | null;
  topicTotals: { claims: number; broadcasts: number; since: string | null };
  onWatch: (id: string) => void;
}) {
  // Broadcasts that produced no economic claims (a ceremony, an arrival) are
  // real coverage but look broken as a row with an empty bar and a "0".
  // They're kept one tap away instead.
  const withClaims = archive.filter(a => a.total > 0);
  const [featured, ...rest] = withClaims;
  const [next, ...later] = schedule;
  const f = featured ? cleanTitle(featured.title) : null;

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <style>{`
        .oa-card{transition:transform .15s ease, box-shadow .15s ease}
        .oa-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(20,17,14,.10)}
        .oa-card:focus-visible{outline:2px solid ${C.ok};outline-offset:3px}
        .oa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
        .oa-feat{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
        @media (max-width:760px){.oa-feat{grid-template-columns:1fr}.oa-grid{grid-template-columns:1fr 1fr;gap:10px}}
        /* Phones: compact rows (thumbnail beside text) — full-width cards made
           the list eight screens long. */
        @media (max-width:560px){
          .oa-grid{grid-template-columns:1fr;gap:10px}
          .oa-row{flex-direction:row!important;align-items:stretch}
          .oa-row>.oa-th{width:128px;flex:none}
          .oa-row>.oa-th>span{aspect-ratio:auto!important;height:100%;min-height:84px}
          .oa-row .oa-body{padding:10px 12px!important}
          .oa-row .oa-t{font-size:14.5px!important;margin:3px 0 8px!important}
        }
        .oa-mob{display:none}
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .oa-chips::-webkit-scrollbar{display:none}
        /* Phones: the band is a status line, not a hero — it was taking a
           whole screen before any broadcast appeared. */
        @media (max-width:560px){
          .oa-band{padding:18px 16px 16px!important}
          .oa-h1{font-size:24px!important}
          .oa-sub{display:none}
          .oa-row1{margin-top:8px!important;gap:12px!important;align-items:center!important}
          .oa-chips{flex-wrap:nowrap!important;overflow-x:auto;margin:14px -16px 0!important;padding:0 16px;scrollbar-width:none}
          .oa-chips>span{font-size:11px!important;padding:4px 10px!important}
        }
        @media (max-width:560px){.oa-mob{display:block}.oa-desk{display:none}}
        @media (prefers-reduced-motion:reduce){.oa-card{transition:none}.oa-card:hover{transform:none}}
      `}</style>

      {liveNow && onReturnLive && (
        <section style={{ background: "#0C0A08", color: "#FFFEFC", borderBottom: "1px solid #231E1A" }}>
          <div className="oa-band" style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: "#F08A7E" }}>
              <Link href="/" className="vu-back" aria-label="Back to Vote Unbiased home" title="Back to Vote Unbiased home" style={{
                width: 30, height: 30, borderRadius: "50%", border: "1px solid #332C27", color: "#E7E2D9",
                display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                textDecoration: "none", marginRight: 6, flex: "none", letterSpacing: 0,
              }}>←</Link>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#E0493A", animation: "pulse 2s infinite" }} />
              LIVE NOW<span className="oa-sub">&nbsp;· FACT-CHECKING IN PROGRESS</span>
            </div>
            <div className="oa-row1" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
              <h1 className="oa-h1" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "clamp(24px, 3.4vw, 38px)", lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0, flex: "1 1 420px", minWidth: 0 }}>
                {cleanTitle(liveNow.title).title}
              </h1>
              <button type="button" onClick={onReturnLive} style={{
                fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer",
                background: "#E0493A", color: "#fff", border: "none", borderRadius: 8, padding: "12px 18px", whiteSpace: "nowrap",
              }}>Return to live →</button>
            </div>
          </div>
        </section>
      )}

      {/* ── Dark band: what's next, and the one action off air ── */}
      {!liveNow && (
      <section style={{ background: "#0C0A08", color: "#FFFEFC" }}>
        <div className="oa-band" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px 34px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: C.faint }}>
            {/* Same icon-only round back control as the replay player, so
                "back" looks the same everywhere in Live Broadcast. */}
            <Link href="/" className="vu-back" aria-label="Back to Vote Unbiased home" title="Back to Vote Unbiased home" style={{
              width: 30, height: 30, borderRadius: "50%", border: "1px solid #332C27", color: "#E7E2D9",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15,
              textDecoration: "none", marginRight: 6, flex: "none", letterSpacing: 0,
            }}>←</Link>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6B645C" }} />
            OFF AIR{next ? <> · NEXT UP {fmtWhen(next.startsAt).toUpperCase()}</> : null}
          </div>
          <div className="oa-row1" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ minWidth: 0, flex: "1 1 420px" }}>
              <h1 className="oa-h1" style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "clamp(30px, 4.6vw, 52px)", lineHeight: 1.04, letterSpacing: "-0.02em", margin: 0 }}>
                {next ? next.title : "Nothing scheduled right now"}
              </h1>
              <p className="oa-sub" style={{ fontFamily: SANS, fontSize: 15, color: C.faint, margin: "10px 0 0", lineHeight: 1.5 }}>
                {next
                  ? <>We&rsquo;ll fact-check it live, claim by claim, against official data.</>
                  : "Official events are usually announced a few hours ahead. Coverage starts automatically."}
              </p>
            </div>
            <AlertButton />
          </div>
          {later.length > 0 && (
            <div className="oa-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 22 }}>
              {later.slice(0, 4).map(s => (
                <span key={s.title + s.startsAt} className="oa-chip" style={{ fontFamily: SANS, fontSize: 12, color: "#BDB5A8", border: "1px solid #332C27", borderRadius: 99, padding: "5px 12px", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: MONO, color: C.faint }}>{fmtDate(s.startsAt)}</span> · {s.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 20px 48px" }}>
        {!featured ? (
          <div style={{ background: C.card, border: `1px dashed ${C.rule2}`, borderRadius: 10, padding: "34px 22px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No recent broadcasts yet</div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.secondary, lineHeight: 1.6, maxWidth: "44ch", margin: "0 auto" }}>
              Coverage runs automatically whenever an official channel goes live.
            </p>
          </div>
        ) : (
          <>
            {/* Phones: one swipeable row, the latest broadcast first and the
                rest waiting to its right — like Apple's product carousels —
                instead of eight screens of stacked cards. */}
            <div className="oa-mob">
              <BroadcastCarousel items={[featured, ...rest.slice(0, 5)]} onWatch={onWatch} />
            </div>

            <div className="oa-desk">
            <h2 style={H2}>Latest</h2>
            <button onClick={() => onWatch(featured.id)} className="oa-card oa-feat" title={featured.title} style={{
              width: "100%", textAlign: "left", cursor: "pointer", padding: 0, font: "inherit",
              background: C.card, border: `1px solid ${C.rule}`, borderRadius: 12, overflow: "hidden",
            }}>
              <Thumb id={featured.id} size="hq" duration={featured.duration} />
              <span style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "22px 24px", minWidth: 0 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: C.muted }}>
                  {fmtDate(featured.date)}{f?.speaker ? ` · ${f.speaker}` : ""}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: "clamp(21px, 2.4vw, 28px)", fontWeight: 600, lineHeight: 1.18, color: C.ink, margin: "6px 0 16px" }}>
                  {f?.title}
                </span>
                <VerdictBar counts={featured.counts} total={featured.total} />
                <span style={{ marginTop: 8 }}><Tally counts={featured.counts} total={featured.total} /></span>
                <span style={{ fontFamily: SANS, fontSize: 14, color: C.ok, fontWeight: 700, marginTop: 18 }}>
                  Watch with fact-check →
                </span>
              </span>
            </button>

            </div>

            <ReplaysArchive items={archive} onWatch={onWatch} />
          </>
        )}

        <div style={{ marginTop: 44 }}>
          <AgendaRadar />
        </div>
        {/* The older "more, and less" panel (TopicShiftPanel, claim-based) was
            removed: the agenda radar above answers the same question from full
            transcripts. */}
        <div style={{ marginTop: 22 }}>
          <TopicBreakdown topics={topics} tail={topicTail} momentum={topicMomentum} totals={topicTotals} />
        </div>

        <footer style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${C.rule2}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
            Every claim checked against
          </span>
          {["BLS", "BEA", "Census", "Treasury", "Federal Reserve"].map(x => (
            <span key={x} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: C.secondary }}>{x}</span>
          ))}
          <Link href="/" style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11.5, color: C.muted, textDecoration: "none" }}>
            ← voteunbiased.org
          </Link>
        </footer>
      </div>
    </div>
  );
}

const H2: React.CSSProperties = {
  fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
  textTransform: "uppercase", color: C.muted, margin: "0 0 12px",
};
