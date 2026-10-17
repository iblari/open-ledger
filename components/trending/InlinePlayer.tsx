"use client";

import { useEffect, useRef, useState } from "react";

/**
 * YouTube player that starts the moment it opens.
 *
 * Browsers only allow autoplay WITH sound in limited cases (Safari: almost
 * never inside an iframe), so the player always starts muted — that is
 * allowed everywhere — then tries to turn the sound on. If the browser
 * refuses, a "Tap for sound" button does it with a real tap.
 */
type YTPlayer = { playVideo(): void; mute(): void; unMute(): void; isMuted(): boolean; setVolume(v: number): void; destroy(): void };
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void } }

let apiReady: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!apiReady) {
    apiReady = new Promise(res => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      document.head.appendChild(s);
    });
  }
  return apiReady;
}

export default function InlinePlayer({ videoId, start, title }: { videoId: string; start: number; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let dead = false;
    loadApi().then(() => {
      if (dead || !host.current || !window.YT) return;
      const el = document.createElement("div");
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId, width: "100%", height: "100%",
        playerVars: { start, autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.mute(); e.target.playVideo();
            // Then try for sound; some browsers allow it after the Watch tap.
            setTimeout(() => {
              try { e.target.unMute(); e.target.setVolume(100); } catch { /* */ }
              setTimeout(() => { try { if (!dead) setMuted(e.target.isMuted()); } catch { /* */ } }, 600);
            }, 250);
          },
        },
      });
    });
    return () => { dead = true; try { player.current?.destroy(); } catch { /* */ } };
  }, [videoId, start]);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "#000" }}>
      <div ref={host} title={title} style={{ position: "absolute", inset: 0 }} className="vu-yt" />
      <style>{`.vu-yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0}`}</style>
      {muted && (
        <button type="button" onClick={() => { try { player.current?.unMute(); player.current?.setVolume(100); setMuted(false); } catch { /* */ } }} style={{
          position: "absolute", left: 12, bottom: 54, border: "none", borderRadius: 99, padding: "8px 14px", cursor: "pointer",
          background: "rgba(20,17,14,.85)", color: "#fff", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
          Tap for sound
        </button>
      )}
    </div>
  );
}
