import { getLedgerHealed, getVerdictOverlay, setVerdictOverlay, type LedgerEntry, type Consistency, type VerdictOverlay } from "./live-kv";
import { sameAssertion } from "./repeat-claims";
import { claimHash, claimPath } from "./claim-link";
import { getClaimSeries } from "./claim-series";
import { getSeries, getSeriesAsOf, CATALOG_BY_ID } from "./series";
import { toOutcome } from "./live-design";

/**
 * Verdict consistency — the same claim, on unchanged data, gets the same verdict.
 *
 * Two parts:
 *   1. Carry-over (at check time). A new claim that restates one we already
 *      checked, when the official data hasn't changed since, takes the earlier
 *      verdict instead of a fresh, noisy one. Deterministic checks against our
 *      own series (tier 1) are left alone: they are already consistent.
 *   2. Reconciliation (one-off + on demand). Existing repeats that got
 *      different verdicts on the same data are reviewed together by an
 *      adjudicator that sees every check's evidence, and given one verdict.
 *      Applied as a read-time overlay: stored records keep the original
 *      verdicts, and every change is listed at /api/consistency.
 */

const DECISIVE = new Set(["TRUE", "MOSTLY TRUE", "MISLEADING", "FALSE"]);
const STATIC_DAYS = 60;   // claims with no series: reuse a verdict this long

interface Occ { videoId: string; title: string; date: string; quote: string; rating: string; actual?: string; explanation?: string; sources?: { title: string; url: string }[] }

function occurrences(ledger: LedgerEntry[]): Occ[] {
  const out: Occ[] = [];
  for (const e of ledger) for (const c of e.claims) {
    if (!c.quote) continue;
    out.push({ videoId: e.videoId, title: e.title, date: e.startedAt, quote: c.quote, rating: (c.rating || "").toUpperCase(), actual: c.actual, explanation: (c as { explanation?: string }).explanation, sources: c.sources });
  }
  return out;
}

/** The FRED series a claim is charted against, if any (read-only). */
async function seriesFor(o: { videoId: string; quote: string; rating: string; actual?: string; date: string }): Promise<string | null> {
  const m = await getClaimSeries({ key: claimHash(o.videoId, o.quote), quote: o.quote, rating: o.rating, actual: o.actual || "", date: o.date }, false).catch(() => null);
  const id = m?.series;
  return id && CATALOG_BY_ID.get(id)?.source === "FRED" && !(m?.countries || []).length ? id : null;
}

/** The data "epoch" a check was made in: the latest observation published
 *  that day. Two checks in the same epoch saw the same official figure. */
async function epoch(seriesId: string | null, date: string): Promise<string | null> {
  if (!seriesId) return null;
  const p = await getSeriesAsOf(seriesId, date.slice(0, 10)).catch(() => null);
  return p ? `${p.d}:${p.v}` : null;
}

/* ── 1. Carry-over at check time ───────────────────────────────────── */

type Checkable = { quote: string; rating: string; actual: string; explanation: string; confidence?: number; sources?: { title: string; url: string }[]; verifiedFromSource?: boolean; consistency?: Consistency; webVerified?: boolean };

/**
 * For each new claim (not settled by our own series), find the latest
 * decisive check of the same assertion from another broadcast. Reuse its
 * verdict when the official data hasn't changed since. Mutates in place;
 * returns how many were carried. Never throws, never blocks long.
 */
