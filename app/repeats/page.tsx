import type { Metadata } from "next";
import Brand from "@/components/Brand";
import Link from "next/link";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import type { RepeatCluster, DriftPair } from "@/lib/repeat-claims";

/**
 * /repeats — the same claim, said again.
 *
 * Everything here is a count of things that happened, which is why it carries
 * no confidence intervals and no trend line. Ten broadcasts cannot support an
 * "is he getting more accurate?" claim, but they can support "he has said this
 * four times" — that is a census of the record, not an estimate drawn from it.
 */

export const metadata: Metadata = {
  title: "Repeat claims — Vote Unbiased",
  description:
    "Claims made more than once across broadcasts, with every occurrence, its date and how we rated it each time.",
};
export const revalidate = 900;

const VERDICT_COLOR: Record<string, string> = {
  "TRUE": C.improveStrong,
  "MOSTLY TRUE": C.improveMed,
  "MISLEADING": C.gold,
  "FALSE": C.accent,
  "PROJECTION": C.mute,
  "UNCONFIRMED": C.mute,
  "UNVERIFIABLE": C.mute,
};

interface Payload {
  ok: boolean;
  totals: { claims: number; repeatedClaims: number; clusters: number; inconsistentlyRated: number };
  clusters: RepeatCluster[];
  drift: DriftPair[];
}

async function load(): Promise<Payload | null> {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://voteunbiased.org";
    const r = await fetch(`${base}/api/repeats`, { next: { revalidate: 900 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function Verdict({ rating }: { rating: string }) {
  const color = VERDICT_COLOR[rating] ?? C.mute;
  return (
    <span style={{
      fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      color, border: `1px solid ${color}`, borderRadius: 3, padding: "2px 6px",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{rating || "—"}</span>
  );
}

function Cluster({ c }: { c: RepeatCluster }) {
  return (
    <article style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "16px 18px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600 }}>
          Said {c.occurrences.length} times
        </span>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.sub }}>
          across {c.days.length} {c.days.length === 1 ? "day" : "days"}
          {c.speakers.length > 1 && ` · ${c.speakers.join(" and ")}`}
        </span>
        {c.verdictInconsistent && (
          <span style={{
            fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: C.gold,
            background: C.highlight, border: `1px solid ${C.gold}`,
            borderRadius: 3, padding: "3px 8px",
          }}>WE RATED IT DIFFERENTLY</span>
        )}
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {c.occurrences.map((o, i) => (
          <li key={i} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            borderLeft: `2px solid ${C.rule}`, paddingLeft: 12,
          }}>
            <span style={{
              fontFamily: SANS, fontSize: 11, color: C.mute, minWidth: 74,
              flexShrink: 0, paddingTop: 2,
            }}>{o.day}</span>
            <blockquote style={{
              fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.5, margin: 0, flex: 1,
            }}>
              &ldquo;{o.quote}&rdquo;
              <span style={{ display: "block", fontFamily: SANS, fontSize: 11, color: C.mute, marginTop: 3 }}>
                {o.speaker ?? "speaker not attributed"}
              </span>
            </blockquote>
            <Verdict rating={o.rating} />
          </li>
        ))}
      </ol>
    </article>
  );
}

export default async function RepeatsPage() {
  const data = await load();
  const clusters = data?.clusters ?? [];
  const drift = data?.drift ?? [];
  const t = data?.totals;

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
          The same claim, again
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 400, letterSpacing: "-0.022em", lineHeight: 1.05, margin: 0 }}>
          Claims made more than once
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 14, color: C.sub, lineHeight: 1.65, maxWidth: "62ch", marginTop: 12 }}>
          A single fact-check answers whether a statement was true that day. This answers
          something else: how often the same statement comes back after being checked.
          Every occurrence is listed with the date it was said and the verdict it drew.
        </p>

        {t && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 22px" }}>
            {[
              [`${t.repeatedClaims}`, `of ${t.claims} claims are repeats`],
              [`${t.clusters}`, "distinct claims repeated"],
              [`${t.inconsistentlyRated}`, "rated inconsistently by us"],
            ].map(([n, label]) => (
              <span key={label} style={{
                display: "inline-flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: 11.5,
                background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 20, padding: "5px 13px",
              }}>
                <strong>{n}</strong> {label}
              </span>
            ))}
          </div>
        )}

        {clusters.length === 0 ? (
          <div style={{
            background: "#fff", border: `1px dashed ${C.rule}`, borderRadius: 6,
            padding: "34px 24px", textAlign: "center", marginTop: 24,
          }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Nothing has been repeated yet</div>
            <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.sub, lineHeight: 1.6, maxWidth: "48ch", margin: "0 auto" }}>
              Repeats are found by comparing every checked claim against every other one
              in the permanent record. As more broadcasts are covered, the recurring lines
              surface here on their own.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {clusters.map(c => <Cluster key={c.id} c={c} />)}
          </div>
        )}

        {drift.length > 0 && (
          <section style={{ marginTop: 34 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 400, margin: "0 0 6px" }}>
              When the number moved
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.sub, lineHeight: 1.6, maxWidth: "62ch", marginBottom: 14 }}>
              The same assertion, made again with a different figure. Neither version is
              flagged as wrong here — the change itself is the observation.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {drift.map((p, i) => (
                <div key={i} style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 6, padding: "14px 18px" }}>
                  {[p.earlier, p.later].map((o, k) => (
                    <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: k ? 10 : 0 }}>
                      <span style={{ fontFamily: SANS, fontSize: 11, color: C.mute, minWidth: 74, flexShrink: 0, paddingTop: 2 }}>{o.day}</span>
                      <blockquote style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.5, margin: 0, flex: 1 }}>
                        &ldquo;{o.quote}&rdquo;
                      </blockquote>
                      <Verdict rating={o.rating} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ fontFamily: SANS, fontSize: 10.5, color: C.mute, lineHeight: 1.65, marginTop: 30, borderTop: `1px solid ${C.rule}`, paddingTop: 14 }}>
          <strong style={{ color: C.sub }}>Method:</strong> Two claims are treated as the same
          when their wording overlaps heavily and their figures agree. A shared distinctive
          number counts on its own, since a quote like &ldquo;11,888 murderers&rdquo; carries
          almost no other words. Claims whose figures genuinely conflict are kept apart, and a
          short quote cannot be absorbed into a long one that merely reuses a few of its words.
          Matching is lexical and deterministic: every grouping on this page can be checked by
          reading the quotes.
          {" "}<strong style={{ color: C.sub }}>Limits:</strong> repeats are only found within
          broadcasts we covered, and the record begins when the permanent ledger shipped.
          A claim absent from this page may simply have been made where we were not listening.
        </footer>
      </main>
    </div>
  );
}
