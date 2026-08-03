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

import { useState } from "react";
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
  claim, isNew, onSeek,
}: { claim: LiveClaimView; isNew?: boolean; onSeek?: (c: LiveClaimView) => void }) {
  const [open, setOpen] = useState(false);
  const color = VERDICT_COLOR[claim.verdict];
  const checking = claim.verdict === "checking";
  const hasDetail = !!(claim.note || claim.sources?.length || claim.source || typeof claim.confidence === "number");

  return (
    <article
      onClick={() => hasDetail && setOpen(o => !o)}
      style={{
        background: L.card, border: `1px solid ${L.cardBorder}`, borderRadius: 10,
        padding: "13px 15px", marginBottom: 10, cursor: hasDetail ? "pointer" : "default",
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

      {/* Expanded analysis — inline, so the video, timeline and the rest of
          the feed all stay exactly where they were. A modal sheet covered
          the speech, which is the one thing this layout promises never to do. */}
      {open && !checking && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${L.cardBorder}` }}>
          {claim.note && (
            <>
              <div style={{ fontFamily: F.ui, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark, marginBottom: 4 }}>
                Why the gap
              </div>
              <p style={{ fontFamily: F.ui, fontSize: 12, color: L.mutedDark2, lineHeight: 1.6, margin: "0 0 12px" }}>
                {claim.note}
              </p>
            </>
          )}
          {(claim.sources?.length || claim.source) && (
            <>
              <div style={{ fontFamily: F.ui, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark, marginBottom: 6 }}>
                Source series
              </div>
              {claim.source && (
                <div style={{ fontFamily: F.ui, fontSize: 11, color: L.mutedDark2, marginBottom: 6 }}>{claim.source}</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {claim.sources?.slice(0, 5).map(sr => (
                  <a key={sr.url} href={sr.url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontFamily: F.ui, fontSize: 10, color: L.true, textDecoration: "none",
                      border: `1px solid ${L.cardBorder}`, borderRadius: 4, padding: "4px 8px",
                    }}>{sr.title.slice(0, 38)} ↗</a>
                ))}
              </div>
            </>
          )}
          {typeof claim.confidence === "number" && (
            <div style={{ fontFamily: F.mono, fontSize: 10, color: L.mutedDark, marginTop: 10 }}>
              {claim.confidence}% model confidence
            </div>
          )}
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8, marginTop: 9,
      }}>
        {claim.source && !checking ? (
          <span style={{ fontFamily: F.ui, fontSize: 9.5, color: L.mutedDark, letterSpacing: "0.04em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {claim.source}
          </span>
        ) : <span />}
        {hasDetail && !checking && (
          <span style={{ fontFamily: F.ui, fontSize: 9.5, fontWeight: 700, color: L.true, flexShrink: 0 }}>
            {open ? "Hide analysis ▲" : "Why ▼"}
          </span>
        )}
      </div>
    </article>
  );
}
