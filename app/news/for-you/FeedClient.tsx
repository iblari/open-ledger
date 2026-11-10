"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FyCard } from "@/lib/for-you";
import type { SeriesData } from "@/lib/series";
import ProChart from "@/components/trending/ProChart";

export type ViewCard = FyCard & { ago: string; color: string | null };
type Comment = { id: string; card: string; by: string; text: string; at: string; mine?: boolean };

const INK = "#1a1a1a", SUB = "#5c5856", MUTE = "#9a9490", RULE = "#e2ded6", BG = "#f8f5f0", RED = "#b8372d";
const SERIF = "'Source Serif 4', Georgia, serif";
const LEAN = { left: "#4361a6", center: "#CFC9BF", right: "#b8372d" } as const;
const SITE = "https://voteunbiased.org";

function beacon(body: object) {
  const s = JSON.stringify(body);
  try { if (navigator.sendBeacon?.("/api/for-you", new Blob([s], { type: "application/json" }))) return; } catch {}
  fetch("/api/for-you", { method: "POST", body: s, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}
function anonId(): string {
  try {
    let a = localStorage.getItem("vu-anon");
    if (!a || !/^[a-f0-9]{32}$/.test(a)) { a = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("vu-anon", a); }
    return a;
  } catch { return "0".repeat(32); }
}
const social = (body: object) => fetch("/api/for-you/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const since = (iso: string) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const short = (n: number) => n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);

/* ── YouTube: the moment the claim was said ───────────────────── */

type YTPlayer = { loadVideoById(o: { videoId: string; startSeconds: number; endSeconds: number }): void; playVideo(): void; pauseVideo(): void; seekTo(s: number, a: boolean): void; mute(): void; unMute(): void; isMuted(): boolean; setVolume(v: number): void; destroy(): void };
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

/** The panel for a claim's broadcast moment. The actual YouTube player is ONE
 *  shared player that the feed lays over the active panel and re-uses for every
 *  clip, so once someone turns sound on (one tap), every next clip plays with
 *  sound as they swipe. Browsers never allow sound before that first tap. */
function Moment({ yt, quote, active, yst, sound, onSound }: { yt: { id: string; start: number; end: number }; quote: string; active: boolean; yst: { playing: boolean; needTap: boolean }; sound: boolean; onSound: () => void }) {
  const live = active && yst.playing;
  return (
    <div className="fy-panel" data-yt-slot={active ? "1" : undefined}>
      <img src={`https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {!live && !(active && yst.needTap) && active && <span className="fy-spin" aria-hidden />}
      <div className="fy-sub" style={{ zIndex: 3 }}><span>“{quote}”</span></div>
      {active && yst.needTap && <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", zIndex: 3, pointerEvents: "none", width: 58, height: 58, borderRadius: "50%", background: "rgba(255,255,255,.95)", display: "grid", placeItems: "center", boxShadow: "0 4px 16px rgba(0,0,0,.3)" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="#1a1a1a" aria-hidden><path d="M8 5v14l11-7z" /></svg></div>}
      {live && (
        <button className={`fy-mute${sound ? "" : " big"}`} style={{ zIndex: 4 }} onClick={e => { e.stopPropagation(); onSound(); }} aria-label={sound ? "Mute" : "Turn sound on"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 5 6 9H2v6h4l5 4V5z" />{sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="M23 9l-6 6M17 9l6 6" />}</svg>
          {sound ? "" : "Tap for sound"}
        </button>
      )}
    </div>
  );
}

function Clip({ src, poster, active, paused }: { src: string | null; poster: string; active: boolean; paused: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = ref.current; if (!v) return; if (active && !paused) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause(); }, [active, paused]);
  const st: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  return src ? <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" style={st} /> : <img src={poster} alt="" loading="lazy" style={st} />;
}

/* ── Interactive data: the official series, drag to read any point ── */
const seriesCache = new Map<string, Promise<SeriesData | null>>();
function getSeries(id: string, countries: string[] = []): Promise<SeriesData | null> {
  const k = `${id}|${countries.join(",")}`;
  if (!seriesCache.has(k)) seriesCache.set(k, fetch(`/api/series?id=${encodeURIComponent(id)}${countries.length ? `&c=${countries.join(",")}` : ""}`).then(r => r.ok ? r.json() : null).then(d => d && !d.error ? d as SeriesData : null).catch(() => null));
  return seriesCache.get(k)!;
}
function useHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(Math.round(el.clientHeight)));
    ro.observe(el); setH(Math.round(el.clientHeight));
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}
/** The chart sizes itself to the space it's given (a real phone screen, not a guess). */
function DataChart({ id, countries, said, saidLine, since, terms, date, tone, fallback, tall, avail }: { tall?: boolean; avail?: number; id: string; countries?: string[]; said?: number | null; saidLine?: string | null; since?: string | null; terms?: boolean; date?: string; tone?: string; fallback: React.ReactNode }) {
  const [data, setData] = useState<SeriesData | null | undefined>(undefined);
  const ck = (countries || []).join(",");
  useEffect(() => { let on = true; getSeries(id, ck ? ck.split(",") : []).then(d => { if (on) setData(d); }); return () => { on = false; }; }, [id, ck]);
  const wrap = useRef<HTMLDivElement>(null);
  const [hh, setHh] = useState(tall ? 180 : 110);
  useLayoutEffect(() => {
    if (!avail || !wrap.current || !data) return;
    const over = wrap.current.offsetHeight - avail;
    if (Math.abs(over) > 3) setHh(h => Math.max(56, Math.min(420, h - over)));
  }, [avail, data, hh]);
  if (data === null) return <>{fallback}</>;
  return (
    <div ref={wrap} className="fy-chart" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      {data === undefined
        ? <div style={{ height: Math.max(80, (avail || 200) - 24), borderRadius: 10, background: "#F3EFE8" }} />
        : <ProChart compact controls={!!tall} chartH={hh} data={data} said={said ?? null} saidLine={saidLine ?? null} claimDate={date || new Date().toISOString()} since={since ?? null} terms={!!terms} tone={tone || "#0E7477"} noClaim={said == null && !date} />}
      {hh >= 90 && <div className="fy-hint">Drag across the chart to read any date</div>}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────── */
const I = {
  like: <><path d="M7 10v11H3V10z" /><path d="M7 10l4.5-7.5c1.4 0 2.5 1.1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.9 21H7" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />,
  share: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 6-7" />,
  story: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  bars: <path d="M6 20V10M12 20V4M18 20v-7" />,
};
const Svg = ({ d, fill }: { d: React.ReactNode; fill?: string }) => <svg width="23" height="23" viewBox="0 0 24 24" fill={fill || "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const OPEN_LABEL: Record<ViewCard["kind"], string> = { story: "Read the story", claim: "Full chart", metric: "Open the data", result: "All results" };

/* ── Comments sheet ───────────────────────────────────────────── */

function Sheet({ card, anon, onClose, onCount }: { card: ViewCard; anon: string; onClose: () => void; onCount: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const handle = useRef<string>("");
  useEffect(() => {
    let dead = false;
    fetch(`/api/for-you/social?card=${encodeURIComponent(card.id)}&anon=${anon}`).then(r => r.json()).then(j => { if (!dead) setList(j.comments || []); }).catch(() => !dead && setList([]));
    return () => { dead = true; };
  }, [card.id, anon]);
  const send = async () => {
    if (busy) return;
    if (text.trim().length < 2) { setErr("Write a comment first."); return; }
    setBusy(true); setErr(null);
    const r = await social({ action: "comment", card: card.id, anon, text }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok || !j?.ok) { setErr(j?.error || "Couldn't post right now. Try again in a minute."); return; }
    handle.current = j.comment.by;
    setList(l => { const n = [j.comment, ...(l || [])]; onCount(n.length); return n; });
    setText("");
  };
  const act = async (c: Comment, action: "report" | "delete") => {
    setMenu(null);
    await social({ action, card: card.id, id: c.id, anon }).catch(() => null);
    if (action === "delete") setList(l => { const n = (l || []).filter(x => x.id !== c.id); onCount(n.length); return n; });
    else setList(l => (l || []).filter(x => x.id !== c.id));
  };
  return (
    <div className="fy-sheet" role="dialog" aria-label="Comments" onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 8px", borderBottom: `1px solid ${RULE}` }}>
        <b style={{ flex: 1, fontSize: 14 }}>{list ? `${list.length} comment${list.length === 1 ? "" : "s"}` : "Comments"}</b>
        <button onClick={onClose} aria-label="Close comments" style={{ background: "none", border: 0, fontSize: 22, lineHeight: 1, cursor: "pointer", color: SUB }}>×</button>
      </div>
      <div className="fy-sheet-list">
        {list === null && <p style={{ color: MUTE, fontSize: 13, padding: "18px 14px" }}>Loading…</p>}
        {list?.length === 0 && <p style={{ color: SUB, fontSize: 13.5, padding: "22px 14px", textAlign: "center" }}>No comments yet. Start the conversation.</p>}
        {list?.map(c => (
          <div key={c.id} style={{ padding: "10px 14px", borderBottom: `1px solid #efebe4`, position: "relative" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: c.mine ? RED : INK }}>{c.by}{c.mine ? " (you)" : ""}</span>
              <span style={{ fontSize: 11.5, color: MUTE, flex: 1 }}>{since(c.at)}</span>
              <button onClick={() => setMenu(m => m === c.id ? null : c.id)} aria-label="Comment options" style={{ background: "none", border: 0, color: MUTE, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>⋯</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.45, color: INK, marginTop: 2, overflowWrap: "anywhere" }}>{c.text}</div>
            {menu === c.id && (
              <div style={{ position: "absolute", right: 14, top: 30, background: "#fff", border: `1px solid ${RULE}`, borderRadius: 8, boxShadow: "0 8px 20px -10px rgba(0,0,0,.3)", zIndex: 2, overflow: "hidden" }}>
                {c.mine
                  ? <button className="fy-menu" onClick={() => act(c, "delete")}>Delete</button>
                  : <button className="fy-menu" onClick={() => act(c, "report")}>Report</button>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${RULE}`, padding: "8px 10px 10px", background: "#fff" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={text} maxLength={280} onChange={e => { setText(e.target.value); setErr(null); }} onKeyDown={e => { if (e.key === "Enter") send(); }}
            placeholder="Add a comment" aria-label="Add a comment"
            style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 999, border: `1px solid ${RULE}`, padding: "0 14px", fontSize: 16, fontFamily: "inherit", background: BG, color: INK }} />
          <button onClick={send} disabled={busy} style={{ height: 40, padding: "0 16px", borderRadius: 999, border: 0, background: INK, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", opacity: busy ? .6 : 1 }}>{busy ? "Checking…" : "Post"}</button>
        </div>
        {err ? <div role="alert" style={{ fontSize: 12.5, color: RED, marginTop: 6, lineHeight: 1.4 }}>{err}</div>
          : <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6 }}>Anonymous{handle.current ? ` as ${handle.current}` : ""}. Disagree freely; no attacks, links or personal details.</div>}
      </div>
    </div>
  );
}

/* ── Feed ─────────────────────────────────────────────────────── */

const SEEN_KEY = "vu-fy-seen";
function loadSeen(): Record<string, number> { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; } }

export default function FeedClient({ cards: initial }: { cards: ViewCard[] }) {
  // Cards this browser has already seen go to the back (oldest-seen first).
  const [cards, setCards] = useState(initial);
  useLayoutEffect(() => {
    const seen = loadSeen();
    if (!Object.keys(seen).length) return;
    const fresh = initial.filter(c => !seen[c.id]);
    const old = initial.filter(c => seen[c.id]).sort((a, b) => seen[a.id] - seen[b.id]);
    if (old.length) setCards([...fresh, ...old]);
  }, [initial]);
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [moved, setMoved] = useState(false);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [anon, setAnon] = useState("");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [cnt, setCnt] = useState<Record<string, { likes: number; comments: number }>>({});
  const [sheet, setSheet] = useState<string | null>(null);
  const [burst, setBurst] = useState<{ id: string; k: number } | null>(null);
  const seen = useRef(new Set<string>());
  const pending = useRef<string[]>([]);
  const maxIdx = useRef(0);
  const tapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytBox = useRef<HTMLDivElement>(null);
  const yp = useRef<YTPlayer | null>(null);
  const ytCur = useRef<{ id: string; start: number; end: number } | null>(null);
  const [yst, setYst] = useState({ playing: false, needTap: false });
  const soundRef = useRef(sound); soundRef.current = sound;
  const [cview, setCview] = useState<"clip" | "data">("clip");
  const autoDone = useRef(false);
  const hasChart = useRef(false);

  // Lay the shared player over the active claim's panel (it scrolls with the content).
  const place = useCallback(() => {
    const f = ytBox.current, root = box.current; if (!f || !root) return;
    const slot = root.querySelector<HTMLElement>('[data-yt-slot="1"]');
    if (!slot) { f.style.display = "none"; return; }
    const r = slot.getBoundingClientRect(), b = root.getBoundingClientRect();
    Object.assign(f.style, { display: "block", top: `${r.top - b.top + root.scrollTop}px`, left: `${r.left - b.left}px`, width: `${r.width}px`, height: `${r.height}px` });
  }, []);
  useEffect(() => { window.addEventListener("resize", place); return () => window.removeEventListener("resize", place); }, [place]);
  useEffect(() => {
    const c = cards[active];
    const yt = c?.kind === "claim" ? c.yt : null;
    setYst({ playing: false, needTap: false });
    setCview("clip"); autoDone.current = false; hasChart.current = c?.kind === "claim" && !!c.chart;
    const raf = requestAnimationFrame(() => requestAnimationFrame(place));
    if (!yt) { try { yp.current?.pauseVideo(); } catch {} return () => cancelAnimationFrame(raf); }
    ytCur.current = yt;
    let dead = false;
    if (yp.current) {
      try {
        yp.current.loadVideoById({ videoId: yt.id, startSeconds: yt.start, endSeconds: yt.end });
        if (soundRef.current) { yp.current.unMute(); yp.current.setVolume(100); } else yp.current.mute();
      } catch {}
    } else {
      loadApi().then(() => {
        const YT = win().YT;
        if (dead || !ytBox.current || !YT || yp.current) return;
        const el = document.createElement("div"); ytBox.current.appendChild(el);
        yp.current = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com", videoId: yt.id, width: "100%", height: "100%",
          playerVars: { start: yt.start, end: yt.end, autoplay: 1, mute: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, disablekb: 1, fs: 0, cc_load_policy: 0 },
          events: {
            onReady: (e: { target: YTPlayer }) => { if (soundRef.current) { e.target.unMute(); e.target.setVolume(100); } else e.target.mute(); e.target.playVideo(); },
            onStateChange: (e: { data: number; target: YTPlayer }) => {
              if (e.data === 1) setYst({ playing: true, needTap: false });
              if (e.data === 0) {
                // After the clip plays once, show the data; after that it loops.
                if (hasChart.current && !autoDone.current) { autoDone.current = true; setCview("data"); return; }
                const y = ytCur.current; if (y) { e.target.seekTo(y.start, true); e.target.playVideo(); }
              }
            },
          },
        }) as YTPlayer;
      });
    }
    // Autoplay can be refused (iPhone Low Power Mode, data saver). Then the
    // player itself takes the tap, which browsers always allow.
    const t = setTimeout(() => { if (!dead) setYst(s => s.playing ? s : { playing: false, needTap: true }); }, 3000);
    return () => { dead = true; clearTimeout(t); cancelAnimationFrame(raf); };
  }, [active, cards, place]);
  useEffect(() => { requestAnimationFrame(place); }, [yst.needTap, place]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(place));
    const x = yp.current;
    if (x && cards[active]?.kind === "claim") {
      try {
        if (cview === "data") x.pauseVideo();
        else { const y = ytCur.current; if (y && autoDone.current) x.seekTo(y.start, true); x.playVideo(); }
      } catch {}
    }
    return () => cancelAnimationFrame(raf);
  }, [cview, active, cards, place]);
  useEffect(() => {
    const x = yp.current; if (!x || cards[active]?.kind !== "claim") return;
    try { if (paused) x.pauseVideo(); else if (yst.playing) x.playVideo(); } catch {}
  }, [paused, active, cards, yst.playing]);
  const toggleSound = useCallback(() => {
    const next = !soundRef.current;
    setSound(next);
    const x = yp.current; if (!x) return;
    try { if (next) { x.unMute(); x.setVolume(100); x.playVideo(); } else x.mute(); } catch {}
  }, []);

  useEffect(() => {
    setAnon(anonId());
    try { setLiked(new Set(JSON.parse(localStorage.getItem("vu-liked") || "[]"))); } catch {}
    fetch(`/api/for-you/social?ids=${cards.map(c => encodeURIComponent(c.id)).join(",")}`).then(r => r.json()).then(j => setCnt(j.counts || {})).catch(() => {});
  }, [cards]);
  useEffect(() => {
    beacon({ session: true });
    const flush = () => { if (pending.current.length) beacon({ views: pending.current.splice(0) }); };
    const t = setInterval(flush, 5000);
    const vis = () => { if (document.visibilityState === "hidden") { flush(); beacon({ done: maxIdx.current + 1 }); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); flush(); };
  }, []);
  useEffect(() => {
    setPaused(false); setSheet(null);
    const id = cards[active]?.id; if (!id) return;
    const t = setTimeout(() => {
      if (!seen.current.has(id)) { seen.current.add(id); pending.current.push(id); maxIdx.current = Math.max(maxIdx.current, active); }
      try { const m = loadSeen(); m[id] = Date.now(); const ks = Object.keys(m); if (ks.length > 600) ks.sort((a, b) => m[a] - m[b]).slice(0, ks.length - 600).forEach(k => delete m[k]); localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch {}
    }, 1500);
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
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      if (["ArrowDown", "j", "PageDown"].includes(e.key)) { e.preventDefault(); go(1); }
      if (["ArrowUp", "k", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
      if (e.key === " ") { e.preventDefault(); setPaused(p => !p); }
      if (e.key === "m") toggleSound();
      if (e.key === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, toggleSound]);

  const toggleLike = (c: ViewCard, force?: boolean) => {
    if (!anon) return;
    const on = force ?? !liked.has(c.id);
    if (on === liked.has(c.id)) return;
    const next = new Set(liked); if (on) next.add(c.id); else next.delete(c.id);
    setLiked(next);
    try { localStorage.setItem("vu-liked", JSON.stringify([...next].slice(-500))); } catch {}
    setCnt(m => ({ ...m, [c.id]: { likes: Math.max(0, (m[c.id]?.likes || 0) + (on ? 1 : -1)), comments: m[c.id]?.comments || 0 } }));
    social({ action: "like", card: c.id, anon, on }).then(r => r.json()).then(j => { if (typeof j.likes === "number") setCnt(m => ({ ...m, [c.id]: { likes: j.likes, comments: m[c.id]?.comments || 0 } })); }).catch(() => {});
  };
  // One tap pauses; a quick second tap likes (and doesn't pause).
  const tap = (c: ViewCard) => {
    if (tapT.current) { clearTimeout(tapT.current); tapT.current = null; toggleLike(c, true); setBurst({ id: c.id, k: Date.now() }); return; }
    tapT.current = setTimeout(() => { tapT.current = null; setPaused(p => !p); }, 260);
  };
  const share = async (c: ViewCard) => {
    const url = `${SITE}${c.href}${c.href.includes("?") ? "&" : "?"}utm_source=foryou&utm_medium=share&utm_content=${encodeURIComponent(c.id)}`;
    const title = c.kind === "story" ? c.title : c.kind === "claim" ? `“${c.quote}”: ${c.ratingLabel}` : c.kind === "metric" ? `${c.name}: ${c.value}` : `${c.title}: vote count`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setToast("Link copied"); setTimeout(() => setToast(null), 1600);
    } catch { /* dismissed */ }
  };

  if (!cards.length) return <p style={{ padding: 40, textAlign: "center", color: SUB }}>Nothing in the feed right now. Check back in a few minutes.</p>;

  return (
    <div style={{ position: "relative", background: BG }}>
      <style>{`
        .fy-box{height:calc(100dvh - var(--vu-chrome-h) - 42px);overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scrollbar-width:none;background:${BG}}
        .fy-box::-webkit-scrollbar{display:none}
        .fy-box{position:relative}
        .fy-ytfloat{position:absolute;display:none;z-index:2;border-radius:14px;overflow:hidden;background:#000}
        .fy-ytfloat iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:inherit}
        .fy-mute.big{top:8px;bottom:auto;left:8px;right:auto;height:34px;padding:0 12px;background:#fff;color:#1a1a1a;box-shadow:0 2px 10px rgba(0,0,0,.25)}
        .fy-spin{position:absolute;left:50%;top:42%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:fy-rot .8s linear infinite;z-index:3}
        @keyframes fy-rot{to{transform:rotate(360deg)}}
        .fy-slot{height:100%;scroll-snap-align:start;scroll-snap-stop:always;position:relative;display:flex;justify-content:center}
        .fy-stage{position:relative;height:100%;aspect-ratio:9/16;max-width:100%;overflow:hidden;display:flex;flex-direction:column;padding:12px 14px 8px;box-sizing:border-box;color:${INK};container-type:size}
        .fy-main{display:flex;flex-direction:column;min-height:0;min-width:0;position:relative;flex:1;overflow:hidden}
        .fy-actions{display:flex;align-items:center;gap:4px;border-top:1px solid ${RULE};padding-top:8px;margin-top:10px;flex-shrink:0}
        .fy-ab{display:inline-flex;align-items:center;gap:5px;height:40px;padding:0 10px 0 6px;border:0;background:none;color:${INK};font:700 13px 'DM Sans',sans-serif;cursor:pointer;border-radius:999px}
        .fy-ab:active{background:#efebe4}
        .fy-ab.on{color:${RED}}
        .fy-open{margin-left:auto;display:inline-flex;align-items:center;height:38px;padding:0 16px;border-radius:999px;background:${INK};color:#fff;font:700 13.5px 'DM Sans',sans-serif;text-decoration:none;white-space:nowrap}
        .fy-media{display:flex;flex-direction:column;gap:6px;min-height:0;cursor:pointer;position:relative}
        .fy-panel{position:relative;width:100%;aspect-ratio:16/9;background:#14110e;border-radius:14px;overflow:hidden;flex-shrink:0}
        .fy-yt{position:absolute;inset:0}.fy-yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
        .fy-sub{position:absolute;left:8px;right:8px;bottom:8px;text-align:center;pointer-events:none;color:#fff}
        .fy-sub span{background:rgba(0,0,0,.72);font-size:12.5px;line-height:1.45;padding:2px 6px;border-radius:4px;-webkit-box-decoration-break:clone;box-decoration-break:clone;display:-webkit-inline-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .fy-mute{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:999px;border:0;background:rgba(0,0,0,.6);color:#fff;font:700 12px 'DM Sans',sans-serif;cursor:pointer;z-index:2}
        .fy-lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTE}}
        .fy-cap{margin-top:auto;padding-top:12px;flex-shrink:0}
        .fy-media.fy-fillmode{flex:1;min-height:0}
        .fy-fill{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
        .fy-fill>.fy-panel{width:min(100%,calc(var(--fh) * 16 / 9));margin:0 auto}
        .fy-fill>.fy-chart{flex-shrink:0}
        .fy-seg{display:flex;gap:6px;margin-bottom:8px;flex-shrink:0}
        .fy-seg button{flex:1;height:32px;border-radius:999px;border:1px solid ${RULE};background:#fff;color:${SUB};font:700 12.5px 'DM Sans',sans-serif;cursor:pointer}
        .fy-seg button.on{background:${INK};border-color:${INK};color:#fff}
        .fy-chart{background:#fff;border:1px solid ${RULE};border-radius:14px;padding:10px 10px 6px;cursor:auto}
        .fy-hint{font-size:10.5px;color:${MUTE};text-align:center;margin-top:2px}
        .fy-grow{flex:1;justify-content:flex-start}
        .fy-photo{flex:none}
        .fy-k{font-size:12px;color:${SUB}}
        .fy-h{font-family:${SERIF};font-weight:500;font-size:clamp(20px,5.4vw,24px);line-height:1.17;letter-spacing:-.01em;margin:5px 0 4px;color:${INK};display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .fy-why{font-size:12px;color:${SUB};margin-top:8px;display:flex;gap:10px;align-items:center}
        .fy-1{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
        .fy-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .fy-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .fy-tag{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:4px;display:inline-block}
        .fy-sheet{position:absolute;left:0;right:0;bottom:0;height:72%;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -12px 30px -12px rgba(20,17,14,.35);z-index:20;display:flex;flex-direction:column;animation:fy-up .2s ease-out}
        .fy-sheet-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
        .fy-menu{display:block;width:100%;padding:8px 16px;background:none;border:0;text-align:left;font:600 13px 'DM Sans',sans-serif;color:${INK};cursor:pointer}
        .fy-menu:hover{background:${BG}}
        .fy-nav{position:absolute;right:24px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:6}
        .fy-nav button{width:44px;height:44px;border-radius:50%;border:1px solid ${RULE};background:#fff;color:${INK};font-size:18px;cursor:pointer}
        .fy-nav button:disabled{opacity:.35;cursor:default}
        @media (min-width:761px){.fy-stage{background:#fff;border-left:1px solid ${RULE};border-right:1px solid ${RULE}}}
        @media (max-width:760px){.fy-nav{display:none}.fy-stage{aspect-ratio:auto;width:100%}}
        @container (max-height:640px){.fy-hint{display:none}.fy-lbl{font-size:10px}}
        @container (max-height:560px){.fy-lbl,.fy-sides-x{display:none!important}.fy-h{font-size:19px;-webkit-line-clamp:2}.fy-cap{padding-top:8px}.fy-3{-webkit-line-clamp:2}}
        @container (max-height:470px){.fy-hide-short{display:none!important}}
        @keyframes fy-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes fy-up{from{transform:translateY(100%)}to{transform:none}}
        @keyframes fy-heart{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-80%) scale(1)}}
      `}</style>
      <div ref={box} className="fy-box" aria-label="For you feed">
        <div ref={ytBox} className="fy-ytfloat" style={{ visibility: yst.playing || yst.needTap ? "visible" : "hidden", opacity: yst.playing ? 1 : 0.011, pointerEvents: yst.needTap ? "auto" : "none" }} />
        {cards.map((c, i) => {
          const on = i === active;
          const near = Math.abs(i - active) <= 2;
          const n = cnt[c.id] || { likes: 0, comments: 0 };
          const isLiked = liked.has(c.id);
          return (
            <section key={c.id} data-i={i} className="fy-slot" aria-label={`${i + 1} of ${cards.length}`}>
              <div className="fy-stage">
                <div className="fy-main">
                  <div className={`fy-media${c.kind === "claim" || c.kind === "metric" || c.kind === "story" ? " fy-fillmode" : ""}`} onClick={() => on && tap(c)}>
                    {(near || c.kind === "story") && <Media c={c} active={on} sound={sound} paused={on && paused} onSound={toggleSound} yst={yst} cview={on ? cview : "clip"} onView={v => { setCview(v); autoDone.current = true; }} />}
                    {on && paused && <div style={{ position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)", zIndex: 5, pointerEvents: "none", background: "rgba(20,17,14,.8)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>Paused · tap to play</div>}
                    {burst?.id === c.id && <svg key={burst.k} width="96" height="96" viewBox="0 0 24 24" fill={RED} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" aria-hidden style={{ position: "absolute", left: "50%", top: "45%", zIndex: 4, pointerEvents: "none", animation: "fy-heart .9s ease-out forwards" }}>{I.like}</svg>}
                  </div>
                  <div className="fy-cap">
                    <Caption c={c} />
                    <div className="fy-why">
                      <span className="fy-1" style={{ flex: 1 }}>{c.why}</span>
                      {i === 0 && !moved && <button onClick={() => go(1)} style={{ background: "none", border: 0, color: INK, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", animation: "fy-bob 1.6s ease-in-out infinite", padding: 0 }}>↑ Swipe up</button>}
                    </div>
                  </div>
                </div>
                <div className="fy-actions">
                  <button className={`fy-ab${isLiked ? " on" : ""}`} onClick={() => toggleLike(c)} aria-pressed={isLiked} aria-label={isLiked ? "Unlike" : "Like"}><Svg d={I.like} fill={isLiked ? RED : undefined} /><span>{short(n.likes)}</span></button>
                  <button className="fy-ab" onClick={() => setSheet(c.id)} aria-label="Comments"><Svg d={I.chat} /><span>{short(n.comments)}</span></button>
                  <button className="fy-ab" onClick={() => share(c)} aria-label="Share"><Svg d={I.share} /></button>
                  <Link href={c.href} className="fy-open" onClick={() => beacon({ open: c.id })}>{OPEN_LABEL[c.kind]} →</Link>
                </div>
                {sheet === c.id && anon && <Sheet card={c} anon={anon} onClose={() => setSheet(null)} onCount={k => setCnt(m => ({ ...m, [c.id]: { likes: m[c.id]?.likes || 0, comments: k } }))} />}
              </div>
            </section>
          );
        })}
      </div>
      <div className="fy-nav">
        <button onClick={() => go(-1)} disabled={active === 0} aria-label="Previous">↑</button>
        <div style={{ fontSize: 11, color: MUTE, textAlign: "center" }}>{active + 1}/{cards.length}</div>
        <button onClick={() => go(1)} disabled={active === cards.length - 1} aria-label="Next">↓</button>
      </div>
      {toast && <div role="status" style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", background: INK, color: "#fff", fontSize: 13, padding: "8px 14px", borderRadius: 999, zIndex: 30 }}>{toast}</div>}
    </div>
  );
}

/** Photo / video panels. */
function Media({ c, active, sound, paused, onSound, yst, cview, onView }: { c: ViewCard; active: boolean; sound: boolean; paused: boolean; onSound: () => void; yst: { playing: boolean; needTap: boolean }; cview: "clip" | "data"; onView: (v: "clip" | "data") => void }) {
  const [pi, setPi] = useState(0);
  const [fill, fh] = useHeight<HTMLDivElement>();
  if (c.kind === "story") {
    const list = [...(c.photo ? [c.photo] : []), ...c.alts.map(a => a.url)];
    const src = list[pi];
    return (
      <div ref={fill} className="fy-fill" style={{ justifyContent: "flex-start", overflow: "hidden" }}>
      <div className="fy-panel fy-photo" style={{ aspectRatio: "auto", height: fh > 140 ? fh : 240, background: "#2a2622" }}>
        {src
          ? <img key={src} src={src} alt="" referrerPolicy="no-referrer" decoding="async" loading={active ? "eager" : "lazy"}
              onError={() => setPi(k => k + 1)}
              onLoad={e => { const im = e.currentTarget; if (im.naturalWidth < 120 || im.naturalHeight < 80) setPi(k => k + 1); }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: 16, color: "#d8d2c8", fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>{c.topic}</span>}
        {src && c.credit && pi === 0 && <span style={{ position: "absolute", right: 0, bottom: 0, fontSize: 10, color: "#eee", background: "rgba(0,0,0,.5)", padding: "2px 6px", borderTopLeftRadius: 4 }}>Photo: {c.credit}</span>}
      </div>
      </div>
    );
  }
  if (c.kind === "claim") {
    const clip = !c.chart || cview === "clip";
    return (
      <>
        {c.yt && c.chart && (
          <div className="fy-seg" onClick={e => e.stopPropagation()}>
            <button className={clip ? "on" : ""} onClick={() => onView("clip")}>▶ What was said</button>
            <button className={!clip ? "on" : ""} onClick={() => onView("data")}>📈 The data</button>
          </div>
        )}
        <div ref={fill} className="fy-fill" style={{ ["--fh" as string]: `${fh}px` }}>
          {c.yt && clip ? <Moment yt={c.yt} active={active} yst={yst} sound={sound} quote={c.quote} onSound={onSound} />
            : c.chart ? <DataChart avail={fh} id={c.chart.series} countries={c.chart.countries} said={c.chart.said} saidLine={c.chart.saidLine} since={c.chart.since} terms={c.chart.terms} date={c.chart.date} tone={c.color || undefined}
                fallback={<div className="fy-panel"><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>} />
            : <div className="fy-panel"><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>}
        </div>
      </>
    );
  }
  if (c.kind === "metric") return (
    <div ref={fill} className="fy-fill" style={{ ["--fh" as string]: `${fh}px` }}>
      <DataChart tall avail={fh} id={c.series} fallback={<div className="fy-panel"><Clip src={c.video} poster={c.image} active={active} paused={paused} /></div>} />
    </div>
  );
  return null;
}

function Coverage({ c }: { c: { left: number; center: number; right: number } }) {
  const t = c.left + c.center + c.right || 1;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", gap: 2 }}>
        {(["left", "center", "right"] as const).filter(k => c[k] > 0).map(k => <span key={k} style={{ flex: c[k], background: LEAN[k] }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 4, color: SUB }}>
        <span><b style={{ color: LEAN.left }}>{Math.round(c.left / t * 100)}%</b> left ({c.left})</span><span>{Math.round(c.center / t * 100)}% center ({c.center})</span><span><b style={{ color: LEAN.right }}>{Math.round(c.right / t * 100)}%</b> right ({c.right})</span>
      </div>
    </div>
  );
}

function Caption({ c }: { c: ViewCard }) {
  if (c.kind === "story") return (
    <>
      <div className="fy-k">News · {c.topic} · {c.outlets} outlets · {c.ago}</div>
      <h2 className="fy-h">{c.title}</h2>
      <Coverage c={c.coverage} />
      {c.sides.length > 0 && (
        <div className="fy-sides-x" style={{ marginTop: 8, borderTop: `1px solid ${RULE}`, paddingTop: 6 }}>
          {c.sides.map(x => (
            <div key={x.lean} className="fy-1" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              <b style={{ color: x.lean === "center" ? "#6b655c" : LEAN[x.lean], fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, letterSpacing: ".06em", marginRight: 6 }}>{x.lean}</b>“{x.title}”
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
        <span className="fy-tag" style={{ background: c.color || INK, color: "#fff", textTransform: "uppercase", letterSpacing: ".06em" }}>{c.ratingLabel}</span>
        <span className="fy-k fy-1">{c.speaker ? `${c.speaker} · ` : ""}{c.ago}</span>
      </div>
      {!c.yt && <div className="fy-h" style={{ fontSize: 19 }}>“{c.quote}”</div>}
      <div className="fy-3" style={{ fontSize: 14.5, lineHeight: 1.42, marginTop: 7 }}><b>The data: </b>{c.dataLine}</div>
      {c.source && !/\bper\b/i.test(c.dataLine) && <div className="fy-k" style={{ marginTop: 3, fontSize: 11.5, color: MUTE }}>Source: {c.source}</div>}
    </>
  );
  if (c.kind === "metric") {
    const up = c.change?.startsWith("up"), down = c.change?.startsWith("down");
    return (
      <>
        <div className="fy-k">{c.official ? "Official data" : "Polling average"} · {c.label}</div>
        <div className="fy-1" style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.25, marginTop: 3 }}>{c.name}: {c.value}</div>
        {c.change && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: up ? "#0E5C5E" : down ? "#9A3412" : SUB }}>{up ? "▲ " : down ? "▼ " : ""}{c.change.replace(/^(up|down) /, "")}</div>}
        <div className="fy-k" style={{ marginTop: 6, fontSize: 11.5, color: MUTE }}>Source: {c.source}{c.nextRelease && Date.parse(c.nextRelease) > Date.now() ? ` · next release ${new Date(c.nextRelease).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}</div>
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
              <span style={{ fontSize: 15, fontWeight: 700 }}>{x.name} <span style={{ fontSize: 11.5, color: MUTE, fontWeight: 500 }}>{x.p}</span></span>
              <span style={{ fontFamily: SERIF, fontSize: 22 }}>{(x.pct * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, background: "#EFEBE4", marginTop: 4, overflow: "hidden" }}><div style={{ width: `${x.pct * 100}%`, height: "100%", background: x.votes === lead ? INK : "#B4AEA5" }} /></div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>{x.votes.toLocaleString("en-US")} votes</div>
          </div>
        ))}
      </div>
      <div className="fy-2" style={{ fontSize: 11.5, color: SUB, marginTop: 10, lineHeight: 1.45 }}>{c.pctCounted != null ? `About ${Math.round(c.pctCounted)}% counted. ` : ""}{c.called ? `Called: ${c.called}. ` : "Not called. "}Unofficial count from {c.source}. No projections.</div>
    </>
  );
}
