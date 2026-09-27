"use client";

/**
 * Landing-page showcase for Live Broadcast: a laptop and a phone, each
 * running the real broadcast layout, on a full-bleed dark band.
 *
 * Source of truth: "Live Broadcast Promo.dc.html" in the Claude Design
 * project. Sizes inside the screens are in container units (cqw) so both
 * devices scale as one picture at any width and stay sharp, which a
 * screenshot would not.
 *
 * The claims are real ledger entries from one broadcast, the 22 Sep 2026 UN
 * General Assembly address, with the verdicts and figures exactly as the
 * fact-checker recorded them. A fact-checker's own advert should not carry
 * made-up checks, and the claims on screen should belong to the event on
 * screen. The counts are that speech's settled totals (unconfirmed claims
 * excluded), so the score the cards build up to is the real one.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const MONO = "'DM Mono',ui-monospace,monospace";

const TITLE = "Remarks to the United Nations General Assembly";
const VIDEO_SRC = "/promo/live-broadcast.mp4";
const POSTER = "/promo/live-broadcast.jpg";

type Kind = "t" | "m" | "f";
interface Claim { time: string; label: string; kind: Kind; quote: string; said: string; data: string }

const CLAIMS: Claim[] = [
  { time: "01:13", label: "MOSTLY TRUE", kind: "t", quote: "Since I took office, we have created more than 1,000,000 new private sector jobs", said: "1M+", data: "902K" },
  { time: "01:46", label: "MOSTLY TRUE", kind: "t", quote: "Real household incomes for Americans have soared to the highest level in history, 87,000 on average", said: "$87K", data: "$87.5K" },
  { time: "02:10", label: "FALSE", kind: "f", quote: "We passed the largest tax cuts in American history.", said: "#1", data: "#6" },
  { time: "02:23", label: "FALSE", kind: "f", quote: "US stock markets have set 80 all time records, and that's just in the last twelve months", said: "80", data: "27" },
];
// The speech's settled totals are 6 true or mostly true, 8 misleading and
// 9 false. The base is those minus the four cards, so once all four have
// appeared the panel shows the real record.
const BASE = { t: 4, m: 8, f: 7 };
const TONE: Record<Kind, [string, string]> = {
  t: ["#0E7477", "#2BA5A0"], m: ["#C2560C", "#E07A2E"], f: ["#B42318", "#E0493A"],
};
const TICKS: [number, Kind][] = [
  [3, "m"], [7, "t"], [14, "f"], [22, "t"], [31, "m"], [40, "f"], [49, "m"],
  [57, "t"], [63, "f"], [70, "t"], [78, "f"], [88, "f"],
];

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(q.matches);
    on(); q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return r;
}

function Video({ pos = "50% 22%" }: { pos?: string }) {
  return (
    // Muted + playsInline is what lets iOS autoplay it. No controls: this is
    // a picture of the product, not a player.
    <video
      src={VIDEO_SRC} poster={POSTER} autoPlay muted loop playsInline preload="metadata"
      aria-hidden tabIndex={-1}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, pointerEvents: "none", background: "#000" }}
    />
  );
}

function Card({ c, phone, animate }: { c: Claim; phone?: boolean; animate: boolean }) {
  const [bg, ink] = TONE[c.kind];
  const u = (d: number, p: number) => `${phone ? p : d}cqw`;
  return (
    <div className={animate ? "lp-in" : undefined} style={{
      flex: "none", background: "#211C18", border: "1px solid #332C27",
      borderRadius: u(0.6, 3), padding: phone ? "4cqw 4.4cqw" : "1.1cqw 1.2cqw",
    }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: u(0.85, 3) }}>
        <span style={{ fontSize: "0.85em", fontWeight: 700, letterSpacing: "0.1em", padding: "0.35em 0.7em", borderRadius: "0.3em", background: bg, color: "#FFFEFC" }}>{c.label}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, color: "#A69E92" }}>{c.time}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: u(1.3, 4.6), lineHeight: 1.32, color: "#F4F0EA", marginTop: "0.6em", textWrap: "pretty" } as React.CSSProperties}>
        &ldquo;{c.quote}&rdquo;
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "1.6em", marginTop: "0.9em", fontSize: u(0.85, 3) }}>
        <div>
          <div style={{ fontSize: "0.8em", fontWeight: 600, letterSpacing: "0.14em", color: "#8C8479" }}>SAID</div>
          <div style={{ fontFamily: MONO, fontSize: "1.3em", color: "#BDB5A8", marginTop: "0.3em" }}>{c.said}</div>
        </div>
        <div style={{ color: "#8C8479", paddingBottom: "0.15em" }}>→</div>
        <div>
          <div style={{ fontSize: "0.8em", fontWeight: 600, letterSpacing: "0.14em", color: "#8C8479" }}>DATA</div>
          <div style={{ fontFamily: MONO, fontSize: "1.3em", color: ink, marginTop: "0.3em" }}>{c.data}</div>
        </div>
        <div style={{ marginLeft: "auto", fontWeight: 600, color: "#2BA5A0" }}>Why ▾</div>
      </div>
    </div>
  );
}

function Live({ size }: { size: string }) {
  return (
    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "0.5em", fontSize: size, fontWeight: 700, letterSpacing: "0.12em", color: "#FFFEFC", background: "#B42318", padding: "0.45em 0.9em", borderRadius: "0.35em", lineHeight: 1 }}>
      <span className="lp-dot" style={{ width: "0.7em", height: "0.7em", borderRadius: "50%", background: "#FFFEFC" }} />LIVE
    </span>
  );
}

export default function LivePromo() {
  const reduced = useReducedMotion();
  // Reduced motion shows the finished state and holds it.
  const [n, setN] = useState(1);
  const [secs, setSecs] = useState(1394);
  const [visible, setVisible] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  // Only tick while the band is on screen: nothing re-renders for a visitor
  // reading the scorecard further up.
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) { setN(CLAIMS.length); return; }
    if (!visible) return;
    const id = setInterval(() => {
      setSecs(s => {
        const next = s + 1;
        if (next % 3 === 0) setN(v => (v % CLAIMS.length) + 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible, reduced]);

  // Scale in as it enters the viewport; exactly `none` at the end so the
  // text isn't left resampled and soft.
  useEffect(() => {
    const el = groupRef.current, ph = phoneRef.current;
    if (!el || !ph) return;
    if (reduced) { el.style.transform = "none"; ph.style.transform = "none"; ph.style.opacity = "1"; return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.8)));
      el.style.transform = p >= 1 ? "none" : `scale(${0.78 + 0.22 * p})`;
      const q = Math.min(1, Math.max(0, (p - 0.35) / 0.65));
      ph.style.transform = q >= 1 ? "none" : `translateY(${(1 - q) * 70}px)`;
      ph.style.opacity = String(0.2 + 0.8 * q);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [reduced]);

  const shown = CLAIMS.slice(0, n);
  const nT = BASE.t + shown.filter(c => c.kind === "t").length;
  const nM = BASE.m + shown.filter(c => c.kind === "m").length;
  const nF = BASE.f + shown.filter(c => c.kind === "f").length;
  const all = nT + nM + nF;
  const score = `${Math.round((nT / all) * 100)}%`;
  const feed = shown.slice().reverse();
  const ticks = TICKS.slice(0, 8 + n);
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const animate = !reduced;

  const bar = (h: string) => (
    <div style={{ display: "flex", height: h, borderRadius: 99, overflow: "hidden", background: "#2C2622" }}>
      <div style={{ flex: nT, background: "#0E7477", transition: "flex .5s" }} />
      <div style={{ flex: nM, background: "#C2560C", transition: "flex .5s" }} />
      <div style={{ flex: nF, background: "#B42318", transition: "flex .5s" }} />
    </div>
  );
  const tickStrip = (h: string, w: string, top: string) => (
    <div style={{ flex: "none", position: "relative", height: h, borderBottom: "1px solid #2C2622", background: "#15110F" }}>
      {ticks.map(([x, k]) => <div key={x} style={{ position: "absolute", top, bottom: top, width: w, left: `${x}%`, background: TONE[k][0] }} />)}
    </div>
  );
  const counts = (fs: string, gap: string, big: string) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap, fontSize: fs, letterSpacing: "0.08em", color: "#A69E92" }}>
      {([[nT, "TRUE"], [nM, "MISLEADING"], [nF, "FALSE"]] as const).map(([v, l]) => (
        <span key={l}><span style={{ fontFamily: SERIF, fontSize: big, color: "#F4F0EA" }}>{v}</span> {l}</span>
      ))}
    </div>
  );

  return (
    <section aria-labelledby="lp-h" className="lp" style={{ background: "#0C0A08", color: "#FFFEFC", fontFamily: SANS, overflow: "hidden" }}>
      <style>{`
        .lp{padding:88px 20px 120px}
        @keyframes lpBreathe{0%,100%{opacity:.95}50%{opacity:.3}}
        @keyframes lpIn{0%{opacity:0;transform:translateY(-14px) scale(.98)}100%{opacity:1;transform:none}}
        .lp-dot{animation:lpBreathe 1.4s ease-in-out infinite}
        .lp-in{animation:lpIn .5s cubic-bezier(.2,.8,.2,1)}
        .lp-group{position:relative;transform-origin:50% 30%;padding-bottom:3%;will-change:transform}
        .lp-laptop{width:84%}
        .lp-phone{position:absolute;right:0;bottom:0;width:clamp(150px,23%,290px);filter:drop-shadow(0 30px 50px rgba(0,0,0,.7));will-change:transform,opacity}
        .lp-cta{transition:background .15s,transform .15s}
        .lp-cta:hover{background:#C9302A;transform:translateY(-1px)}
        .lp-cta:focus-visible{outline:2px solid #FFFEFC;outline-offset:3px}
        @media (max-width:720px){
          .lp{padding:56px 16px 72px}
          .lp-laptop{width:100%}
          .lp-phone{position:relative;right:auto;bottom:auto;width:60%;margin:28px auto 0}
          .lp-group{padding-bottom:0}
        }
        @media (prefers-reduced-motion:reduce){.lp-dot,.lp-in{animation:none}.lp-cta{transition:none}}
      `}</style>

      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 500, color: "#A69E92" }}>
          <span className="lp-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#EF4444" }} />
          Live Broadcast · Now in beta
        </div>
        <h2 id="lp-h" style={{ margin: 0, fontFamily: SERIF, fontWeight: 600, fontSize: "clamp(48px, 8.4vw, 112px)", lineHeight: 0.98, letterSpacing: "-0.03em", textWrap: "balance" } as React.CSSProperties}>
          Watch politicians.<br />Check the <span style={{ fontStyle: "italic", fontWeight: 500, color: "#E0493A" }}>numbers.</span>
        </h2>
      </div>

      {/* Purely a picture of the product — the copy and button below carry the meaning. */}
      <div aria-hidden style={{ maxWidth: 1240, margin: "80px auto 0", padding: "8px 0" }}>
        <div ref={groupRef} className="lp-group">

          {/* ── Laptop ── */}
          <div className="lp-laptop" style={{ containerType: "inline-size" } as React.CSSProperties}>
            <div style={{ width: "88%", margin: "0 auto", boxSizing: "border-box", aspectRatio: "16 / 10.4", background: "#000", border: "2px solid #56565A", borderBottom: "none", borderRadius: "3.4cqw 3.4cqw 0 0", padding: "1.5cqw 1.5cqw 2.2cqw", boxShadow: "inset 0 0 0 1px #1C1C1E, 0 0 0 1px #0E0E0F" }}>
              <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "1.4cqw 1.4cqw .3cqw .3cqw", overflow: "hidden", background: "#F4F0EA", containerType: "inline-size", display: "flex", flexDirection: "column" } as React.CSSProperties}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "13%", height: "2.4cqw", background: "#000", borderRadius: "0 0 1.2cqw 1.2cqw", zIndex: 2 }} />
                <div style={{ flex: "none", height: "4.6cqw", padding: "0 2.2cqw", background: "#FFFEFC", borderBottom: "1px solid #DFD9CF", display: "flex", alignItems: "center", gap: "1cqw" }}>
                  <div style={{ width: "2.3cqw", height: "2.3cqw", borderRadius: "50%", background: "#14110E", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: SERIF, fontSize: "1.3cqw", fontWeight: 600, color: "#FFFEFC", lineHeight: 1 }}>V</span></div>
                  <div style={{ fontFamily: SERIF, fontSize: "1.7cqw", lineHeight: 1, whiteSpace: "nowrap" }}><span style={{ color: "#14110E" }}>Vote</span> <span style={{ fontStyle: "italic", color: "#B42318" }}>Unbiased</span></div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.6cqw" }}>
                    <span style={{ fontSize: "1cqw", color: "#5F5850" }}>Data</span>
                    <span style={{ fontSize: "1cqw", fontWeight: 600, color: "#FFFEFC", background: "#B42318", padding: ".7cqw 1.3cqw", borderRadius: ".4cqw" }}>Join our newsletter</span>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, padding: "1.6cqw 3.2cqw" }}>
                  <div style={{ height: "100%", display: "flex", background: "#1A1613", borderRadius: ".9cqw", overflow: "hidden", border: "1px solid #2C2622" }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ flex: "none", height: "3.6cqw", padding: "0 1.4cqw", display: "flex", alignItems: "center", gap: "1cqw", borderBottom: "1px solid #2C2622" }}>
                        <div style={{ flex: "none", width: "2cqw", height: "2cqw", borderRadius: "50%", border: "1px solid #3A332D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1cqw", color: "#A69E92" }}>←</div>
                        <Live size=".75cqw" />
                        <div style={{ fontFamily: SERIF, fontSize: "1.25cqw", color: "#F4F0EA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{TITLE}</div>
                        <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: "1cqw", color: "#A69E92" }}>{elapsed}</div>
                      </div>
                      <div style={{ position: "relative", flex: 1, minHeight: 0, background: "#000" }}><Video /></div>
                      {tickStrip("1.8cqw", ".25cqw", "28%")}
                      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "1.8cqw", padding: "1.2cqw 1.6cqw" }}>
                        <div>
                          <div style={{ fontFamily: SERIF, fontSize: "3cqw", color: "#F4F0EA", lineHeight: 1 }}>{score}</div>
                          <div style={{ fontSize: ".7cqw", color: "#8C8479", marginTop: ".3cqw" }}>matched the data</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {bar(".5cqw")}
                          <div style={{ marginTop: ".8cqw" }}>{counts(".8cqw", "1.4cqw", "1.3em")}</div>
                        </div>
                      </div>
                      <div style={{ flex: "none", display: "flex", gap: ".8cqw", padding: "0 1.6cqw 1.4cqw" }}>
                        <span style={{ whiteSpace: "nowrap", fontSize: ".9cqw", color: "#BDB5A8", border: "1px solid #3A332D", padding: ".6cqw 1cqw", borderRadius: ".4cqw" }}>■ Stop</span>
                        <span style={{ whiteSpace: "nowrap", fontSize: ".9cqw", fontWeight: 600, color: "#FFFEFC", background: "#0E7477", padding: ".6cqw 1.1cqw", borderRadius: ".4cqw" }}>Check this moment</span>
                      </div>
                    </div>
                    <div style={{ flex: "none", width: "31%", borderLeft: "1px solid #2C2622", display: "flex", flexDirection: "column", minHeight: 0 }}>
                      <div style={{ flex: "none", padding: "1.2cqw 1.2cqw 1cqw", borderBottom: "1px solid #2C2622" }}>
                        <div style={{ display: "flex", fontSize: ".75cqw", fontWeight: 600, letterSpacing: ".16em", color: "#A69E92" }}><span>FACT-CHECK FEED</span><span style={{ marginLeft: "auto", fontFamily: MONO, letterSpacing: 0, color: "#F4F0EA" }}>{all}</span></div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5cqw", marginTop: ".9cqw", fontSize: ".65cqw", fontWeight: 600, letterSpacing: ".1em" }}>
                          <span style={{ padding: ".4cqw .8cqw", borderRadius: "2cqw", background: "#F4F0EA", color: "#14110E" }}>ALL {all}</span>
                          <span style={{ padding: ".4cqw .8cqw", borderRadius: "2cqw", border: "1px solid #3A332D", color: "#BDB5A8" }}>FALSE {nF}</span>
                          <span style={{ padding: ".4cqw .8cqw", borderRadius: "2cqw", border: "1px solid #3A332D", color: "#BDB5A8" }}>MISLEADING {nM}</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: ".9cqw", padding: "1cqw" }}>
                        {feed.slice(0, 3).map(c => <Card key={c.time} c={c} animate={animate} />)}
                      </div>
                      <div style={{ flex: "none", display: "flex", alignItems: "center", padding: ".9cqw 1.2cqw", borderTop: "1px solid #2C2622", fontSize: ".8cqw", color: "#BDB5A8" }}>
                        <span><span style={{ color: "#F4F0EA", fontWeight: 600 }}>{all}</span> claims on the record</span>
                        <span style={{ marginLeft: "auto", color: "#2BA5A0", fontWeight: 600 }}>Download record ↓</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: "relative", height: "2.3cqw", borderRadius: "0 0 2.4cqw 2.4cqw / 0 0 1.8cqw 1.8cqw", background: "linear-gradient(to bottom,#4A4A4E 0%,#2C2C2E 30%,#161618 75%,#0A0A0B 100%)", boxShadow: "0 0 0 1px #0E0E0F" }}>
              <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "15%", height: ".9cqw", background: "linear-gradient(#0E0E0F,#26262A)", borderRadius: "0 0 1cqw 1cqw" }} />
            </div>
          </div>

          {/* ── Phone ── */}
          <div ref={phoneRef} className="lp-phone" style={{ containerType: "inline-size" } as React.CSSProperties}>
            <div style={{ position: "relative", aspectRatio: "9 / 19.4", boxSizing: "border-box", borderRadius: "15cqw", padding: "3.4cqw", background: "#000", border: "2px solid #56565A", boxShadow: "inset 0 0 0 1px #1C1C1E, inset 0 0 0 2px #000, 0 0 0 1px #0E0E0F, 0 0 0 2px #2C2C2E" }}>
              {[["left", "17%", "4%"], ["left", "24%", "8%"], ["left", "34%", "8%"], ["right", "27%", "13%"]].map(([side, top, h], i) => (
                <div key={i} style={{ position: "absolute", [side]: -5, top, width: 3, height: h, background: "#1C1C1E", border: "1px solid #6A6A6E", [side === "left" ? "borderRight" : "borderLeft"]: "none", borderRadius: side === "left" ? "2px 0 0 2px" : "0 2px 2px 0" }} />
              ))}
              <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "12cqw", overflow: "hidden", background: "#1A1613", containerType: "inline-size", display: "flex", flexDirection: "column" } as React.CSSProperties}>
                <div style={{ flex: "none", height: "13cqw", background: "#FFFEFC", display: "flex", alignItems: "center", padding: "1.5cqw 8cqw 0", boxSizing: "border-box" }}>
                  <span style={{ fontSize: "4.4cqw", fontWeight: 600, color: "#14110E" }}>9:41</span>
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1.2cqw" }}>
                    <span style={{ width: "4.5cqw", height: "2.6cqw", display: "flex", alignItems: "flex-end", gap: ".5cqw" }}>
                      {[40, 60, 80, 100].map(h => <span key={h} style={{ flex: 1, height: `${h}%`, background: "#14110E", borderRadius: ".3cqw" }} />)}
                    </span>
                    <span style={{ width: "6cqw", height: "2.8cqw", border: "1px solid #8C8479", borderRadius: ".9cqw", padding: ".4cqw", boxSizing: "border-box" }}><span style={{ display: "block", width: "70%", height: "100%", background: "#14110E", borderRadius: ".4cqw" }} /></span>
                  </span>
                </div>
                <div style={{ position: "absolute", top: "3cqw", left: "50%", transform: "translateX(-50%)", width: "30%", height: "8.6cqw", borderRadius: "10cqw", background: "#000", zIndex: 2 }} />
                <div style={{ flex: "none", height: "12cqw", display: "flex", alignItems: "center", gap: "2.4cqw", padding: "0 3.6cqw", borderBottom: "1px solid #2C2622" }}>
                  <div style={{ flex: "none", width: "7cqw", height: "7cqw", borderRadius: "50%", border: "1px solid #3A332D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.6cqw", color: "#BDB5A8" }}>←</div>
                  <Live size="2.4cqw" />
                  <div style={{ flex: 1, minWidth: 0, fontFamily: SERIF, fontSize: "3.8cqw", color: "#F4F0EA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{TITLE}</div>
                  <div style={{ flex: "none", fontFamily: MONO, fontSize: "3cqw", color: "#A69E92" }}>{elapsed}</div>
                </div>
                <div style={{ flex: "none", position: "relative", aspectRatio: "16 / 10", background: "#000" }}><Video /></div>
                {tickStrip("6cqw", "1cqw", "22%")}
                <div style={{ flex: "none", display: "flex", gap: "4cqw", padding: "3.4cqw 3.6cqw", borderBottom: "1px solid #2C2622" }}>
                  <div style={{ flex: "none" }}>
                    <div style={{ fontFamily: SERIF, fontSize: "8.4cqw", color: "#F4F0EA", lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: "2.4cqw", color: "#8C8479", marginTop: "1cqw" }}>matched the data</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: "1cqw" }}>
                    {bar("1.4cqw")}
                    <div style={{ marginTop: "2.4cqw" }}>{counts("2.5cqw", "1cqw 3cqw", "1.5em")}</div>
                  </div>
                </div>
                <div style={{ flex: "none", padding: "3cqw 3.6cqw 0" }}>
                  <div style={{ height: "10cqw", borderRadius: "2.4cqw", background: "#0E7477", color: "#FFFEFC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.8cqw", fontWeight: 600 }}>Check this moment</div>
                </div>
                <div style={{ flex: "none", display: "flex", gap: "2cqw", padding: "3cqw 3.6cqw", overflow: "hidden" }}>
                  {([["ALL", all], ["FALSE", nF], ["MISLEADING", nM], ["TRUE", nT]] as const).map(([l, v], i) => (
                    <span key={l} style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: ".8cqw", padding: "2cqw 3.6cqw", borderRadius: "3cqw", fontSize: "2.5cqw", fontWeight: 700, letterSpacing: ".12em", ...(i === 0 ? { background: "#F4F0EA", color: "#14110E" } : { border: "1px solid #3A332D", color: "#BDB5A8" }) }}>
                      <span>{l}</span><span>{v}</span>
                    </span>
                  ))}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: "2.4cqw", padding: "0 3.6cqw" }}>
                  {feed.slice(0, 2).map(c => <Card key={c.time} c={c} phone animate={animate} />)}
                </div>
                <div style={{ flex: "none", display: "flex", alignItems: "center", padding: "3.4cqw 4.4cqw 7cqw", borderTop: "1px solid #2C2622", background: "#1A1613", fontSize: "3.2cqw", color: "#BDB5A8", position: "relative" }}>
                  <span><span style={{ color: "#F4F0EA", fontWeight: 600 }}>{all}</span> claims on the record</span>
                  <span style={{ marginLeft: "auto", color: "#2BA5A0", fontWeight: 600 }}>Download ↓</span>
                  <div style={{ position: "absolute", bottom: "2cqw", left: "50%", transform: "translateX(-50%)", width: "36%", height: "1.3cqw", borderRadius: "2cqw", background: "#F4F0EA" }} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <p style={{ maxWidth: 760, margin: "72px auto 0", textAlign: "center", fontSize: "clamp(18px, 2vw, 22px)", lineHeight: 1.45, fontWeight: 500, color: "#8C8479", textWrap: "pretty" } as React.CSSProperties}>
        Stream press briefings, hearings and addresses with <span style={{ color: "#FFFEFC" }}>AI fact-checking running alongside the video</span>. Every economic claim is verified against official data — BLS, BEA, Census, the Fed — in real time.
      </p>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 24, flexWrap: "wrap", marginTop: 32 }}>
        <Link href="/live" className="lp-cta" style={{ fontSize: 15, fontWeight: 600, color: "#FFFEFC", padding: "12px 22px", borderRadius: 100, background: "#B42318", textDecoration: "none" }}>
          Try the beta
        </Link>
        <span style={{ fontSize: 14, color: "#8C8479" }}>Full launch Q4 2026</span>
      </div>
    </section>
  );
}
