"use client";

/**
 * What the claims were about, and how each subject scored.
 *
 * Hand-rolled bars rather than a chart library. OffAir already draws stacked
 * verdict bars for every archive row in exactly this idiom, and recharts would
 * ship a client-side renderer to redraw twenty divs — while breaking the
 * typography the rest of the page sets by hand.
 *
 * Bars are widths in a flex row, so every topic's segments are proportional to
 * ITS OWN total, and the row length encodes the topic's share of all claims.
 * A subject with three claims and a subject with twenty-five never read as
 * equally weighted, which is the failure mode of showing rates alone.
 *
 * Each bar opens to the claims behind it. A chart asserting that 100% of
 * immigration claims were false should be one click from the sentences that
 * back the number, or the reader has to take it on faith.
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

interface TopicClaimRow {
  quote: string; rating: string; topic: string;
  speaker: string | null; day: string; broadcast: string;
}

const VERDICT: Record<string, string> = {
  "FALSE": C.con, "MISLEADING": C.mis, "TRUE": C.ok, "MOSTLY TRUE": C.ok,
};

function ClaimRow({ c, showTopic }: { c: TopicClaimRow; showTopic: boolean }) {
  const color = VERDICT[c.rating] ?? C.faint;
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.rule}` }}>
      <span style={{
        fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
        color, border: `1px solid ${color}`, borderRadius: 3, padding: "2px 5px",
        flexShrink: 0, marginTop: 2, whiteSpace: "nowrap",
      }}>{c.rating || "—"}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontFamily: SERIF, fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
          &ldquo;{c.quote}&rdquo;
        </span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 10.5, color: C.faint, marginTop: 3 }}>
          {c.speaker ?? "speaker not attributed"} · {c.day}
          {showTopic ? ` · ${c.topic}` : ""}
        </span>
      </span>
    </li>
  );
}

function Bar({
  t, widthPct, open, busy, error, claims, onToggle,
}: {
  t: TopicTally; widthPct: number; open: boolean; busy: boolean;
  error: string | null; claims: TopicClaimRow[] | null;
  onToggle: () => void;
}) {
  const segs: [number, string, string][] = [
    [t.false, C.con, "False"],
    [t.misleading, C.mis, "Misleading"],
    [t.accurate, C.ok, "True or mostly true"],
    [t.unscored, C.unscored, "Not scored"],
  ];
  const panelId = `topic-${t.topic.replace(/\W+/g, "-")}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          background: open ? C.paper : "transparent", border: "none",
          borderRadius: 4, padding: "5px 6px", margin: "0 -6px 2px",
          cursor: "pointer", textAlign: "left", font: "inherit",
        }}
      >
        <span aria-hidden style={{
          fontSize: 9, color: C.faint, width: 8, flexShrink: 0,
          transform: open ? "rotate(90deg)" : "none", transition: "transform .12s",
        }}>▶</span>

        <span style={{
          fontFamily: SANS, fontSize: 11.5, color: C.secondary,
          width: 120, flexShrink: 0, textAlign: "right",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{t.topic}</span>

        <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: `${widthPct}%`, minWidth: 6, display: "flex", height: 13, borderRadius: 2, overflow: "hidden" }}>
            {segs.map(([n, color, label]) =>
              n > 0 ? <span key={label} style={{ flex: n, background: color }} title={`${label}: ${n}`} /> : null
            )}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{t.total}</span>
        </span>

        <span style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 600, width: 38, flexShrink: 0,
          textAlign: "right",
          // Coloured only where decisive. A middling number in red would read
          // as a verdict the sample cannot support.
          color: t.rate === null ? C.faint : t.rate >= 0.8 ? C.con : t.rate <= 0.4 ? C.ok : C.secondary,
        }}>
          {t.rate === null ? "—" : `${Math.round(t.rate * 100)}%`}
        </span>
      </button>

      {open && (
        <div id={panelId} style={{ margin: "2px 0 10px 138px", paddingLeft: 12, borderLeft: `2px solid ${C.rule}` }}>
          {busy && (
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: "6px 0" }}>Loading claims…</p>
          )}
          {/* An error must not render as an empty list — "we couldn't load this"
              and "nothing was said about this" are different claims to make. */}
          {!busy && error && (
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.con, margin: "6px 0" }}>
              {error} <button type="button" onClick={onToggle} style={{
                font: "inherit", color: C.secondary, background: "none",
                border: "none", textDecoration: "underline", cursor: "pointer", padding: 0,
              }}>Try again</button>
            </p>
          )}
          {!busy && !error && claims && (
            claims.length === 0
              ? <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: "6px 0" }}>No claims recorded.</p>
              : <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {claims.map((c, i) => (
                    <ClaimRow key={`${c.day}-${i}`} c={c} showTopic={Boolean(t.members?.length)} />
                  ))}
                </ul>
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
    />
  );

  return (
    <section style={{
      background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8,
      padding: "18px 20px 16px",
    }}>
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
