"use client";

/**
 * LiveTeaser — ~25s self-playing 16:9 teaser for the Live Broadcast feature.
 * Lives in the landing page's ComingSoonSection (replaces AnimatedWaveform).
 *
 * Story: countdown title card → faithful recreation of the /live playing view
 * (broadcast + karaoke captions + fact-check cards, with a "Screen Studio"
 * camera) → dark end card with beta/launch chips.
 *
 * Implementation notes (per design handoff):
 * - Everything is a PURE FUNCTION of the playhead t — one rAF clock drives
 *   the whole scene, so it's scrub-safe and cheap (no per-element timers).
 * - 1920×1080 design canvas, scaled to fit its container with transform.
 * - IntersectionObserver pauses offscreen; prefers-reduced-motion freezes on
 *   a representative frame (t≈14.5, cards visible).
 * - All colors/type mirror app/live/page.tsx — do not restyle.
 */

import React, { useEffect, useRef, useState } from "react";

/* ── Tokens (mirror lib/design-tokens + /live) ── */
const T = {
  bg: "#f8f5f0", card: "#ffffff", ink: "#1a1a1a", sub: "#5c5856",
  mute: "#9a9490", rule: "#e2ded6", accent: "#b8372d", gold: "#a67c00",
  blue: "#1d4ed8", paper: "#f3ede5", live: "#dc2626",
};
const RATING: Record<string, string> = {
  "TRUE": "#0d7377", "MOSTLY TRUE": "#16a34a",
  "MISLEADING": "#ca8a04", "FALSE": "#c2410c", "UNVERIFIABLE": "#9a9490",
};
const SERIF = "'Source Serif 4', Georgia, serif";
const SANS = "'DM Sans', -apple-system, sans-serif";
const FOOTAGE = "/teaser-footage.webp";

/* ── Easing / interpolation ── */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x: number) => x * x * x;
const easeInOutQuart = (x: number) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2);
const easeOutBack = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function interp(ts: number[], vs: number[], ease: (x: number) => number) {
  return (t: number): number => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[ts.length - 1]) return vs[vs.length - 1];
    let i = 0;
    while (t > ts[i + 1]) i++;
    const p = (t - ts[i]) / (ts[i + 1] - ts[i]);
    return vs[i] + (vs[i + 1] - vs[i]) * ease(p);
  };
}

/* ── Speech + timing (word cadence drives captions, claims, timecode) ── */
const SPEECH_START = 4.3;
const WORDS = ("Let me be clear: unemployment is at a fifty-year low. We have created fifteen million new jobs in just three years. We've already cut the deficit by over a trillion dollars. And today, American inflation is the lowest in the world.").split(" ");
const WORD_TIMES = (() => {
  const out: number[] = []; let t = SPEECH_START;
  for (const w of WORDS) {
    out.push(t);
    t += 0.26;
    if (w.endsWith(".")) t += 0.38;
    else if (w.endsWith(":") || w.endsWith(",")) t += 0.18;
  }
  out.push(t); // sentinel
  return out;
})();
const endOfWord = (i: number) => WORD_TIMES[i + 1];
// Claims pop ~0.55s after their phrase ends (the pipeline beat)
const CT = [
  endOfWord(9) + 0.55,   // "...fifty-year low."
  endOfWord(20) + 0.55,  // "...three years."
  endOfWord(30) + 0.55,  // "...trillion dollars."
  endOfWord(40) + 0.55,  // "...in the world."
];
// ▶ stamps = when the phrase was SPOKEN, on the same clock as the LIVE bug
const vtOf = (w: number) => {
  const vs = Math.max(0, Math.floor(8 + WORD_TIMES[w] - SPEECH_START));
  return `${Math.floor(vs / 60)}:${String(vs % 60).padStart(2, "0")}`;
};

