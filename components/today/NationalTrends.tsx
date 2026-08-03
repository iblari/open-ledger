import { C, SERIF, SANS } from "@/lib/design-tokens";
import store from "../../public/observations/series.json";

/**
 * National / global trend cards for /today.
 *
 * Server component, zero client JS: the sparklines are plain SVG paths built
 * at build time. A trends page that needs a charting library to draw a
 * 40-point line is paying 60kB for nothing, and it would stop the page being
 * statically indexable — which is the whole point of /today.
 *
 * Attribution is rendered FROM THE DATA, not hard-coded here. Epoch AI is
 * CC-BY, and a licence that requires credit should not depend on a developer
 * remembering to type it into the markup.
 */

interface Point { t: string; v: number; label?: string }
interface Series {
  id: string; topic: string; label: string; unit: string;
  cadence: string; geography: string;
  points: Point[];
  latest: Point; first: Point;
  score?: number; yoy?: number;
  /** "oom" for log-scaled series, where a percent change is meaningless. */
  changeUnit?: "percent" | "oom";
  changeWindowDays?: number;
  comparedWith?: { t: string; v: number };
  confidenceNotes?: string[];
  source: {
    id: string; name: string; url: string; licence: string;
    licenceUrl?: string; attribution?: string; note?: string;
  };
}

const TOPIC_LABEL: Record<string, string> = {
  ai: "AI", commerce: "Commerce", traffic: "Traffic",
  housing: "Housing", jobs: "Jobs & wages", population: "Population",
};

const nf = (n: number, d = 1) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Human-readable value. Each unit needs its own treatment — "277166 M miles"
 *  is technically right and completely unreadable. */
function fmt(v: number, unit: string): string {
  if (unit === "%") return `${nf(v)}%`;
  if (unit === "index") return nf(v);
  if (unit === "M miles") return `${nf(v / 1000, 1)}bn miles`;
  if (unit === "log10 FLOP") return `10^${nf(v)} FLOP`;
  return nf(v);
}

/** Sparkline over the last `take` points, normalised to its own range. */
function Spark({ points, take = 40, w = 150, h = 34, stroke }: {
  points: Point[]; take?: number; w?: number; h?: number; stroke: string;
}) {
  const pts = points.slice(-take);
  if (pts.length < 2) return null;
  const vs = pts.map(p => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block" }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.v)} r={2.4} fill={stroke} />
    </svg>
  );
}

function Card({ s }: { s: Series }) {
  const up = (s.yoy ?? 0) >= 0;
  // Deliberately NOT green/red. Whether rising e-commerce or rising traffic is
  // "good" is a political judgement, and this page doesn't make those. Colour
  // encodes direction only.
  const dir = up ? C.ink : C.sub;
  const windowLabel =
    s.changeWindowDays == null ? null
      // "year on year" already carries the per-year sense, so an oom series
      // must not also append it — that read "year on year per year".
      : s.changeWindowDays >= 350 && s.changeWindowDays <= 380 ? "year on year"
      : `annualised from ${Math.round(s.changeWindowDays / 30)} months`;

  return (
    <article style={{
      background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.mute }}>
            {TOPIC_LABEL[s.topic] || s.topic}
          </div>
          <h3 style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: C.ink, margin: "3px 0 0", lineHeight: 1.25 }}>
            {s.label}
          </h3>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmt(s.latest.v, s.unit)}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 10, color: C.mute, marginTop: 3 }}>
            {s.latest.t}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: dir, fontVariantNumeric: "tabular-nums" }}>
            {s.changeUnit === "oom"
              ? `${up ? "+" : ""}${nf(s.yoy ?? 0)} orders of magnitude`
              : `${up ? "+" : ""}${nf(s.yoy ?? 0)}%`}
          </div>
          {windowLabel && (
            <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, marginTop: 1 }}>{windowLabel}</div>
          )}
          {s.comparedWith && (
            <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute }}>
              from {fmt(s.comparedWith.v, s.unit)} · {s.comparedWith.t}
            </div>
          )}
        </div>
        <Spark points={s.points} stroke={dir} />
      </div>

      {/* The running-max series names the model holding the record; a flat
          line is only meaningful if you can see what it is flat AT. */}
      {s.latest.label && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.sub }}>
          Current record: <strong style={{ fontWeight: 600 }}>{s.latest.label}</strong>
        </div>
      )}

      {/* Provenance. Every card names its publisher, cadence and licence —
          the same contract the live fact-checker holds itself to. */}
      <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, lineHeight: 1.5 }}>
          <a href={s.source.url} target="_blank" rel="noopener noreferrer" style={{ color: C.sub, textDecoration: "none", fontWeight: 600 }}>
            {s.source.name}
          </a>
          {" · "}{s.cadence}
          {s.source.licence !== "public-domain" && (
            <>
              {" · "}
              <a href={s.source.licenceUrl || "#"} target="_blank" rel="noopener noreferrer" style={{ color: C.mute }}>
                {s.source.licence}
              </a>
            </>
          )}
        </div>
        {s.source.attribution && (
          <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, marginTop: 3, fontStyle: "italic" }}>
            {s.source.attribution}
          </div>
        )}
        {(s.confidenceNotes?.length ?? 0) > 0 && (
          <div style={{ fontFamily: SANS, fontSize: 9.5, color: C.mute, marginTop: 3 }}>
            Caveat: {s.confidenceNotes!.join("; ")}.
          </div>
        )}
      </div>
    </article>
  );
}

export default function NationalTrends() {
  const series = (store.series as unknown as Series[]).filter(s => s.points?.length > 1);
  if (!series.length) return null;
  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, color: C.ink, margin: 0 }}>
          Across the country
        </h2>
        <span style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute }}>
          Ranked by how much each has moved · {store.series.length} series
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 12, color: C.sub, lineHeight: 1.6, margin: "0 0 14px", maxWidth: "62ch" }}>
        National measures, scored the same way as the local signals above: size of the change,
        whether it is accelerating, whether it has held, and how unusual it is against the
        series&rsquo; own history.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(268px, 1fr))", gap: 12 }}>
        {series.map(s => <Card key={s.id} s={s} />)}
      </div>
    </section>
  );
}
