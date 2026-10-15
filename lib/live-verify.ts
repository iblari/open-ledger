// Server-side claim verification for the Live Broadcast fact-check route.
//
// What this does, in plain language:
//   The Claude prompt asks the LLM to extract claims AND to identify which
//   of our 6 headline metrics + which year (and admin) the claim is about.
//   If the LLM gives us those structured fields, we DON'T trust its "actual"
//   number — we look up the real value from metrics-data.ts (sourced from
//   BEA/BLS/etc.) and rewrite the verdict. This eliminates the most common
//   hallucination failure mode for verifiable claims, and gives us the
//   metricKey to deep-link the fact card into /dashboard?metric=...&admin=...
//
// What it does NOT do:
//   - Verify free-text non-numeric claims (handled by LLM alone)
//   - Override claims the LLM marked UNVERIFIABLE
//   - Override when metricKey/year are absent

import { BENCH_ANCHORS, isUnitMismatch } from "./benchmark-verify";
import {
  type MetricKey, type AdminId, METRIC_KEYS, METRICS_DATA, ADMINS_DATA,
  adminForYear, lookupValue, adminTenureValues, formatValue,
} from "./metrics-data";

export interface RawClaim {
  quote: string;
  rating: string;        // TRUE | MOSTLY TRUE | MISLEADING | FALSE | UNVERIFIABLE
  confidence?: number;
  actual: string;        // LLM-provided "actual" — may be replaced
  explanation: string;
  // NEW structured fields, may be missing/null on older claims or when the
  // LLM couldn't map the claim to one of our metrics.
  metricKey?: MetricKey | null;
  year?: number | null;
  admin?: AdminId | null;
  // Numeric value the speaker claimed, if extractable — used for re-rating.
  claimedValue?: number | null;
}

export interface VerifiedClaim extends RawClaim {
  // Set to true if we replaced 'actual' with a ground-truth lookup.
  verifiedFromSource: boolean;
  // The actual ground-truth value (for the UI to show inline if desired).
  groundTruth?: { value: number; year: number; metricKey: MetricKey; source: string };
}

/** Validate that the LLM's structured fields point at real entries in our
 *  metrics-data, and rewrite the rating + "actual" string when we have a
 *  ground truth to compare. Non-mutating; returns a new claim. */
/**
 * Countries / non-US entities whose statistics must NEVER be checked against
 * our US series. Observed failure: "now they got a 180% in inflation" —
 * spoken about IRAN — was tagged metricKey=inflation, resolved against BLS
 * CPI-U (2.9%) and published as FALSE with a Bureau of Labor Statistics
 * citation. Refuting a claim about Iran with American data is a fabricated
 * refutation, which is worse than saying nothing.
 */
const FOREIGN_SUBJECT_RE = new RegExp(
  "\\b(" + [
    "iran", "iranian", "china", "chinese", "russia", "russian", "ukraine", "ukrainian",
    "venezuela", "venezuelan", "argentina", "argentine", "turkey", "turkish", "zimbabwe",
    "germany", "german", "france", "french", "japan", "japanese", "india", "indian",
    "mexico", "mexican", "canada", "canadian", "brazil", "brazilian", "israel", "israeli",
    "gaza", "syria", "syrian", "iraq", "iraqi", "afghanistan", "korea", "korean",
    "britain", "british", "uk", "europe", "european", "eu", "nato", "opec",
    "cuba", "cuban", "nigeria", "egypt", "saudi", "pakistan", "vietnam", "taiwan",
  ].join("|") + ")\\b", "i"
);

/** True when the claim is about a foreign subject rather than the US. */
export function mentionsForeignSubject(text: string): boolean {
  if (!text) return false;
  return FOREIGN_SUBJECT_RE.test(text);
}