interface TeaserClaim {
  rating: string; conf: number; vt: string; quote: string;
  data: string; sourced: boolean; expl: string; metric?: string;
}
const CLAIMS: TeaserClaim[] = [
  {
    rating: "TRUE", conf: 96, vt: vtOf(4),
    quote: "Unemployment is at a fifty-year low",
    data: "BLS: Unemployment fell to 3.4%, the lowest since 1969.",
    sourced: true,
    expl: "Confirmed — a 54-year low reached during this term.",
  },
  {
    rating: "MOSTLY TRUE", conf: 88, vt: vtOf(10),
    quote: "Fifteen million new jobs in just three years",
    data: "BLS: ~14.8M nonfarm jobs added; many recovered pandemic-era losses.",
    sourced: false,
    expl: "Close to accurate, but includes pandemic recovery jobs.",
  },
  {
    rating: "MISLEADING", conf: 91, vt: vtOf(21),
    quote: "We've already cut the deficit by over a trillion dollars",
    data: "Treasury: Deficit fell $3.1T → $1.7T as COVID emergency spending expired — not new policy.",
    sourced: true,
    expl: "Nominally true, but driven by temporary spending ending.",
  },
  {
    rating: "FALSE", conf: 94, vt: vtOf(31),
    quote: "American inflation is the lowest in the world",
    data: "IMF: Several G7 nations were lower — Japan ~2.6%, Switzerland under 2%.",
    sourced: false,
    expl: "Not the lowest among advanced economies.",
    metric: "Inflation (CPI)",
  },
];

/* ── Timeline anchors ── */
const S2_IN = 3.5;
const PULL_BACK = 17.6;
const SUMMARY_T = 18.7;
const S2_OUT = 19.6;
const S3_IN = 19.8;
const DURATION = 25;
const REDUCED_MOTION_FRAME = 14.5; // representative frame: 3 cards visible

const pulse = (t: number) => 0.55 + 0.45 * Math.abs(Math.sin(t * 2.4));
const entry = (t: number, t0: number, dur = 0.45) => clamp((t - t0) / dur, 0, 1);

