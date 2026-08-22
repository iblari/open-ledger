"use client";

/**
 * Running score — big serif percentage, stacked bar, counts beneath.
 *
 * The number is the headline, so it's set large in the serif and sits to the
 * left of the bar rather than being a footnote on the right of it.
 *
 * Only the three checkable verdicts count toward the percentage. Unverifiable
 * claims are surfaced separately and excluded from the denominator: "we
 * couldn't check it" is not evidence of falsehood, and folding it in would
 * distort the one number this page exists to defend.
 */

import { L, F } from "@/lib/live-design";

export default function RunningScore({
  trueCount, misleadingCount, falseCount, unverifiableCount, mob = false,
}: { trueCount: number; misleadingCount: number; falseCount: number; unverifiableCount: number; mob?: boolean }) {
  const checked = trueCount + misleadingCount + falseCount;
  const pct = checked > 0 ? Math.round((trueCount / checked) * 100) : null;

  const seg = (n: number, color: string, label: string) =>
    n > 0 ? <div key={label} style={{ flex: n, background: color }} title={`${label}: ${n}`} /> : null;

  const counts: [number, string, string][] = [
    [trueCount, "TRUE", L.true],
    [misleadingCount, "MISLEADING", L.misleading],
    [falseCount, "FALSE", L.false],
  ];

  return (
    <div style={{
      // On a phone this block was ~190px of a ~640px usable column — more
      // than the fact feed it sits above. Everything shrinks; nothing is
      // removed, because the score is the headline number.
      background: L.ink, padding: mob ? "6px 14px 7px" : "14px 18px 16px",
      borderBottom: `1px solid ${L.cardBorder}`,
      display: "flex", alignItems: "center", gap: mob ? 11 : 18,
    }}>
      {/* The percentage now carries its own denominator.
          A bare "52%" beside a politician's face reads as an approval
          rating or an overall honesty score, and it is neither: it is
          TRUE / (TRUE + MISLEADING + FALSE) over the economic claims this
          broadcast happened to surface. Unlabelled, it was the one number
          on the page that could travel in a screenshot and mean something
          the site never said. */}
      <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{
          fontFamily: F.display, fontSize: mob ? 22 : 38, fontWeight: 600, lineHeight: 1,
          color: "#F2EEE9", letterSpacing: "-0.02em",
        }}>
          {pct !== null ? `${pct}%` : "—"}
        </span>
        <span style={{
          fontFamily: F.ui, fontSize: mob ? 9 : 10, lineHeight: 1.3,
          color: L.mutedDark, letterSpacing: "0.02em", maxWidth: mob ? 92 : 118,
        }}>
          {pct !== null
            ? `matched the data · of ${checked} checkable claim${checked === 1 ? "" : "s"}`
            : "no checkable claims yet"}
        </span>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", height: mob ? 6 : 9, borderRadius: 5, overflow: "hidden",
          background: "#2A2420", marginBottom: mob ? 5 : 9,
        }}>
          {checked > 0
            ? [seg(trueCount, L.true, "true"), seg(misleadingCount, L.misleading, "misleading"), seg(falseCount, L.false, "false")]
            : null}
        </div>

        <div style={{ display: "flex", gap: mob ? 11 : 18, flexWrap: "wrap", alignItems: "baseline" }}>
          {counts.filter(([n]) => n > 0).map(([n, label]) => (
            <span key={label} style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: "#F2EEE9" }}>{n}</span>
              <span style={{
                fontFamily: F.ui, fontSize: 11, fontWeight: 500, letterSpacing: "0.1em",
                color: L.mutedDark2,
              }}>{label}</span>
            </span>
          ))}

          {unverifiableCount > 0 && (
            <span style={{ fontFamily: F.ui, fontSize: 10.5, letterSpacing: "0.06em", color: L.mutedDark }}>
              {/* On a phone the explanatory tail wrapped onto its own line,
                  costing ~30px to restate what the legend already implies. */}
              +{unverifiableCount} not scored{mob ? "" : " · forecasts & unaudited claims"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