/**
 * Is the CLAIM about a foreign country? (Not: is a country named anywhere
 * nearby.)
 *
 * Observed failure, Oct 14: "we're at 1.7% inflation… for the last three
 * months, 1.7, 1.8%" — US inflation — was sent to Iran's statistics because
 * the NEXT sentence said "And Iran will end very shortly", and the old gate
 * checked the whole transcript chunk for any country word.
 *
 * Rules, in order:
 *  1. The quote names a foreign country → foreign.
 *  2. The quote speaks in the first person ("we", "our", "us", "this
 *     country", "America") → the US. A US official's "we" is the US.
 *  3. Otherwise ("they got 180% inflation") look only BACKWARDS: the ~300
 *     characters before the quote in the transcript. What is said after a
 *     claim can't be what the claim was about.
 *  If the quote can't be located, fall back to the whole context only for
 *  third-person quotes (they / their / them), the original failure's shape.
 */
const FIRST_PERSON_RE = /\b(we|we're|we've|we'll|weve|were at|our|ours|us|this country|our country|america|american|americans|the united states|the us)\b/i;
const THIRD_PERSON_RE = /\b(they|they're|they've|their|them|that country)\b/i;
const squash = (s: string) => s.toLowerCase().replace(/\[\d+:\d{2}(?::\d{2})?\]/g, " ").replace(/[^a-z0-9%.$ ]+/g, " ").replace(/\s+/g, " ").trim();
export function claimIsForeign(quote: string, context = ""): boolean {
  if (mentionsForeignSubject(quote)) return true;
  // "we"/"our" settles it — unless the quote is also about "they"
  // ("they do 95% of their business with us"), then the lead-in decides.
  if (FIRST_PERSON_RE.test(quote) && !THIRD_PERSON_RE.test(quote)) return false;
  if (!context) return false;
  const ctx = squash(context), q = squash(quote);
  const probe = q.slice(0, Math.min(40, q.length));
  const at = probe.length >= 8 ? ctx.indexOf(probe) : -1;
  if (at >= 0) return mentionsForeignSubject(ctx.slice(Math.max(0, at - 300), at + q.length));
  return THIRD_PERSON_RE.test(quote) && mentionsForeignSubject(context);
}

/** The transcript up to and including the quote (what came after it is not
 *  what it was about). Whole context when the quote can't be found. */
export function contextBefore(quote: string, context: string, chars = 900): string {
  if (!context) return "";
  const lc = context.toLowerCase();
  const probe = quote.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 30);
  let at = probe.length >= 8 ? lc.indexOf(probe) : -1;
  if (at < 0) {
    // Transcript lines carry "[m:ss]" stamps that can split the quote.
    const words = probe.split(" ").slice(0, 3).join(" ");
    at = words.length >= 8 ? lc.indexOf(words) : -1;
  }
  if (at < 0) return context;
  // Stop at the quote: a "[m:ss]" stamp inside it can push its end a few
  // characters on, which is acceptable; the next sentence is not.
  return context.slice(Math.max(0, at - chars), at + quote.length + 8);
}

