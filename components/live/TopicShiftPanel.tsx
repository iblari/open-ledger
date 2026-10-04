"use client";

/**
 * "What they're talking about more, and less."
 *
 * The signal the ledger was built for: which subjects are turning up in more
 * broadcasts lately, and which have dropped away. Counted in BROADCASTS (one
 * convention = one vote), labelled with how far the change can be trusted,
 * and never hiding that the mix of events drives part of it.
 */

import { useRef, useState } from "react";
import type { ShiftRow, TopicShift } from "@/lib/topic-breadth";

const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const UP = "#0E7477", DOWN = "#B42318";

const LABEL: Record<ShiftRow["confidence"], [string, string, string]> = {
  confirmed: ["Confirmed", "#E1F5EE", "#085041"],
  early: ["Early signal", "#FAEEDA", "#633806"],
  "too-early": ["Too early to tell", "#F1EFE8", "#5F5E5A"],
};

/** Short, clean broadcast title for the readout: no "LIVE:" prefix or trailing date. */
function shortTitle(t: string) {
  return t.replace(/^\s*LIVE:\s*/i, "").replace(/,?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s*\d{4}\s*$/i, "").trim();
}

/**
 * The trend line, now readable point by point: hover (or drag a finger)
 * and the nearest point lights up with the broadcast it ends on, whether
 * that broadcast raised the subject, and the rolling count.
 */
