"use client";

// InsightsStrip — auto-generated "what's notable right now" callouts.
//
// Renders the top N observations from lib/insights as a compact card row.
// On desktop: 3-up grid. On mobile: vertically stacked (each card stays
// readable; the strip itself is short enough that 4 stacked cards = ~one
// scroll). Card click deep-links into /dashboard?metric=<key>&admin=<id>.
//
// Pure client component because the insight scoring runs at render time —
// fast enough (just iterates 6 metrics × 5 detectors) that there's no need
// to precompute or cache.

import Link from "next/link";
import { useMemo } from "react";
import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import { generateInsights, insightsAsOfYear, adminName, type InsightKind } from "@/lib/insights";

interface Props {
  /** How many insight cards to render. 3 = desktop grid. */
  limit?: number;
  /** True on mobile — switch to a vertical stack. */
  mob: boolean;
  /** Optional section eyebrow shown above the strip. */
  eyebrow?: string;
}

// Small accent colors per insight kind. Used as a 4px left bar on each card
// — a visual hint of the kind without needing an icon library. Picked from
// the existing palette so nothing clashes with the editorial language.
const KIND_COLOR: Record<InsightKind, string> = {
  extreme_high:    EC.improveStrong, // record value (teal — neutral "noteworthy")
  extreme_low:     EC.improveStrong,
  threshold_cross: EC.accent,        // crossed a level (red — focused)
  streak:          EC.gold,          // long run (gold — duration)
  biggest_move:    EC.accent,        // big delta (red — attention)
  above_average:   EC.mute,
  below_average:   EC.mute,
};

export function InsightsStrip({ limit = 3, mob, eyebrow }: Props) {
  // useMemo so the insight list doesn't recompute on every parent re-render
  // (the metrics-data is static during a session so the result is stable).
  const insights = useMemo(() => generateInsights({ limit }), [limit]);
  const asOfYear = insightsAsOfYear();
  if (insights.length === 0) return null;

  return (
    <section style={{
      padding: mob ? "20px 0 24px" : "28px 0 32px",
    }}>
      {/* Section eyebrow + as-of badge. Sets the "this is auto-generated
          from current data, not editor commentary" framing. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: mob ? 10 : 14, flexWrap: "wrap",
      }}>
        <div style={{
          fontFamily: ESANS, fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: EC.sub, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: EC.accent,
            animation: "pulse 2s infinite",
          }} />
          {eyebrow ?? "What's notable in the data"}
        </div>
        <div style={{
          fontFamily: ESANS, fontSize: 10, color: EC.mute, letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          As of {asOfYear} · auto-generated
        </div>
      </div>

      {/* Card grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: mob ? "1fr" : `repeat(${Math.min(insights.length, 3)}, 1fr)`,
        gap: mob ? 8 : 12,
      }}>
        {insights.map(i => (
          <Link key={i.id}
            href={`/dashboard?metric=${i.metricKey}${i.admin ? `&admin=${i.admin}` : ""}`}
            style={{
              display: "block",
              background: EC.card,
              border: `1px solid ${EC.rule}`,
              borderLeft: `3px solid ${KIND_COLOR[i.kind]}`,
              borderRadius: 4,
              padding: mob ? "12px 14px" : "14px 16px",
              textDecoration: "none", color: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = KIND_COLOR[i.kind]; e.currentTarget.style.borderLeftColor = KIND_COLOR[i.kind]; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = EC.rule; e.currentTarget.style.borderLeftColor = KIND_COLOR[i.kind]; }}
          >
            {/* Eyebrow row: metric label + arrow */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontFamily: ESANS, fontSize: 10, fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: EC.mute, marginBottom: 6,
            }}>
              <span>{i.metricLabel}{i.admin ? ` · ${adminName(i.admin)}` : ""}</span>
              <span style={{ color: KIND_COLOR[i.kind], fontSize: 12 }}>→</span>
            </div>
            {/* Headline */}
            <div style={{
              fontFamily: ESERIF, fontSize: mob ? 15 : 16, fontWeight: 500,
              color: EC.ink, lineHeight: 1.25, letterSpacing: "-0.01em",
              marginBottom: 4,
            }}>
              {i.headline}
            </div>
            {/* Context line */}
            <div style={{
              fontFamily: ESANS, fontSize: 11, color: EC.sub, lineHeight: 1.5,
            }}>
              {i.context}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
