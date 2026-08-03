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

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HomeArchiveItem, HomeScheduleItem } from "@/lib/live-home";

const C = {
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

/** Real input, not a sentence: empty → disabled, typing enables it. */
function CheckAnyVideo() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "pulling" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!url.trim() || phase === "pulling") return;
    setPhase("pulling"); setMsg("Pulling transcript…");
    try {
      const r = await fetch("/api/fetch-transcript", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.segments?.length) {
        setPhase("error");
        setMsg(d.error || "No captions available for that video yet.");
        return;
      }
      setPhase("done");
      setMsg(`Transcript found · ${d.segments.length} segments · opening the record`);
      setTimeout(() => { window.location.href = `/live?url=${encodeURIComponent(url.trim())}`; }, 700);
    } catch {
      setPhase("error"); setMsg("Couldn't reach that video.");
    }
  };

  const disabled = !url.trim() || phase === "pulling";
  return (
    <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, padding: "16px 18px" }}>
      <h3 style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, margin: "0 0 4px" }}>
        Check any video
      </h3>
      <p style={{ fontFamily: SANS, fontSize: 12, color: C.secondary, lineHeight: 1.55, margin: "0 0 11px" }}>
        Paste a YouTube link to a speech or hearing — we&rsquo;ll pull the transcript and check every economic claim in it.
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          value={url} onChange={e => { setUrl(e.target.value); if (phase !== "idle") setPhase("idle"); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="youtube.com/watch?v=…"
          style={{
            flex: 1, minWidth: 160, padding: "10px 12px", borderRadius: 5,
            border: `1px solid ${C.rule2}`, background: "#fff",
            fontFamily: SANS, fontSize: 16, color: C.ink, outline: "none",
          }}
        />
        <button onClick={submit} disabled={disabled} style={{
          padding: "10px 16px", borderRadius: 5, border: "none",
          background: disabled ? C.rule : C.ink, color: disabled ? C.muted : "#fff",
          fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
          cursor: disabled ? "default" : "pointer", flexShrink: 0,
        }}>{phase === "pulling" ? "Working…" : "Check it"}</button>
      </div>
      {phase !== "idle" && (
        <>
          {phase === "pulling" && (
            <div style={{ height: 3, borderRadius: 2, background: C.rule, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "40%", background: C.ok, animation: "vuProgress 1.1s ease-in-out infinite" }} />
            </div>
          )}
          <div style={{
            fontFamily: SANS, fontSize: 11, marginTop: 8, lineHeight: 1.5,
            color: phase === "error" ? C.con : phase === "done" ? C.ok : C.muted,
          }}>{msg}</div>
        </>
      )}
    </section>
  );
}

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

