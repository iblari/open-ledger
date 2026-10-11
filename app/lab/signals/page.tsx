import type { Metadata } from "next";
import { getScorecard, type ScoreRow, type Flag } from "@/lib/signal-score";
import { SERIF, SANS } from "@/lib/design-tokens";

/**
 * /lab/signals — internal scorecard: does the agenda radar predict anything?
 * Not linked from the site and kept out of search. See lib/signal-score.ts.
 */
export const metadata: Metadata = { title: "Signal scorecard (lab)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const V: Record<ScoreRow["verdict"], [string, string, string]> = {
  "beats chance": ["Beats chance", "#085041", "#E1F5EE"],
  promising: ["Promising", "#0C447C", "#E6F1FB"],
  "no edge": ["No edge", "#791F1F", "#FCEBEB"],
  collecting: ["Collecting", "#444441", "#F1EFE8"],
};
const R: Record<Flag["result"], [string, string]> = { hit: ["Hit", "#0E7477"], miss: ["Miss", "#C2410C"], pending: ["Pending", "#4A6E8A"] };
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function SignalsLab() {
  const s = await getScorecard().catch(() => null);
  const th: React.CSSProperties = { textAlign: "left", fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8C8479", padding: "8px 8px", borderBottom: "1px solid #DFD9CF" };
  const td: React.CSSProperties = { padding: "8px 8px", borderBottom: "1px solid #EFEAE2", fontSize: 13.5, verticalAlign: "top" };
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 20px 60px", fontFamily: SANS, color: "#14110E", background: "#F8F5F0", minHeight: "100vh" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8C8479" }}>Lab · internal</div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 30, margin: "4px 0 6px" }}>Does the radar predict anything?</h1>
      <p style={{ fontSize: 14, color: "#5F5850", lineHeight: 1.6, maxWidth: "70ch", margin: 0 }}>
        Every time a subject is flagged Watch, Rising or New, a 21-day window opens. A <b>hit</b> means the matching real-world thing happened inside it.
        <b> Chance</b> is how often that thing happens in any 21-day window over the past year. A subject only counts as predictive once its hits clearly beat chance over 8+ resolved flags.
      </p>
      {!s ? <p style={{ marginTop: 24 }}>No scorecard yet — the first daily run builds it.</p> : (
        <>
          <p style={{ fontSize: 12.5, color: "#8C8479", marginTop: 10 }}>
            {s.flags.length} flags since {fmt(s.since)} (backtest + live) · {s.sources.frDocs} presidential documents · prices: {Object.entries(s.sources.series).map(([k, n]) => `${k} ${n}`).join(", ")}
          </p>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: "22px 0 8px" }}>Scorecard</h2>
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #DFD9CF", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr><th style={th}>Subject</th><th style={th}>Checked against</th><th style={th}>Hits / resolved</th><th style={th}>By chance</th><th style={th}>Pending</th><th style={th}>Verdict</th></tr></thead>
              <tbody>
                {s.rows.map(r => {
                  const [l, fg, bg] = V[r.verdict];
                  return (
                    <tr key={r.key}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                      <td style={{ ...td, color: "#5F5850", fontSize: 12.5 }}>{r.outcome}</td>
                      <td style={td}><b>{r.hits}</b> / {r.resolved}</td>
                      <td style={{ ...td, color: "#5F5850" }}>{r.expected} <span style={{ fontSize: 11.5 }}>({Math.round(r.baseRate * 100)}% per window)</span></td>
                      <td style={{ ...td, color: "#5F5850" }}>{r.pending}</td>
                      <td style={td}><span style={{ fontSize: 11.5, fontWeight: 700, color: fg, background: bg, padding: "2px 8px", borderRadius: 99 }}>{l}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 20, margin: "26px 0 8px" }}>Every flag</h2>
          <div style={{ background: "#fff", border: "1px solid #DFD9CF", borderRadius: 10 }}>
            {s.flags.map(f => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 80px", gap: 10, padding: "8px 12px", borderTop: "1px solid #EFEAE2", fontSize: 13 }}>
                <span style={{ color: "#8C8479" }}>{fmt(f.opened)}</span>
                <span>
                  <b>{f.label}</b> <span style={{ color: "#8C8479" }}>· {f.status}{f.source === "backtest" ? " · backtest" : ""} · until {fmt(f.windowEnd)}</span>
                  {f.evidence && <div style={{ color: "#5F5850", fontSize: 12.5 }}>{fmt(f.evidence.date)}: {f.evidence.url ? <a href={f.evidence.url} style={{ color: "#0E7477" }}>{f.evidence.text}</a> : f.evidence.text}</div>}
                </span>
                <span style={{ textAlign: "right", fontWeight: 700, fontSize: 12, color: R[f.result][1] }}>{R[f.result][0]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
