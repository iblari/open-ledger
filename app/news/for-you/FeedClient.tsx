"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FyCard } from "@/lib/for-you";

export type ViewCard = FyCard & { ago: string; color: string | null };

const SERIF = "'Source Serif 4', Georgia, serif";
const LEAN = { left: "#5B7BD0", center: "#D9D5CE", right: "#D2493D" } as const;
const SITE = "https://voteunbiased.org";

function beacon(body: object) {
  const s = JSON.stringify(body);
  try { if (navigator.sendBeacon?.("/api/for-you", new Blob([s], { type: "application/json" }))) return; } catch {}
  fetch("/api/for-you", { method: "POST", body: s, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

/* ── YouTube: the moment the claim was said ───────────────────── */

type YTPlayer = { playVideo(): void; pauseVideo(): void; seekTo(s: number, a: boolean): void; mute(): void; unMute(): void; isMuted(): boolean; setVolume(v: number): void; destroy(): void; getPlayerState(): number };
type W = { YT?: { Player: new (el: HTMLElement, o: object) => unknown }; onYouTubeIframeAPIReady?: () => void };
const win = () => window as unknown as W;
let apiReady: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (win().YT?.Player) return Promise.resolve();
  if (!apiReady) apiReady = new Promise(res => {
    const prev = win().onYouTubeIframeAPIReady;
    win().onYouTubeIframeAPIReady = () => { prev?.(); res(); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; document.head.appendChild(s);
  });
  return apiReady;
}

function Moment({ yt, active, sound, paused, quote, onMuted }: { yt: { id: string; start: number; end: number }; active: boolean; sound: boolean; paused: boolean; quote: string; onMuted: (m: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const p = useRef<YTPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active) return;
    let dead = false;
    loadApi().then(() => {
      const YT = win().YT;
      if (dead || !host.current || !YT) return;
      const el = document.createElement("div"); host.current.appendChild(el);
      p.current = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com", videoId: yt.id, width: "100%", height: "100%",
        playerVars: { start: yt.start, end: yt.end, autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, disablekb: 1, fs: 0, cc_load_policy: 0 },
        events: {
          onReady: (e: { target: YTPlayer }) => { e.target.mute(); e.target.playVideo(); },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 0) { e.target.seekTo(yt.start, true); e.target.playVideo(); }
          },
        },
      }) as YTPlayer;
    });
    const h = host.current;
    return () => { dead = true; setPlaying(false); try { p.current?.destroy(); } catch {} p.current = null; if (h) h.innerHTML = ""; };
  }, [active, yt.id, yt.start, yt.end]);
  useEffect(() => {
    const x = p.current; if (!x || !playing) return;
    try {
      if (sound) { x.unMute(); x.setVolume(100); setTimeout(() => { try { onMuted(x.isMuted()); } catch {} }, 500); } else x.mute();
    } catch {}
  }, [sound, playing, onMuted]);
  useEffect(() => { const x = p.current; if (!x || !playing) return; try { if (paused) x.pauseVideo(); else x.playVideo(); } catch {} }, [paused, playing]);
  return (
    <div className="fy-panel">
      <img src={`https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: playing ? 0 : 1, transition: "opacity .3s" }} />
      <div ref={host} className="fy-yt" />
      <div className="fy-sub"><span>“{quote}”</span></div>
    </div>
  );
}

function Clip({ src, poster, active, paused, fit = "cover" }: { src: string | null; poster: string; active: boolean; paused: boolean; fit?: "cover" | "contain" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = ref.current; if (!v) return; if (active && !paused) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause(); }, [active, paused]);
  const st: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit };
  return src ? <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" style={st} /> : <img src={poster} alt="" loading="lazy" style={st} />;
}

/* ── Icons ─────────────────────────────────────────────────────── */
const I = {
  share: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />,
  on: <><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
  off: <><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></>,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 6-7" />,
  story: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  bars: <path d="M6 20V10M12 20V4M18 20v-7" />,
};
const Svg = ({ d }: { d: React.ReactNode }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

/* ── Overlays per kind ─────────────────────────────────────────── */

function Coverage({ c }: { c: { left: number; center: number; right: number } }) {
  const t = c.left + c.center + c.right || 1;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        {(["left", "center", "right"] as const).filter(k => c[k] > 0).map(k => <span key={k} style={{ flex: c[k], background: LEAN[k] }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 4, color: "rgba(255,255,255,.8)" }}>
        <span>{Math.round(c.left / t * 100)}% left ({c.left})</span><span>{Math.round(c.center / t * 100)}% center ({c.center})</span><span>{Math.round(c.right / t * 100)}% right ({c.right})</span>
      </div>
    </div>
  );
}

const OPEN: Record<ViewCard["kind"], [string, React.ReactNode]> = { story: ["Story", I.story], claim: ["Chart", I.chart], metric: ["Data", I.chart], result: ["Results", I.bars] };

export default function FeedClient({ cards }: { cards: ViewCard[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [moved, setMoved] = useState(false);
  const [sound, setSound] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const pending = useRef<string[]>([]);
  const maxIdx = useRef(0);
  const onMuted = useCallback((m: boolean) => setBlocked(m), []);

  useEffect(() => {
    beacon({ session: true });
    const flush = () => { if (pending.current.length) beacon({ views: pending.current.splice(0) }); };
    const t = setInterval(flush, 5000);
    const vis = () => { if (document.visibilityState === "hidden") { flush(); beacon({ done: maxIdx.current + 1 }); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); flush(); };
  }, []);
  useEffect(() => {
    setPaused(false);
    const id = cards[active]?.id; if (!id) return;
    const t = setTimeout(() => { if (!seen.current.has(id)) { seen.current.add(id); pending.current.push(id); maxIdx.current = Math.max(maxIdx.current, active); } }, 1000);
    return () => clearTimeout(t);
  }, [active, cards]);
  useEffect(() => {
    const root = box.current; if (!root) return;
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting && e.intersectionRatio > 0.6) { const i = Number((e.target as HTMLElement).dataset.i); setActive(i); if (i > 0) setMoved(true); }
    }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-i]").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [cards.length]);
  const go = useCallback((d: number) => {
    box.current?.querySelector<HTMLElement>(`[data-i="${Math.max(0, Math.min(cards.length - 1, active + d))}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active, cards.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (["ArrowDown", "j", "PageDown"].includes(e.key)) { e.preventDefault(); go(1); }
      if (["ArrowUp", "k", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
      if (e.key === " ") { e.preventDefault(); setPaused(p => !p); }
      if (e.key === "m") setSound(s => !s);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  const share = async (c: ViewCard) => {
    const url = `${SITE}${c.href}${c.href.includes("?") ? "&" : "?"}utm_source=foryou&utm_medium=share&utm_content=${encodeURIComponent(c.id)}`;
    const title = c.kind === "story" ? c.title : c.kind === "claim" ? `“${c.quote}”: ${c.ratingLabel}` : c.kind === "metric" ? `${c.name}: ${c.value}` : `${c.title}: vote count`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setToast("Link copied"); setTimeout(() => setToast(null), 1600);
    } catch { /* dismissed */ }
  };

  if (!cards.length) return <p style={{ padding: 40, textAlign: "center" }}>Nothing in the feed right now. Check back in a few minutes.</p>;

  return (
    <div style={{ position: "relative", background: "#000" }}>
      <style>{`
        .fy-box{height:calc(100dvh - var(--vu-chrome-h) - 42px);overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scrollbar-width:none;background:#000}
        .fy-box::-webkit-scrollbar{display:none}
        .fy-slot{height:100%;scroll-snap-align:start;scroll-snap-stop:always;position:relative;overflow:hidden;display:flex;justify-content:center}
        .fy-stage{position:relative;height:100%;aspect-ratio:9/16;max-width:100%;overflow:hidden;background:#0b0b0b;color:#fff}
        .fy-bg{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(28px) brightness(.45);transform:scale(1.1)}
        .fy-tap{position:absolute;inset:0;z-index:2}
        .fy-panel{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden}
        .fy-yt{position:absolute;inset:0}.fy-yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
        .fy-sub{position:absolute;left:8px;right:8px;bottom:8px;text-align:center;pointer-events:none}
        .fy-sub span{background:rgba(0,0,0,.72);font-size:13px;line-height:1.45;padding:3px 7px;border-radius:4px;box-decoration-break:clone;-webkit-box-decoration-break:clone;display:-webkit-inline-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .fy-lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);padding:10px 12px 6px}
        .fy-grad{position:absolute;left:0;right:0;bottom:0;height:62%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.55) 35%,rgba(0,0,0,.92));z-index:3;pointer-events:none}
        .fy-cap{position:absolute;left:14px;right:68px;bottom:14px;z-index:4;text-shadow:0 1px 2px rgba(0,0,0,.4)}
        .fy-k{font-size:12px;color:rgba(255,255,255,.75)}
        .fy-h{font-family:${SERIF};font-weight:500;font-size:clamp(20px,5.4vw,24px);line-height:1.18;letter-spacing:-.01em;margin:6px 0 4px;color:#fff;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
        .fy-why{font-size:12px;color:rgba(255,255,255,.8);margin-top:8px;display:flex;gap:10px;align-items:center}
        .fy-1{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
        .fy-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .fy-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .fy-rail{position:absolute;right:8px;bottom:96px;z-index:5;display:flex;flex-direction:column;gap:16px;align-items:center}
        .fy-rb{display:flex;flex-direction:column;align-items:center;gap:3px;color:#fff;background:none;border:0;cursor:pointer;font:600 11px/1 'DM Sans',sans-serif;text-decoration:none;padding:0}
        .fy-rb span{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center;backdrop-filter:blur(6px)}
        .fy-tag{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:4px;display:inline-block}
        .fy-nav{position:absolute;right:24px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:6}
        .fy-nav button{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer}
        .fy-nav button:disabled{opacity:.3;cursor:default}
        @media (max-width:760px){.fy-nav{display:none}.fy-stage{aspect-ratio:auto;width:100%}}
        @media (max-height:700px){.fy-hide-short{display:none}}
        @keyframes fy-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes fy-pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}
      `}</style>
      <div ref={box} className="fy-box" aria-label="For you feed">
        {cards.map((c, i) => {
          const on = i === active;
          const near = Math.abs(i - active) <= 2;
          return (
            <section key={c.id} data-i={i} className="fy-slot" aria-label={`${i + 1} of ${cards.length}`}>
              <div className="fy-stage">
                {near && <Stage c={c} active={on} sound={sound} paused={on && paused} onMuted={onMuted} />}
                <div className="fy-tap" onClick={() => on && setPaused(p => !p)} />
                {on && paused && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 4, pointerEvents: "none" }}><span style={{ width: 70, height: 70, borderRadius: "50%", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", animation: "fy-pop .15s" }}><svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg></span></div>}
                <div className="fy-rail">
                  {c.kind === "claim" && c.yt && (
                    <button className="fy-rb" onClick={() => { setSound(s => !s); setBlocked(false); }} aria-label={sound ? "Mute" : "Sound on"}><span><Svg d={sound && !blocked ? I.on : I.off} /></span>{sound && !blocked ? "Sound" : "Muted"}</button>
                  )}
                  <Link href={c.href} className="fy-rb" onClick={() => beacon({ open: c.id })}><span><Svg d={OPEN[c.kind][1]} /></span>{OPEN[c.kind][0]}</Link>
                  <button className="fy-rb" onClick={() => share(c)} aria-label="Share"><span><Svg d={I.share} /></span>Share</button>
                </div>
                <div className="fy-cap">
                  <Caption c={c} />
                  <div className="fy-why">
                    <span className="fy-1" style={{ flex: 1 }}>{c.why}</span>
                    {i === 0 && !moved && <button onClick={() => go(1)} style={{ background: "none", border: 0, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", animation: "fy-bob 1.6s ease-in-out infinite", padding: 0 }}>↑ Swipe up</button>}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <div className="fy-nav">
        <button onClick={() => go(-1)} disabled={active === 0} aria-label="Previous">↑</button>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", textAlign: "center" }}>{active + 1}/{cards.length}</div>
        <button onClick={() => go(1)} disabled={active === cards.length - 1} aria-label="Next">↓</button>
      </div>
      {toast && <div role="status" style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", background: "#fff", color: "#111", fontSize: 13, padding: "8px 14px", borderRadius: 999, zIndex: 7 }}>{toast}</div>}
    </div>
  );
}

/** The picture/video layer. */
function Stage({ c, active, sound, paused, onMuted }: { c: ViewCard; active: boolean; sound: boolean; paused: boolean; onMuted: (m: boolean) => void }) {
  const [pi, setPi] = useState(0);
  if (c.kind === "story") {
    const list = [...(c.photo ? [c.photo] : []), ...c.alts.map(a => a.url)];
    const src = list[pi];
    return (
      <>
        {src ? (
          <>
            <img src={src} alt="" aria-hidden referrerPolicy="no-referrer" style={{ position: "absolute", inset: -40, width: "calc(100% + 80px)", height: "calc(100% + 80px)", objectFit: "cover", filter: "blur(28px) brightness(.45)" }} />
            <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setPi(n => n + 1)} style={{ position: "absolute", left: 0, top: "6%", width: "100%", height: "auto", maxHeight: "50%", objectFit: "contain" }} />
          </>
        ) : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#2a2622,#0b0b0b)" }} />}
        {src && c.credit && pi === 0 && <span style={{ position: "absolute", right: 8, top: 8, zIndex: 3, fontSize: 10, color: "rgba(255,255,255,.75)", background: "rgba(0,0,0,.4)", padding: "2px 6px", borderRadius: 4 }}>Photo: {c.credit}</span>}
        <div className="fy-grad" style={{ height: "58%" }} />
      </>
    );
  }
  if (c.kind === "claim") {
    return (
      <>
        <div className="fy-bg" style={{ backgroundImage: `url(${c.yt ? `https://i.ytimg.com/vi/${c.yt.id}/hqdefault.jpg` : c.image})` }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          {c.yt ? (
            <>
              <div className="fy-lbl">What was said · {c.speaker || "Speaker"}</div>
              <Moment yt={c.yt} active={active} sound={sound} paused={paused} quote={c.quote} onMuted={onMuted} />
              <div className="fy-lbl fy-hide-short">What the data shows</div>
              <div className="fy-panel fy-hide-short"><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>
            </>
          ) : (
            <div className="fy-panel" style={{ marginTop: 40 }}><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>
          )}
        </div>
        <div className="fy-grad" style={{ height: "42%" }} />
      </>
    );
  }
  if (c.kind === "metric") {
    return (
      <>
        <div className="fy-bg" style={{ backgroundImage: `url(${c.image})` }} />
        <div style={{ position: "relative", zIndex: 1, paddingTop: "18%" }}>
          <div className="fy-panel"><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>
        </div>
        <div className="fy-grad" style={{ height: "48%" }} />
      </>
    );
  }
  return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 0%,#2b2724,#0b0b0b)" }} />;
}

function Caption({ c }: { c: ViewCard }) {
  if (c.kind === "story") return (
    <>
      <div className="fy-k">News · {c.topic} · {c.outlets} outlets · {c.ago}</div>
      <h2 className="fy-h">{c.title}</h2>
      <Coverage c={c.coverage} />
      {c.sides.length > 0 && (
        <div className="fy-hide-short" style={{ marginTop: 8 }}>
          {c.sides.map(x => (
            <div key={x.lean} className="fy-1" style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(255,255,255,.88)" }}>
              <b style={{ color: LEAN[x.lean], fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, letterSpacing: ".06em", marginRight: 6 }}>{x.lean}</b>“{x.title}”
            </div>
          ))}
        </div>
      )}
      {c.blindspot && <div style={{ marginTop: 8 }}><span className="fy-tag" style={{ background: "#EEEAF8", color: "#4D3E8F" }}>{c.blindspot}</span></div>}
    </>
  );
  if (c.kind === "claim") return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="fy-tag" style={{ background: c.color || "#fff", color: "#fff", textTransform: "uppercase", letterSpacing: ".06em" }}>{c.ratingLabel}</span>
        <span className="fy-k fy-1">{c.speaker ? `${c.speaker} · ` : ""}{c.ago}</span>
      </div>
      <div className="fy-3" style={{ fontSize: 14.5, lineHeight: 1.42, marginTop: 8 }}><b style={{ fontWeight: 700 }}>The data: </b>{c.dataLine}</div>
      {c.source && !/\bper\b/i.test(c.dataLine) && <div className="fy-k" style={{ marginTop: 3, fontSize: 11.5 }}>Source: {c.source}</div>}
    </>
  );
  if (c.kind === "metric") {
    const up = c.change?.startsWith("up"), down = c.change?.startsWith("down");
    return (
      <>
        <div className="fy-k">Official data · {c.label}</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{c.name}</div>
        <div style={{ fontFamily: SERIF, fontSize: "clamp(48px,14vw,64px)", lineHeight: 1, fontWeight: 500, letterSpacing: "-.03em", margin: "4px 0" }}>{c.value}</div>
        {c.change && <div style={{ fontSize: 14, fontWeight: 700, color: up ? "#7FD6CF" : down ? "#F6A57E" : "#fff" }}>{up ? "▲ " : down ? "▼ " : ""}{c.change.replace(/^(up|down) /, "")}</div>}
        <div className="fy-k" style={{ marginTop: 6, fontSize: 11.5 }}>Source: {c.source}{c.nextRelease && Date.parse(c.nextRelease) > Date.now() ? ` · next release ${new Date(c.nextRelease).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}</div>
      </>
    );
  }
  const lead = c.cands[0]?.votes;
  return (
    <>
      <div className="fy-k">{c.live ? "Live result" : "Election result"} · {c.state} · updated {c.ago}</div>
      <h2 className="fy-h">{c.title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
        {c.cands.map(x => (
          <div key={x.name}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{x.name} <span style={{ fontSize: 11.5, opacity: .7, fontWeight: 500 }}>{x.p}</span></span>
              <span style={{ fontFamily: SERIF, fontSize: 22 }}>{(x.pct * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.15)", marginTop: 4, overflow: "hidden" }}><div style={{ width: `${x.pct * 100}%`, height: "100%", background: x.votes === lead ? "#fff" : "rgba(255,255,255,.45)" }} /></div>
            <div style={{ fontSize: 11.5, opacity: .7, marginTop: 2 }}>{x.votes.toLocaleString("en-US")} votes</div>
          </div>
        ))}
      </div>
      <div className="fy-2" style={{ fontSize: 11.5, opacity: .75, marginTop: 10, lineHeight: 1.45 }}>{c.pctCounted != null ? `About ${Math.round(c.pctCounted)}% counted. ` : ""}{c.called ? `Called: ${c.called}. ` : "Not called. "}Unofficial count from {c.source}. No projections.</div>
    </>
  );
}
