"use client";

// InsightsStrip — auto-generated "what's notable right now" callouts.
//
// Two data sources, hot-swapped at runtime:
//   1. PRIMARY: fetch /api/benchmark-data → run lib/insights-live detectors.
//      This is the live FRED-backed path; insights describe "as of Sept 2025."
//   2. FALLBACK: lib/insights generateInsights() over static annual snapshots.
//      Used if the live fetch fails (missing FRED_API_KEY, network, etc.) so
//      the UI never goes blank.
//
// Strip is purely client-rendered so the live fetch doesn't slow down the
// initial page paint — the static fallback shows immediately, then upgrades
// to the live version once the network roundtrip completes (~200-800ms).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import {
  generateInsights, insightsAsOfYear, adminName,
  type Insight, type InsightKind,
} from "@/lib/insights";
import {
  generateLiveInsights, latestDataDate, fmtFreshness,
  type LiveBenchmarkPayload,
} from "@/lib/insights-live";

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
  // Static fallback computed at render — shown immediately while the live
  // fetch is in flight, and kept if the fetch fails entirely.
  const staticInsights = useMemo(() => generateInsights({ limit }), [limit]);
  const staticAsOf = insightsAsOfYear();

  // Live fetch state. We track the latest DATA date (most recent FRED print
  // across all metrics) rather than the cache-warming timestamp — the former
  // is the meaningful freshness signal, the latter is misleading because it
  // resets whenever Vercel rebuilds even if the underlying data is unchanged.
  const [liveInsights, setLiveInsights] = useState<Insight[] | null>(null);
  const [dataDate, setDataDate] = useState<Date | null>(null);
  const [, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/benchmark-data")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: LiveBenchmarkPayload) => {
        if (cancelled) return;
        if (data.error) { setFetchError(data.error); return; }
        const live = generateLiveInsights(data, { limit });
        if (live.length > 0) {
          setLiveInsights(live);
          setDataDate(latestDataDate(data));
        }
      })
      .catch(e => { if (!cancelled) setFetchError(e.message); });
    return () => { cancelled = true; };
  }, [limit]);

  // Prefer live insights when available; static is the warm-up state.
  const insights = liveInsights ?? staticInsights;
  const isLive = liveInsights !== null;
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
          fontFamily: ESANS, fontSize: 10, color: isLive ? EC.improveStrong : EC.mute,
          letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: isLive ? 600 : 500,
        }}
        title={isLive
          ? "Pulled live from FRED. Most macro data (CPI, unemployment, GDP) is published with a 4-6 week lag by BLS/BEA — this date is the most recent official print, not when our cache refreshed."
          : "Showing static fallback — live FRED data couldn't be fetched (check FRED_API_KEY in Vercel env)."}
        >
          {isLive && dataDate
            ? `Live FRED · latest ${fmtFreshness(dataDate)}`
            : `As of ${staticAsOf} · auto-generated`}
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
