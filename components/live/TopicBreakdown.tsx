"use client";

/**
 * What the claims were about, and how each subject scored.
 *
 * Hand-rolled bars rather than a chart library. OffAir already draws stacked
 * verdict bars for every archive row in exactly this idiom, and recharts would
 * ship a client-side renderer to redraw twenty divs — while breaking the
 * typography the rest of the page sets by hand.
 *
 * Bar length encodes the topic's share of all claims, and the segments within
 * it are proportional to that topic's own total. A subject with three claims
 * and one with twenty-five never read as equally weighted, which is the
 * failure mode of showing rates alone.
 *
 * Each bar opens to the claims behind it: a chart asserting that every
 * immigration claim was false should be one click from the sentences backing
 * it, or the reader takes the number on faith.
 *
 * LAYOUT — the row is two different shapes.
 *   Wide: one line, label | bar | count | rate.
 *   Narrow: label and rate on the first line, bar spanning the full width
 *   beneath. Fitting all four into 375px left the bar around 140px and the
 *   opened panel, indented to clear a 120px desktop label, gave quotes a
 *   ~220px column that broke them across three words a line.
 * Handled in CSS rather than a JS breakpoint so the server and client render
 * the same markup and there is no resize listener to keep in sync.
 */

import { useCallback, useState } from "react";
import type { TopicTally } from "@/lib/claim-topics";

const C = {
  card: "#FFFEFC", ink: "#14110E", secondary: "#5F5850",
  muted: "#8C8479", faint: "#A69E92", rule: "#DFD9CF", paper: "#E7E2D9",
  ok: "#0E7477", mis: "#B45309", con: "#C2410C", unscored: "#C9C2B6",
};
const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";

/** Claims shown before the list asks to be expanded. Crime & policing carries
 *  25; dropping all of them into a phone makes the chart unreachable below. */
const PREVIEW = 5;

interface HoverInfo {
  label: string; count: number; topic: string; color: string;
  x: number; y: number;
}

interface TopicClaimRow {
  quote: string; rating: string; topic: string;
  speaker: string | null; day: string; broadcast: string;
}

const VERDICT: Record<string, string> = {
  "FALSE": C.con, "MISLEADING": C.mis, "TRUE": C.ok, "MOSTLY TRUE": C.ok,
};

const CSS = `
.vu-row{display:flex;align-items:center;gap:10px;width:100%;border:none;
  border-radius:4px;padding:5px 6px;margin:0 -6px 2px;cursor:pointer;
  text-align:left;font:inherit;position:relative;flex-wrap:wrap}
.vu-caret{font-size:9px;width:8px;flex-shrink:0;transition:transform .12s}
.vu-open .vu-caret{transform:rotate(90deg)}
.vu-label{font-family:${SANS};font-size:11.5px;width:120px;flex-shrink:0;
  text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vu-barwrap{flex:1;min-width:0;display:flex;align-items:center;gap:8px}
.vu-bar{min-width:6px;display:flex;height:13px;border-radius:2px;overflow:hidden}
.vu-count{font-family:${SANS};font-size:10.5px;flex-shrink:0}
.vu-rate{font-family:${SANS};font-size:11px;font-weight:600;width:38px;
  flex-shrink:0;text-align:right}
.vu-seg{transition:opacity .14s ease,filter .14s ease}
.vu-row:hover .vu-seg{opacity:.42}
.vu-row:hover .vu-seg:hover{opacity:1;filter:brightness(1.14)}
.vu-tip{animation:vu-tip-in .13s ease-out}
@keyframes vu-tip-in{from{opacity:0;transform:translate(-50%,2px)}}
.vu-panel{margin:2px 0 10px 138px;padding-left:12px;border-left:2px solid ${C.rule}}
.vu-claim{display:flex;gap:10px;align-items:flex-start;padding:8px 0;
  border-bottom:1px solid ${C.rule}}
.vu-badge{font-family:${SANS};font-size:9px;font-weight:700;letter-spacing:.04em;
  border-radius:3px;padding:2px 5px;flex-shrink:0;margin-top:2px;white-space:nowrap}
.vu-quote{font-family:${SERIF};font-size:13.5px;line-height:1.5;display:block}
.vu-meta{font-family:${SANS};font-size:10.5px;display:block;margin-top:3px}
@media (max-width:640px){
  .vu-row{gap:8px;row-gap:5px}
  /* Label and rate share line one; the bar takes the whole of line two, so it
     is legible instead of being crushed into what is left over. */
  .vu-label{width:auto;flex:1;text-align:left;font-size:12px;order:1}
  .vu-rate{order:2;width:auto}
  .vu-barwrap{order:3;flex-basis:100%;padding-left:18px}
  .vu-bar{height:11px}
  /* The desktop indent cleared a fixed-width label that no longer exists here. */
  .vu-panel{margin-left:0;padding-left:10px}
  /* Badge above the quote: as a left column it took a third of the width and
     left the text in a ribbon. */
  .vu-claim{flex-direction:column;gap:5px;padding:10px 0}
  .vu-badge{margin-top:0;align-self:flex-start}
  .vu-quote{font-size:14.5px}
}
@media (prefers-reduced-motion:reduce){
  .vu-seg,.vu-caret{transition:none}
  .vu-tip{animation:none}
}`;

