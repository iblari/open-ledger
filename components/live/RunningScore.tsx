"use client";

/**
 * Running score (spec 2a) — accuracy %, stacked bar, three counts.
 *
 * Only the three checkable verdicts count. Unverifiable claims are surfaced
 * separately and excluded from the denominator: "we couldn't check it" is not
 * evidence of falsehood, and folding it in would distort the one number this
 * whole page exists to defend.
 */

import { L, F } from "@/lib/live-design";

export default function RunningScore({
  trueCount, misleadingCount, falseCount, unverifiableCount,
}: { trueCount: number; misleadingCount: number; falseCount: number; unverifiableCount: number }) {
  const checked = trueCount + misleadingCount + falseCount;
  const pct = checked > 0 ? Math.round((trueCount / checked) * 100) : null;
  const seg = (n: number, color: string, label: string) =>
    n > 0 ? <div key={label} title={`${label}: ${n}`} style={{ width: `${(n / checked) * 100}%`, background: color }} /> : null;

  return (
    <div style={{ background: L.stage, padding: "10px 14px 12px", borderBottom: `1px solid ${L.cardBorder}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
        <span style={{ fontFamily: F.ui, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: L.mutedDark }}>
          Running record
        </span>
        {pct !== null ? (
          <span style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 500, color: "#fff" }}>
            {pct}<span style={{ fontSize: 11, color: L.mutedDark2 }}>% match data</span>
          </span>
        ) : (
          <span style={{ fontFamily: F.ui, fontSize: 10.5, color: L.mutedDark }}>no checkable claims yet</span>
        )}
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#2A2420" }}>
        {checked > 0 ? [seg(trueCount, L.true, "true"), seg(misleadingCount, L.misleading, "misleading"), seg(falseCount, L.false, "false")] : null}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {([["Match", trueCount, L.true], ["Misleading", misleadingCount, L.misleading], ["Contradicted", falseCount, L.false]] as const).map(([label, n, color]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />
            <span style={{ fontFamily: F.mono, fontSize: 12, color: "#fff" }}>{n}</span>
            <span style={{ fontFamily: F.ui, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: L.mutedDark }}>{label}</span>
          </span>
        ))}
        {unverifiableCount > 0 && (
          <span style={{ fontFamily: F.ui, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: L.mutedDark }}>
            +{unverifiableCount} unverifiable · excluded
          </span>
        )}
      </div>
    </div>
  );
}
