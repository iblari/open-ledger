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
  trueCount, misleadingCount, falseCount, unverifiableCount,
}: { trueCount: number; misleadingCount: number; falseCount: number; unverifiableCount: number }) {
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
      background: L.ink, padding: "14px 18px 16px",
      borderBottom: `1px solid ${L.cardBorder}`,
      display: "flex", alignItems: "center", gap: 18,
    }}>
      <span style={{
        fontFamily: F.display, fontSize: 38, fontWeight: 600, lineHeight: 1,
        color: "#F2EEE9", flexShrink: 0, letterSpacing: "-0.02em",
      }}>
        {pct !== null ? `${pct}%` : "—"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", height: 9, borderRadius: 5, overflow: "hidden",
          background: "#2A2420", marginBottom: 9,
        }}>
          {checked > 0
            ? [seg(trueCount, L.true, "true"), seg(misleadingCount, L.misleading, "misleading"), seg(falseCount, L.false, "false")]
            : null}
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
          {counts.filter(([n]) => n > 0).map(([n, label]) => (
            <span key={label} style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ fontFamily: F.display, fontSize: 15, fontWeight: 600, color: "#F2EEE9" }}>{n}</span>
              <span style={{
                fontFamily: F.ui, fontSize: 11, fontWeight: 500, letterSpacing: "0.1em",
                color: L.mutedDark2,
              }}>{label}</span>
            </span>
          ))}
          {checked === 0 && (
            <span style={{ fontFamily: F.ui, fontSize: 11.5, color: L.mutedDark }}>no checkable claims yet</span>
          )}
          {unverifiableCount > 0 && (
            <span style={{ fontFamily: F.ui, fontSize: 10.5, letterSpacing: "0.06em", color: L.mutedDark }}>
              +{unverifiableCount} not scored · forecasts &amp; unaudited claims
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