function FadeRise({ t, t0, dur = 0.5, rise = 14, children, style }: {
  t: number; t0: number; dur?: number; rise?: number;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  const p = easeOutCubic(entry(t, t0, dur));
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * rise}px)`, ...style }}>
      {children}
    </div>
  );
}

/* ── Scene A · Going live (0 – 3.9s) ── */
function SceneCountdown({ t }: { t: number }) {
  const out = easeInCubic(entry(t, 3.35, 0.5));
  const secsLeft = t < 1.5 ? 3 : t < 2.0 ? 2 : 1;
  const isLive = t >= 2.55;
  const livePop = easeOutBack(entry(t, 2.55, 0.5));
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 26,
      opacity: 1 - out, transform: `scale(${1 + out * 0.05})`,
    }}>
      <FadeRise t={t} t0={0.25} style={{
        fontFamily: SANS, fontSize: 22, fontWeight: 700, letterSpacing: "0.24em",
        textTransform: "uppercase", color: T.mute,
      }}>
        Vote Unbiased · Live
      </FadeRise>
      <FadeRise t={t} t0={0.5} style={{
        fontFamily: SERIF, fontSize: 92, fontWeight: 900, color: T.ink,
        lineHeight: 1.08, textAlign: "center", letterSpacing: "-0.02em", maxWidth: 1250,
      }}>
        Presidential Remarks<br />on the Economy
      </FadeRise>
      <FadeRise t={t} t0={0.85} style={{
        fontFamily: SANS, fontSize: 21, fontWeight: 500, letterSpacing: "0.14em",
        textTransform: "uppercase", color: T.sub,
      }}>
        Live coverage · Tonight · 9:00 PM ET
      </FadeRise>
      <div style={{ height: 74, display: "flex", alignItems: "center", marginTop: 10 }}>
        {!isLive ? (
          <FadeRise t={t} t0={1.15} style={{
            fontFamily: SANS, fontSize: 30, fontWeight: 700, color: T.mute,
            fontVariantNumeric: "tabular-nums", letterSpacing: "0.1em",
          }}>
            STARTS IN 00:0{secsLeft}
          </FadeRise>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            transform: `scale(${livePop})`, opacity: clamp(livePop, 0, 1),
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", background: T.live,
              boxShadow: "0 0 24px rgba(220,38,38,0.55)", opacity: pulse(t),
            }} />
            <span style={{
              fontFamily: SANS, fontSize: 40, fontWeight: 800, letterSpacing: "0.22em",
              color: T.live,
            }}>LIVE NOW</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Camera keyframes (wide → push video → pan panel → punch per claim → pull back) ── */
const camKF = (() => {
  const kf: [number, number, number, number][] = [
    [S2_IN, 960, 430, 1.28],
    [5.3, 960, 428, 1.34],
    [6.6, 810, 592, 1.88],
    [CT[0] - 0.05, 810, 596, 1.9],
    [CT[0] + 0.75, 1442, 295, 2.02],
    [CT[1] - 0.05, 1442, 300, 2.0],
    [CT[1] + 0.2, 1442, 303, 2.08],
    [CT[1] + 0.65, 1442, 303, 2.0],
    [CT[2] - 0.05, 1442, 306, 2.0],
    [CT[2] + 0.2, 1442, 310, 2.08],
    [CT[2] + 0.65, 1442, 310, 2.0],
    [CT[3] - 0.05, 1442, 314, 2.02],
    [CT[3] + 0.2, 1450, 330, 2.18],
    [CT[3] + 0.7, 1445, 326, 2.06],
    [PULL_BACK, 1445, 326, 2.06],
    [PULL_BACK + 1.15, 960, 448, 1.22],
    [S2_OUT, 960, 452, 1.2],
  ];
  const ts = kf.map(k => k[0]);
  return {
    x: interp(ts, kf.map(k => k[1]), easeInOutQuart),
    y: interp(ts, kf.map(k => k[2]), easeInOutQuart),
    s: interp(ts, kf.map(k => k[3]), easeInOutQuart),
  };
})();

/* ── Recreated /live pieces ── */

function Counter({ n, t, color }: { n: number; t: number; color: string }) {
  const last = n > 0 ? CT[n - 1] : -10;
  const pop = 1 + 0.3 * Math.max(0, 1 - (t - last) / 0.35);
  return (
    <span style={{
      color, flexShrink: 0, display: "inline-block",
      transform: `scale(${pop})`, transformOrigin: "center",
      fontVariantNumeric: "tabular-nums",
    }}>{n} claim{n === 1 ? "" : "s"}</span>
  );
}

function StatusBar({ t, nClaims }: { t: number; nClaims: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
      background: T.ink, borderRadius: "8px 8px 0 0", color: "#fff",
      fontFamily: SANS, fontSize: 12,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.live, opacity: pulse(t) }} />
      <span style={{ fontWeight: 700 }}>LIVE</span>
      <span style={{ color: "#9a9490" }}>|</span>
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>Presidential Remarks on the Economy</span>
      <span style={{
        flexShrink: 0, fontSize: 9, color: "#0d7377", padding: "2px 6px",
        background: "#0d737722", border: "1px solid #0d7377", borderRadius: 3,
        letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
      }}>✓ synced</span>
      <Counter n={nClaims} t={t} color="#9a9490" />
    </div>
  );
}

/** Broadcast frame: footage still with continuous push-in + breathing so it
 *  never reads as static, plus LIVE bug, running timecode, and news chyron. */
function BroadcastVideo({ t }: { t: number }) {
  const lt = Math.max(0, t - S2_IN);
  const span = S2_OUT - S2_IN;
  const zoom = 1.03 + 0.06 * clamp(lt / span, 0, 1);
  const driftX = -6 * clamp(lt / span, 0, 1);
  const vs = Math.max(0, Math.floor(8 + (t - SPEECH_START)));
  const tc = `${Math.floor(vs / 60)}:${String(vs % 60).padStart(2, "0")}`;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0b0a09" }}>
      <div style={{
        position: "absolute", inset: 0,
        transform: `scale(${zoom}) translateX(${driftX}px)`, transformOrigin: "50% 42%",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FOOTAGE} alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center 18%", display: "block",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(135% 115% at 50% 40%, transparent 56%, rgba(0,0,0,0.45) 100%)",
        }} />
        {/* Bottom grade — swallows the footage's own baked-in caption */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: "34%",
          background: "linear-gradient(180deg, transparent 0%, rgba(8,7,5,0.72) 78%)",
        }} />
      </div>

      {/* LIVE bug + timecode (fixed overlays, not zoomed) */}
      <div style={{ position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px",
          background: T.live, borderRadius: 3, fontFamily: SANS, fontSize: 12,
          fontWeight: 800, letterSpacing: "0.14em", color: "#fff",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", opacity: pulse(t) }} />
          LIVE
        </span>
        <span style={{
          padding: "3px 8px", background: "rgba(0,0,0,0.5)", borderRadius: 3,
          fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "#fff",
          fontVariantNumeric: "tabular-nums", letterSpacing: "0.06em",
        }}>{tc}</span>
      </div>

      {/* News lower-third chyron */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, display: "flex", alignItems: "stretch" }}>
        <div style={{
          marginLeft: 14, background: T.live, color: "#fff", display: "flex", alignItems: "center",
          padding: "0 14px", fontFamily: SANS, fontSize: 13, fontWeight: 800,
          letterSpacing: "0.16em", borderRadius: "3px 0 0 3px",
        }}>LIVE</div>
        <div style={{
          flex: 1, marginRight: 14, background: "rgba(14,12,10,0.95)",
          borderLeft: "2px solid rgba(212,180,120,0.55)", padding: "8px 16px",
          display: "flex", flexDirection: "column", justifyContent: "center", borderRadius: "0 3px 3px 0",
        }}>
          <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
            Presidential Remarks on the Economy
          </div>
          <div style={{
            fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: "#c9bfa8",
            letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3,
          }}>World Economic Forum · Davos 2026</div>
        </div>
      </div>
    </div>
  );
}

/* Word-synced karaoke strip — mirrors CaptionKaraoke on /live */
function Karaoke({ t }: { t: number }) {
  let cur = -1;
  for (let i = WORDS.length - 1; i >= 0; i--) {
    if (t >= WORD_TIMES[i]) { cur = i; break; }
  }
  if (cur < 0) {
    return <span style={{ color: T.mute, fontStyle: "italic" }}>Waiting for speech…</span>;
  }
  const BACK = 14, FWD = 10;
  const start = Math.max(0, cur - BACK);
  const end = Math.min(WORDS.length, cur + 1 + FWD);
  return (
    <span>
      {start > 0 && <span style={{ color: T.mute, opacity: 0.5 }}>… </span>}
      {WORDS.slice(start, end).map((w, i) => {
        const wi = start + i;
        const isCur = wi === cur;
        return (
          <span key={wi} style={isCur ? {
            background: T.accent, color: "#fff", borderRadius: 3,
            padding: "0 4px", fontWeight: 600,
          } : { color: wi < cur ? T.ink : T.mute, opacity: wi < cur ? 1 : 0.55 }}>
            {w}{" "}
          </span>
        );
      })}
      {end < WORDS.length && <span style={{ color: T.mute, opacity: 0.5 }}>…</span>}
    </span>
  );
}

/* FactCard — verbatim styles from app/live/page.tsx */
function FactCard({ c, t, popT }: { c: TeaserClaim; t: number; popT: number }) {
  const p = easeOutCubic(entry(t, popT, 0.4));
  const grow = easeOutCubic(entry(t, popT, 0.45));
  const rc = RATING[c.rating];
  return (
    <div style={{ maxHeight: grow * 210, overflow: "hidden" }}>
      <div style={{
        background: T.card, border: `1px solid ${T.rule}`, borderRadius: 10,
        padding: "12px 14px", marginBottom: 8, borderLeft: `4px solid ${rc}`,
        opacity: p, transform: `translateX(${(1 - p) * 26}px)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: rc, color: "#fff", letterSpacing: 0.5, fontFamily: SANS,
            }}>{c.rating}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: T.mute, fontFamily: SANS }}>{c.conf}% conf.</span>
          </div>
          <span style={{
            fontSize: 10, color: T.blue, fontFamily: SANS, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 3,
          }}>▶ {c.vt}</span>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 6,
          fontStyle: "italic", fontFamily: SERIF, lineHeight: 1.4,
        }}>&ldquo;{c.quote}&rdquo;</div>
        <div style={{ fontSize: 11, color: T.sub, marginBottom: 4, lineHeight: 1.5, fontFamily: SANS }}>
          <strong style={{ color: T.ink }}>Data:</strong> {c.data}
          {c.sourced && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6,
              padding: "1px 6px", borderRadius: 3, background: "#0d737715", color: "#0d7377",
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
              fontFamily: SANS, verticalAlign: "middle",
            }}>✓ Sourced</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.4, fontFamily: SANS }}>{c.expl}</div>
        {c.metric && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
            padding: "5px 10px", background: T.paper, border: `1px solid ${T.rule}`,
            borderRadius: 4, fontSize: 10, fontWeight: 600, color: T.ink, fontFamily: SANS,
          }}>See full data: {c.metric} <span style={{ color: T.blue }}>→</span></span>
        )}
      </div>
    </div>
  );
}

