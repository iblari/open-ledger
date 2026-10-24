import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clipForKey } from "@/lib/og-video";
import { OgFrame, STRIPES, CHEETAH_BODY, CHEETAH_EYE } from "@/components/og/OgFrame";

/**
 * Per-claim og:video clip (8 s), rendered to MP4 by scripts/render-og-videos.mjs.
 *   0–2.4 s  the quote, "checking against <source>…"
 *   2.4–6.6  the official series draws in, what was said, the gap, the stamp
 *   6.6–8    "Checked by Vote Unbiased"
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CSS = `
@keyframes C1{0%,1%{opacity:0}4%,28%{opacity:1}31%,100%{opacity:0}}
@keyframes C2{0%,29%{opacity:0}32%,80%{opacity:1}83%,100%{opacity:0}}
@keyframes C3{0%,81%{opacity:0}85%,100%{opacity:1}}
@keyframes qt{0%,3%{clip-path:inset(0 100% 0 0)}20%,100%{clip-path:inset(0 0 0 0)}}
@keyframes ck{0%,18%{opacity:0;transform:translateY(10px)}22%,100%{opacity:1;transform:none}}
@keyframes zoom{0%,29%{transform:scale(1.08)}80%,100%{transform:scale(1)}}
@keyframes ln{0%,31%{stroke-dashoffset:1400}50%,100%{stroke-dashoffset:0}}
@keyframes a1{0%,44%{opacity:0}48%,100%{opacity:1}}
@keyframes sd{0%,50%{stroke-dashoffset:1200}56%,100%{stroke-dashoffset:0}}
@keyframes gp{0%,55%{transform:scaleY(0)}61%,100%{transform:scaleY(1)}}
@keyframes stp{0%,61%{opacity:0;transform:scale(2.3) rotate(-9deg)}65%,100%{opacity:1;transform:scale(1) rotate(-9deg)}}
@keyframes wm{0%,83%{opacity:0;transform:translateY(12px)}89%,100%{opacity:1;transform:none}}
#ogv .A{animation-duration:8s;animation-iteration-count:infinite;animation-timing-function:ease}
`;

const STAMP: Record<string, [string, string]> = { FALSE: ["FALSE", "#E0493A"], TRUE: ["TRUE", "#2BA393"], "MOSTLY TRUE": ["MOSTLY TRUE", "#2BA393"] };
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export default async function Clip({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const d = await clipForKey(key);
  if (!d) notFound();
  const g = d.geo;
  const [stamp, col] = STAMP[d.rating] || [d.rating, "#E0493A"];
  const q = d.quote.length > 140 ? d.quote.slice(0, 137).replace(/\s+\S*$/, "") + "…" : d.quote;
  const qSize = q.length > 90 ? 44 : q.length > 50 ? 54 : 64;

  return (
    <OgFrame css={CSS}>
      <div className="A" style={{ position: "absolute", left: 0, bottom: 0, height: 4, background: col, opacity: 0.7, animationName: "ogprog", animationTimingFunction: "linear" }} />

      <div className="sc A" style={{ animationName: "C1" }}>
        <div className="k" style={{ position: "absolute", left: 70, top: 56 }}>{[d.speaker, fmtDay(d.date)].filter(Boolean).join(" · ")}</div>
        <div className="sf A" style={{ position: "absolute", left: 70, right: 70, top: 150, fontSize: qSize, lineHeight: 1.18, animationName: "qt" }}>“{q}”</div>
        <div className="A" style={{ position: "absolute", left: 70, bottom: 70, fontSize: 22, letterSpacing: ".14em", animationName: "ck" }}>
          <span className="r">●</span> <span className="m">CHECKING AGAINST {g.source.toUpperCase()}…</span>
        </div>
      </div>

      <div className="sc A" style={{ animationName: "C2" }}>
        <div className="A" style={{ position: "absolute", inset: 0, transformOrigin: "85% 60%", animationName: "zoom" }}>
          <div className="k" style={{ position: "absolute", left: 60, top: 46, right: 60, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.label}</div>
          <svg viewBox="0 0 600 314" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {g.ticks.map((tk, i) => <g key={i}><line x1="30" y1={tk.y} x2="560" y2={tk.y} stroke="#1C1814" /><text x="566" y={tk.y + 4} fontSize="10" fill="#5A5148">{tk.label}</text></g>)}
            <path className="A" d={g.path} fill="none" stroke="#EDE7DE" strokeWidth={3.2} strokeLinejoin="round" strokeDasharray="1400" style={{ animationName: "ln" }} />
            {g.saidY != null && <path className="A" d={`M30 ${g.saidY} L560 ${g.saidY}`} stroke="#8C8479" strokeWidth={2} strokeDasharray="7 7" style={{ strokeDashoffset: 1200, animationName: "sd" }} />}
            {g.saidY != null && g.gap && <rect className="A" x={g.dot[0] - 4} y={Math.min(g.dot[1], g.saidY)} width={8} height={Math.abs(g.saidY - g.dot[1])} fill={col} opacity={0.55} style={{ transformOrigin: `${g.dot[0]}px ${g.saidY}px`, animationName: "gp" }} />}
            <circle className="A" cx={g.dot[0]} cy={g.dot[1]} r={7} fill={col} style={{ animationName: "a1" }} />
          </svg>
          {g.peak && <div className="sf A" style={{ position: "absolute", left: g.peak.x * 2 - 60, top: g.peak.y * 2 - 46, fontSize: 24, color: "#A39D93", animationName: "a1" }}>{g.peak.label}</div>}
          <div className="A" style={{ position: "absolute", right: 90, top: Math.max(120, Math.min(420, g.dot[1] * 2 - 90)), textAlign: "right", animationName: "a1" }}>
            <span className="sf" style={{ fontSize: 52 }}>{g.actual}</span><br /><span className="m" style={{ fontSize: 20 }}>actual</span>
          </div>
          {g.said && g.saidY != null && <div className="A m" style={{ position: "absolute", left: 60, top: Math.min(560, g.saidY * 2 + 10), fontSize: 22, animationName: "a1" }}>said <span style={{ color: "#EDE7DE" }}>{g.said}</span></div>}
        </div>
        <div className="A" style={{ position: "absolute", right: 200, bottom: 110, border: `6px solid ${col}`, color: col, fontWeight: 700, fontSize: 38, padding: "6px 26px", borderRadius: 10, letterSpacing: ".06em", animationName: "stp" }}>
          {stamp}{g.gap && stamp === "FALSE" ? ` · OFF ${g.gap.toUpperCase()}` : ""}
        </div>
      </div>

      <div className="sc A" style={{ animationName: "C3", display: "flex", alignItems: "center", justifyContent: "center", gap: 34 }}>
        <svg viewBox="0 20 240 80" width={240} height={80} className="A" style={{ animationName: "wm" }}>
          <defs><clipPath id="ogc2">{STRIPES.map(y => <rect key={y} x="0" y={y} width="240" height="7" />)}</clipPath></defs>
          <g clipPath="url(#ogc2)"><path d={CHEETAH_BODY} fill="#F5F5F2" /><path d={CHEETAH_EYE} fill="#E0493A" /></g>
        </svg>
        <div className="A" style={{ animationName: "wm" }}>
          <div className="m" style={{ fontSize: 22, letterSpacing: ".18em" }}>CHECKED BY</div>
          <div className="sf" style={{ fontSize: 58 }}>Vote <i className="r">Unbiased</i></div>
          <div className="m" style={{ fontSize: 22 }}>Economic &amp; political intelligence, in real time</div>
        </div>
      </div>
    </OgFrame>
  );
}
