"use client";

/**
 * Data tab, "Same point in office" lens: every administration at the month
 * the current one has reached, ranked. Live from FRED via
 * /api/benchmark-data. A row opens the month-by-month chart.
 */

import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import { samePoint, fmtBench, type Bench } from "@/lib/bench-lens";

// Most recent six on screen; ranks are still out of every administration
// the feed covers (back to Nixon).
const SHOWN = ["clinton", "bush43", "obama", "trump1", "biden", "trump2"];
const SHORT: Record<string, string> = {
  clinton: "Clinton", bush43: "Bush W.", obama: "Obama", trump1: "Trump", biden: "Biden", trump2: "Trump II",
};
const YEARS: Record<string, string> = {
  clinton: "1993–2001", bush43: "2001–2009", obama: "2009–2017", trump1: "2017–2021", biden: "2021–2025", trump2: "2025–",
};

/** Rank → cell colour: top third teal, bottom third orange, middle neutral. */
function rankStyle(rank: number, n: number): { bg: string; fg: string } {
  const q = (rank - 1) / Math.max(n - 1, 1);
  if (q <= 0.15) return { bg: "rgba(13,115,119,.42)", fg: "#063638" };
  if (q <= 0.34) return { bg: "rgba(13,115,119,.2)", fg: "#0B4A4C" };
  if (q >= 0.85) return { bg: "rgba(194,65,12,.4)", fg: "#5E160C" };
  if (q >= 0.66) return { bg: "rgba(194,65,12,.18)", fg: "#7A2418" };
  return { bg: EC.paper, fg: EC.sub };
}