function FilterChips({ t, counts }: { t: number; counts: number[] }) {
  const p = easeOutCubic(entry(t, CT[0] + 0.15, 0.4));
  const total = counts.reduce((a, b) => a + b, 0);
  const chips: [string, number, string, boolean][] = [["ALL", total, T.ink, true]];
  (["TRUE", "MOSTLY TRUE", "MISLEADING", "FALSE"] as const).forEach((r, i) => {
    if (counts[i] > 0) chips.push([r, counts[i], RATING[r], false]);
  });
  return (
    <div style={{
      maxHeight: p * 34, opacity: p, overflow: "hidden",
      display: "flex", flexWrap: "wrap", gap: 5, padding: p > 0.01 ? "8px 10px 0" : 0,
      background: T.card, borderLeft: `1px solid ${T.rule}`, borderRight: `1px solid ${T.rule}`,
    }}>
      {chips.map(([label, n, color, active]) => (
        <span key={label} style={{
          fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 9px",
          borderRadius: 12, letterSpacing: 0.3,
          border: `1px solid ${active ? color : T.rule}`,
          background: active ? color : T.card, color: active ? "#fff" : T.sub,
        }}>{label} {n}</span>
      ))}
    </div>
  );
}

function SummaryBar({ t }: { t: number }) {
  const p = easeOutCubic(entry(t, SUMMARY_T, 0.5));
  const fill = 50 * easeOutCubic(entry(t, SUMMARY_T + 0.15, 0.5));
  const rows: [string, number][] = [["TRUE", 1], ["MOSTLY TRUE", 1], ["MISLEADING", 1], ["FALSE", 1]];
  return (
    <div style={{
      opacity: p, transform: `translateY(${(1 - p) * 14}px)`, marginTop: 8,
      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 8,
      padding: "10px 14px", fontFamily: SANS,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: 1, color: T.mute, marginBottom: 6,
      }}>Session Summary</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 6, background: T.rule, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${fill}%`, height: "100%", borderRadius: 3, background: "#ca8a04" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{Math.round(fill)}%</span>
      </div>
      <div style={{ fontSize: 9, color: T.mute, marginBottom: 8 }}>Accuracy Score</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {rows.map(([r, n]) => (
          <span key={r} style={{ fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: RATING[r] }} />
            <span style={{ color: T.sub }}>{r}:</span>
            <span style={{ color: T.ink }}>{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Scene B · The /live product (3.5 – 19.9s) ── */
function SceneLive({ t }: { t: number }) {
  const inP = easeOutCubic(entry(t, S2_IN, 0.55));
  const outP = easeInCubic(entry(t, S2_OUT - 0.1, 0.55));
  const nClaims = CT.filter(ct => t >= ct).length;
  const counts = [nClaims >= 1 ? 1 : 0, nClaims >= 2 ? 1 : 0, nClaims >= 3 ? 1 : 0, nClaims >= 4 ? 1 : 0];
  const emptyOut = easeInCubic(entry(t, CT[0] - 0.15, 0.3));
  const x = camKF.x(t), y = camKF.y(t), s = camKF.s(t);
  const visible = CLAIMS.map((c, i) => ({ c, i })).filter(({ i }) => t >= CT[i]).reverse();

  return (
    <div style={{ position: "absolute", inset: 0, opacity: inP * (1 - outP), overflow: "hidden" }}>
      {/* Camera: translate/scale one wrapper around the full 1920×1080 page */}
      <div style={{
        position: "absolute", inset: 0, width: 1920, height: 1080,
        transform: `translate(${960 - x * s}px, ${540 - y * s}px) scale(${s})`,
        transformOrigin: "0 0",
      }}>
        {/* Nav */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: 1920, height: 52,
          background: "#ffffff", borderBottom: `1px solid ${T.rule}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ width: 1408, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 900, color: T.ink }}>Vote Unbiased</span>
            <div style={{ display: "flex", gap: 20, fontFamily: SANS, fontSize: 13, alignItems: "center" }}>
              <span style={{ color: T.sub, fontWeight: 500 }}>Data</span>
              <span style={{ color: T.sub, fontWeight: 500 }}>Scenarios</span>
              <span style={{ color: T.accent, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.live, opacity: pulse(t) }} />
                Live
              </span>
            </div>
          </div>
        </div>

        {/* LEFT column */}
        <div style={{ position: "absolute", left: 288, top: 76, width: 944 }}>
          <StatusBar t={t} nClaims={nClaims} />
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" }}>
            <BroadcastVideo t={t} />
          </div>
          <div style={{
            background: T.paper, padding: "10px 14px", fontSize: 12.5,
            fontFamily: SANS, borderBottom: `1px solid ${T.rule}`,
            lineHeight: 1.7, minHeight: 62,
          }}>
            <Karaoke t={t} />
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
            background: T.card, border: `1px solid ${T.rule}`, borderRadius: "0 0 8px 8px",
          }}>
            <span style={{
              background: T.accent, color: "#fff", borderRadius: 6, padding: "6px 16px",
              fontFamily: SANS, fontSize: 12, fontWeight: 700,
            }}>■ Stop</span>
            <span style={{
              background: T.blue, color: "#fff", borderRadius: 6, padding: "6px 16px",
              fontFamily: SANS, fontSize: 12, fontWeight: 700,
            }}>🔍 Fact Check This</span>
            <span style={{ fontFamily: SANS, fontSize: 11, color: T.gold, fontWeight: 600, opacity: 0.4 + 0.6 * pulse(t) }}>
              AI analyzing transcript...
            </span>
          </div>
        </div>

        {/* RIGHT: fact-check panel */}
        <div style={{ position: "absolute", left: 1252, top: 76, width: 380 }}>
          <div style={{
            padding: "12px 14px", background: T.card, border: `1px solid ${T.rule}`,
            borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.live, opacity: pulse(t) }} />
              LIVE FACT-CHECK
            </div>
            <span style={{ fontFamily: SANS, fontSize: 11, color: T.mute }}>
              <Counter n={nClaims} t={t} color={T.mute} />
            </span>
          </div>
          <FilterChips t={t} counts={counts} />
          <div style={{
            height: 600, overflow: "hidden", padding: "8px 8px 0",
            background: T.paper, border: `1px solid ${T.rule}`, borderTop: "none",
            borderRadius: "0 0 8px 8px",
          }}>
            {emptyOut < 1 && (
              <div style={{
                textAlign: "center", padding: "40px 16px", fontFamily: SANS,
                color: T.mute, opacity: 1 - emptyOut,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Listening for claims...</div>
                <div style={{ fontSize: 11 }}>Fact-check cards will appear here as economic claims are detected.</div>
              </div>
            )}
            {visible.map(({ c, i }) => (
              <FactCard key={i} c={c} t={t} popT={CT[i]} />
            ))}
          </div>
          <SummaryBar t={t} />
        </div>
      </div>
    </div>
  );
}

