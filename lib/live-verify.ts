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
export function verifyClaim(raw: RawClaim): VerifiedClaim {
  const out: VerifiedClaim = { ...raw, verifiedFromSource: false };

  // Sanitize structured fields — LLM sometimes hands us a key that doesn't
  // exist, or a year outside our data range. Drop those rather than trust them.
  if (out.metricKey && !METRIC_KEYS.includes(out.metricKey as MetricKey)) out.metricKey = null;
  if (out.admin && !ADMINS_DATA[out.admin as AdminId]) out.admin = null;

  // If we have a metricKey but no year, try to infer the year from the admin
  // (use end-of-tenure as a reasonable proxy for "during X's term").
  if (out.metricKey && out.year == null && out.admin) {
    const a = ADMINS_DATA[out.admin];
    if (a) out.year = a.end;
  }

  // Need both to do a point lookup.
  if (!out.metricKey || out.year == null) return out;

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
    const newRating = rateNumericClaim(out.claimedValue, truthValue, metric.unit);
    if (newRating) out.rating = newRating;
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
