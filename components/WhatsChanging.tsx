"use client";

/**
 * WhatsChanging — the homepage answer to "What is changing in America?"
 *
 * Renders the trends feed (/api/trends): detection is deterministic
 * arithmetic over Census county data, the narrative is AI-written but
 * grounded in the computed numbers, and every card carries its method.
 * Trend → insight → county → evidence: cards expand into the why/matters/
 * watch analysis plus the affected-county table, and link into the atlas
 * for the map view.
 *
 * Renders nothing until the feed exists in KV, so shipping this component
 * is a no-op until the first refresh runs.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import type { TrendsFeed, TrendItem } from "@/lib/live-kv";

const KICKER_COLORS: Record<string, string> = {
  Housing: "#b8372d", Migration: "#1d4ed8", Income: "#0d7377",
  Poverty: "#7c2d12", Economy: "#a67c00",
};

function TrendCard({ t, mob, lead }: { t: TrendItem; mob: boolean; lead?: boolean }) {
  const [open, setOpen] = useState(false);
  const kc = KICKER_COLORS[t.kicker] || C.accent;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6,
      borderTop: `3px solid ${kc}`, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        textAlign: "left", background: "none", border: "none", cursor: "pointer",
        padding: lead && !mob ? "20px 22px" : "14px 16px", display: "block", width: "100%",
        fontFamily: SANS, color: C.ink,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
          color: kc, marginBottom: 8,
        }}>
          <span>{t.kicker}</span>
          <span style={{ color: C.mute, fontWeight: 500, letterSpacing: "0.05em" }}>{t.window}</span>
        </div>
        <div style={{
          fontFamily: SERIF, fontSize: lead && !mob ? 27 : mob ? 17 : 18.5,
          fontWeight: lead ? 600 : 500, lineHeight: 1.18, letterSpacing: "-0.015em", marginBottom: 10,
        }}>
          {t.headline}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: SERIF, fontSize: lead && !mob ? 30 : 21, fontWeight: 700,
            color: kc, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
          }}>{t.heroStat.value}</span>
          <span style={{ fontSize: mob ? 10.5 : 11.5, color: C.sub, lineHeight: 1.45, flex: 1, minWidth: 140 }}>
            {t.heroStat.label}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "#1d4ed8", fontWeight: 600, marginTop: 10 }}>
          {open ? "▾ Close analysis" : "▸ Why it happened, why it matters"}
        </div>
      </button>

      {open && (
        <div style={{ padding: lead && !mob ? "0 22px 18px" : "0 16px 14px" }}>
          {t.narrative && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {([["Why it happened", t.narrative.why], ["Why it matters", t.narrative.matters], ["What to watch", t.narrative.watch]] as const).map(([h, body]) => (
                <div key={h}>
                  <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.mute, marginBottom: 3 }}>{h}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.sub, lineHeight: 1.62 }}>{body}</div>
                </div>
              ))}
            </div>
          )}

          {/* Evidence: affected counties */}
          <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 4, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.mute, marginBottom: 7 }}>
              The evidence · {Math.min(t.top.length, mob ? 6 : 8)} of {t.breadth.n.toLocaleString()} counties
            </div>
            {t.top.slice(0, mob ? 6 : 8).map(c => (
              <div key={c.fips + c.value} style={{
                display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline",
                fontFamily: SANS, fontSize: 11.5, padding: "3px 0", fontVariantNumeric: "tabular-nums",
              }}>
                <span style={{ color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}, {c.st}
                </span>
                <span style={{ flexShrink: 0, color: C.sub }}>
                  <strong style={{ color: C.ink }}>{c.value}</strong>
                  {!mob && <span style={{ color: C.mute }}> · {c.detail}</span>}
                </span>
              </div>
            ))}
            <Link href="/dashboard?tab=state_atlas" style={{ display: "inline-block", marginTop: 8, fontFamily: SANS, fontSize: 11, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
              Explore these counties on the map →
            </Link>
          </div>

          <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, lineHeight: 1.55 }}>
            <strong style={{ color: C.sub }}>Method:</strong> {t.method}
          </div>
        </div>
      )}
    </div>
  );
}

function useIsMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const check = () => setMob(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mob;
}

/**
 * variant="strip": one slim homepage row — the headline count + lead trend,
 * linking to /trends. variant="full": the complete feed (the /trends page).
 */
export default function WhatsChanging({ variant = "full", embedded = false }: { variant?: "strip" | "full"; embedded?: boolean }) {
  const mob = useIsMobile();
  const [feed, setFeed] = useState<TrendsFeed | null>(null);

  useEffect(() => {
    fetch("/api/trends")
      .then(r => r.json())
      .then((d: TrendsFeed) => { if (d?.trends?.length) setFeed(d); })
      .catch(() => {});
  }, []);

  if (!feed) return null;

  if (variant === "strip") {
    const lead = feed.trends[0];
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "10px 14px 0" : "18px 32px 0" }}>
        <Link href="/trends" style={{
          display: "flex", alignItems: "center", gap: mob ? 8 : 12,
          background: "#fff", border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.accent}`,
          borderRadius: 4, padding: mob ? "9px 12px" : "9px 16px", textDecoration: "none",
        }}>
          <span className="live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#c1272d", flexShrink: 0 }} />
          {!mob && (
            <span style={{
              fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: C.sub, flexShrink: 0,
            }}>What&rsquo;s changing</span>
          )}
          <span style={{
            fontFamily: SERIF, fontSize: mob ? 12.5 : 14, fontWeight: 500, color: C.ink,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
          }}>{lead.headline}</span>
          <span style={{
            fontFamily: SANS, fontSize: mob ? 10.5 : 11, fontWeight: 600, color: "#1d4ed8",
            flexShrink: 0, whiteSpace: "nowrap",
          }}>+{feed.trends.length - 1} more →</span>
        </Link>
      </div>
    );
  }
  const [lead, ...rest] = feed.trends;
  const asOf = new Date(feed.generatedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <section style={{
      padding: embedded ? (mob ? "26px 0 0" : "36px 0 0") : mob ? "18px 0 8px" : "36px 0 16px",
      borderBottom: embedded ? "none" : `1px solid ${C.rule}`,
      borderTop: embedded ? `1px solid ${C.rule}` : "none",
    }}>
      <div style={{ maxWidth: embedded ? "none" : 1280, margin: "0 auto", padding: embedded ? 0 : mob ? "0 14px" : "0 32px" }}>
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
          marginBottom: mob ? 12 : 16, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#c1272d", flexShrink: 0 }} />
            <h2 style={{
              fontFamily: SERIF, fontSize: mob ? 21 : 28, fontWeight: 600,
              letterSpacing: "-0.02em", margin: 0,
            }}>
              What&rsquo;s changing in America
            </h2>
          </div>
          <span style={{ fontFamily: SANS, fontSize: mob ? 9.5 : 10.5, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {feed.universe.counties.toLocaleString()} counties analyzed · {asOf}
          </span>
        </div>

        {mob ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {feed.trends.map(t => <TrendCard key={t.id} t={t} mob />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 12, alignItems: "start" }}>
            <div style={{ gridRow: "1 / span 2" }}>
              <TrendCard t={lead} mob={false} lead />
            </div>
            {rest.slice(0, 4).map(t => <TrendCard key={t.id} t={t} mob={false} />)}
          </div>
        )}

        <div style={{ fontFamily: SANS, fontSize: 10, color: C.mute, marginTop: 10, lineHeight: 1.5 }}>
          Detected by arithmetic over {feed.universe.source} — no editorial selection. AI analysis is grounded in the computed figures; tap any card for the method.
        </div>
      </div>
    </section>
  );
}