export default function OffAir({
  archive, schedule, onWatch,
}: { archive: HomeArchiveItem[]; schedule: HomeScheduleItem[]; onWatch: (id: string) => void }) {
  // The pitch is for people who haven't seen it. Returning visitors get
  // straight to the product.
  const [showMasthead, setShowMasthead] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem("vu_seen_live_masthead");
      if (!seen) { setShowMasthead(true); localStorage.setItem("vu_seen_live_masthead", "1"); }
    } catch { setShowMasthead(true); }
  }, []);

  const [featured, ...rest] = archive;
  const next = schedule[0];

  return (
    <div style={{ background: C.paper, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 40px" }}>

        {showMasthead && (
          <header style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 26 }}>
            <div style={{ flex: "2 1 420px", minWidth: 280 }}>
              <h1 style={{ fontFamily: SERIF, fontSize: "clamp(34px,5vw,56px)", fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0, color: C.ink }}>
                Every economic claim, checked against the data — as it&rsquo;s said.
              </h1>
              <p style={{ fontFamily: SANS, fontSize: 15, color: C.secondary, lineHeight: 1.6, maxWidth: "52ch", margin: "14px 0 0" }}>
                We transcribe official broadcasts live and check every number against BLS, BEA,
                Treasury and Fed series. You get the quote, the real figure and the source — no verdict on the politics.
              </p>
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 220 }}>
              {[
                ["Verbatim quotes", "Never a paraphrase, so you can check it against the tape."],
                ["The number, both ways", "What was said and what the official series says."],
                ["A record you can take", "Every broadcast downloads as a citable document."],
              ].map(([t, d], i) => (
                <div key={t} style={{ padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${C.rule2}` }}>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{t}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{d}</div>
                </div>
              ))}
            </div>
          </header>
        )}

        {/* Status strip — replaces the empty card and both CTA boxes */}
        <div style={{
          background: C.ink, borderRadius: 8, padding: "14px 18px", marginBottom: 22,
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span className="live-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: C.faint }} />
            <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.16em", color: C.faint }}>OFF AIR</span>
          </span>
          <span style={{ flex: 1, minWidth: 200, fontFamily: SANS, fontSize: 12.5, color: "#E7E2D9", lineHeight: 1.5 }}>
            {next
              ? <>Next up: <strong style={{ fontWeight: 600 }}>{next.title}</strong> · {fmtWhen(next.startsAt)}</>
              : "Nothing scheduled right now — official events are usually announced a few hours ahead."}
          </span>
          <AlertButton />
        </div>

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Archive */}
          <section style={{ flex: "1.6 1 520px", minWidth: 300 }}>
            <h2 style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted, margin: "0 0 12px" }}>
              Recent broadcasts · full record
            </h2>

            {!featured ? (
              <div style={{ background: C.card, border: `1px dashed ${C.rule2}`, borderRadius: 8, padding: "34px 22px", textAlign: "center" }}>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No broadcasts in the last 72 hours</div>
                <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.secondary, lineHeight: 1.6, maxWidth: "44ch", margin: "0 auto" }}>
                  Coverage runs automatically whenever an official channel goes live. Paste a video on the right to check one yourself in the meantime.
                </p>
              </div>
            ) : (
              <>
                <button onClick={() => onWatch(featured.id)} style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, padding: "18px 20px", marginBottom: 10,
                }}>
                  <div style={{ fontFamily: SANS, fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    {fmtDate(featured.date)} · {featured.venue} · {featured.duration}
                  </div>
                  <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, lineHeight: 1.25, color: C.ink, marginBottom: 12 }}>
                    {featured.title}
                  </div>
                  <VerdictBar counts={featured.counts} total={featured.total} />
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.ok, fontWeight: 700, marginTop: 11 }}>
                    Open the record →
                  </div>
                </button>

                {rest.slice(0, 4).map(a => (
                  <button key={a.id} onClick={() => onWatch(a.id)} style={{
                    display: "flex", width: "100%", textAlign: "left", cursor: "pointer",
                    alignItems: "center", gap: 14, flexWrap: "wrap",
                    background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8,
                    padding: "12px 16px", marginBottom: 8,
                  }}>
                    <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{a.title}</span>
                      <span style={{ display: "block", fontFamily: SANS, fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                        {fmtDate(a.date)} · {a.duration}
                      </span>
                    </span>
                    <span style={{ flex: "0 1 170px", minWidth: 120 }}>
                      <VerdictBar counts={a.counts} total={a.total} />
                    </span>
                  </button>
                ))}
              </>
            )}
          </section>

          {/* Right rail */}
          <aside style={{ flex: "1 1 340px", minWidth: 280, position: "sticky", top: 82, display: "flex", flexDirection: "column", gap: 14 }}>
            <CheckAnyVideo />

            <section style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, padding: "16px 18px" }}>
              <h3 style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, margin: "0 0 10px" }}>
                What&rsquo;s coming
              </h3>
              {schedule.length === 0 && (
                <p style={{ fontFamily: SANS, fontSize: 12, color: C.muted, margin: 0 }}>Nothing scheduled yet.</p>
              )}
              {schedule.map(s => (
                <div key={s.title + s.startsAt} style={{
                  display: "flex", gap: 11, alignItems: "flex-start",
                  padding: "10px 0", borderTop: `1px solid ${C.rule2}`,
                }}>
                  <span style={{
                    flexShrink: 0, fontFamily: MONO, fontSize: 10, color: C.ink,
                    background: C.paper, border: `1px solid ${C.rule2}`, borderRadius: 4,
                    padding: "4px 7px", textAlign: "center", lineHeight: 1.25, minWidth: 42,
                  }}>{fmtDate(s.startsAt)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{s.title}</span>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
                      {fmtWhen(s.startsAt)}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          </aside>
        </div>

        <footer style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${C.rule2}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
            Every claim checked against
          </span>
          {["BLS", "BEA", "Census", "Treasury", "Federal Reserve"].map(a => (
            <span key={a} style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: C.secondary }}>{a}</span>
          ))}
          <Link href="/" style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 11.5, color: C.muted, textDecoration: "none" }}>
            ← voteunbiased.org
          </Link>
        </footer>
      </div>
    </div>
  );
}