function ClaimRow({ c, showTopic }: { c: TopicClaimRow; showTopic: boolean }) {
  const color = VERDICT[c.rating] ?? C.faint;
  return (
    <li className="vu-claim">
      <span className="vu-badge" style={{ color, border: `1px solid ${color}` }}>
        {c.rating || "—"}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="vu-quote" style={{ color: C.ink }}>&ldquo;{c.quote}&rdquo;</span>
        <span className="vu-meta" style={{ color: C.faint }}>
          {c.speaker ?? "speaker not attributed"} · {c.day}{showTopic ? ` · ${c.topic}` : ""}
        </span>
      </span>
    </li>
  );
}

function Bar({
  t, widthPct, open, busy, error, claims, onToggle, onHover,
}: {
  t: TopicTally; widthPct: number; open: boolean; busy: boolean;
  error: string | null; claims: TopicClaimRow[] | null;
  onToggle: () => void; onHover: (h: HoverInfo | null) => void;
}) {
  const [all, setAll] = useState(false);
  const segs: [number, string, string][] = [
    [t.false, C.con, "False"],
    [t.misleading, C.mis, "Misleading"],
    [t.accurate, C.ok, "True or mostly true"],
    [t.unscored, C.unscored, "Not scored"],
  ];
  const panelId = `topic-${t.topic.replace(/\W+/g, "-")}`;
  const shown = claims ? (all ? claims : claims.slice(0, PREVIEW)) : null;
  const hidden = claims ? claims.length - (shown?.length ?? 0) : 0;

  const enter = (label: string, n: number, color: string) => (e: React.MouseEvent<HTMLSpanElement>) =>
    onHover({ label, count: n, topic: t.topic, color, x: e.clientX, y: e.currentTarget.getBoundingClientRect().top });

  return (
    <div>
      <button
        type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
        className={`vu-row${open ? " vu-open" : ""}`}
        style={{ background: open ? C.paper : "transparent" }}
      >
        <span aria-hidden className="vu-caret" style={{ color: C.faint }}>▶</span>
        <span className="vu-label" style={{ color: C.secondary }}>{t.topic}</span>
        <span className="vu-barwrap">
          <span className="vu-bar" style={{ width: `${widthPct}%` }}>
            {segs.map(([n, color, label]) =>
              n > 0 ? (
                <span key={label} className="vu-seg" style={{ flex: n, background: color }}
                  onMouseEnter={enter(label, n, color)} onMouseMove={enter(label, n, color)}
                  onMouseLeave={() => onHover(null)} />
              ) : null
            )}
          </span>
          <span className="vu-count" style={{ color: C.faint }}>{t.total}</span>
          {/* The hover tooltip is mouse-only. Without this the segment counts
              would be unreachable by keyboard or screen reader, which is how
              the native title attribute this replaced failed. */}
          <span style={{
            position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
            overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
          }}>
            {segs.filter(([n]) => n > 0).map(([n, , l]) => `${n} ${l.toLowerCase()}`).join(", ")}.
          </span>
        </span>
        <span className="vu-rate" style={{
          color: t.rate === null ? C.faint : t.rate >= 0.8 ? C.con : t.rate <= 0.4 ? C.ok : C.secondary,
        }}>{t.rate === null ? "—" : `${Math.round(t.rate * 100)}%`}</span>
      </button>

      {open && (
        <div id={panelId} className="vu-panel">
          {busy && <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: "6px 0" }}>Loading claims…</p>}
          {/* An error must not render as an empty list — "we couldn't load this"
              and "nothing was said about this" are different claims to make. */}
          {!busy && error && (
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.con, margin: "6px 0" }}>
              {error}{" "}
              <button type="button" onClick={onToggle} style={{
                font: "inherit", color: C.secondary, background: "none", border: "none",
                textDecoration: "underline", cursor: "pointer", padding: 0,
              }}>Try again</button>
            </p>
          )}
          {!busy && !error && shown && (
            shown.length === 0
              ? <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: "6px 0" }}>No claims recorded.</p>
              : <>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {shown.map((c, i) => <ClaimRow key={`${c.day}-${i}`} c={c} showTopic={Boolean(t.members?.length)} />)}
                  </ul>
                  {hidden > 0 && (
                    <button type="button" onClick={() => setAll(true)} style={{
                      fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: C.secondary,
                      background: "none", border: "none", padding: "9px 0 2px",
                      cursor: "pointer", textDecoration: "underline",
                    }}>Show {hidden} more</button>
                  )}
                </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopicBreakdown({
  topics, tail, totals,
}: {
  topics: TopicTally[];
  tail: TopicTally | null;
  totals: { claims: number; broadcasts: number; since: string | null };
}) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, TopicClaimRow[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async (t: TopicTally) => {
    if (open === t.topic) { setOpen(null); return; }
    setOpen(t.topic);
    setError(null);
    if (cache[t.topic]) return;
    setBusy(true);
    try {
      // The tail's label is a synthetic count, so it asks for the subjects it
      // absorbed by name.
      const names = t.members?.length ? t.members : [t.topic];
      const r = await fetch(`/api/topic-claims?topics=${encodeURIComponent(names.join(","))}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setCache(prev => ({ ...prev, [t.topic]: d.claims ?? [] }));
    } catch {
      setError("Couldn't load these claims.");
    } finally {
      setBusy(false);
    }
  }, [open, cache]);

  if (!topics.length || totals.claims === 0) return null;
  const max = Math.max(...topics.map(t => t.total));
  const since = totals.since
    ? new Date(totals.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const row = (t: TopicTally, widthPct: number) => (
    <Bar
      key={t.topic} t={t} widthPct={widthPct}
      open={open === t.topic}
      busy={open === t.topic && busy}
      error={open === t.topic ? error : null}
      claims={cache[t.topic] ?? null}
      onToggle={() => { void toggle(t); }}
      onHover={setHover}
    />
  );

  return (
    <section
      style={{
        background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8,
        padding: "18px 20px 16px",
      }}
      // A bar can be left mid-hover if the pointer exits fast enough that the
      // segment never sees a mouseleave, stranding the tooltip on screen.
      onMouseLeave={() => setHover(null)}
    >
      <style>{CSS}</style>

      {hover && (
        <div role="presentation" className="vu-tip" style={{
          position: "fixed", left: hover.x, top: hover.y - 34,
          transform: "translateX(-50%)", zIndex: 40, pointerEvents: "none",
          background: C.ink, color: "#FFFEFC", borderRadius: 5,
          padding: "5px 9px", fontFamily: SANS, fontSize: 11.5, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 2px 10px rgba(20,17,14,.22)",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: hover.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{hover.count}</span>
          <span style={{ opacity: .8 }}>{hover.label.toLowerCase()}</span>
          <span style={{ opacity: .5 }}>· {hover.topic}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 3 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: C.ink, margin: 0 }}>
          What gets claimed, and what holds up
        </h2>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint }}>
          {totals.claims} claims · {totals.broadcasts} broadcasts{since ? ` · since ${since}` : ""}
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "0 0 14px", maxWidth: "62ch" }}>
        Every claim we have checked, grouped by subject. Bar length is how much gets said
        about it; the figure on the right is the share of checkable claims that were false
        or misleading. Select any subject to read the claims behind it.
      </p>

      <div>
        {topics.map(t => row(t, (t.total / max) * 100))}
        {/* The tail keeps the bars summing to the total in the header. Without
            it a top-N slice silently drops claims the header still counts. */}
        {tail && tail.total > 0 && (
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px dashed ${C.rule}` }}>
            {row(tail, (Math.min(tail.total, max) / max) * 100)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 11, borderTop: `1px solid ${C.rule}` }}>
        {([["False", C.con], ["Misleading", C.mis], ["True", C.ok], ["Not scored", C.unscored]] as const).map(([label, color]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: SANS, fontSize: 10.5, color: C.muted }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />{label}
          </span>
        ))}
      </div>

      <p style={{ fontFamily: SANS, fontSize: 10, color: C.faint, lineHeight: 1.55, margin: "9px 0 0" }}>
        Subjects are assigned by a fixed keyword list, so the same claim always lands in the
        same place. Claims we could not settle are shown but excluded from the percentage —
        being unable to check something is not evidence it was false. Topics with only a
        handful of claims will swing a lot as more broadcasts are covered.
      </p>
    </section>
  );
}