function Spark({ series, raised, points, max, color, topic, w = 96 }: {
  series: number[]; raised?: boolean[]; points?: { title: string; date: string }[];
  max: number; color: string; topic?: string; w?: number;
}) {
  const h = 28;
  const [hi, setHi] = useState<number | null>(null);
  // Phones fire synthetic mouse events after a tap; without this the
  // readout could be cleared by them the moment it appeared.
  const lastTouch = useRef(0);
  if (series.length < 2) return <svg width={w} height={h} aria-hidden />;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const [lx, ly] = pts[pts.length - 1];
  const interactive = Boolean(points && points.length === series.length);
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const k = Math.round(((clientX - r.left) / r.width) * (series.length - 1));
    setHi(Math.max(0, Math.min(series.length - 1, k)));
  };
  const p = hi != null && points ? points[hi] : null;
  return (
    <span style={{ position: "relative", display: "inline-block", flex: "none", lineHeight: 0 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", overflow: "visible", cursor: interactive ? "crosshair" : undefined, touchAction: interactive ? "pan-y" : undefined }}
        onMouseMove={interactive ? e => pick(e.clientX, e.currentTarget) : undefined}
        onMouseLeave={interactive ? () => { if (Date.now() - lastTouch.current > 3000) setHi(null); } : undefined}
        onTouchStart={interactive ? e => { lastTouch.current = Date.now(); pick(e.touches[0].clientX, e.currentTarget); } : undefined}
        onTouchMove={interactive ? e => { lastTouch.current = Date.now(); pick(e.touches[0].clientX, e.currentTarget); } : undefined}
        onTouchEnd={interactive ? () => { const t = (lastTouch.current = Date.now()); setTimeout(() => { if (lastTouch.current === t) setHi(null); }, 3000); } : undefined}>
        <rect x={-4} y={-6} width={w + 8} height={h + 12} fill="transparent" />
        <polyline points={pts.map(q => q.map(n => n.toFixed(1)).join(",")).join(" ")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        {interactive && hi == null && pts.map(([x, y], i) => i < pts.length - 1 && (
          <circle key={i} cx={x} cy={y} r={1.3} fill={color} opacity={0.45} />
        ))}
        {hi == null && <circle cx={lx} cy={ly} r={2.8} fill={color} />}
        {hi != null && (
          <>
            <line x1={pts[hi][0]} x2={pts[hi][0]} y1={-2} y2={h + 2} stroke="#CFC8BC" strokeWidth={1} />
            <circle cx={pts[hi][0]} cy={pts[hi][1]} r={3.6} fill="#fff" stroke={color} strokeWidth={2} />
          </>
        )}
      </svg>
      {p && hi != null && (
        <span role="tooltip" style={{
          position: "absolute", bottom: h + 8,
          // Right-anchored: the line always sits at the right end of its row,
          // so a left-anchored box ran off the screen on phones.
          right: Math.max(-6, w - pts[hi][0] - 24),
          width: 220, zIndex: 20, pointerEvents: "none", lineHeight: 1.35,
          background: "#14110E", color: "#F4F0EA", borderRadius: 8, padding: "8px 10px",
          fontFamily: SANS, fontSize: 11.5, boxShadow: "0 6px 18px rgba(20,17,14,.25)", whiteSpace: "normal", textAlign: "left",
        }}>
          <span style={{ display: "block", color: "#A69E92", fontSize: 10.5, letterSpacing: "0.04em" }}>
            {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
          </span>
          <span style={{ display: "block", fontWeight: 600, margin: "2px 0 5px" }}>{shortTitle(p.title)}</span>
          {raised && (
            <span style={{ display: "block", color: raised[hi] ? "#7FD1C7" : "#C9C2B6" }}>
              {raised[hi] ? "✓ Raised" : "– Didn\u2019t raise"} {topic ? topic.toLowerCase() : "it"}
            </span>
          )}
          <span style={{ display: "block", color: "#C9C2B6" }}>{series[hi]} of the last {max} broadcasts</span>
        </span>
      )}
    </span>
  );
}

function Column({ title, rows, color, win, arrow, points }: { title: string; rows: ShiftRow[]; color: string; win: number; arrow: string; points?: { title: string; date: string }[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color, marginBottom: 6 }}>{arrow} {title}</div>
      {rows.length === 0 && <div style={{ fontFamily: SANS, fontSize: 13, color: "#8C8479", padding: "8px 0", borderTop: "1px solid #EFEAE2" }}>Nothing moved.</div>}
      {rows.map(r => {
        const [lab, bg, fg] = LABEL[r.confidence];
        return (
          <div key={r.topic} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid #EFEAE2" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600, color: "#14110E" }}>{r.topic}</div>
              <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#5F5850", marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span>{r.recent} of {win} <span style={{ color: "#A69E92" }}>(was {r.prior} of {win})</span></span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: bg, color: fg, whiteSpace: "nowrap" }}>{lab}</span>
              </div>
            </div>
            <Spark series={r.series} raised={r.raised} points={points} topic={r.topic} max={win} color={color} />
          </div>
        );
      })}
    </div>
  );
}

const DOT: Record<ShiftRow["confidence"], string> = { confirmed: "#0E7477", early: "#C2860C", "too-early": "#C9C2B6" };

/** Phone layout: one list at a time, one line per subject, confidence as a
 *  dot explained once in a key. Roughly a third of the desktop height. */
function Mobile({ shift }: { shift: TopicShift }) {
  const [tab, setTab] = useState<"up" | "down">(shift.rising.length ? "up" : "down");
  const rows = tab === "up" ? shift.rising : shift.fading;
  const color = tab === "up" ? UP : DOWN;
  const w = shift.window;
  const tabBtn = (k: "up" | "down", label: string, n: number, c: string) => (
    <button type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{
      flex: 1, border: "none", cursor: "pointer", borderRadius: 99, padding: "7px 0",
      fontFamily: SANS, fontSize: 13, fontWeight: tab === k ? 700 : 500,
      background: tab === k ? "#fff" : "transparent", color: tab === k ? c : "#5F5850",
      boxShadow: tab === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
    }}>{label} · {n}</button>
  );
  return (
    <div>
      <div role="tablist" style={{ display: "flex", background: "#EFEAE2", borderRadius: 99, padding: 3, margin: "12px 0 4px" }}>
        {tabBtn("up", "▲ Rising", shift.rising.length, UP)}
        {tabBtn("down", "▼ Fading", shift.fading.length, DOWN)}
      </div>
      {rows.length === 0 && <div style={{ fontFamily: SANS, fontSize: 13, color: "#8C8479", padding: "10px 0" }}>Nothing moved.</div>}
      {rows.map(r => (
        <div key={r.topic} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto 60px", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid #EFEAE2" }}>
          <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "#14110E", minWidth: 0 }}>
            <span aria-label={LABEL[r.confidence][0]} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: DOT[r.confidence], marginRight: 7, verticalAlign: "middle" }} />
            {r.topic}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 13, color: "#5F5850", whiteSpace: "nowrap" }}>
            {r.recent}/{w} <span style={{ color: "#A69E92" }}>← {r.prior}</span>
          </span>
          <Spark series={r.series} raised={r.raised} points={shift.points} topic={r.topic} max={w} color={color} w={60} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: SANS, fontSize: 11, color: "#8C8479", marginTop: 8 }}>
        {(["confirmed", "early", "too-early"] as const).map(k => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT[k] }} />{LABEL[k][0]}
          </span>
        ))}
      </div>
      {shift.steady.length > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 12, color: "#5F5850", marginTop: 12, paddingTop: 10, borderTop: "1px solid #DFD9CF" }}>
          <b style={{ color: "#14110E", fontWeight: 600 }}>Always on the agenda:</b> {shift.steady.join(", ")}
        </div>
      )}
      <details style={{ marginTop: 8, fontFamily: SANS }}>
        <summary style={{ fontSize: 12, color: UP, cursor: "pointer", listStyle: "none" }}>How to read this ›</summary>
        <p style={{ fontSize: 12, color: "#5F5850", lineHeight: 1.55, margin: "6px 0 0" }}>
          &ldquo;3/{w} ← 0&rdquo; means the subject came up in 3 of the last {w} broadcasts, against 0 of the {w} before.
          Each broadcast counts once, however long. The line is that count over time. Which events happened moves
          these numbers, and with {w} broadcasts a side only a swing of 4 is strong enough to call confirmed.
        </p>
      </details>
    </div>
  );
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "";

