import type { Metadata } from "next";
import { brandData } from "@/lib/og-video";
import { OgFrame, STRIPES, CHEETAH_BODY, CHEETAH_EYE } from "@/components/og/OgFrame";

/**
 * The branded og:video loop (14 s), rendered to MP4 frame by frame by
 * scripts/render-og-videos.mjs. Live data: the newest false claim drawn on
 * its official series, and seven current signals that become the cheetah.
 *   0–3 s   live caption, the number is detected
 *   3–7.5   checked against the record: line, said line, gap, stamp
 *   7.5–11.5 seven live signals as bars → the striped cheetah mark
 *   11.5–14 brand card
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CSS = `
@keyframes S1{0%,1%{opacity:0}3%,20%{opacity:1}23%,100%{opacity:0}}
@keyframes S2{0%,21%{opacity:0}24%,52%{opacity:1}55%,100%{opacity:0}}
@keyframes S3{0%,53%{opacity:0}56%,82%{opacity:1}85%,100%{opacity:0}}
@keyframes S4{0%,83%{opacity:0}86%,100%{opacity:1}}
@keyframes cap{0%,3%{clip-path:inset(0 100% 0 0)}14%,100%{clip-path:inset(0 0 0 0)}}
@keyframes hit{0%,13%{opacity:0;transform:scale(1.25)}15%,100%{opacity:1;transform:scale(1)}}
@keyframes det{0%,15%{opacity:0;transform:translateY(10px)}17%,100%{opacity:1;transform:none}}
@keyframes zoom{0%,21%{transform:scale(1.08)}52%,100%{transform:scale(1)}}
@keyframes ln{0%,23%{stroke-dashoffset:1400}36%,100%{stroke-dashoffset:0}}
@keyframes a1{0%,29%{opacity:0}32%,100%{opacity:1}}
@keyframes sd{0%,36%{stroke-dashoffset:1200}40%,100%{stroke-dashoffset:0}}
@keyframes gp{0%,39%{transform:scaleY(0)}43%,100%{transform:scaleY(1)}}
@keyframes stp{0%,43%{opacity:0;transform:scale(2.3) rotate(-9deg)}45.5%,100%{opacity:1;transform:scale(1) rotate(-9deg)}}
@keyframes src{0%,46%{opacity:0}49%,100%{opacity:1}}
@keyframes bar{0%,56%{transform:scaleX(0)}62%,70%{transform:scaleX(var(--w))}75%,100%{transform:scaleX(1)}}
@keyframes barO{0%,74%{opacity:1}79%,100%{opacity:0}}
@keyframes lb{0%,58%{opacity:0}62%,70%{opacity:1}73%,100%{opacity:0}}
@keyframes ch{0%,74%{opacity:0}79%,100%{opacity:1}}
@keyframes eye{0%,78%{opacity:0;transform:scale(0)}81%,100%{opacity:1;transform:scale(1)}}
@keyframes wm{0%,86%{opacity:0;letter-spacing:.3em}91%,100%{opacity:1;letter-spacing:-.01em}}
@keyframes tg{0%,89%{opacity:0;transform:translateY(10px)}93%,100%{opacity:1;transform:none}}
#ogv .A{animation-duration:14s;animation-iteration-count:infinite;animation-timing-function:ease}
`;

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).toUpperCase();

export default async function Brand() {
  const { hero, signals } = await brandData();
  const g = hero?.geo;
  // Caption: the claim with the claimed number boxed.
  const q = hero?.quote || "";
  const num = g?.said ? q.match(/[$]?\d[\d.,]*\s?%?/)?.[0] : null;
  const [pre, post] = num ? [q.slice(0, q.indexOf(num)), q.slice(q.indexOf(num) + num.length)] : [q, ""];
  const widths = [0.86, 0.71, 0.62, 0.5, 0.41, 0.33, 0.24];
  const sig = [...signals]; while (sig.length < 7) sig.push({ label: "", value: "", note: "", hot: false });

  return (
    <OgFrame css={CSS}>
      <div className="A" style={{ position: "absolute", left: 0, bottom: 0, height: 4, background: "#E0493A", opacity: 0.7, animationName: "ogprog", animationTimingFunction: "linear" }} />

      {/* 1 · live caption */}
      {hero && g && (
        <div className="sc A" style={{ animationName: "S1" }}>
          <div style={{ position: "absolute", left: 60, top: 50, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#E0493A", animation: "ogpulse 1.2s infinite" }} />
            <span className="k" style={{ color: "#E0493A" }}>Live</span>
            <span className="k">· {hero.speaker || "On air"} · {fmtDay(hero.date)} {fmtTime(hero.date)} ET</span>
          </div>
          <div style={{ position: "absolute", left: 60, right: 60, top: 180, height: 110, display: "flex", alignItems: "center", gap: 7 }}>
            {Array.from({ length: 64 }, (_, i) => (
              <span key={i} style={{ flex: 1, height: "100%", borderRadius: 3, background: ["#3A332C", "#4A413A", "#5A4F46"][i % 3], animation: `ogwv ${0.42 + ((i * 7) % 9) * 0.05}s ${((i * 3) % 7) * 0.07}s infinite` }} />
            ))}
          </div>
          <div className="sf A" style={{ position: "absolute", left: 60, right: 60, top: 360, fontSize: 46, lineHeight: 1.25, animationName: "cap" }}>
            “{pre}{num && (
              <span style={{ position: "relative", display: "inline-block", padding: "0 6px" }}>{num}
                <span className="A" style={{ position: "absolute", inset: "-6px -4px", border: "4px solid #E0493A", borderRadius: 8, animationName: "hit" }} />
              </span>
            )}{post}”
          </div>
          <div className="A" style={{ position: "absolute", left: 60, bottom: 60, fontSize: 21, letterSpacing: ".14em", animationName: "det" }}>
            <span className="r">● CLAIM DETECTED</span> <span className="m">· CHECKING AGAINST {g.source.toUpperCase()}…</span>
          </div>
        </div>
      )}

      {/* 2 · against the record */}
      {hero && g && (
        <div className="sc A" style={{ animationName: "S2" }}>
          <div className="A" style={{ position: "absolute", inset: 0, transformOrigin: "85% 60%", animationName: "zoom" }}>
            <div className="k" style={{ position: "absolute", left: 60, top: 46 }}>{g.label}</div>
            <svg viewBox="0 0 600 314" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {g.ticks.map((tk, i) => <g key={i}><line x1="30" y1={tk.y} x2="560" y2={tk.y} stroke="#1C1814" /><text x="566" y={tk.y + 4} fontSize="10" fill="#5A5148">{tk.label}</text></g>)}
              <path className="A" d={g.path} fill="none" stroke="#EDE7DE" strokeWidth={3.2} strokeLinejoin="round" strokeDasharray="1400" style={{ animationName: "ln" }} />
              {g.saidY != null && <path className="A" d={`M30 ${g.saidY} L560 ${g.saidY}`} stroke="#8C8479" strokeWidth={2} strokeDasharray="7 7" style={{ strokeDashoffset: 1200, animationName: "sd" }} />}
              {g.saidY != null && <rect className="A" x={g.dot[0] - 4} y={Math.min(g.dot[1], g.saidY)} width={8} height={Math.abs(g.saidY - g.dot[1])} fill="#E0493A" opacity={0.55} style={{ transformOrigin: `${g.dot[0]}px ${g.saidY}px`, animationName: "gp" }} />}
              <circle className="A" cx={g.dot[0]} cy={g.dot[1]} r={7} fill="#E0493A" style={{ animationName: "a1" }} />
            </svg>
            {g.peak && <div className="sf A" style={{ position: "absolute", left: g.peak.x * 2 - 60, top: g.peak.y * 2 - 46, fontSize: 24, color: "#A39D93", animationName: "a1" }}>{g.peak.label}</div>}
            <div className="A" style={{ position: "absolute", right: 90, top: Math.max(120, g.dot[1] * 2 - 90), textAlign: "right", animationName: "a1" }}>
              <span className="sf" style={{ fontSize: 52 }}>{g.actual}</span><br /><span className="m" style={{ fontSize: 20 }}>actual</span>
            </div>
            {g.said && g.saidY != null && <div className="A m" style={{ position: "absolute", left: 60, top: g.saidY * 2 + 10, fontSize: 22, animationName: "src" }}>said <span style={{ color: "#EDE7DE" }}>{g.said}</span></div>}
          </div>
          <div className="A" style={{ position: "absolute", right: 200, bottom: 120, border: "6px solid #E0493A", color: "#E0493A", fontWeight: 700, fontSize: 38, padding: "6px 26px", borderRadius: 10, letterSpacing: ".06em", animationName: "stp" }}>
            FALSE{g.gap ? ` · OFF ${g.gap.toUpperCase()}` : ""}
          </div>
          <div className="A m" style={{ position: "absolute", left: 60, bottom: 40, fontSize: 20, letterSpacing: ".14em", animationName: "src" }}>SOURCE {g.source.toUpperCase()} · CHECKED LIVE</div>
        </div>
      )}

      {/* 3 · signals → cheetah */}
      <div className="sc A" style={{ animationName: "S3" }}>
        <div className="k A" style={{ position: "absolute", left: 60, top: 46, animationName: "lb" }}>Live signals · right now</div>
        <svg viewBox="0 20 240 80" style={{ position: "absolute", left: 168, top: 170, width: 864, height: 288, overflow: "visible" }}>
          <defs><clipPath id="ogc">{STRIPES.map(y => <rect key={y} x="0" y={y} width="240" height="7" />)}</clipPath></defs>
          <g className="A" style={{ animationName: "barO" }}>
            {STRIPES.map((y, i) => (
              <rect key={y} className="A" x="0" y={y} width="240" height="7" fill={sig[i]?.hot && i === 0 ? "#E0493A" : "#EDE7DE"}
                style={{ transformOrigin: "0 0", ["--w" as string]: widths[i], animationName: "bar", animationDelay: `${i * 0.05}s` } as React.CSSProperties} />
            ))}
          </g>
          <g clipPath="url(#ogc)" className="A" style={{ animationName: "ch" }}>
            <path d={CHEETAH_BODY} fill="#F5F5F2" />
            <path className="A" d={CHEETAH_EYE} fill="#E0493A" style={{ transformOrigin: "216px 38px", animationName: "eye" }} />
          </g>
        </svg>
        <div className="A" style={{ position: "absolute", left: 168, top: 170, width: 864, height: 288, fontSize: 21, animationName: "lb" }}>
          {sig.map((s, i) => s.label && (
            // Beside the end of its own bar (stripe i sits at y=STRIPES[i] in a 20–100 viewBox, 3.6 px per unit).
            <div key={i} style={{ position: "absolute", left: widths[i] * 864 + 18, top: (STRIPES[i] - 20) * 3.6 - 3, whiteSpace: "nowrap", lineHeight: "26px" }}>
              {s.label} <b className={s.hot && i === 0 ? "r" : undefined} style={{ fontWeight: 700 }}>{s.value}</b> <span className="m">· {s.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 · brand */}
      <div className="sc A" style={{ animationName: "S4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <div className="sf A" style={{ fontSize: 76, animationName: "wm" }}>Vote <i className="r">Unbiased</i></div>
        <div className="A" style={{ fontSize: 30, color: "#C9C2B8", animationName: "tg" }}>Economic &amp; political intelligence. <span className="r">In real time.</span></div>
        <div className="k A" style={{ animationName: "tg", marginTop: 6 }}>voteunbiased.org</div>
      </div>
    </OgFrame>
  );
}
