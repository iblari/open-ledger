"use client";

/**
 * "What they're talking about more, and less."
 *
 * The signal the ledger was built for: which subjects are turning up in more
 * broadcasts lately, and which have dropped away. Counted in BROADCASTS (one
 * convention = one vote), labelled with how far the change can be trusted,
 * and never hiding that the mix of events drives part of it.
 */

import { useState } from "react";
import type { ShiftRow, TopicShift } from "@/lib/topic-breadth";

const SERIF = "'Newsreader',Georgia,serif";
const SANS = "'DM Sans',-apple-system,sans-serif";
const UP = "#0E7477", DOWN = "#B42318";

const LABEL: Record<ShiftRow["confidence"], [string, string, string]> = {
  confirmed: ["Confirmed", "#E1F5EE", "#085041"],
  early: ["Early signal", "#FAEEDA", "#633806"],
  "too-early": ["Too early to tell", "#F1EFE8", "#5F5E5A"],
};

function Spark({ series, max, color }: { series: number[]; max: number; color: string }) {
  const w = 96, h = 28;
  if (series.length < 2) return <svg width={w} height={h} aria-hidden />;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 3 - (v / max) * (h - 6)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ flex: "none" }}>
      <polyline points={pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.8} fill={color} />
    </svg>
  );
}

function Column({ title, rows, color, win, arrow }: { title: string; rows: ShiftRow[]; color: string; win: number; arrow: string }) {
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
            <Spark series={r.series} max={win} color={color} />
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
          <Spark series={r.series} max={w} color={color} />
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
        <Column title="RISING" arrow="▲" rows={shift.rising} color={UP} win={w} />
        <Column title="FADING" arrow="▼" rows={shift.fading} color={DOWN} win={w} />
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
