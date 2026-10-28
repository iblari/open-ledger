import Link from "next/link";
import type { BenchMetric } from "@/lib/bench-lens";
import { ADMINS, type MetricInfo, fredUrl } from "@/lib/seo-catalog";
import { fmtV, fmtPct, fmtChange, type RankTable } from "@/lib/seo-bench";
import { C } from "@/lib/design-tokens";

/** Crawlable comparison table: every administration at the same month in office. */
export default function RankTableView({ info, m, t, highlight }: { info: MetricInfo; m: BenchMetric; t: RankTable; highlight?: string | null }) {
  const th: React.CSSProperties = { textAlign: "left", padding: "9px 12px", fontSize: 12, fontWeight: 700, color: C.sub, borderBottom: `1px solid ${C.rule}`, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "9px 12px", fontSize: 14, borderBottom: `1px solid ${C.rule}`, verticalAlign: "top" };
  const meanTxt = t.byChange ? fmtPct(t.meanChange) : t.mean != null ? fmtV(m, t.mean) : "—";
  return (
    <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <caption style={{ textAlign: "left", padding: "12px 12px 4px", fontSize: 13, color: C.sub, captionSide: "top" }}>
          {info.name} at month {t.month + 1} in office, {t.n} administrations ranked {t.byChange ? "on % change since month 1" : t.lowerBetter ? "lowest (best) to highest" : "highest (best) to lowest"}. Average of all {t.n}: {meanTxt}.
        </caption>
        <thead><tr>
          <th style={th}>Rank</th><th style={th}>Administration</th><th style={th}>Value at month {t.month + 1}</th>
          <th style={th}>Change since month 1</th><th style={th}>Latest / end of month 48</th><th style={th}>Primary federal source</th>
        </tr></thead>
        <tbody>
          {t.rows.map(r => {
            const a = ADMINS.find(x => x.id === r.id);
            const on = r.id === highlight || (!highlight && r.current);
            return (
              <tr key={r.id} style={on ? { background: "#fbf3ef" } : undefined}>
                <td style={{ ...td, fontWeight: 700 }}>#{r.rank}</td>
                <td style={td}>{a ? <Link href={`/economy/${a.slug}/${info.slug}`} style={{ color: C.ink, fontWeight: on ? 700 : 500 }}>{a.full}</Link> : r.name}{r.current ? <span style={{ color: C.mute, fontSize: 12 }}> · in office</span> : null}</td>
                <td style={td}>{fmtV(m, r.value)}</td>
                <td style={td}>{fmtChange(m, r.start, r.value)}</td>
                <td style={td}>{r.last != null ? `${fmtV(m, r.last)} (month ${r.lastMonth + 1})` : "—"}</td>
                <td style={{ ...td, fontSize: 12.5 }}>{info.agency.replace(/ \(.*\)$/, "")} · {info.series.map((s, i) => <span key={s}>{i ? ", " : ""}<a href={fredUrl(s)} style={{ color: C.sub }}>{s}</a></span>)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