export default function TopicShiftPanel({ shift }: { shift: TopicShift | null }) {
  if (!shift) return null;
  const w = shift.window;
  return (
    <section aria-labelledby="shift-h" className="shift-box" style={{ background: "#FFFEFC", border: "1px solid #DFD9CF", borderRadius: 10, padding: "20px 22px" }}>
      <style>{`.shift-cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}.shift-m{display:none}
        @media (max-width:640px){.shift-m{display:block}.shift-d{display:none}.shift-h{font-size:18px!important}.shift-box{padding:16px 14px!important}}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="shift-h" className="shift-h" style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, margin: 0, color: "#14110E" }}>
          What they&rsquo;re talking about more, and less
        </h2>
        <span style={{ fontFamily: SANS, fontSize: 12, color: "#8C8479" }}>
          Last {w} broadcasts vs the {w} before{shift.from ? ` · ${fmt(shift.from)}–${fmt(shift.to)}` : ""}
        </span>
      </div>
      <div className="shift-m"><Mobile shift={shift} /></div>
      <div className="shift-d">
      <p style={{ fontFamily: SANS, fontSize: 13, color: "#5F5850", margin: "6px 0 16px", lineHeight: 1.5, maxWidth: "70ch" }}>
        How many of the latest broadcasts raised each subject at all, so one long speech counts once.
        The line shows the same count over time, one point per broadcast.
      </p>
      <div className="shift-cols">
        <Column title="RISING" arrow="▲" rows={shift.rising} color={UP} win={w} points={shift.points} />
        <Column title="FADING" arrow="▼" rows={shift.fading} color={DOWN} win={w} points={shift.points} />
      </div>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #DFD9CF", fontFamily: SANS, fontSize: 12.5, color: "#5F5850", lineHeight: 1.6 }}>
        {shift.steady.length > 0 && (
          <div><b style={{ color: "#14110E", fontWeight: 600 }}>Always on the agenda:</b> {shift.steady.join(", ")} came up in at least 3 of {w} broadcasts in both periods.</div>
        )}
        <div style={{ color: "#8C8479" }}>
          Read with care: which events happened moves these numbers — a ceremony or a single-issue event pulls its own subject up.
          With {w} broadcasts on each side, only a swing of 4 is strong enough to call confirmed.
        </div>
      </div>
      </div>
    </section>
  );
}
