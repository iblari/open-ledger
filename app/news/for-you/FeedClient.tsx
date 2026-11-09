"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FyCard } from "@/lib/for-you";

export type ViewCard = FyCard & { ago: string; color: string | null };

const INK = "#1a1a1a", SUB = "#5c5856", MUTE = "#9a9490", RULE = "#e2ded6", RED = "#b8372d";
const SERIF = "'Source Serif 4', Georgia, serif";
const LEAN = { left: "#4361a6", center: "#D9D5CE", right: "#b8372d" } as const;
const SITE = "https://voteunbiased.org";

function beacon(body: object) {
  const s = JSON.stringify(body);
  try { if (navigator.sendBeacon?.("/api/for-you", new Blob([s], { type: "application/json" }))) return; } catch {}
  fetch("/api/for-you", { method: "POST", body: s, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

/* ── Card bodies ─────────────────────────────────────────────── */

function Media({ video, image, active, alt }: { video: string | null; image: string; active: boolean; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    if (active) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
  }, [active]);
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1200 / 630", background: "#14110e", borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
      {video
        ? <video ref={ref} src={video} poster={image} muted loop playsInline preload="none" aria-label={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={image} alt={alt} loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}

function Coverage({ c }: { c: { left: number; center: number; right: number } }) {
  const t = c.left + c.center + c.right || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
        {(["left", "center", "right"] as const).filter(k => c[k] > 0).map(k => <span key={k} style={{ flex: c[k], background: LEAN[k] }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: SUB, marginTop: 5 }}>
        <span><b style={{ color: LEAN.left, fontWeight: 600 }}>{Math.round(c.left / t * 100)}%</b> left ({c.left})</span>
        <span>{Math.round(c.center / t * 100)}% center ({c.center})</span>
        <span><b style={{ color: LEAN.right, fontWeight: 600 }}>{Math.round(c.right / t * 100)}%</b> right ({c.right})</span>
      </div>
    </div>
  );
}

function StoryBody({ c }: { c: Extract<ViewCard, { kind: "story" }> }) {
  const [i, setI] = useState(0);
  const list = [...(c.photo ? [{ url: c.photo, name: c.credit || "" }] : []), ...c.alts];
  const cur = list[i];
  return (
    <>
      <div className="fy-photo" style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#1d1a17", flexShrink: 0 }}>
        {cur
          // eslint-disable-next-line @next/next/no-img-element
          ? <img key={cur.url} src={cur.url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setI(n => n + 1)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: 18, color: "#d8d2c8", fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{c.topic}</span>}
        {cur?.name && <span style={{ position: "absolute", right: 0, bottom: 0, background: "rgba(0,0,0,.55)", color: "#eee", fontSize: 10, padding: "2px 6px", borderTopLeftRadius: 4 }}>Photo: {cur.name}</span>}
      </div>
      <div className="fy-k">News · {c.topic} · {c.outlets} outlets · {c.ago}</div>
      <h2 className="fy-h">{c.title}</h2>
      <div style={{ fontSize: 12, color: MUTE, margin: "2px 0 6px" }}>Who covered it</div>
      <Coverage c={c.coverage} />
      {(c.blindspot || c.official) && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {c.blindspot && <span className="fy-tag" style={{ background: "#EEEAF8", color: "#4D3E8F" }}>{c.blindspot}</span>}
          {c.official && <span className="fy-tag" style={{ background: "#E3F2F1", color: "#0E5C5E" }}>{c.official}</span>}
        </div>
      )}
    </>
  );
}

function ClaimBody({ c, active }: { c: Extract<ViewCard, { kind: "claim" }>; active: boolean }) {
  return (
    <>
      <Media video={c.video} image={c.image} active={active} alt={`Chart for: ${c.quote}`} />
      <div className="fy-k">Claim check · {c.ago}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px" }}>
        <span style={{ background: c.color || INK, color: "#fff", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, textTransform: "uppercase" }}>{c.ratingLabel}</span>
        {c.speaker && <span style={{ fontSize: 13, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.speaker}</span>}
      </div>
      <h2 className="fy-h fy-clamp">“{c.quote}”</h2>
      <div style={{ borderTop: `1px solid ${RULE}`, marginTop: 10, paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTE }}>The data</div>
        <div className="fy-clamp3" style={{ fontSize: 14.5, lineHeight: 1.45, color: INK, marginTop: 3 }}>{c.dataLine}</div>
        {c.source && <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>Source: {c.source}</div>}
      </div>
    </>
  );
}

function MetricBody({ c, active }: { c: Extract<ViewCard, { kind: "metric" }>; active: boolean }) {
  const up = c.change?.startsWith("up"), down = c.change?.startsWith("down");
  return (
    <>
      <div className="fy-k" style={{ marginTop: 0 }}>Official data · {c.label}</div>
      <div style={{ fontSize: 15, color: SUB, marginTop: 2 }}>{c.name}</div>
      <div style={{ fontFamily: SERIF, fontSize: "clamp(52px,15vw,72px)", lineHeight: 1, fontWeight: 500, letterSpacing: "-0.03em", margin: "6px 0 6px" }}>{c.value}</div>
      {c.change && <div style={{ fontSize: 14, fontWeight: 600, color: up ? "#0E5C5E" : down ? "#9A3412" : SUB }}>{up ? "▲ " : down ? "▼ " : ""}{c.change.replace(/^(up|down) /, "")}</div>}
      <div style={{ marginTop: 14 }}><Media video={c.video} image={c.image} active={active} alt={`${c.name} chart`} /></div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>Source: {c.source}{c.nextRelease ? ` · Next release ${new Date(c.nextRelease).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` : ""}</div>
    </>
  );
}

function ResultBody({ c }: { c: Extract<ViewCard, { kind: "result" }> }) {
  const lead = c.cands[0]?.votes;
  return (
    <>
      <div className="fy-k" style={{ marginTop: 0 }}>Live result · {c.state} · updated {c.ago}</div>
      <h2 className="fy-h">{c.title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
        {c.cands.map(x => (
          <div key={x.name}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{x.name} <span style={{ fontSize: 12, color: MUTE, fontWeight: 500 }}>{x.p}</span></span>
              <span style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500 }}>{(x.pct * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "#EFEBE4", marginTop: 5, overflow: "hidden" }}>
              <div style={{ width: `${x.pct * 100}%`, height: "100%", background: x.votes === lead ? INK : "#B4AEA5", borderRadius: 5 }} />
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>{x.votes.toLocaleString("en-US")} votes</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: SUB, marginTop: 14, lineHeight: 1.5 }}>
        {c.pctCounted != null ? `About ${Math.round(c.pctCounted)}% of expected votes counted. ` : ""}{c.called ? `Called: ${c.called}. ` : "Not called. "}Unofficial count from {c.source}. No projections.
      </div>
    </>
  );
}

/* ── Feed ─────────────────────────────────────────────────────── */

const OPEN: Record<ViewCard["kind"], string> = { story: "Read the story", claim: "See the chart", metric: "Open the data", result: "All results" };
const ICON: Record<ViewCard["kind"], string> = { story: "◎", claim: "✓", metric: "↗", result: "●" };

export default function FeedClient({ cards }: { cards: ViewCard[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [moved, setMoved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const pending = useRef<string[]>([]);
  const maxIdx = useRef(0);

  // Session + view beacons (card counted after ~1s on screen).
  useEffect(() => {
    beacon({ session: true });
    const flush = () => { if (pending.current.length) { beacon({ views: pending.current.splice(0) }); } };
    const t = setInterval(flush, 5000);
    const bye = () => { flush(); beacon({ done: maxIdx.current + 1 }); };
    const vis = () => { if (document.visibilityState === "hidden") bye(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); flush(); };
  }, []);
  useEffect(() => {
    const id = cards[active]?.id; if (!id) return;
    const t = setTimeout(() => { if (!seen.current.has(id)) { seen.current.add(id); pending.current.push(id); maxIdx.current = Math.max(maxIdx.current, active); } }, 1000);
    return () => clearTimeout(t);
  }, [active, cards]);

  // Which card is on screen.
  useEffect(() => {
    const root = box.current; if (!root) return;
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting && e.intersectionRatio > 0.6) {
        const i = Number((e.target as HTMLElement).dataset.i);
        setActive(i); if (i > 0) setMoved(true);
      }
    }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-i]").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [cards.length]);

  const go = useCallback((d: number) => {
    const root = box.current; if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-i="${Math.max(0, Math.min(cards.length - 1, active + d))}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active, cards.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  const share = async (c: ViewCard) => {
    const url = `${SITE}${c.href}${c.href.includes("?") ? "&" : "?"}utm_source=foryou&utm_medium=share&utm_content=${encodeURIComponent(c.id)}`;
    const title = c.kind === "story" ? c.title : c.kind === "claim" ? `“${c.quote}”: ${c.ratingLabel}` : c.kind === "metric" ? `${c.name}: ${c.value}` : `${c.title}: live count`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setToast("Link copied"); setTimeout(() => setToast(null), 1600);
    } catch { /* dismissed */ }
  };

  if (!cards.length) return <p style={{ padding: 40, textAlign: "center", color: SUB }}>Nothing in the feed right now. Check back in a few minutes.</p>;

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .fy-box{height:calc(100dvh - var(--vu-chrome-h) - 42px);overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior-y:contain;scrollbar-width:none}
        .fy-box::-webkit-scrollbar{display:none}
        .fy-slot{height:100%;scroll-snap-align:start;scroll-snap-stop:always;display:flex;justify-content:center;padding:12px 12px 14px;box-sizing:border-box}
        .fy-card{width:100%;max-width:460px;height:100%;background:#fff;border:1px solid ${RULE};border-radius:18px;padding:14px 14px 12px;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}
        .fy-scroll{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
        .fy-photo{aspect-ratio:4/3;max-height:42%}
        .fy-k{font-size:12px;color:${SUB};margin:12px 0 4px}
        .fy-h{font-family:${SERIF};font-weight:500;font-size:clamp(21px,5.6vw,26px);line-height:1.15;letter-spacing:-0.015em;margin:0 0 10px;color:${INK}}
        .fy-clamp{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
        .fy-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .fy-tag{font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:5px}
        .fy-foot{display:flex;align-items:center;gap:8px;border-top:1px solid ${RULE};padding-top:10px;margin-top:10px}
        .fy-why{flex:1;min-width:0;font-size:12px;color:${SUB};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fy-btn{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 14px;border-radius:999px;font-size:13.5px;font-weight:600;text-decoration:none;border:1px solid ${RULE};background:#fff;color:${INK};cursor:pointer;font-family:inherit}
        .fy-btn.dark{background:${INK};border-color:${INK};color:#fff}
        .fy-nav{position:absolute;right:max(16px,calc(50% - 330px));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px}
        .fy-nav button{width:42px;height:42px;border-radius:50%;border:1px solid ${RULE};background:#fff;color:${INK};font-size:18px;cursor:pointer}
        .fy-nav button:disabled{opacity:.35;cursor:default}
        @media (max-width:760px){.fy-nav{display:none}.fy-slot{padding:10px 10px 12px}}
        @media (max-height:700px){.fy-photo{max-height:36%}.fy-h{font-size:20px}}
        @keyframes fy-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      `}</style>
      <div ref={box} className="fy-box" aria-label="For you feed">
        {cards.map((c, i) => (
          <section key={c.id} data-i={i} className="fy-slot" aria-label={`${i + 1} of ${cards.length}`}>
            <article className="fy-card">
              <div className="fy-scroll">
                {c.kind === "story" && <StoryBody c={c} />}
                {c.kind === "claim" && <ClaimBody c={c} active={i === active} />}
                {c.kind === "metric" && <MetricBody c={c} active={i === active} />}
                {c.kind === "result" && <ResultBody c={c} />}
              </div>
              {i === 0 && !moved && (
                <button onClick={() => go(1)} style={{ alignSelf: "center", marginTop: 6, background: "none", border: 0, color: MUTE, fontSize: 12, cursor: "pointer", animation: "fy-bob 1.6s ease-in-out infinite", fontFamily: "inherit" }}>↑ Swipe up for more</button>
              )}
              <div className="fy-foot">
                <span className="fy-why" title={c.why}><span aria-hidden style={{ color: RED, marginRight: 6 }}>{ICON[c.kind]}</span>{c.why}</span>
                <button className="fy-btn" onClick={() => share(c)} aria-label="Share">Share</button>
                <Link href={c.href} className="fy-btn dark" onClick={() => beacon({ open: c.id })}>{OPEN[c.kind]} →</Link>
              </div>
            </article>
          </section>
        ))}
      </div>
      <div className="fy-nav">
        <button onClick={() => go(-1)} disabled={active === 0} aria-label="Previous card">↑</button>
        <div style={{ fontSize: 11, color: MUTE, textAlign: "center" }}>{active + 1}/{cards.length}</div>
        <button onClick={() => go(1)} disabled={active === cards.length - 1} aria-label="Next card">↓</button>
      </div>
      {toast && <div role="status" style={{ position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)", background: INK, color: "#fff", fontSize: 13, padding: "8px 14px", borderRadius: 999 }}>{toast}</div>}
    </div>
  );
}
