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
/**
 * The DATA column shows a FIGURE, never a truncated sentence.
 *
 * Internally-verified claims lead with the number ("3.2% — GDP Growth…"),
 * but web-verified ones lead with the source ("BLS reports real average
 * hourly earnings increased 0.1%…"). Truncating those produced "BLS reports
 * real average…", which tells the reader nothing. So: pull the first real
 * quantity out of the sentence, and keep the whole sentence for the analysis.
 */
function extractFigure(text: string): string | null {
  const t = (text || "").replace(/\s+/g, " ");
  const patterns = [
    /\$\s?[\d,]+(?:\.\d+)?\s?(?:trillion|billion|million|[TBMK])\b/i, // $1.2 trillion / $37.5B
    /\$\s?[\d,]+(?:\.\d+)?/,                                          // $1,027.51
    /[-+]?\d[\d,]*(?:\.\d+)?\s?(?:percentage points?|pp)\b/i,          // 2.3 pp
    /[-+]?\d[\d,]*(?:\.\d+)?\s?%/,                                     // 0.1%
    /[-+]?\d[\d,]*(?:\.\d+)?\s?(?:trillion|billion|million|thousand)\b/i,
    /[-+]?\d[\d,]*(?:\.\d+)?\s?[TBMK]\b/,                             // 12.8M, +57K
    /[-+]?\d[\d,]*(?:\.\d+)?/,                                          // bare number
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

function headline(actual: string): { figure: string; rest: string } {
  const t = (actual || "").trim();
  const MAX = 30;
  // Leading-figure form: "3.2% — GDP Growth for Trump II at month 18…"
  const em = t.split(/\s+—\s+/);
  if (em.length > 1 && em[0].length <= MAX) {
    return { figure: em[0].trim(), rest: em.slice(1).join(" — ").trim() };
  }
  if (t.length <= MAX) return { figure: t, rest: "" };
  const fig = extractFigure(t);
  // Keep the full sentence in the analysis either way.
  if (fig) return { figure: fig, rest: t };
  const cut = t.slice(0, MAX);
  const at = cut.lastIndexOf(" ");
  return { figure: (at > 12 ? cut.slice(0, at) : cut).trim() + "…", rest: t };
}

/** Raw claimed values arrive unformatted (1500000000000). Make them readable
 *  at a glance so SAID and DATA are comparable. */
function formatSaid(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(n % 1e12 === 0 ? 0 : 1)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (abs >= 10000) return n.toLocaleString();
  return String(v);
}

export default function ClaimCard({
  claim, isNew, onSeek, compact = false,
}: { claim: LiveClaimView; isNew?: boolean; onSeek?: (c: LiveClaimView) => void; compact?: boolean }) {
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
        // Compact is the phone. The card is sized for a desktop rail, where
        // it has a 404px column to itself; on a 393px screen that same card
        // is 206px tall and only 1.6 of them fit the feed.
        padding: compact ? "10px 12px" : "15px 17px",
        marginBottom: compact ? 8 : 11,
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
        fontFamily: F.display, fontSize: compact ? 15 : 18.5, fontWeight: 500,
        lineHeight: compact ? 1.32 : 1.4,
        // Three lines is enough to recognise a quote; the full text is one
        // tap away in the detail.
        ...(compact ? {
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical" as const, overflow: "hidden",
        } : {}),
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
            <div style={{ fontFamily: F.mono, fontSize: compact ? 15 : 18, color: "#CFC7BD", lineHeight: 1.2 }}>
              {formatSaid(claim.claimed)}
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
            <div style={{ fontFamily: F.mono, fontSize: compact ? 15 : 18, color, lineHeight: 1.2, wordBreak: "break-word" }}>
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