/* ── Scene C · Beta → Q3 end card (19.8 – 25s) ── */
function SceneEndCard({ t }: { t: number }) {
  const lt = t - S3_IN;
  const inP = easeOutCubic(clamp(lt / 0.6, 0, 1));
  const outP = easeInCubic(entry(t, DURATION - 0.5, 0.5));
  const chip = (t0: number): React.CSSProperties => {
    const p = easeOutBack(clamp((lt - t0) / 0.5, 0, 1));
    return { transform: `scale(${Math.max(0.001, p)})`, opacity: clamp(p, 0, 1) };
  };
  return (
    <div style={{
      position: "absolute", inset: 0, opacity: inP * (1 - outP),
      background: "linear-gradient(135deg, #1a1a1a 0%, #2d2520 100%)", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -180, right: -180, width: 640, height: 640,
        background: "radial-gradient(circle, rgba(220,38,38,0.16) 0%, transparent 70%)",
        borderRadius: "50%",
      }} />
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 30, textAlign: "center",
      }}>
        <FadeRise t={lt} t0={0.5} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%", background: T.live,
            boxShadow: "0 0 18px rgba(220,38,38,0.55)", opacity: pulse(t),
          }} />
          <span style={{
            fontFamily: SANS, fontSize: 22, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "0.28em", color: T.live,
          }}>Live Broadcast</span>
        </FadeRise>
        <FadeRise t={lt} t0={0.8} style={{
          fontFamily: SERIF, fontSize: 84, fontWeight: 700, color: "#fff",
          lineHeight: 1.12, letterSpacing: "-0.015em",
        }}>
          Watch politicians.<br />
          Check the <em style={{ fontStyle: "italic", fontWeight: 400, color: "#e0685c" }}>numbers.</em>
        </FadeRise>
        <FadeRise t={lt} t0={1.4} style={{
          fontFamily: SANS, fontSize: 22, color: "#b8b0a8", maxWidth: 780, lineHeight: 1.6,
        }}>
          Real-time AI fact-checking on live speeches — every economic claim
          verified against official data.
        </FadeRise>
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          <span style={{
            ...chip(2.0), display: "inline-flex", alignItems: "center", gap: 10,
            padding: "12px 24px", borderRadius: 6, border: `1px solid ${T.live}`,
            background: "#dc262622", color: "#fff", fontFamily: SANS,
            fontSize: 17, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: T.live, opacity: pulse(t) }} />
            In beta now
          </span>
          <span style={{
            ...chip(2.25), display: "inline-flex", alignItems: "center",
            padding: "12px 24px", borderRadius: 6, border: "1px solid #ca8a04",
            background: "#ca8a0422", color: "#e8c264", fontFamily: SANS,
            fontSize: 17, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          }}>Full launch · Q3 2026</span>
        </div>
        <FadeRise t={lt} t0={2.9} style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: "#e8e2d8" }}>
          voteunbiased.org/live
        </FadeRise>
        <FadeRise t={lt} t0={3.5} style={{
          fontFamily: SANS, fontSize: 14, fontWeight: 500, color: T.mute,
          letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 8,
        }}>
          No spin · No editorial · You interpret
        </FadeRise>
      </div>
    </div>
  );
}