export async function carryOverVerdicts<T extends Checkable>(claims: T[], videoId?: string | null): Promise<number> {
  const todo = claims.filter(c => !c.verifiedFromSource && c.quote);
  if (!todo.length) return 0;
  let ledger: LedgerEntry[];
  try { ledger = await getLedgerHealed(); } catch { return 0; }
  const all = occurrences(ledger).filter(o => o.videoId !== videoId && DECISIVE.has(o.rating));
  let n = 0;
  await Promise.all(todo.map(async c => {
    const prior = all.filter(o => sameAssertion(c.quote, o.quote)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prior) return;
    try {
      const sid = await seriesFor(prior);
      let unchanged: boolean;
      if (sid) {
        // Same latest observation now as when it was last checked → no new release.
        const [then, now] = await Promise.all([getSeriesAsOf(sid, prior.date.slice(0, 10)), getSeries(sid)]);
        const last = now?.lines[0]?.points.slice(-1)[0];
        unchanged = !!then && !!last && then.d === last.d;
      } else {
        unchanged = Date.now() - Date.parse(prior.date) < STATIC_DAYS * 864e5;
      }
      if (!unchanged) return;
      const day = new Date(prior.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
      Object.assign(c, {
        rating: prior.rating,
        actual: prior.actual || c.actual,
        explanation: prior.explanation || c.explanation,
        sources: prior.sources?.length ? prior.sources : c.sources,
        consistency: {
          kind: "carried", from: claimPath(prior.videoId, prior.quote), fromDate: prior.date, at: new Date().toISOString(),
          note: `Same claim as the one checked on ${day}. ${sid ? "No new official data has been published since" : "Nothing in the record has changed since"}, so the verdict carries over.`,
        } satisfies Consistency,
      });
      n++;
    } catch { /* fresh check instead */ }
  }));
  return n;
}

/* ── 2. Reconciliation ─────────────────────────────────────────────── */

export interface ReconcileGroup {
  key: string;
  epoch: string | null;
  series: string | null;
  occ: { id: number; path: string; date: string; quote: string; rating: string }[];
  decision?: { rating: string; basis: number; actual: string; explanation: string; reason: string; members: number[] };
  error?: string;
}

/** Groups of the same assertion, on the same data, with differing verdicts. */
export async function findInconsistent(): Promise<ReconcileGroup[]> {
  const ledger = await getLedgerHealed();
  const occ = occurrences(ledger).filter(o => DECISIVE.has(o.rating)).sort((a, b) => a.date.localeCompare(b.date));
  // Greedy grouping against each group's first quote (not transitive chains).
  const groups: Occ[][] = [];
  for (const o of occ) {
    const g = groups.find(g => g[0].videoId !== o.videoId && !g.some(x => x.videoId === o.videoId) && sameAssertion(g[0].quote, o.quote));
    if (g) g.push(o); else groups.push([o]);
  }
  const out: ReconcileGroup[] = [];
  for (const g of groups.filter(g => g.length > 1 && new Set(g.map(o => toOutcome(o.rating))).size > 1)) {
    const sid = await seriesFor(g[g.length - 1]);
    const eps = await Promise.all(g.map(o => epoch(sid, o.date)));
    const byEpoch = new Map<string, number[]>();
    g.forEach((_, i) => { const k = sid ? eps[i] ?? `?${i}` : "static"; byEpoch.set(k, [...(byEpoch.get(k) || []), i]); });
    for (const [ep, idx] of byEpoch) {
      const members = idx.map(i => g[i]);
      if (members.length < 2 || new Set(members.map(o => toOutcome(o.rating))).size < 2) continue;
      out.push({
        key: claimHash(members[0].videoId, members[0].quote) + ":" + ep,
        epoch: sid ? ep : null, series: sid,
        occ: members.map((o, i) => ({ id: i, path: claimPath(o.videoId, o.quote), date: o.date, quote: o.quote, rating: o.rating })),
      });
    }
  }
  return out;
}

const ADJ_MODELS = ["claude-sonnet-4-5", "claude-haiku-4-5-20251001"];
const ADJ_SYSTEM = `You are the consistency reviewer for a nonpartisan fact-checking site. Several checks of what may be the SAME claim, made on different days while the official data did not change, got DIFFERENT verdicts. Your job: decide which of them truly make the same factual assertion, and give that group ONE verdict, using only the evidence the checks found.

RATINGS
- TRUE: sources confirm the figure within normal rounding
- MOSTLY TRUE: directionally right, but imprecise, cherry-picked, or from a favourable time slice
- MISLEADING: technically defensible but the framing distorts it (wrong baseline, missing context, a target quoted as an achievement)
- FALSE: sources contradict the figure materially

RULES
- Same assertion = a reader would expect the same verdict for each. Different wording that adds or changes a factual element (a different figure, place, period or group) is NOT the same assertion: leave it out of "members".
- Judge the number, never the politics. Identical scrutiny for any speaker.
- Prefer evidence from datasets, audits and official releases over news coverage of the speech.
- Never invent a figure. "actual" must restate what the best check found, with the publisher and period.
- "explanation" under 30 words.
Respond ONLY with JSON: {"members":[ids],"rating":"TRUE|MOSTLY TRUE|MISLEADING|FALSE","basis":id of the check whose evidence is strongest,"actual":"...","explanation":"...","reason":"one sentence on why the checks disagreed"}`;

async function adjudicate(g: ReconcileGroup, evidence: Occ[]): Promise<ReconcileGroup["decision"]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no ANTHROPIC_API_KEY");
  const body = g.occ.map((o, i) => {
    const e = evidence[i];
    return `[${o.id}] ${o.date.slice(0, 10)} — "${o.quote}"\n  verdict: ${o.rating}\n  found: ${(e.actual || "").slice(0, 400)}\n  why: ${(e.explanation || "").slice(0, 300)}\n  sources: ${(e.sources || []).slice(0, 4).map(s => `${s.title} (${s.url})`).join("; ") || "none"}`;
  }).join("\n\n");
  let lastErr = "";
  for (const model of ADJ_MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 700, temperature: 0, system: ADJ_SYSTEM, messages: [{ role: "user", content: `${g.series ? `Official series: ${g.series}; every check below saw the same published figure.\n\n` : ""}${body}` }] }),
      signal: AbortSignal.timeout(60_000),
    }).catch(e => { lastErr = String(e); return null; });
    if (!r || !r.ok) { lastErr = r ? `${model} ${r.status}` : lastErr; continue; }
    const j = await r.json();
    const text = (j.content || []).filter((x: { type: string }) => x.type === "text").map((x: { text: string }) => x.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) { lastErr = "no JSON"; continue; }
    const p = JSON.parse(m[0]) as { members?: number[]; rating?: string; basis?: number; actual?: string; explanation?: string; reason?: string };
    const rating = String(p.rating || "").toUpperCase();
    const ids = new Set(g.occ.map(o => o.id));
    const members = (p.members || []).filter(i => ids.has(i));
    if (!DECISIVE.has(rating) || members.length < 2) return { rating, basis: -1, actual: "", explanation: "", reason: p.reason || "not the same assertion", members };
    const basis = ids.has(Number(p.basis)) ? Number(p.basis) : members[0];
    return { rating, basis, actual: String(p.actual || evidence[basis].actual || ""), explanation: String(p.explanation || "").slice(0, 260), reason: String(p.reason || ""), members };
  }
  throw new Error(lastErr || "adjudication failed");
}

