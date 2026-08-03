"use client";

/**
 * Claim card (spec 2a).
 *
 * Anatomy: verdict chip + timestamp → verbatim quote (serif) → SAID → DATA
 * with both figures in mono.
 *
 * Two typographic rules from the spec do the real work:
 *  - Everything a person SAID is serif; every number from DATA is mono.
 *  - Verdict colour appears on the chip and the OFFICIAL figure only — never
 *    as a background wash or accent bar. The claimed figure stays muted, so
 *    the eye lands on the gap between what was said and what is true.
 * Confidence is deliberately absent here and shown in the detail sheet.
 */

import { L, F, VERDICT_COLOR, VERDICT_LABEL, type Verdict } from "@/lib/live-design";

export interface LiveClaimView {
  id: string;
  verdict: Verdict;
  time: string;
  quote: string;
  claimed?: string | null;
  actual: string;
  note?: string;
  source?: string;
  confidence?: number;
  sources?: { title: string; url: string }[];
}

export default function ClaimCard({
  claim, isNew, onOpen, onSeek,
}: { claim: LiveClaimView; isNew?: boolean; onOpen?: (c: LiveClaimView) => void; onSeek?: (c: LiveClaimView) => void }) {
  const color = VERDICT_COLOR[claim.verdict];
  const checking = claim.verdict === "checking";

  return (
    <article
      onClick={() => onOpen?.(claim)}
      style={{
        background: L.card, border: `1px solid ${L.cardBorder}`, borderRadius: 10,
        padding: "13px 15px", marginBottom: 10, cursor: onOpen ? "pointer" : "default",
        animation: isNew ? "vuCardIn .45s ease" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
        <span style={{
          fontFamily: F.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
          textTransform: "uppercase", color: checking ? L.mutedDark2 : "#fff",
          background: checking ? "transparent" : color,
          border: checking ? `1px solid ${L.cardBorder}` : "none",
          padding: "3px 9px", borderRadius: 3,
        }}>{VERDICT_LABEL[claim.verdict]}</span>
        <button
          onClick={e => { e.stopPropagation(); onSeek?.(claim); }}
          style={{
            fontFamily: F.mono, fontSize: 11, color: L.mutedDark2, background: "none",
            border: "none", cursor: onSeek ? "pointer" : "default", padding: 0,
          }}>▶ {claim.time}</button>
      </div>

      <blockquote style={{
        fontFamily: F.display, fontSize: 16, fontWeight: 500, lineHeight: 1.35,
        color: "#F2EEE9", margin: "0 0 11px",
      }}>&ldquo;{claim.quote}&rdquo;</blockquote>

      {!checking && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 10px", alignItems: "baseline" }}>
          {claim.claimed && (
            <>
              <span style={{ fontFamily: F.ui, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark }}>Said</span>
              <span style={{ fontFamily: F.mono, fontSize: 13, color: L.mutedDark2 }}>{claim.claimed}</span>
            </>
          )}
          <span style={{ fontFamily: F.ui, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark }}>Data</span>
          <span style={{ fontFamily: F.mono, fontSize: 13, color, lineHeight: 1.5 }}>{claim.actual}</span>
        </div>
      )}

      {claim.source && !checking && (
        <div style={{ fontFamily: F.ui, fontSize: 9.5, color: L.mutedDark, marginTop: 9, letterSpacing: "0.04em" }}>
          {claim.source}
        </div>
      )}
    </article>
  );
}
