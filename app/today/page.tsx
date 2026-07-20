import type { Metadata } from "next";
import Link from "next/link";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { STATE_NAME_TO_CODE } from "@/lib/state-data";
import TodayExplorer from "@/components/TodayExplorer";
import TodaySubscribe from "@/components/TodaySubscribe";
import feed from "../../public/observations/signals.json";

/**
 * /today — the trend-discovery front page (design: "See the economic and
 * social shifts reshaping America"), rendered in the site's editorial
 * palette with REAL data end to end:
 *  - ranked signals from the deterministic engine (BLS LAUS monthly + ACS annual)
 *  - state map of where unemployment is moving (labor-force-weighted YoY)
 *  - county spotlight + search across all 3,200 county-equivalents
 * Server-rendered/static; the two interactive islands (search, email) load
 * after paint. Rebuilt automatically on every observation refresh.
 */

export const metadata: Metadata = {
  title: "What's Changing in America — Vote Unbiased",
  description:
    "Emerging economic signals across states and counties — detected from official data, explained with evidence, traced to the source.",
};
export const dynamic = "force-static";

interface Signal {
  id: string; rank: number; topic: string;
  geo: { level: string; fips: string; name: string; st: string };
  headline: string; direction: string;
  stat: { value: string; label: string; change: string };
  comparison: string; score: number; caveats: string[];
  series: { periods: string[]; values: (number | null)[] } | null;
  source: { name: string; url: string; metric: string; period: string; retrieved: string };
}

const TOPIC_LABEL: Record<string, string> = { jobs: "Jobs & wages", housing: "Housing", population: "Population" };
const TOPIC_FRESH: Record<string, string> = { jobs: "Monthly · BLS", housing: "Annual · Census", population: "Annual · Census" };

/** Server-rendered choropleth: state labor-force-weighted unemployment YoY. */
async function ChangeMap() {
  let features: FeatureCollection<Geometry, { name: string }> | null = null;
  try {
    const topo = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", {
      next: { revalidate: false },
    }).then(r => r.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features = topoFeature(topo, topo.objects.states) as any;
  } catch { return null; }
  if (!features) return null;
  const proj = geoAlbersUsa().fitExtent([[0, 0], [460, 290]], features);
  const pathFn = geoPath(proj);
  const comps = feed.stateComposites as Record<string, { yoy: number; counties: number }>;
  const color = (yoy: number | undefined) => {
    if (yoy == null) return C.rule;
    const t = Math.min(1, Math.abs(yoy) / 0.8);
    const a = 0.15 + t * 0.75;
    return yoy > 0 ? `rgba(194,65,12,${a})` : `rgba(13,115,119,${a})`;
  };
  return (
    <div>
      <svg viewBox="0 0 460 290" style={{ width: "100%", height: "auto", display: "block" }} role="img"
        aria-label="Map of unemployment change by state, year over year">
        {features.features.map(f => {
          const code = STATE_NAME_TO_CODE[f.properties.name];
          const comp = code ? comps[code] : undefined;
          return (
            <path key={String(f.id)} d={pathFn(f) || undefined}
              fill={color(comp?.yoy)} stroke="#fff" strokeWidth={0.6}>
              <title>{f.properties.name}: {comp ? `${comp.yoy > 0 ? "+" : ""}${comp.yoy}pp unemployment YoY` : "no data"}</title>
            </path>
          );
        })}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 9.5, color: C.sub, marginTop: 8 }}>
        improving
        <span style={{ display: "inline-flex", borderRadius: 2, overflow: "hidden", border: `1px solid ${C.rule}` }}>
          {["rgba(13,115,119,0.8)", "rgba(13,115,119,0.4)", "#f3ede5", "rgba(194,65,12,0.4)", "rgba(194,65,12,0.8)"].map((bg, i) => (
            <span key={i} style={{ width: 18, height: 9, background: bg }} />
          ))}
        </span>
        worsening · unemployment YoY, labor-force weighted
      </div>
    </div>
  );
}

