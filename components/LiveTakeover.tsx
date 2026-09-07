"use client";

/**
 * The homepage band that appears while a broadcast is running.
 *
 * Off air this renders nothing at all, so the landing page is untouched for
 * the great majority of the time. Live, it takes the full width above
 * everything else and its only job is to get one tap to /live.
 *
 * Whether to show it is decided on the SERVER — same reason /live resolves its
 * two states before paint. Checking from the client would paint the ordinary
 * hero first and swap it a moment later, which is worst of both: the visitor
 * who came for the broadcast sees the wrong page, and everyone else sees a
 * layout jump.
 *
 * The elapsed clock is the one part that cannot be server-rendered — it would
 * be stale on arrival and frozen after — so it starts empty and fills in on
 * mount rather than shipping a wrong number.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { SERIF, SANS } from "@/lib/design-tokens";

export interface LiveNow {
  title: string;
  startedAt: string;
}

function elapsed(startedAt: string): string | null {
  const ms = Date.now() - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins} min in`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m in`;
}

export default function LiveTakeover({ live }: { live: LiveNow | null }) {
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    const tick = () => setSince(elapsed(live.startedAt));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [live]);

  if (!live) return null;

  return (
    <section
      aria-label="Live broadcast"
      style={{
        background: "#14110E", color: "#FFFEFC",
        padding: "clamp(38px, 9vw, 76px) 20px clamp(34px, 8vw, 64px)",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes vu-live-pulse{0%,100%{opacity:1}50%{opacity:.35}}
        .vu-live-dot{animation:vu-live-pulse 1.8s ease-in-out infinite}
        .vu-live-cta{transition:transform .13s ease, background .13s ease}
        .vu-live-cta:hover{transform:translateY(-1px);background:#F3EDE5}
        @media (prefers-reduced-motion:reduce){
          .vu-live-dot{animation:none}
          .vu-live-cta{transition:none}
          .vu-live-cta:hover{transform:none}
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: SANS, fontSize: 11.5, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: "#FF6B5E", marginBottom: 14,
        }}>
          <span className="vu-live-dot" style={{
            width: 8, height: 8, borderRadius: "50%", background: "#FF6B5E",
          }} />
          Live now
          {/* Rendered only once the client has a real clock. A server-rendered
              duration is wrong the moment it is cached. */}
          {since && <span style={{ color: "#9A938B", letterSpacing: "0.05em", textTransform: "none", fontWeight: 500 }}>· {since}</span>}
        </div>

        <h1 style={{
          fontFamily: SERIF, fontWeight: 400,
          fontSize: "clamp(28px, 6.2vw, 54px)", lineHeight: 1.1,
          letterSpacing: "-0.02em", margin: "0 0 14px",
        }}>
          {live.title}
        </h1>

        <p style={{
          fontFamily: SANS, fontSize: "clamp(13px, 2.6vw, 16px)",
          color: "#B8B0A6", lineHeight: 1.6, margin: "0 auto 26px", maxWidth: "48ch",
        }}>
          Every economic claim is being checked against official data as it is said.
        </p>

        <Link
          href="/live"
          className="vu-live-cta"
          style={{
            display: "inline-flex", alignItems: "center", gap: 9,
            background: "#FFFEFC", color: "#14110E",
            fontFamily: SANS, fontSize: 15, fontWeight: 600,
            // Comfortably past the 44px minimum tap target: this is the one
            // thing the band exists to be pressed.
            padding: "15px 28px", borderRadius: 6, textDecoration: "none",
          }}
        >
          Watch the fact-check <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
