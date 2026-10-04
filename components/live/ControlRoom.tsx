"use client";

/**
 * Control Room — the full spec-2a playing view.
 *
 * Solves the two problems in the brief:
 *  1. Checks are hard to follow while watching → the video is PINNED and
 *     never moves; only the feed scrolls. Reading a card can never push the
 *     speech off screen.
 *  2. Flat hierarchy → a fixed vertical stack on mobile (context bar, video,
 *     timeline, score, feed, record bar) and a two-column split on desktop
 *     (stage left, 404px rail right) so the eye always knows where to land.
 *
 * The video element is injected as a SLOT rather than rendered here: the
 * YouTube IFrame API replaces its target div in place, so re-mounting that
 * node would kill playback. Everything else is owned by this component.
 */

import { useEffect, useRef, useState } from "react";
import { L, F, VERDICT_COLOR, toVerdict, toOutcome, type Verdict } from "@/lib/live-design";
import CredibilityTimeline, { type TimelineTick } from "./CredibilityTimeline";
import RunningScore from "./RunningScore";
import ClaimCard, { type LiveClaimView } from "./ClaimCard";

export interface ControlRoomClaim {
  id: string; rating: string; quote: string; actual: string; explanation?: string;
  videoTime?: number; confidence?: number; claimedValue?: number | null;
  sources?: { title: string; url: string }[];
  groundTruth?: { source: string };
}

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function ControlRoom({
  title, mode, elapsed, videoDuration, silentFor, videoSlot, caption, claims, newClaimIds,
  onSeek, onStop, onFactCheck, isChecking, manualResult, onOpenRecord, mob, onBack, immersive = false,
}: {
  /** Phone held sideways: video and feed side by side, filling the window. */
  immersive?: boolean;
  /** Replays only: return to the list of recent broadcasts. */
  onBack?: () => void;
  title: string;
  mode: "live" | "replay" | "demo";
  elapsed: number;
  /** The video's true length, when the player knows it. Without this the
   *  timeline scales itself to the furthest CLAIM, so the playhead sits near
   *  the right edge while the video is only a third of the way through. */
  videoDuration?: number;
  /** Seconds since the transcriber last delivered speech, or null when it
   *  has never delivered any this session. Drives the honest empty state. */
  silentFor?: number | null;
  videoSlot: React.ReactNode;
  caption: React.ReactNode;
  /** Result of the viewer's own "check this moment". */
  manualResult?: LiveClaimView[] | null;
  claims: ControlRoomClaim[];
  newClaimIds: Set<string>;
  /**
   * `seconds` is a position on the TIMELINE SHOWN HERE. `claimId`, when
   * present, says the request came from clicking a claim — the parent then
   * maps it through its own origin logic instead of trusting our number,
   * because a live claim's videoTime is measured from when the worker
   * started capturing, which is not a position on the viewer's player.
   */
  onSeek: (seconds: number, claimId?: string) => void;
  onStop: () => void;
  onFactCheck: () => void;
  isChecking: boolean;
  onOpenRecord: () => void;
  mob: boolean;
}) {
  const [filter, setFilter] = useState<Verdict | "all">("all");

  // Full screen that keeps the fact-check. YouTube's own button (now hidden)
  // made the VIDEO full screen and dropped the feed; this makes the whole
  // player full screen instead. Not offered where the browser can't do it
  // for a page element (iPhone Safari) — there, turning the phone sideways
  // gives the immersive layout.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const [canFs, setCanFs] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any;
    setCanFs(Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled));
    const on = () => setFs(Boolean((d.fullscreenElement || d.webkitFullscreenElement) === rootRef.current && rootRef.current));
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); };
  }, []);
  const toggleFs = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any; const el = rootRef.current as any;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
    else if (el) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  };
  /* Phones: one button into the sideways, full-screen layout (design A).
     Android can go full screen and lock landscape itself. iPhone Safari
     allows neither for a web page, so there the button explains the one
     thing that works — turning the phone — and the layout follows. */
  const [rotateHint, setRotateHint] = useState<null | "enter" | "exit">(null);
  const enterLandscape = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = document.documentElement as any;
    try { await (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: "hide" }); } catch { /* not allowed */ }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (screen.orientation as any)?.lock?.("landscape");
    } catch {
      setRotateHint("enter");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(screen.orientation as any)?.lock) setRotateHint("enter");
  };
  const exitLandscape = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any;
    let handled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { (screen.orientation as any)?.unlock?.(); handled = true; } catch { /* fine */ }
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      try { await (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); handled = true; } catch { /* fine */ }
    }
    // iPhone: nothing a page can do; say how.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!handled || !(screen.orientation as any)?.lock) setRotateHint("exit");
  };
  useEffect(() => { if (!rotateHint) return; const t = setTimeout(() => setRotateHint(null), 4000); return () => clearTimeout(t); }, [rotateHint]);

  const RotateHint = rotateHint ? (

        <div role="status" style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 90,
          background: "#14110E", color: "#F2EEE9", border: `1px solid ${L.cardBorder}`,
          borderRadius: 14, padding: "18px 20px", textAlign: "center", fontFamily: F.ui, maxWidth: 260,
          boxShadow: "0 18px 40px rgba(0,0,0,.5)",
        }} onClick={() => setRotateHint(null)}>
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden style={{ display: "block", margin: "0 auto 10px", transform: rotateHint === "enter" ? "rotate(90deg)" : "none" }}>
            <rect x="12" y="4" width="16" height="32" rx="3" fill="none" stroke="#F2EEE9" strokeWidth="2" />
            <line x1="18" y1="31" x2="22" y2="31" stroke="#F2EEE9" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{rotateHint === "enter" ? "Turn your phone sideways" : "Turn your phone upright"}</div>
          <div style={{ fontSize: 11.5, color: L.mutedDark2, marginTop: 4, lineHeight: 1.45 }}>
            {rotateHint === "enter" ? "The video and the fact-check feed fill the screen side by side." : "to go back to the normal view."}
          </div>
        </div>
  ) : null;

  // Layout knobs for the two big modes.
  const big = fs || immersive;
  const compact = mob || immersive;
  const [showPill, setShowPill] = useState(false);
  const prevCount = useRef(claims.length);

  // "New check landing…" pill — removes the need to hunt for the new card.
  useEffect(() => {
    if (claims.length > prevCount.current) {
      setShowPill(true);
      const t = setTimeout(() => setShowPill(false), 2600);
      prevCount.current = claims.length;
      return () => clearTimeout(t);
    }
    prevCount.current = claims.length;
  }, [claims.length]);

  // Bring a freshly-checked claim into view. The feed sorts newest-first by
  // TIMECODE, so a check made at 26:45 lands mid-list, not at the top —
  // without this the press would look like it did nothing.
  useEffect(() => {
    if (!newClaimIds.size) return;
    const id = [...newClaimIds][0];
    const t = setTimeout(() => {
      document.getElementById(`vu-claim-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => clearTimeout(t);
  }, [newClaimIds]);

  const views: LiveClaimView[] = claims.map(c => ({
    id: c.id,
    verdict: toOutcome(c.rating),
    time: stamp(c.videoTime ?? 0),
    quote: c.quote,
    claimed: c.claimedValue != null ? String(c.claimedValue) : null,
    actual: c.actual,
    note: c.explanation,
    source: c.groundTruth?.source,
    confidence: c.confidence,
    sources: c.sources,
  }));

  const counts = {
    true: claims.filter(c => toVerdict(c.rating) === "true").length,
    misleading: claims.filter(c => toVerdict(c.rating) === "misleading").length,
    false: claims.filter(c => toVerdict(c.rating) === "false").length,
    // Everything that doesn't score, split by WHY it doesn't.
    projection: claims.filter(c => toOutcome(c.rating) === "projection").length,
    unconfirmed: claims.filter(c => toOutcome(c.rating) === "unconfirmed").length,
    unverifiable: claims.filter(c => toOutcome(c.rating) === "unverifiable").length,
  };
  const unscored = counts.projection + counts.unconfirmed + counts.unverifiable;

  const ticks: TimelineTick[] = claims
    .map(c => {
      const v = toVerdict(c.rating);
      return v && c.videoTime != null ? { id: c.id, at: c.videoTime, verdict: v } : null;
    })
    .filter((t): t is TimelineTick => t !== null);

  const secs = (t: string) => {
    const [m, s2] = t.split(":").map(Number);
    return (m || 0) * 60 + (s2 || 0);
  };
  const shown = (filter === "all" ? views : views.filter(v => v.verdict === filter))
    .slice()
    .sort((a, b) => secs(b.time) - secs(a.time)); // newest on top
  const modeLabel = mode === "replay" ? "REPLAY" : mode === "demo" ? "DEMO" : "LIVE";
  const modeColor = mode === "live" ? L.false : mode === "replay" ? "#1d4ed8" : "#B45309";

  /* ── Shared pieces ─────────────────────────────────────────── */

  const ContextBar = (
    <div style={{
      height: immersive ? 38 : 44, flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
      padding: immersive ? "0 10px 0 max(10px, env(safe-area-inset-left))" : "0 14px", background: L.stage, borderBottom: `1px solid ${L.cardBorder}`,
    }}>
      {/* Icon-only so the title keeps its room on a phone; the label rides on
          aria-label and title, so it is still announced and still explained
          on hover. */}
      {onBack && (
        <button
          type="button" onClick={onBack} className="vu-back"
          aria-label={mode === "live" ? "Past broadcasts & trends (the live keeps running)" : "Back to recent broadcasts"}
          title={mode === "live" ? "Past broadcasts & trends (the live keeps running)" : "Back to recent broadcasts"}
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: `1px solid ${L.cardBorder}`,
            color: "#D8D2C8", fontSize: 15, lineHeight: 1, cursor: "pointer", padding: 0,
          }}
        >←</button>
      )}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
        background: modeColor, color: "#fff", borderRadius: 3, padding: "3px 8px",
        fontFamily: F.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
      }}>
        {mode === "live" && <span className="live-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
        {modeLabel}
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontFamily: F.display, fontSize: 14, fontWeight: 500,
        color: "#F2EEE9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{title}</span>
      {immersive && (counts.true + counts.misleading + counts.false) > 0 && (
        // The score panel is dropped sideways (the video needs the height);
        // its headline rides here instead.
        <span style={{ fontFamily: F.ui, fontSize: 10.5, color: L.mutedDark2, flexShrink: 0, whiteSpace: "nowrap" }}>
          <b style={{ color: "#F2EEE9", fontFamily: F.mono, fontWeight: 500 }}>{Math.round((counts.true / Math.max(1, counts.true + counts.misleading + counts.false)) * 100)}%</b> matched
          {" · "}<span style={{ color: L.true }}>{counts.true}</span>/<span style={{ color: L.misleading }}>{counts.misleading}</span>/<span style={{ color: L.false }}>{counts.false}</span>
        </span>
      )}
      <span style={{ fontFamily: F.mono, fontSize: 12, color: L.mutedDark2, flexShrink: 0 }}>{stamp(elapsed)}</span>
      {(mob || immersive) && (
        <button type="button" onClick={immersive ? exitLandscape : enterLandscape} className="vu-back"
          aria-label={immersive ? "Exit full screen" : "Full screen, sideways, with fact-checks"}
          title={immersive ? "Exit full screen" : "Full screen with fact-checks"}
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: `1px solid ${L.cardBorder}`, color: "#D8D2C8",
            cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1,
          }}>
          {immersive ? "✕" : (
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />
            </svg>
          )}
        </button>
      )}
      {!mob && !immersive && canFs && (
        <button type="button" onClick={toggleFs} className="vu-back"
          aria-label={fs ? "Exit full screen" : "Full screen with fact-checks"}
          title={fs ? "Exit full screen (Esc)" : "Full screen with fact-checks"}
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginLeft: 4,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: `1px solid ${L.cardBorder}`, color: "#D8D2C8",
            cursor: "pointer", padding: 0,
          }}>
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {fs
              ? <path d="M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4" />
              : <path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />}
          </svg>
        </button>
      )}
      {/* Stop lives here now. As its own full-width bar it cost ~46px of a
          phone screen to expose an action people use once, at the end. */}
      {mob && (
        <button onClick={onStop} aria-label="Stop" style={{
          background: "transparent", border: `1px solid ${L.cardBorder}`, color: L.mutedDark2,
          borderRadius: 6, padding: "3px 9px", marginLeft: 8, fontFamily: F.ui,
          fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0,
        }}>■</button>
      )}
    </div>
  );

  const FilterChips = (
    // One row that scrolls sideways on mobile instead of wrapping to two.
    // Seven verdict chips wrapped into a second line and cost ~55px of feed.
    <div style={{
      display: "flex", gap: 5,
      flexWrap: compact ? "nowrap" : "wrap",
      overflowX: compact ? "auto" : undefined,
      scrollbarWidth: "none",
    }}>
      {(([
        ["all", `ALL ${views.length}`],
        ["false", `FALSE ${counts.false}`],
        ["misleading", `MISLEADING ${counts.misleading}`],
        ["true", `TRUE ${counts.true}`],
        // Only offer a filter for outcomes actually present — an always-on
        // "UNVERIFIABLE 0" chip advertised a weakness that wasn't there.
        ...(counts.unconfirmed ? [["unconfirmed", `UNCONFIRMED ${counts.unconfirmed}`]] : []),
        ...(counts.projection ? [["projection", `PROJECTION ${counts.projection}`]] : []),
        ...(counts.unverifiable ? [["unverifiable", `UNVERIFIABLE ${counts.unverifiable}`]] : []),
      ] as const))
        .filter(([k]) => k === "all" || counts[k as keyof typeof counts] > 0)
        .map(([k, label]) => {
          const active = filter === k;
          const color = k === "all" ? "#fff" : VERDICT_COLOR[k as Verdict];
          return (
            <button key={k} onClick={() => setFilter(k as Verdict | "all")} style={{
              fontFamily: F.ui, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              padding: "4px 9px", borderRadius: 12, cursor: "pointer",
              background: active ? (k === "all" ? "#F2EEE9" : color) : "transparent",
              color: active ? (k === "all" ? L.ink : "#fff") : L.mutedDark2,
              border: `1px solid ${active ? "transparent" : L.cardBorder}`,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>{label}</button>
          );
        })}
    </div>
  );

  const Feed = (
    <div className={compact ? "vu-feed-mob" : undefined}
      style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {showPill && (
        <div style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 5,
          background: L.true, color: "#fff", borderRadius: 20, padding: "6px 14px",
          fontFamily: F.ui, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
          boxShadow: "0 6px 20px rgba(0,0,0,.35)", pointerEvents: "none",
        }}>New check landing…</div>
      )}
      <div style={{
        // Plain column flow. `column-reverse` with `justify-content:flex-end`
        // packs the cards against the visual top and sends the overflow
        // UPWARD, out of reach — the feed simply could not be scrolled.
        // Newest-first ordering is done explicitly below instead, and the
        // isNew flag already keeps the entry animation to the new card only.
        flex: 1, minHeight: 0, overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "12px 14px 16px",
        display: "flex", flexDirection: "column",
      }}>
        {shown.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "40px 16px", fontFamily: F.ui, color: L.mutedDark,
          }}>
            {/* Don't claim to be listening when no audio is arriving.
                A broadcast where the transcriber has fallen over looked
                identical to one where nobody had said anything checkable
                yet — the viewer waits indefinitely for a feed that is not
                coming. Two minutes of silence is well past the 45s chunk
                cadence, so it means the chain, not the speaker. */}
            {(() => {
              const stalled = silentFor != null && silentFor > 120;
              if (views.length > 0) return (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: L.mutedDark2 }}>
                  No claims match this filter
                </div>
              );
              return (<>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{stalled ? "⚠️" : "📡"}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: stalled ? L.misleading : L.mutedDark2 }}>
                  {stalled ? "Not receiving audio" : "Listening for claims…"}
                </div>
                <div style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.5, maxWidth: "36ch", marginLeft: "auto", marginRight: "auto" }}>
                  {stalled
                    ? `No speech has reached the transcriber for ${Math.round(silentFor! / 60)} min. Coverage is reconnecting — the record will be completed from captions after the broadcast.`
                    : "Checks appear here as economic claims are spoken."}
                </div>
              </>);
            })()}
          </div>
        ) : shown.map(v => (
          <ClaimCard key={v.id} claim={v} compact={compact} isNew={newClaimIds.has(v.id)}
            // Seconds are 0 on purpose: the parent resolves the claim by id
            // and applies its own origin logic. LiveClaimView carries a
            // formatted `time` string, not a number, so reading videoTime
            // here was always undefined — a real type error hidden by
            // ignoreBuildErrors.
            onSeek={c => onSeek(0, c.id)} />
        ))}
      </div>
    </div>
  );

  const RecordBar = (
    <button onClick={onOpenRecord} style={{
      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, width: "100%", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
      background: L.stageAlt, border: "none", borderTop: `1px solid ${L.cardBorder}`,
      cursor: "pointer", textAlign: "left",
    }}>
      <span style={{ fontFamily: F.ui, fontSize: 12.5, color: "#F2EEE9" }}>
        <strong style={{ fontFamily: F.mono, fontWeight: 500 }}>{views.length}</strong> claims on the record
      </span>
      <span style={{ fontFamily: F.ui, fontSize: 11.5, fontWeight: 700, color: L.true, whiteSpace: "nowrap" }}>
        Download record ↓
      </span>
    </button>
  );

  const Controls = (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
      background: L.stage, borderTop: `1px solid ${L.cardBorder}`, flexShrink: 0,
    }}>
      <button onClick={onStop} style={{
        background: "transparent", border: `1px solid ${L.cardBorder}`, color: L.mutedDark2,
        borderRadius: 6, padding: "7px 14px", fontFamily: F.ui, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }}>■ Stop</button>
      <button onClick={onFactCheck} disabled={isChecking} style={{
        background: L.true, border: "none", color: "#fff", borderRadius: 6,
        padding: "7px 14px", fontFamily: F.ui, fontSize: 11.5, fontWeight: 700,
        cursor: isChecking ? "default" : "pointer", opacity: isChecking ? 0.6 : 1,
      }}>{isChecking ? "Checking…" : "🔍 Check this moment"}</button>
    </div>
  );

  const Stage = (
    <>
      <div style={{
        position: "relative", aspectRatio: "16/9", background: "#000",
        flexShrink: 0,
        // The stage must NEVER be allowed to be taller than the column,
        // because the column sits in an overflow:hidden grid — whatever the
        // video pushes past the bottom simply ceases to exist. On desktop a
        // full-width 16:9 in a wide window is taller than the viewport, so
        // Stop and "Check this moment" were clipped clean off; the same bug
        // as mobile, one layer up. Width is derived FROM the height cap
        // (h × 16/9) so the box stays true 16:9 instead of letterboxing.
        // 30vh -> 25vh. Every point given back here goes straight to the
        // feed, which was down to roughly one and a half visible cards.
        // Full screen / sideways: the video takes everything except the bar
        // above it and the timeline + score below it.
        maxHeight: mob ? "min(25vh, 210px)" : fs ? "calc(100vh - 44px - 120px)" : immersive ? "calc(100dvh - 38px - 26px)" : "min(52vh, 620px)",
        width: mob ? "100%" : fs ? "min(100%, calc((100vh - 164px) * 16 / 9))" : immersive ? "min(100%, calc((100dvh - 64px) * 16 / 9))" : "min(100%, calc(min(52vh, 620px) * 16 / 9))",
        margin: mob ? undefined : "0 auto",
      }}>
        {videoSlot}
        {/* Live caption overlaid at the bottom of the video (spec: the words
            being spoken tie to the card that appears). */}
        {caption && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            // Hard cap: the caption is a strip at the base of the frame, never
            // a panel that can grow over the speaker. Two lines max, clipped.
            maxHeight: "38%",
            padding: "16px 12px 8px",
            background: "linear-gradient(180deg, transparent, rgba(10,8,7,.92) 45%)",
            pointerEvents: "none", overflow: "hidden",
          }}>
            <div style={{
              fontFamily: F.ui, fontSize: mob ? 11.5 : 13, lineHeight: 1.45,
              color: "#F2EEE9", textShadow: "0 1px 3px rgba(0,0,0,.9)",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {caption}
            </div>
          </div>
        )}
      </div>
      {/* The axis is the VIDEO, not the claims. Scaling to the last tick
          made the playhead race ahead of the picture: at 27:46 of a 1:09:51
          replay whose last claim sits at 31:51, the marker rendered at 87%
          while the video was 40% through. Fall back to the old behaviour
          only while the player has not reported a duration yet (live edge). */}
      <CredibilityTimeline ticks={ticks} position={elapsed}
        duration={videoDuration && videoDuration > 60
          ? videoDuration
          : Math.max(elapsed, ...ticks.map(t => t.at), 60)}
        onSeek={onSeek} />
      {!immersive && (
        <RunningScore trueCount={counts.true} misleadingCount={counts.misleading}
          falseCount={counts.false} unverifiableCount={unscored} mob={compact} />
      )}
    </>
  );

  /* ── Layouts ───────────────────────────────────────────────── */

  /**
   * A manual check no longer gets its own panel on mobile.
   *
   * Its claims are already added to `claims`, so a separate block rendered
   * the same card twice and pushed the feed further down the screen. The
   * result now lands in the feed like any other claim; the effect below
   * scrolls it into view so pressing the button still visibly does
   * something.
   */
  if (mob) {
    // Fixed vertical stack: only the feed scrolls, so the video is never
    // pushed off screen by what you're reading.
    return (
      <div style={{
        // 100dvh, not inset:0. The DYNAMIC viewport unit tracks the visible
        // area as mobile browser chrome shows and hides; inset:0 resolves
        // against the layout viewport, which extends underneath the toolbar
        // and quietly hides whatever is at the bottom of the stack.
        position: "fixed", top: 0, left: 0, right: 0,
        height: "100dvh", maxHeight: "100dvh",
        zIndex: 60, background: L.ink,
        display: "flex", flexDirection: "column",
      }}>
        {ContextBar}
        {Stage}
        {/* The primary action gets its own full-width row DIRECTLY under the
            video, not the bottom control bar. On a phone the bottom of a
            fixed stack sits under the browser toolbar and the home
            indicator, so "Check this moment" was there in the DOM and
            unreachable on screen. Above the feed it cannot be pushed
            anywhere. */}
        <div style={{ padding: "10px 14px 0", background: L.ink, flexShrink: 0 }}>
          <button onClick={onFactCheck} disabled={isChecking} style={{
            width: "100%", background: L.true, border: "none", color: "#fff",
            borderRadius: 8, padding: "9px 14px", fontFamily: F.ui,
            fontSize: 13.5, fontWeight: 700, cursor: isChecking ? "default" : "pointer",
            opacity: isChecking ? 0.6 : 1,
          }}>{isChecking ? "Checking…" : "🔍 Check this moment"}</button>
        </div>
        {/* Compact the cards themselves. Reclaiming layout space got the
            feed to 335px, but a card is 206px — so still only 1.6 fit. The
            card is sized for a desktop rail; on a phone the quote, the two
            figures and the padding can all give a little without losing
            anything. Done in CSS so ClaimCard needs no new prop and desktop
            is provably untouched. */}
        <div style={{ padding: "8px 14px 0", background: L.ink, flexShrink: 0 }}>{FilterChips}</div>
        {Feed}
        {RecordBar}
        {RotateHint}
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{
      display: "grid", gap: 0, background: L.ink, overflow: "hidden",
      gridTemplateColumns: immersive ? "minmax(0,2fr) minmax(0,1fr)" : fs ? "minmax(0,1fr) 420px" : "minmax(0,1fr) 404px",
      ...(immersive
        // Sideways phone: cover the window. 100dvh follows the browser bar
        // as it shows and hides.
        ? { position: "fixed", top: 0, left: 0, right: 0, height: "100dvh", zIndex: 70, borderRadius: 0, border: "none" }
        : fs
          ? { height: "100vh", borderRadius: 0, border: "none" }
          : { height: "calc(100vh - 140px)", minHeight: 560, borderRadius: 12, border: `1px solid ${L.cardBorder}` }),
    }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, borderRight: `1px solid ${L.cardBorder}` }}>
        {ContextBar}
        {Stage}
        {!immersive && Controls}
        {/* The leftover height carries the running transcript rather than a
            void. Previously a flex spacer pushed the controls to the bottom
            of the column, leaving a large empty panel and burying the
            "check this moment" button below the fold. */}
        {/* This area belongs to "check this moment" — the result of a manual
            check lands here, beside the video, instead of nowhere (it wasn't
            rendered at all after the redesign). */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 18px", display: immersive ? "none" : undefined }}>
          {isChecking ? (
            <div style={{ fontFamily: F.ui, fontSize: 12.5, color: L.mutedDark2 }}>
              Checking what was just said against the data…
            </div>
          ) : manualResult && manualResult.length > 0 ? (
            <>
              <div style={{
                fontFamily: F.ui, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em",
                textTransform: "uppercase", color: L.mutedDark, marginBottom: 10,
              }}>You checked this moment</div>
              {manualResult.map(c => <ClaimCard key={c.id} claim={c} />)}
            </>
          ) : (
            // Centred, not pinned to the top. This panel is as tall as the
            // video beside it, so a two-line prompt at the top left a large
            // black void underneath that read as a broken or still-loading
            // region rather than an empty one.
            <div style={{
              minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              textAlign: "center",
            }}>
              <div style={{ fontFamily: F.ui, fontSize: 12.5, color: L.mutedDark, lineHeight: 1.6, maxWidth: "42ch" }}>
                {/* Explicit {" "} — JSX strips whitespace that sits against a
                    line break, which is what glued "moment" to "and". */}
                Heard something worth checking? Press{" "}
                <strong style={{ color: L.mutedDark2 }}>Check this moment</strong>{" "}
                and we&rsquo;ll verify what was just said against official data.
                The result appears here and joins the record.
              </div>
            </div>
          )}
        </div>
      </div>
      {/* minHeight:0 is what makes the rail scroll: grid items default to
          min-height:auto, so without it the feed grows to fit its content and
          overflows the card instead of scrolling inside it. */}
      <aside style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: L.stageAlt }}>
        <div style={{ padding: immersive ? "8px 10px 8px" : "12px 14px", paddingRight: immersive ? "max(10px, env(safe-area-inset-right))" : undefined, borderBottom: `1px solid ${L.cardBorder}`, flexShrink: 0 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginBottom: immersive ? 6 : 9, fontFamily: F.ui,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: L.mutedDark }}>
              Fact-check feed
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 12, color: "#fff" }}>{views.length}</span>
          </div>
          {FilterChips}
        </div>
        {Feed}
        {!immersive && RecordBar}
      </aside>
      {RotateHint}
    </div>
  );
}
