"use client";

/**
 * Claim card.
 *
 * Anatomy: filled verdict chip + timecode on one row → the quote in serif →
 * SAID → DATA as two columns with the arrow between them.
 *
 * The typographic rule doing the real work: everything a person SAID is
 * serif, every number from DATA is mono, and the verdict colour appears on
 * the chip and the OFFICIAL figure only. The claimed figure stays muted, so
 * the eye lands on the gap between what was said and what is true.
 *
 * Confidence is deliberately absent from the face of the card; it lives in
 * the expanded analysis and in the export.
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

/** Keep the on-record figure short enough to sit beside the claimed one.
 *  Long sourced sentences move to the expanded analysis instead. */
function headline(actual: string): { figure: string; rest: string } {
  const t = (actual || "").trim();
  const MAX = 30;
  // Our sourced strings lead with the figure and an em dash:
  // "3.2% — GDP Growth for Trump II at month 18…". Split only on the em dash
  // (a hyphen would cut "All-time high" into "All") and keep decimals intact.
  const em = t.split(/\s+—\s+/);
  if (em.length > 1 && em[0].length <= MAX) {
    return { figure: em[0].trim(), rest: em.slice(1).join(" — ").trim() };
  }
  if (t.length <= MAX) return { figure: t, rest: "" };
  // First sentence, if it's short enough to read as a figure.
  const dot = t.match(/^(.{1,30}?)\.\s+(.+)$/s);
  if (dot && dot[1].length <= MAX) return { figure: dot[1].trim(), rest: t };
  const cut = t.slice(0, MAX);
  const at = cut.lastIndexOf(" ");
  return { figure: (at > 12 ? cut.slice(0, at) : cut).trim() + "…", rest: t };
}

export default function ClaimCard({
  claim, isNew, onSeek,
}: { claim: LiveClaimView; isNew?: boolean; onSeek?: (c: LiveClaimView) => void }) {
  const [open, setOpen] = useState(false);
  const color = VERDICT_COLOR[claim.verdict];
  const checking = claim.verdict === "checking";
  const { figure, rest } = headline(claim.actual);
  const hasDetail = !!(claim.note || rest || claim.sources?.length || claim.source || typeof claim.confidence === "number");

  return (
    <article
      onClick={() => hasDetail && setOpen(o => !o)}
      style={{
        background: L.card, border: `1px solid ${L.cardBorder}`, borderRadius: 12,
        padding: "15px 17px", marginBottom: 11,
        cursor: hasDetail ? "pointer" : "default",
        animation: isNew ? "vuCardIn .45s ease" : undefined,
      }}
    >
      {/* chip + timecode */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <span style={{
          fontFamily: F.ui, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: checking ? L.mutedDark2 : "#fff",
          background: checking ? "transparent" : color,
          border: checking ? `1px solid ${L.cardBorder}` : "none",
          padding: "6px 12px", borderRadius: 6, lineHeight: 1,
        }}>{VERDICT_LABEL[claim.verdict]}</span>
        <button
          onClick={e => { e.stopPropagation(); onSeek?.(claim); }}
          style={{
            fontFamily: F.mono, fontSize: 14, color: L.mutedDark, background: "none",
            border: "none", cursor: onSeek ? "pointer" : "default", padding: 0, letterSpacing: "0.02em",
          }}>{claim.time}</button>
      </div>

      {/* the quote */}
      <blockquote style={{
        fontFamily: F.display, fontSize: 18.5, fontWeight: 500, lineHeight: 1.4,
        color: "#F5F1EC", margin: "0 0 16px",
      }}>&ldquo;{claim.quote}&rdquo;</blockquote>

      {/* SAID → DATA */}
      {!checking && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div style={{ minWidth: 0, flex: "0 1 auto" }}>
            <div style={{
              fontFamily: F.ui, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em",
              textTransform: "uppercase", color: L.mutedDark, marginBottom: 6,
            }}>Said</div>
            <div style={{ fontFamily: F.mono, fontSize: 18, color: "#CFC7BD", lineHeight: 1.2 }}>
              {claim.claimed || "—"}
            </div>
          </div>

          <span style={{
            fontFamily: F.ui, fontSize: 16, color: L.mutedDark,
            paddingBottom: 2, flexShrink: 0,
          }}>→</span>

          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div style={{
              fontFamily: F.ui, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em",
              textTransform: "uppercase", color: L.mutedDark, marginBottom: 6,
            }}>Data</div>
            <div style={{ fontFamily: F.mono, fontSize: 18, color, lineHeight: 1.2, wordBreak: "break-word" }}>
              {figure}
            </div>
          </div>
        </div>
      )}

      {/* expanded analysis — inline, so the video and feed stay put */}
      {open && !checking && (
        <div style={{ marginTop: 14, paddingTop: 13, borderTop: `1px solid ${L.cardBorder}` }}>
          {rest && (
            <p style={{ fontFamily: F.ui, fontSize: 12.5, color: L.mutedDark2, lineHeight: 1.6, margin: "0 0 12px" }}>
              {rest}
            </p>
          )}
          {claim.note && (
            <>
              <div style={{ fontFamily: F.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark, marginBottom: 4 }}>
                Why the gap
              </div>
              <p style={{ fontFamily: F.ui, fontSize: 12.5, color: L.mutedDark2, lineHeight: 1.6, margin: "0 0 12px" }}>
                {claim.note}
              </p>
            </>
          )}
          {(claim.sources?.length || claim.source) && (
            <>
              <div style={{ fontFamily: F.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: L.mutedDark, marginBottom: 6 }}>
                Source series
              </div>
              {claim.source && (
                <div style={{ fontFamily: F.ui, fontSize: 11.5, color: L.mutedDark2, marginBottom: 6 }}>{claim.source}</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {claim.sources?.slice(0, 5).map(sr => (
                  <a key={sr.url} href={sr.url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontFamily: F.ui, fontSize: 10.5, color: L.true, textDecoration: "none",
                      border: `1px solid ${L.cardBorder}`, borderRadius: 4, padding: "4px 9px",
                    }}>{sr.title.slice(0, 40)} ↗</a>
                ))}
              </div>
            </>
          )}
          {typeof claim.confidence === "number" && (
            <div style={{ fontFamily: F.mono, fontSize: 10.5, color: L.mutedDark, marginTop: 11 }}>
              {claim.confidence}% model confidence
            </div>
          )}
        </div>
      )}

      {hasDetail && !checking && (
        <div style={{
          fontFamily: F.ui, fontSize: 10.5, fontWeight: 700, color: L.true,
          marginTop: 12, textAlign: "right",
        }}>{open ? "Hide analysis ▲" : "Why ▼"}</div>
      )}
    </article>
  );
}
