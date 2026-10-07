"use client";

/**
 * Credibility timeline (spec 2a) — "turns a 40-minute briefing into one
 * scannable object."
 *
 * Every checked claim is a 3px tick at its position coloured by verdict; the
 * playhead is a white 2px line. Clicking or dragging seeks the video, and
 * because the feed, caption and running score all derive from the playhead,
 * one gesture rewinds the whole page.
 */

import { useRef } from "react";
import { L, VERDICT_COLOR, type Verdict } from "@/lib/live-design";

export interface TimelineTick { id: string; at: number; verdict: Verdict }

export default function CredibilityTimeline({
  ticks, position, duration, onSeek, onPickClaim,
}: { ticks: TimelineTick[]; position: number; duration: number; onSeek: (seconds: number) => void;
  /** A TAP (not a drag) near a mark picks that claim: the video jumps to it
   *  and the feed scrolls to its card. */
  onPickClaim?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; moved: boolean } | null>(null);
  const span = Math.max(duration, ...ticks.map(t => t.at), 60);

  const seekFromEvent = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * span);
  };
  const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Credibility timeline — jump to any checked claim"
      aria-valuemin={0} aria-valuemax={Math.round(span)} aria-valuenow={Math.round(position)}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "ArrowLeft") onSeek(Math.max(0, position - 15));
        if (e.key === "ArrowRight") onSeek(Math.min(span, position + 15));
      }}
      onPointerDown={e => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        down.current = { x: e.clientX, moved: false };
        if (!onPickClaim) seekFromEvent(e.clientX);
      }}
      onPointerMove={e => {
        if (e.buttons !== 1) return;
        if (down.current && Math.abs(e.clientX - down.current.x) > 6) down.current.moved = true;
        if (!onPickClaim || down.current?.moved) seekFromEvent(e.clientX);
      }}
      onPointerUp={e => {
        const d = down.current; down.current = null;
        if (!onPickClaim || !d || d.moved) return;
        const el = ref.current; if (!el) return;
        const r = el.getBoundingClientRect();
        // Nearest mark within a finger's width; otherwise a plain seek.
        let best: TimelineTick | null = null, bestPx = 16;
        for (const t of ticks) {
          const px = Math.abs(r.left + (t.at / span) * r.width - e.clientX);
          if (px < bestPx) { bestPx = px; best = t; }
        }
        if (best) onPickClaim(best.id); else seekFromEvent(e.clientX);
      }}
      style={{
        position: "relative", height: 30, background: L.stageAlt,
        borderTop: `1px solid ${L.cardBorder}`, borderBottom: `1px solid ${L.cardBorder}`,
        cursor: "pointer", touchAction: "none", userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "#2A2420" }} />
      {ticks.map(t => (
        <div key={t.id} title={`${t.verdict} at ${stamp(t.at)}`} style={{
          position: "absolute", left: `${(t.at / span) * 100}%`,
          top: 6, width: 3, height: 18, borderRadius: 1,
          background: VERDICT_COLOR[t.verdict], transform: "translateX(-1.5px)",
        }} />
      ))}
      <div style={{
        position: "absolute", left: `${Math.min(100, (position / span) * 100)}%`,
        top: 0, bottom: 0, width: 2, background: "#fff",
        transform: "translateX(-1px)", boxShadow: "0 0 6px rgba(255,255,255,.5)",
      }} />
    </div>
  );
}
