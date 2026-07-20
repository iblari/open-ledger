import type { Metadata } from "next";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import feed from "../../public/observations/signals.json";

/**
 * /today — the trend-discovery feed (product plan §2, MVP job: "8-12
 * highest-confidence new signals; each card shows direction, magnitude,
 * comparison, source and updated date").
 *
 * Server-rendered and fully static: the feed JSON is produced by
 * deterministic detection over the observation store (scripts/
 * detect-signals.mjs) and committed — each data refresh triggers a
 * rebuild. No client JS, indexable, fast.
 */

export const metadata: Metadata = {
  title: "What's Changing Today — Vote Unbiased",
  description:
    "Ranked signals from the newest official data: where unemployment, incomes and housing are moving across America's counties. Every number traced to its source.",
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

function Spark({ series }: { series: NonNullable<Signal["series"]> }) {
  const vals = series.values;
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
  const W = 220, H = 40;
  // Split into contiguous segments so series gaps (2025 appropriations
  // lapse) render as visible breaks, not fabricated interpolation.
  const segs: string[] = [];
  let cur: string[] = [];
  vals.forEach((v, i) => {
    if (v == null) { if (cur.length > 1) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${(i / (vals.length - 1)) * W},${H - 4 - ((v - lo) / span) * (H - 8)}`);
  });
  if (cur.length > 1) segs.push(cur.join(" "));
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {segs.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke={C.accent} strokeWidth={1.8} />
      ))}
    </svg>
  );
}

function Card({ s, lead }: { s: Signal; lead?: boolean }) {
  const dirColor = s.direction === "improving" ? C.improveStrong : s.direction === "worsening" ? C.declineStrong : C.sub;
  return (
    <article style={{
      background: "#fff", border: `1px solid ${C.rule}`, borderTop: `3px solid ${dirColor}`,
      borderRadius: 6, padding: lead ? "20px 22px" : "16px 18px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
        fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase" as const, color: dirColor,
      }}>
        <span>{s.topic} · {s.geo.level === "nation" ? "National" : `${s.geo.name}, ${s.geo.st}`}</span>
        <span title="v1 trend score — see method note" style={{ color: C.mute, fontWeight: 500, letterSpacing: "0.04em" }}>
          score {s.score}
        </span>
      </div>
      <h2 style={{
        fontFamily: SERIF, fontSize: lead ? 26 : 19, fontWeight: lead ? 600 : 500,
        lineHeight: 1.2, letterSpacing: "-0.015em", margin: 0,
      }}>{s.headline}</h2>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" as const }}>
        <span style={{ fontFamily: SERIF, fontSize: lead ? 30 : 24, fontWeight: 700, color: dirColor, fontVariantNumeric: "tabular-nums" }}>
          {s.stat.value}
        </span>
        <span style={{ fontFamily: SANS, fontSize: 11.5, color: C.sub, lineHeight: 1.5, flex: 1, minWidth: 150 }}>
          {s.stat.label} · <strong style={{ color: C.ink }}>{s.stat.change}</strong>
        </span>
      </div>
      {s.series && <Spark series={s.series} />}
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.sub, lineHeight: 1.55 }}>{s.comparison}</div>
      {s.caveats.length > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 10, color: C.mute, lineHeight: 1.5, borderTop: `1px dashed ${C.rule}`, paddingTop: 8 }}>
          {s.caveats.join(" ")}
        </div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const }}>
        <span>{s.source.name} · {s.source.metric}</span>
        <span>{s.source.period} · retrieved {s.source.retrieved}</span>
      </div>
    </article>
  );
}

export default function TodayPage() {
  const signals = feed.signals as Signal[];
  const [lead, ...rest] = signals;
  const updated = new Date(feed.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <nav style={{ borderBottom: `1px solid ${C.rule}`, background: "#fff", padding: "12px 0" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 900, color: C.ink, textDecoration: "none" }}>Vote Unbiased</Link>
          <div style={{ display: "flex", gap: 16, fontFamily: SANS, fontSize: 13 }}>
            <Link href="/dashboard" style={{ color: C.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
            <Link href="/trends" style={{ color: C.sub, textDecoration: "none", fontWeight: 500 }}>Trends</Link>
            <Link href="/live" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>Live</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 48px" }}>
        <header style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.sub, fontWeight: 500, marginBottom: 8 }}>
            The signal feed · updated {updated}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 400, letterSpacing: "-0.022em", lineHeight: 1.05, margin: 0 }}>
            What&rsquo;s changing <em style={{ fontStyle: "italic", color: C.accent }}>today.</em>
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 13.5, color: C.sub, maxWidth: "62ch", lineHeight: 1.6, marginTop: 10 }}>
            Signals detected by arithmetic over the newest official data — {feed.universe.counties.toLocaleString()} counties,
            latest print {feed.universe.period}. No editorial selection: every card carries its number, its comparison,
            its caveats and its source. Slower-moving annual analyses live in <Link href="/trends" style={{ color: "#1d4ed8" }}>Trends</Link>.
          </p>
        </header>

        <div style={{ marginBottom: 12 }}>
          <Card s={lead} lead />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {rest.map(s => <Card key={s.id} s={s} />)}
        </div>

        <footer style={{ marginTop: 24, fontFamily: SANS, fontSize: 10.5, color: C.mute, lineHeight: 1.6, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
          <strong style={{ color: C.sub }}>Method:</strong> {feed.formula} Detection runs on every data refresh;
          the feed is fully reproducible from public sources.
        </footer>
      </main>
    </div>
  );
}
