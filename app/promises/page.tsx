import type { Metadata } from "next";
import Brand from "@/components/Brand";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import { STATUS_LABEL, STATUS_COLOR, type PromiseFile, type PromiseRecord, type PromiseStatus } from "@/lib/promises";

/**
 * /promises — the longitudinal accountability archive.
 *
 * Live fact-checking answers "is that true right now?". This answers the
 * harder question no newsroom sustains: "you said you would — did you?".
 * Promises are captured verbatim, stored permanently, and re-scored by
 * deterministic arithmetic every time new official data lands.
 */

export const metadata: Metadata = {
  title: "Promise Tracker — Vote Unbiased",
  description:
    "Every quantified promise made by officials, scored against official data as it arrives. Kept, partially kept, broken, or too early to tell — with the numbers shown.",
};
export const revalidate = 900;

const ORDER: PromiseStatus[] = ["broken", "partial", "kept", "pending", "unresolvable"];

async function load(): Promise<PromiseFile | null> {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://voteunbiased.org";
    const r = await fetch(`${base}/api/promises`, { next: { revalidate: 900 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function Bar({ pct, color }: { pct: number; color: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 6, background: C.rule, borderRadius: 3, overflow: "hidden", margin: "8px 0 4px" }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function Card({ p }: { p: PromiseRecord }) {
  const st = (p.resolution?.status ?? "pending") as PromiseStatus;
  const color = STATUS_COLOR[st];
  const pct = p.resolution?.progressPct;
  return (
    <article style={{
      background: "#fff", border: `1px solid ${C.rule}`, borderLeft: `4px solid ${color}`,
      borderRadius: 6, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{
          fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em",
          textTransform: "uppercase", color: "#fff", background: color, padding: "3px 9px", borderRadius: 4,
        }}>{STATUS_LABEL[st]}</span>
        <span style={{ fontFamily: SANS, fontSize: 10, color: C.mute }}>
          {p.speaker} · {new Date(p.spokenAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>
      <blockquote style={{
        fontFamily: SERIF, fontSize: 17, fontWeight: 500, fontStyle: "italic",
        lineHeight: 1.35, margin: "0 0 10px", color: C.ink,
      }}>&ldquo;{p.quote}&rdquo;</blockquote>
      {typeof pct === "number" && (
        <>
          <Bar pct={pct} color={color} />
          <div style={{ fontFamily: SANS, fontSize: 10.5, color: C.sub, fontWeight: 600 }}>
            {pct}% of the way to the promised number
          </div>
        </>
      )}
      {p.resolution && (
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.sub, lineHeight: 1.6, marginTop: 8 }}>
          {p.resolution.evidence}
        </div>
      )}
      <div style={{
        display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
        fontFamily: SANS, fontSize: 9.5, color: C.mute, marginTop: 10,
        borderTop: `1px dashed ${C.rule}`, paddingTop: 8,
      }}>
        <span>
          {p.sourceUrl ? (
            <a href={p.videoTime ? `${p.sourceUrl}&t=${p.videoTime}` : p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>
              ▶ {p.sourceTitle}
            </a>
          ) : p.sourceTitle}
        </span>
        <span>{p.resolution?.source} {p.resolution?.asOf ? `· ${p.resolution.asOf}` : ""}</span>
      </div>
    </article>
  );
}

export default async function PromisesPage() {
  const file = await load();
  const promises = file?.promises ?? [];
  const counts = promises.reduce<Record<string, number>>((a, p) => {
    const s = p.resolution?.status ?? "pending"; a[s] = (a[s] || 0) + 1; return a;
  }, {});
  const sorted = [...promises].sort(
    (a, b) => ORDER.indexOf((a.resolution?.status ?? "pending") as PromiseStatus) - ORDER.indexOf((b.resolution?.status ?? "pending") as PromiseStatus)
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <nav style={{ borderBottom: `1px solid ${C.rule}`, background: "#fff", padding: "12px 0" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand />
          <div style={{ display: "flex", gap: 16, fontFamily: SANS, fontSize: 13 }}>
            <Link href="/today" style={{ color: C.sub, textDecoration: "none", fontWeight: 500 }}>Today</Link>
            <Link href="/dashboard" style={{ color: C.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
            <Link href="/live" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>● Live</Link>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "30px 20px 50px" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 10 }}>
          The accountability archive
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 400, letterSpacing: "-0.022em", lineHeight: 1.05, margin: 0 }}>
          They said they would. <em style={{ fontStyle: "italic", color: C.accent }}>Did they?</em>
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 14, color: C.sub, maxWidth: "60ch", lineHeight: 1.65, marginTop: 12 }}>
          Quantified promises captured from official speeches and live coverage, then re-scored automatically
          every time new official data lands. We report whether the <strong>number</strong> was reached —
          never whether the speaker caused it. Presidents influence perhaps 10&ndash;30% of these outcomes.
        </p>

        {promises.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 18px" }}>
            {ORDER.filter(s => counts[s]).map(s => (
              <span key={s} style={{
                display: "inline-flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 11.5,
                background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 20, padding: "5px 13px",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[s] }} />
                <strong>{counts[s]}</strong> {STATUS_LABEL[s].toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {promises.length === 0 ? (
          <div style={{
            background: "#fff", border: `1px dashed ${C.rule}`, borderRadius: 6,
            padding: "34px 24px", textAlign: "center", marginTop: 24,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗂️</div>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, marginBottom: 6 }}>The archive is being built</div>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.sub, lineHeight: 1.6, maxWidth: "48ch", margin: "0 auto" }}>
              Promises are mined from archived speeches and captured live during broadcasts.
              Each one is stored with its exact wording, then scored the moment the data exists to settle it.
            </p>
            <Link href="/live" style={{ display: "inline-block", marginTop: 14, fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "#1d4ed8", textDecoration: "none" }}>
              See live fact-checking →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sorted.map(p => <Card key={p.id} p={p} />)}
          </div>
        )}

        <footer style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute, lineHeight: 1.65, marginTop: 26, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          <strong style={{ color: C.sub }}>Method:</strong> {file?.method || "Promises are captured verbatim, then scored deterministically against official series."}
          {" "}Extraction records wording and structure only; every verdict is arithmetic, reproducible from the cited series.
          Promises without a measurable target are kept in the archive and labelled as such rather than dropped.
        </footer>
      </main>
    </div>
  );
}
