import { C, SERIF, SANS } from "@/lib/design-tokens";
import type { Trend } from "@/lib/state-trends";

const fmt = (t: Trend, v: number) => `${t.unit === "%" && t.key !== "jobs" && t.key !== "taxes" && v > 0 ? "+" : ""}${v.toFixed(1)}${t.unit === "%" ? "%" : ""}`;

/** One small bar chart per measure, last ten years, latest value on top. */
export default function StateTrends({ name, trends }: { name: string; trends: Trend[] }) {
  if (!trends.length) return null;
  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 30, letterSpacing: "-0.015em", margin: 0 }}>{name}, last 10 years</h2>
      <div className="st-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 14 }}>
        {trends.map(t => {
          const pts = t.points; const real = pts.filter(p => p.v != null) as { y: number; v: number; partial?: boolean }[];
          if (!real.length) return null;
          const last = real[real.length - 1];
          const max = Math.max(...real.map(p => Math.abs(p.v))) || 1;
          const neg = real.some(p => p.v < 0);
          return (
            <a key={t.key} href={t.url} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 14, padding: "12px 14px", textDecoration: "none", color: C.ink, fontFamily: SANS }}>
              <div style={{ fontSize: 12.5, color: C.sub }}>{t.label}{t.scope ? ` · ${t.scope}` : ""}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <span style={{ fontFamily: SERIF, fontSize: 26 }}>{fmt(t, last.v)}{t.unit !== "%" ? <span style={{ fontSize: 13, color: C.sub }}>{t.unit}</span> : null}</span>
                <span style={{ fontSize: 12, color: C.mute }}>{last.y}{last.partial ? " so far" : ""}</span>
              </div>
              <div role="img" aria-label={`${t.label}: ${real.map(p => `${p.y} ${p.v}`).join(", ")}`} style={{ display: "flex", gap: 3, height: 54, marginTop: 8, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, right: 0, top: neg ? "50%" : "100%", borderTop: `1px solid ${C.rule}` }} />
                {pts.map(p => {
                  if (p.v == null) return <span key={p.y} title={`${p.y}: no data`} style={{ flex: 1 }} />;
                  const h = Math.max(3, (Math.abs(p.v) / max) * (neg ? 50 : 100));
                  return (
                    <span key={p.y} title={`${p.y}: ${fmt(t, p.v)}`} style={{ flex: 1, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, right: 0, height: `${h}%`, ...(p.v >= 0 ? { bottom: neg ? "50%" : 0 } : { top: "50%" }), background: p.partial ? C.accent : C.ink, opacity: p.v < 0 ? 0.35 : 0.8, borderRadius: 1 }} />
                    </span>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.mute, marginTop: 4 }}><span>{pts[0].y}</span><span>{t.source}{t.note ? ` · ${t.note}` : ""} ↗</span><span>{pts[pts.length - 1].y}</span></div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
