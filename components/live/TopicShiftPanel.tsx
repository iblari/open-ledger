"use client";

/**
 * "What they're talking about more, and less."
 *
 * The signal the ledger was built for: which subjects are turning up in more
 * broadcasts lately, and which have dropped away. Counted in BROADCASTS (one
 * convention = one vote), labelled with how far the change can be trusted,
 * and never hiding that the mix of events drives part of it.
 */

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

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "";

export default function TopicShiftPanel({ shift }: { shift: TopicShift | null }) {
  if (!shift) return null;
  const w = shift.window;
  return (
    <section aria-labelledby="shift-h" style={{ background: "#FFFEFC", border: "1px solid #DFD9CF", borderRadius: 10, padding: "20px 22px" }}>
      <style>{`.shift-cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}@media (max-width:700px){.shift-cols{grid-template-columns:1fr;gap:18px}}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="shift-h" style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, margin: 0, color: "#14110E" }}>
          What they&rsquo;re talking about more, and less
        </h2>
        <span style={{ fontFamily: SANS, fontSize: 12, color: "#8C8479" }}>
          Last {w} broadcasts vs the {w} before{shift.from ? ` · ${fmt(shift.from)}–${fmt(shift.to)}` : ""}
        </span>
      </div>
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
    </section>
  );
}