/* ── Root: clock + scale-to-fit stage ── */
export default function LiveTeaser() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);
  const playingRef = useRef(true);

  // Scale the 1920×1080 canvas to the container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / 1920);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One rAF clock; pause offscreen; freeze for prefers-reduced-motion.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReduced(true);
      setT(REDUCED_MOTION_FRAME);
      return;
    }
    const el = wrapRef.current;
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        clock = (clock + dt) % DURATION;
        setT(clock);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const io = new IntersectionObserver(([e]) => {
      playingRef.current = e.isIntersecting;
      last = performance.now(); // avoid a jump when resuming
    }, { threshold: 0.15 });
    if (el) io.observe(el);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden style={{
      width: "100%", aspectRatio: "16/9", background: "#0a0a0a",
      border: `1px solid ${T.rule}`, borderRadius: 4, overflow: "hidden",
      position: "relative",
    }}>
      {scale > 0 && (
        <div style={{
          position: "absolute", top: 0, left: 0, width: 1920, height: 1080,
          transform: `scale(${scale})`, transformOrigin: "0 0", background: T.bg,
        }}>
          {t < 4.0 && !reduced && <SceneCountdown t={t} />}
          {t >= S2_IN && t < S2_OUT + 0.5 && <SceneLive t={t} />}
          {t >= S3_IN && !reduced && <SceneEndCard t={t} />}
        </div>
      )}
    </div>
  );
}
