import type { Metadata } from "next";
import { OgFrame, STRIPES, CHEETAH_BODY, CHEETAH_EYE } from "@/components/og/OgFrame";

/**
 * og:video for /vote (6 s loop, 1200×628, dark), rendered to MP4 by
 * scripts/render-og-videos.mjs. Built for iMessage: plays small, muted, looping.
 *   0–1.6 s  a ballot (already on screen at frame 0) gets its check
 *   1.7–2.7  it drops into the slot
 *   2.6–3.9  the slot becomes the cheetah, drawn stripe by stripe
 *   3.8–6    "Check the data first." + voteunbiased.org/vote
 */
export const dynamic = "force-static";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CSS = `
#ogv{background:radial-gradient(ellipse at 50% 42%,#1c1915 0%,#0A0806 72%)}
@keyframes tick{0%,10%{stroke-dashoffset:60}26%,100%{stroke-dashoffset:0}}
@keyframes drop{0%,28%{transform:translateY(0);opacity:1}44%{transform:translateY(190px);opacity:1}46%,100%{transform:translateY(190px);opacity:0}}
@keyframes slot{0%,42%{opacity:1;transform:scaleX(1)}50%,100%{opacity:0;transform:scaleX(.15)}}
@keyframes bump{0%,42%{transform:translateY(0)}45%{transform:translateY(5px)}48%,100%{transform:translateY(0)}}
@keyframes stripe{0%,44%{transform:scaleX(0)}62%,100%{transform:scaleX(1)}}
@keyframes head{0%,58%{opacity:0}64%,100%{opacity:1}}
@keyframes line{0%,63%{opacity:0;transform:translateY(14px)}72%,100%{opacity:1;transform:none}}
@keyframes url{0%,72%{opacity:0}80%,100%{opacity:1}}
#ogv .A{animation-duration:6s;animation-iteration-count:infinite;animation-fill-mode:both;animation-timing-function:cubic-bezier(.5,0,.3,1)}
`;

export default function VoteVideo() {
  return (
    <OgFrame css={CSS}>
      {/* Ballot + slot */}
      <div className="A" style={{ position: "absolute", left: 360, top: 312, width: 480, height: 18, borderRadius: 9, background: "#EDE7DE", transformOrigin: "center", animationName: "bump" }}>
        <div className="A" style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#EDE7DE", animationName: "slot" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 318, overflow: "hidden" }}>
        <div className="A" style={{ position: "absolute", left: 510, top: 40, animationName: "drop" }}>
          <svg width="180" height="236" viewBox="0 0 120 160">
            <rect width="120" height="160" rx="6" fill="#F7F4EF" />
            <rect x="16" y="20" width="88" height="8" rx="3" fill="#14110E" />
            <rect x="16" y="48" width="18" height="18" rx="3" fill="none" stroke="#14110E" strokeWidth="3" />
            <rect x="42" y="53" width="60" height="7" rx="3" fill="#CFC9BF" />
            <rect x="16" y="84" width="18" height="18" rx="3" fill="none" stroke="#14110E" strokeWidth="3" />
            <rect x="42" y="89" width="52" height="7" rx="3" fill="#CFC9BF" />
            <rect x="16" y="120" width="18" height="18" rx="3" fill="none" stroke="#14110E" strokeWidth="3" />
            <rect x="42" y="125" width="64" height="7" rx="3" fill="#CFC9BF" />
            <path className="A" d="M19 93 L25 99 L36 85" fill="none" stroke="#E0493A" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 60, animationName: "tick" }} />
          </svg>
        </div>
      </div>

      {/* Cheetah, drawn stripe by stripe */}
      <svg style={{ position: "absolute", left: 375, top: 70, width: 450, height: 150 }} viewBox="0 20 240 80">
        <defs>
          <clipPath id="vcp">
            {STRIPES.map((y, i) => (
              <rect key={y} className="A" x="0" y={y} width="240" height="7" style={{ transformBox: "fill-box", transformOrigin: "left", animationName: "stripe", animationDelay: `${i * 0.07}s` }} />
            ))}
          </clipPath>
        </defs>
        <g clipPath="url(#vcp)">
          <path d={CHEETAH_BODY} fill="#EDE7DE" />
          <path className="A" d={CHEETAH_EYE} fill="#E0493A" style={{ animationName: "head" }} />
        </g>
      </svg>

      {/* Line + url */}
      <div className="A sf" style={{ position: "absolute", left: 0, right: 0, top: 268, textAlign: "center", fontSize: 96, lineHeight: 1.05, letterSpacing: "-0.02em", color: "#F7F4EF", animationName: "line" }}>
        Check the data first.
      </div>
      <div className="A" style={{ position: "absolute", left: 0, right: 0, top: 420, display: "flex", justifyContent: "center", gap: 0, animationName: "url" }}>
        <span style={{ width: 130, height: 10, background: "#4361a6", borderRadius: "3px 0 0 3px" }} />
        <span style={{ width: 130, height: 10, background: "#F7F4EF" }} />
        <span style={{ width: 130, height: 10, background: "#b8372d", borderRadius: "0 3px 3px 0" }} />
      </div>
      <div className="A" style={{ position: "absolute", left: 0, right: 0, top: 474, textAlign: "center", fontSize: 34, letterSpacing: ".14em", fontWeight: 600, color: "#E0493A", animationName: "url" }}>
        VOTEUNBIASED.ORG/VOTE
      </div>
    </OgFrame>
  );
}
