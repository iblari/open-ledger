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

import { useState } from "react";
import Link from "next/link";
import type { HomeArchiveItem, HomeScheduleItem, TopicTally } from "@/lib/live-home";
import TopicBreakdown from "./TopicBreakdown";
import type { MomentumResult } from "@/lib/topic-breadth";

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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });


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

export default function OffAir({
  archive, schedule, topics, topicTail, topicMomentum, topicTotals, onWatch,
}: {
  archive: HomeArchiveItem[]; schedule: HomeScheduleItem[];
  topics: TopicTally[];
  topicTail: TopicTally | null;
  topicMomentum: MomentumResult[];
  topicTotals: { claims: number; broadcasts: number; since: string | null };
  onWatch: (id: string) => void;
}) {
  // Broadcasts that produced no economic claims (a ceremony, an arrival) are
  // real coverage but look broken as a row with an empty bar and a "0".
  // They're kept one tap away instead.
  const withClaims = archive.filter(a => a.total > 0);
  const quiet = archive.filter(a => a.total === 0);
  const [showQuiet, setShowQuiet] = useState(false);
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
          .oa-chip{white-space:normal!important}
        }
        @media (prefers-reduced-motion:reduce){.oa-card{transition:none}.oa-card:hover{transform:none}}
      `}</style>

      {/* ── Dark band: what's next, and the one action off air ── */}
      <section style={{ background: "#0C0A08", color: "#FFFEFC" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px 34px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", color: C.faint }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6B645C" }} />
            OFF AIR{next ? <> · NEXT UP {fmtWhen(next.startsAt).toUpperCase()}</> : null}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ minWidth: 0, flex: "1 1 420px" }}>
              <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: "clamp(30px, 4.6vw, 52px)", lineHeight: 1.04, letterSpacing: "-0.02em", margin: 0 }}>
                {next ? next.title : "Nothing scheduled right now"}
              </h1>
              <p style={{ fontFamily: SANS, fontSize: 15, color: C.faint, margin: "10px 0 0", lineHeight: 1.5 }}>
                {next
                  ? <>We&rsquo;ll fact-check it live, claim by claim, against official data.</>
                  : "Official events are usually announced a few hours ahead. Coverage starts automatically."}
              </p>
            </div>
            <AlertButton />
          </div>
          {later.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 22 }}>
              {later.slice(0, 4).map(s => (
                <span key={s.title + s.startsAt} className="oa-chip" style={{ fontFamily: SANS, fontSize: 12, color: "#BDB5A8", border: "1px solid #332C27", borderRadius: 99, padding: "5px 12px", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: MONO, color: C.faint }}>{fmtDate(s.startsAt)}</span> · {s.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

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

            {rest.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "36px 0 12px" }}>
                  <h2 style={{ ...H2, margin: 0 }}>Recent broadcasts</h2>
                  {/* The bars mean nothing without this. */}
                  <span style={{ display: "flex", gap: 14, fontFamily: SANS, fontSize: 11.5, color: C.muted }}>
                    {([["True", C.ok], ["Misleading", C.mis], ["False", C.con]] as const).map(([l, c]) => (
                      <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="oa-grid">
                  {rest.slice(0, 12).map(a => {
                    const t = cleanTitle(a.title);
                    return (
                      <button key={a.id} onClick={() => onWatch(a.id)} className="oa-card oa-row" title={a.title} style={{
                        display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer", padding: 0, font: "inherit",
                        background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: "hidden", minWidth: 0,
                      }}>
                        <span className="oa-th" style={{ display: "block" }}><Thumb id={a.id} size="mq" duration={a.duration} /></span>
                        <span className="oa-body" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, padding: "12px 14px 14px" }}>
                          <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted }}>
                            {fmtDate(a.date)}{t.speaker ? ` · ${t.speaker}` : ""}
                          </span>
                          <span className="oa-t" style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, lineHeight: 1.25, color: C.ink, margin: "4px 0 12px", flex: 1 }}>
                            {t.title}
                          </span>
                          <VerdictBar counts={a.counts} total={a.total} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {quiet.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setShowQuiet(v => !v)} aria-expanded={showQuiet} style={{
                  background: "none", border: "none", padding: "6px 0", cursor: "pointer",
                  fontFamily: SANS, fontSize: 12.5, color: C.muted,
                }}>
                  {quiet.length} {quiet.length === 1 ? "broadcast" : "broadcasts"} with no economic claims · <span style={{ color: C.ok, fontWeight: 600 }}>{showQuiet ? "Hide" : "Show"}</span>
                </button>
                {showQuiet && (
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                    {quiet.map(a => (
                      <li key={a.id}>
                        <button onClick={() => onWatch(a.id)} style={{
                          background: "none", border: "none", padding: "6px 0", cursor: "pointer", textAlign: "left",
                          fontFamily: SANS, fontSize: 13, color: C.secondary,
                        }}>
                          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>{fmtDate(a.date)}</span> · {cleanTitle(a.title).title} <span style={{ color: C.muted }}>· {a.duration}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 44 }}>
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
