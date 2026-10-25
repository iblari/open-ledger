import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSeries } from "@/lib/series";
import { buildOgChart } from "@/lib/og-chart";
import { shortName, sourceLabel } from "@/lib/metric-share";
import { VIDEO_METRICS } from "@/lib/og-media";
import { OgFrame, STRIPES, CHEETAH_BODY, CHEETAH_EYE } from "@/components/og/OgFrame";

/**
 * Per-metric og:video clip (8 s, 1200×628), rendered to MP4 by
 * scripts/render-og-videos.mjs and re-rendered when new data lands.
 *   0–0.6 s  title     0.6–4 s  five years of the series draws in
 *   4–4.6 s  latest value + dot     4.6 s  change vs a year earlier, hold
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CSS = `
@keyframes t1{0%,1%{opacity:0;transform:translateY(12px)}7%,100%{opacity:1;transform:none}}
@keyframes ln{0%,7%{stroke-dashoffset:1}50%,100%{stroke-dashoffset:0}}
@keyframes ar{0%,40%{opacity:0}55%,100%{opacity:1}}
@keyframes v1{0%,50%{opacity:0;transform:translateY(16px)}57%,100%{opacity:1;transform:none}}
@keyframes dt{0%,50%{opacity:0;transform:scale(0)}55%,100%{opacity:1;transform:scale(1)}}
@keyframes ch{0%,57%{opacity:0}63%,100%{opacity:1}}
#ogv .A{animation-duration:8s;animation-iteration-count:infinite;animation-timing-function:ease;animation-fill-mode:both}
`;

export default async function MetricClip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!VIDEO_METRICS.includes(id)) notFound();
  const sd = await getSeries(id).catch(() => null);
  const W = 1072, H = 250;
  const c = sd ? buildOgChart(sd, { W, H }) : null;
  if (!sd || !c) notFound();

  return (
    <OgFrame css={CSS}>
      <div className="A" style={{ position: "absolute", left: 0, bottom: 0, height: 4, background: "#E0493A", opacity: 0.7, animationName: "ogprog", animationTimingFunction: "linear" }} />
      <div className="A" style={{ position: "absolute", left: 64, right: 64, top: 44, animationName: "t1" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="k"><span className="r">●</span> Official data · latest {c.valueDate}</span>
          <span className="k">{sourceLabel(id, sd.source)}</span>
        </div>
        <div className="sf" style={{ fontSize: 44, marginTop: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(id)}</div>
      </div>
      <div style={{ position: "absolute", left: 64, top: 170, display: "flex", alignItems: "baseline", gap: 26 }}>
        <span className="sf A" style={{ fontSize: 96, lineHeight: 1, animationName: "v1" }}>{c.value}</span>
        {c.change && <span className="A" style={{ fontSize: 28, color: "#C9C2B8", animationName: "ch" }}>{c.change}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", left: 64, top: 300, overflow: "visible" }}>
        <path className="A" d={c.area} fill="#EDE7DE" fillOpacity={0.1} style={{ animationName: "ar" }} />
        <path className="A" d={c.path} pathLength={1} fill="none" stroke="#EDE7DE" strokeWidth={4} strokeLinejoin="round" strokeDasharray="1" style={{ animationName: "ln" }} />
        <circle className="A" cx={c.dot[0]} cy={c.dot[1]} r={10} fill="#E0493A" stroke="#0A0806" strokeWidth={4} style={{ transformOrigin: `${c.dot[0]}px ${c.dot[1]}px`, animationName: "dt" }} />
      </svg>
      <div className="m" style={{ position: "absolute", left: 64, bottom: 30, fontSize: 20 }}>{c.from}–{c.to}</div>
      <div style={{ position: "absolute", right: 64, bottom: 22, display: "flex", alignItems: "center", gap: 14 }}>
        <svg viewBox="0 20 240 80" width={96} height={32}>
          <defs><clipPath id="ogm">{STRIPES.map(y => <rect key={y} x="0" y={y} width="240" height="7" />)}</clipPath></defs>
          <g clipPath="url(#ogm)"><path d={CHEETAH_BODY} fill="#F5F5F2" /><path d={CHEETAH_EYE} fill="#E0493A" /></g>
        </svg>
        <span className="sf" style={{ fontSize: 30 }}>Vote <i className="r">Unbiased</i></span>
      </div>
    </OgFrame>
  );
}