export default function SamePointView({
  bench, mob, onOpen,
}: { bench: Bench | null; mob: boolean; onOpen: (benchKey: string) => void }) {
  if (!bench) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", fontFamily: ESANS, color: EC.mute, fontSize: 13 }}>
        Loading live data from FRED…
      </div>
    );
  }
  const cats = Object.entries(bench.categories);
  // A rank needs a field: series that only reach back a few terms (the S&P
  // 500 is licensed to FRED for ~10 years) stay out of this lens.
  const keysIn = (cat: string) => Object.keys(bench.metrics).filter(k =>
    bench.metrics[k].cat === cat && (samePoint(bench, k)?.n ?? 0) >= 5);

  if (mob) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {cats.map(([cat, label]) => {
          const keys = keysIn(cat);
          if (!keys.length) return null;
          return (
            <div key={cat}>
              <div style={{ fontFamily: ESANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: EC.mute, marginBottom: 8, paddingLeft: 4 }}>{label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {keys.map(k => {
                  const m = bench.metrics[k];
                  const sp = samePoint(bench, k);
                  if (!sp?.current) return null;
                  const st = rankStyle(sp.current.rank, sp.n);
                  return (
                    <button key={k} type="button" onClick={() => onOpen(k)} className="hover-lift" style={{
                      display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer",
                      background: EC.card, border: `1px solid ${EC.rule}`, borderLeft: "3px solid #b8372d", borderRadius: 3,
                      padding: "12px 14px", font: "inherit", width: "100%",
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontFamily: ESERIF, fontSize: 14, fontWeight: 500, color: EC.ink, marginBottom: 2 }}>{m.label}</span>
                        <span style={{ display: "block", fontFamily: ESANS, fontSize: 11, color: EC.mute }}>
                          Month {sp.month}{sp.byChange
                            ? (sp.avgChange != null ? ` · past avg growth ${sp.avgChange > 0 ? "+" : sp.avgChange < 0 ? "−" : ""}${Math.abs(sp.avgChange).toFixed(1)}%` : "")
                            : (sp.avg != null ? ` · past avg ${fmtBench(sp.avg, m.unit)}` : "")}
                        </span>
                      </span>
                      <span style={{ background: st.bg, color: st.fg, borderRadius: 3, padding: "6px 10px", minWidth: 74, textAlign: "center", lineHeight: 1.15, whiteSpace: "nowrap", flex: "none", display: "block" }}>
                        <span style={{ display: "block", fontFamily: ESERIF, fontWeight: 600, fontSize: 15 }}>{fmtBench(sp.current.value, m.unit)}</span>
                        <span style={{ display: "block", fontFamily: ESANS, fontSize: 11, opacity: 0.85, fontVariantNumeric: "tabular-nums", paddingRight: 1 }}>#{sp.current.rank} of {sp.n}{sp.byChange && sp.current.change != null ? ` · ${sp.current.change > 0 ? "+" : sp.current.change < 0 ? "−" : ""}${Math.abs(sp.current.change).toFixed(1)}%` : ""}</span>
                      </span>
                      <span style={{ fontSize: 18, color: EC.mute, fontWeight: 300 }}>›</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p style={{ fontFamily: ESANS, fontSize: 11.5, color: EC.mute, lineHeight: 1.5, margin: "4px 4px 0" }}>
          Trump II at its latest month for each measure, ranked against all {bench.admins.length} administrations since Nixon at the same month. Live from FRED.
        </p>
      </div>
    );
  }

  const grid = "200px repeat(6, 1fr)";
  return (
    <div style={{ background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, alignItems: "center", background: EC.paper, borderBottom: `1px solid ${EC.rule}`, padding: "10px 0", fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: EC.sub, fontWeight: 500 }}>
        <div style={{ paddingLeft: 18 }}>Metric</div>
        {SHOWN.map(id => (
          <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center" }}>
            <div style={{ color: id === "trump2" ? "#b8372d" : EC.ink, fontSize: 12, fontWeight: 500, letterSpacing: "-0.01em", textTransform: "none", fontFamily: ESERIF }}>
              {id === "trump2" && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#b8372d", marginRight: 5, verticalAlign: "middle" }} />}
              {SHORT[id]}
            </div>
            <div style={{ color: EC.mute, letterSpacing: "0.04em", fontFamily: ESANS, fontSize: 10 }}>{YEARS[id]}</div>
          </div>
        ))}
      </div>
      {cats.map(([cat, label]) => {
        const keys = keysIn(cat);
        if (!keys.length) return null;
        return (
          <div key={cat}>
            <div style={{ fontFamily: ESANS, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: EC.mute, padding: "12px 18px 4px", background: "#fbf8f3", borderTop: `1px solid ${EC.rule}` }}>{label}</div>
            {keys.map(k => {
              const m = bench.metrics[k];
              const sp = samePoint(bench, k);
              if (!sp) return null;
              return (
                <button key={k} type="button" onClick={() => onOpen(k)} className="vu-row" title={`Open ${m.label}, month by month`} style={{
                  display: "grid", gridTemplateColumns: grid, alignItems: "center", width: "100%", textAlign: "left",
                  borderTop: `1px solid ${EC.rule}`, borderLeft: "none", borderRight: "none", borderBottom: "none",
                  background: "transparent", cursor: "pointer", padding: 0, font: "inherit",
                }}>
                  <span style={{ padding: "10px 18px", display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontWeight: 500, color: EC.ink, fontSize: 13, fontFamily: ESANS }}>{m.label}</span>
                    <span style={{ fontSize: 10, color: EC.mute, letterSpacing: "0.03em", fontFamily: ESANS }}>Month {sp.month}{sp.byChange ? " · ranked by growth" : ""}</span>
                  </span>
                  {SHOWN.map(id => {
                    const r = sp.rows.find(x => x.id === id);
                    if (!r) return <span key={id} style={{ textAlign: "center", color: EC.mute, fontFamily: ESANS, fontSize: 12 }}>—</span>;
                    const st = rankStyle(r.rank, sp.n);
                    return (
                      <span key={id} style={{ margin: 3, background: st.bg, color: st.fg, borderRadius: 3, padding: "6px 2px", textAlign: "center", lineHeight: 1.15, outline: id === "trump2" ? "1.5px solid #b8372d55" : undefined }}>
                        <span style={{ display: "block", fontFamily: ESERIF, fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{fmtBench(r.value, m.unit)}</span>
                        <span style={{ display: "block", fontFamily: ESANS, fontSize: 10, opacity: 0.85 }}>#{r.rank} of {sp.n}{sp.byChange && r.change != null ? ` · ${r.change > 0 ? "+" : r.change < 0 ? "−" : ""}${Math.abs(r.change).toFixed(1)}%` : ""}</span>
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "10px 18px", background: EC.paper, borderTop: `1px solid ${EC.rule}`, fontFamily: ESANS, fontSize: 11, color: EC.sub }}>
        <span>Each president at the month Trump II has reached for that measure. Rank is out of all {bench.admins.length} administrations since Nixon (#1 = best); dollar and output measures that grow with time are ranked by their % change since inauguration instead of the level. Live from FRED.</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Ranks worse</span>
          <span style={{ display: "flex", border: `1px solid ${EC.rule}`, borderRadius: 2, overflow: "hidden" }}>
            {[0.4, 0.18].map((a, i) => <i key={"d" + i} style={{ width: 18, height: 10, display: "inline-block", background: `rgba(194,65,12,${a})` }} />)}
            <i style={{ width: 18, height: 10, display: "inline-block", background: EC.paper }} />
            {[0.2, 0.42].map((a, i) => <i key={"i" + i} style={{ width: 18, height: 10, display: "inline-block", background: `rgba(13,115,119,${a})` }} />)}
          </span>
          <span>Ranks better</span>
        </span>
      </div>
    </div>
  );
}