export default async function TodayPage() {
  const signals = feed.signals as Signal[];
  const ranked = signals.filter(s => s.geo.level === "nation" || s.rank <= 4).slice(0, 6);
  const updated = new Date(feed.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const map = await ChangeMap();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      {/* ── Nav ── */}
      <nav style={{ borderBottom: `1px solid ${C.rule}`, background: "#fff", padding: "12px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
            <Link href="/" style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 900, color: C.ink, textDecoration: "none" }}>Vote Unbiased</Link>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.ink, borderBottom: `2px solid ${C.accent}`, paddingBottom: 2 }}>Today</span>
            <Link href="/trends" style={{ fontFamily: SANS, fontSize: 13, color: C.sub, textDecoration: "none", fontWeight: 500 }}>Trends</Link>
            <Link href="/dashboard" style={{ fontFamily: SANS, fontSize: 13, color: C.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11, color: C.sub }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0d7377" }} />
              Sources current
            </span>
            <Link href="/live" style={{ fontFamily: SANS, fontSize: 13, color: C.accent, textDecoration: "none", fontWeight: 700 }}>● Live</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 20px 0" }}>
        {/* ── Hero ── */}
        <header style={{ marginBottom: 26 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.sub, fontWeight: 500, marginBottom: 10 }}>
            What is changing now · updated {updated}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(30px, 5.5vw, 46px)", fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.05, margin: 0, maxWidth: "22ch" }}>
            See the economic and social shifts <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 400 }}>reshaping America.</em>
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 14, color: C.sub, maxWidth: "58ch", lineHeight: 1.6, margin: "12px 0 0" }}>
            Emerging signals across states and counties — detected from official data by open arithmetic,
            explained with evidence, and linked to the source. No editorial selection.
          </p>
        </header>

        {/* ── Main grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)", gap: 24, alignItems: "start" }} className="today-grid">
          {/* Left: ranked signals */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" as const }}>
              <h2 style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, margin: 0 }}>Top signals today</h2>
              <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute }}>ranked by magnitude, acceleration, persistence &amp; peer divergence</span>
            </div>
            {ranked.map((s, i) => {
              const dirColor = s.direction === "improving" ? C.improveStrong : s.direction === "worsening" ? C.declineStrong : C.sub;
              return (
                <article key={s.id} style={{
                  display: "grid", gridTemplateColumns: "34px minmax(0,1fr) minmax(120px, 150px)", gap: 14,
                  background: "#fff", border: `1px solid ${C.rule}`, borderLeft: `3px solid ${dirColor}`,
                  borderRadius: 6, padding: "14px 16px", marginBottom: 10, alignItems: "start",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", background: C.paper, border: `1px solid ${C.rule}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: SERIF, fontSize: 14, fontWeight: 700, color: C.sub,
                  }}>{i + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: dirColor, marginBottom: 4 }}>
                      {TOPIC_LABEL[s.topic] || s.topic}
                      <span style={{ color: C.mute, fontWeight: 500, marginLeft: 8, letterSpacing: "0.04em" }}>{TOPIC_FRESH[s.topic]}</span>
                    </div>
                    <h3 style={{ fontFamily: SERIF, fontSize: 17.5, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em", margin: "0 0 5px" }}>{s.headline}</h3>
                    <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.sub, lineHeight: 1.55 }}>{s.comparison}</div>
                    <div style={{ fontFamily: SANS, fontSize: 9, color: C.mute, marginTop: 6 }}>
                      {s.source.name} · {s.source.period}{s.caveats.length > 0 ? ` · ${s.caveats[0]}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const }}>
                    <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 700, color: dirColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.stat.value}</div>
                    <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, lineHeight: 1.45, marginTop: 4 }}>{s.stat.label}</div>
                  </div>
                </article>
              );
            })}

            {/* Topic lenses */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 14 }}>
              {Object.entries(TOPIC_LABEL).map(([k, label]) => (
                <span key={k} style={{
                  fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: C.ink,
                  background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "8px 14px",
                }}>{label}</span>
              ))}
              {["Business", "Health", "Risk"].map(l => (
                <span key={l} title="Data source lands in a later phase" style={{
                  fontFamily: SANS, fontSize: 11.5, fontWeight: 500, color: C.mute,
                  background: "transparent", border: `1px dashed ${C.rule}`, borderRadius: 6, padding: "8px 14px",
                }}>{l} · soon</span>
              ))}
            </div>
          </section>

          {/* Right rail: map + search/spotlight */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "16px 18px" }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, marginBottom: 2 }}>Where unemployment is moving</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: C.mute, marginBottom: 10 }}>Year-over-year change · {feed.universe.period}</div>
              {map ?? <div style={{ fontFamily: SANS, fontSize: 11, color: C.mute }}>Map unavailable this build.</div>}
            </div>
            <TodayExplorer initial={feed.spotlight} periods={(feed.spotlight?.series.periods as string[]) || []} />
          </aside>
        </div>

        {/* ── Trust band ── */}
        <section style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16,
          borderTop: `1px solid ${C.rule}`, margin: "30px -20px 0", padding: "24px 20px 34px", background: C.paper,
        }}>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Context without commentary</div>
            <p style={{ fontFamily: SANS, fontSize: 12, color: C.sub, lineHeight: 1.65, margin: 0, maxWidth: "44ch" }}>
              Every signal shows its exact period, comparison, calculation, source and caveats.
              Detection is open arithmetic — it never invents evidence or assigns political blame.
            </p>
            <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.improveStrong, fontWeight: 700, marginTop: 8 }}>
              ✓ Official sources · transparent calculations
            </div>
          </div>
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Data powering this view</div>
            <p style={{ fontFamily: SANS, fontSize: 12, color: C.sub, lineHeight: 1.65, margin: "0 0 10px", maxWidth: "44ch" }}>
              A shared geography and metric layer makes every state and county directly comparable.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {["Census", "BLS"].map(s => (
                <span key={s} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: C.ink, background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "4px 12px" }}>{s}</span>
              ))}
              {["BEA", "FHFA", "CDC", "FEMA"].map(s => (
                <span key={s} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 500, color: C.mute, border: `1px dashed ${C.rule}`, borderRadius: 12, padding: "4px 12px" }}>{s} · soon</span>
              ))}
            </div>
          </div>
          <div style={{ background: C.ink, borderRadius: 8, padding: "18px 20px" }}>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: "#f8f5f0", marginBottom: 4 }}>The weekly signal</div>
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: "#b8b0a8", lineHeight: 1.55, margin: "0 0 12px" }}>
              The most important shifts — before they become headlines.
            </p>
            <TodaySubscribe />
          </div>
        </section>

        <footer style={{ fontFamily: SANS, fontSize: 10, color: C.mute, lineHeight: 1.6, padding: "14px 0 30px" }}>
          <strong style={{ color: C.sub }}>Method:</strong> {feed.formula}
        </footer>
      </main>

      {/* Single responsive rule: stack the grid on narrow screens */}
      <style>{`@media (max-width: 800px){ .today-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