const PLAN_KEY = "verdict:reconcile:plan:v1";
const LOG_KEY = "verdict:reconcile:log:v1";
export { PLAN_KEY, LOG_KEY };

/**
 * Review every inconsistent group (dry run stores a plan; apply writes the
 * overlay). Bounded per call; groups already decided are skipped.
 */
export async function reconcile(opts: { apply: boolean; limit?: number; reset?: boolean; only?: string[]; drop?: Record<string, number[]> }): Promise<{ groups: number; decided: number; changed: number; plan: ReconcileGroup[] }> {
  const { kvGet, kvSetMany } = await import("./live-kv");
  const [planRaw] = await kvGet([PLAN_KEY]);
  const prior: Record<string, ReconcileGroup> = planRaw && !opts.reset ? JSON.parse(planRaw) : {};
  const groups = await findInconsistent();
  const ledger = await getLedgerHealed();
  const occAll = occurrences(ledger);
  const lookup = (path: string) => occAll.find(o => claimPath(o.videoId, o.quote) === path)!;

  let budget = Math.max(1, Math.min(opts.limit ?? 8, 20));
  await Promise.all(groups.map(async g => {
    if (prior[g.key]?.decision) { g.decision = prior[g.key].decision; return; }
    if (budget-- <= 0) return;
    try { g.decision = await adjudicate(g, g.occ.map(o => lookup(o.path))); }
    catch (e) { g.error = (e as Error).message; }
  }));
  // The plan holds only groups that are still inconsistent (or were applied).
  const plan: Record<string, ReconcileGroup> = {};
  for (const [k, g] of Object.entries(prior)) if ((g as ReconcileGroup & { applied?: string }).applied) plan[k] = g;
  for (const g of groups) if (g.decision) plan[g.key] = g;
  await kvSetMany([[PLAN_KEY, JSON.stringify(plan), 0]]);

  let changed = 0;
  if (opts.apply) {
    const ov = { ...(await getVerdictOverlay(true)) };
    const log: { at: string; path: string; from: string; to: string; group: number; reason: string }[] = JSON.parse((await kvGet([LOG_KEY]))[0] || "[]");
    const now = new Date().toISOString();
    for (const g of Object.values(plan) as (ReconcileGroup & { applied?: string })[]) {
      const d = g.decision;
      if (!d || d.basis < 0 || !DECISIVE.has(d.rating) || g.applied) continue;
      // A human review step: only listed groups, minus any members struck out.
      if (opts.only && !opts.only.includes(g.key)) continue;
      const struck = new Set(opts.drop?.[g.key] || []);
      d.members = d.members.filter(i => !struck.has(i));
      if (d.members.length < 2 || struck.has(d.basis)) continue;
      g.applied = now;
      const basis = g.occ.find(o => o.id === d.basis)!;
      const basisOcc = lookup(basis.path);
      for (const id of d.members) {
        const o = g.occ.find(x => x.id === id)!;
        const src = lookup(o.path);
        if (!src) continue;
        const h = claimHash(src.videoId, src.quote);
        const original = ov[h]?.consistency.prevRating ?? o.rating;
        const entry: VerdictOverlay = {
          rating: d.rating, actual: d.actual, explanation: d.explanation, sources: basisOcc?.sources,
          consistency: {
            kind: "reconciled", from: basis.path, fromDate: basis.date, prevRating: original, group: d.members.length, at: now,
            note: `Reviewed with ${d.members.length - 1} other check${d.members.length > 2 ? "s" : ""} of the same claim made while the official data was unchanged, so all get one verdict.`,
          },
        };
        if (toOutcome(original) !== toOutcome(d.rating) || original !== d.rating) {
          ov[h] = entry; changed++;
          log.push({ at: now, path: o.path, from: original, to: d.rating, group: d.members.length, reason: d.reason });
        }
      }
    }
    await setVerdictOverlay(ov);
    await kvSetMany([[LOG_KEY, JSON.stringify(log.slice(-2000)), 0], [PLAN_KEY, JSON.stringify(plan), 0], ["trending-claims:v3", "", 1]]);
  }
  const list = Object.values(plan);
  return { groups: groups.length, decided: list.filter(g => g.decision).length, changed, plan: list };
}
