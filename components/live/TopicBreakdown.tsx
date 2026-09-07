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
 */

import type { TopicTally } from "@/lib/claim-topics";

const C = {
  card: "#FFFEFC", ink: "#14110E", secondary: "#5F5850",
  muted: "#8C8479", faint: "#A69E92", rule: "#DFD9CF",
  ok: "#0E7477", mis: "#B45309", con: "#C2410C", unscored: "#C9C2B6",
};
const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";

function Bar({ t, widthPct }: { t: TopicTally; widthPct: number }) {
  const segs: [number, string, string][] = [
    [t.false, C.con, "False"],
    [t.misleading, C.mis, "Misleading"],
    [t.accurate, C.ok, "True or mostly true"],
    [t.unscored, C.unscored, "Not scored"],
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <div style={{
        fontFamily: SANS, fontSize: 11.5, color: C.secondary,
        width: 128, flexShrink: 0, textAlign: "right",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{t.topic}</div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: `${widthPct}%`, minWidth: 6, display: "flex", height: 13, borderRadius: 2, overflow: "hidden" }}>
          {segs.map(([n, color, label]) =>
            n > 0 ? <div key={label} style={{ flex: n, background: color }} title={`${label}: ${n}`} /> : null
          )}
        </div>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.faint, flexShrink: 0 }}>{t.total}</span>
      </div>

      <div style={{
        fontFamily: SANS, fontSize: 11, fontWeight: 600, width: 38, flexShrink: 0,
        textAlign: "right",
        // Rate is coloured only where it is decisive. A middling number in red
        // would read as a verdict the sample cannot support.
        color: t.rate === null ? C.faint : t.rate >= 0.8 ? C.con : t.rate <= 0.4 ? C.ok : C.secondary,
      }}>
        {t.rate === null ? "—" : `${Math.round(t.rate * 100)}%`}
      </div>
    </div>
  );
}

export default function TopicBreakdown({
  topics, totals,
}: {
  topics: TopicTally[];
  totals: { claims: number; broadcasts: number; since: string | null };
}) {
  if (!topics.length || totals.claims === 0) return null;
  const max = Math.max(...topics.map(t => t.total));

  const since = totals.since
    ? new Date(totals.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

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
        or misleading.
      </p>

      <div>
        {topics.map(t => <Bar key={t.topic} t={t} widthPct={(t.total / max) * 100} />)}
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