export function verifyClaim(raw: RawClaim, context = ""): VerifiedClaim {
  const out: VerifiedClaim = { ...raw, verifiedFromSource: false };

  // Scope gate FIRST: a foreign subject invalidates every US metric anchor.
  // The claim still gets fact-checked — it just goes to the web tier, which
  // can find the right country's statistics.
  // NOTE: check the surrounding transcript as well as the quote. The observed
  // failure ("they got a 180% in inflation") contained no country word at
  // all; "Iranian regimes" appeared two sentences earlier in the chunk.
  if (out.metricKey && claimIsForeign(out.quote, context)) {
    out.metricKey = null;
    out.rating = "UNVERIFIABLE";
    out.actual = "This claim is about a country other than the United States, so it cannot be checked against US federal data.";
  }

  // Sanitize structured fields — LLM sometimes hands us a key that doesn't
  // exist, or a year outside our data range. Drop those rather than trust them.
  // Keep keys this module can't resolve but the BENCHMARK tier can (jobs,
  // gas, wages, fed_rate, trade, mfg, lfpr…). Nulling them here silently
  // disabled tier 1b and pushed those claims to a paid web search.
  if (out.metricKey
      && !METRIC_KEYS.includes(out.metricKey as MetricKey)
      && !(out.metricKey in BENCH_ANCHORS)) {
    out.metricKey = null;
  }
  if (out.admin && !ADMINS_DATA[out.admin as AdminId]) out.admin = null;

  // If we have a metricKey but no year, try to infer the year from the admin
  // (use end-of-tenure as a reasonable proxy for "during X's term").
  if (out.metricKey && out.year == null && out.admin) {
    const a = ADMINS_DATA[out.admin];
    if (a) out.year = a.end;
  }

  // Need both to do a point lookup.
  if (!out.metricKey || out.year == null) return out;

  if (!METRIC_KEYS.includes(out.metricKey as MetricKey)) return out; // benchmark tier owns it
  const metric = METRICS_DATA[out.metricKey as MetricKey];
  const truthValue = lookupValue(out.metricKey as MetricKey, out.year);
  if (truthValue == null) return out; // year out of range

  // Fill in admin from year if missing.
  if (!out.admin) out.admin = adminForYear(out.year) ?? null;

  // Build the ground-truth attachment.
  out.groundTruth = {
    value: truthValue,
    year: out.year,
    metricKey: out.metricKey as MetricKey,
    source: metric.source,
  };
  out.verifiedFromSource = true;

  // Rewrite "actual" with the sourced number, replacing whatever Claude said.
  const formatted = formatValue(truthValue, metric.unit);
  const adminLabel = out.admin ? ` (${ADMINS_DATA[out.admin].name})` : "";
  out.actual = `${formatted} — ${metric.label} in ${out.year}${adminLabel}, per ${metric.source}.`;

  // If the LLM extracted the claimed value, re-rate based on numeric distance
  // from ground truth. This catches cases where the LLM marked a claim TRUE
  // but actually misremembered the real number itself.
  if (typeof out.claimedValue === "number") {
    if (isUnitMismatch(out.quote, out.claimedValue, truthValue, metric.unit)) {
      // A change-vs-level or wildly different-scale comparison: keep our
      // figure as context, but don't manufacture a verdict from it.
      out.rating = "UNVERIFIABLE";
      out.verifiedFromSource = false;
      out.actual = `${formatted} is the ${metric.label} level in ${out.year}; the claim describes a change, which this series doesn't directly settle.`;
    } else {
      const newRating = rateNumericClaim(out.claimedValue, truthValue, metric.unit);
      if (newRating) out.rating = newRating;
    }
  }

  return out;
}

/** Compare a claimed numeric value to ground truth and pick a rating.
 *  Tolerances are intentionally generous — speakers round, paraphrase, and
 *  may be referencing a slightly different time slice. False is reserved for
 *  significant disagreement. */
function rateNumericClaim(claimed: number, truth: number, unit: string): string | null {
  // Percent-point thresholds for rate metrics ("4%", "10%", etc.)
  if (unit === "%") {
    const diff = Math.abs(claimed - truth);
    if (diff <= 0.3) return "TRUE";
    if (diff <= 0.8) return "MOSTLY TRUE";
    if (diff <= 2.0) return "MISLEADING";
    return "FALSE";
  }
  // Relative-error thresholds for index/dollar metrics ($, idx).
  const relErr = Math.abs(claimed - truth) / Math.max(Math.abs(truth), 1);
  if (relErr <= 0.03) return "TRUE";
  if (relErr <= 0.08) return "MOSTLY TRUE";
  if (relErr <= 0.20) return "MISLEADING";
  return "FALSE";
}

/** Append metric-anchor hint block to the Claude system prompt so the LLM
 *  knows which metricKey values are valid and what each one means. Keeping
 *  this colocated with the lookup means the prompt and the verifier never
 *  drift out of sync. */
export function metricAnchorPromptBlock(): string {
  const lines = METRIC_KEYS.map(k => {
    const m = METRICS_DATA[k];
    return `  - "${k}": ${m.label} (${m.unit}, ${m.source}). Match when the speaker mentions ${m.hints.slice(0, 4).join(" / ")}.`;
  });
  return [
    "METRIC ANCHORS — when a claim references one of these, include the matching key:",
    ...lines,
    "  - null: the claim does not map to any of the above metrics.",
  ].join("\n");
}
