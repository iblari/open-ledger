/**
 * Promise Tracker — the longitudinal accountability layer.
 *
 * A *claim* is a statement about the past ("unemployment is 4.2%") — the live
 * fact-checker handles those against current data. A *promise* is a
 * quantified commitment about the future ("we will create 10 million jobs").
 * Promises can't be checked when spoken; they must be stored, then resolved
 * when the data arrives. That waiting is exactly the work no newsroom
 * sustains, and it's cheap for us because the ground-truth series already
 * refresh themselves.
 *
 * DESIGN CONTRACT (mirrors the fact-checker's):
 *  - Extraction (AI) captures wording + structure. It never assigns a verdict.
 *  - Resolution is DETERMINISTIC arithmetic over the same FRED-backed series
 *    the benchmark uses. Same inputs → same verdict, always reproducible.
 *  - We report whether the NUMBER was reached — never whether the speaker
 *    caused it. Presidents influence perhaps 10-30% of these outcomes; the
 *    tracker states the outcome and leaves causation to the reader.
 */

export type PromiseStatus =
  | "kept"          // target met or exceeded by the deadline
  | "partial"       // meaningful progress (≥50% of the way) but short
  | "broken"        // deadline passed, <50% of the way
  | "pending"       // deadline in the future — data still accumulating
  | "unresolvable"; // no official series can settle it as stated

export interface PromiseTarget {
  /** Metric key in the benchmark dataset (unemployment, jobs, inflation…). */
  metricKey: string | null;
  /** "increase" | "decrease" | "level" — what direction counts as progress. */
  direction: "increase" | "decrease" | "level";
  /** The number promised, in the metric's natural unit. */
  targetValue: number | null;
  /** For cumulative promises ("create 10M jobs") vs level promises ("under 4%"). */
  kind: "cumulative_change" | "level" | "ratio";
  /** ISO date the promise comes due. Defaults to end of the speaker's term. */
  deadline: string | null;
  /** Baseline anchor: value when the promise was made (filled at resolution). */
  baselineValue?: number | null;
  baselineDate?: string | null;
}

export interface PromiseRecord {
  id: string;
  quote: string;
  speaker: string;
  admin: string | null;
  spokenAt: string;               // ISO date of the speech
  sourceTitle: string;
  sourceUrl: string | null;
  videoTime: number | null;       // seconds into the source video
  target: PromiseTarget;
  extractionConfidence: number;   // 0-100, from the extractor
  /** Why this can't be scored, when status is unresolvable. */
  unresolvableReason?: string;
  resolution?: {
    status: PromiseStatus;
    actualValue: number | null;
    progressPct: number | null;   // 0-100+ toward the target
    asOf: string;                 // period of the data used
    evidence: string;             // one sentence, numbers only
    evaluatedAt: string;
    source: string;
  };
}

export interface PromiseFile {
  generatedAt: string;
  method: string;
  promises: PromiseRecord[];
}

export const STATUS_LABEL: Record<PromiseStatus, string> = {
  kept: "Promise kept",
  partial: "Partially kept",
  broken: "Promise broken",
  pending: "Too early to tell",
  unresolvable: "Not measurable as stated",
};

export const STATUS_COLOR: Record<PromiseStatus, string> = {
  kept: "#0d7377",
  partial: "#ca8a04",
  broken: "#c2410c",
  pending: "#5c5856",
  unresolvable: "#9a9490",
};

/**
 * Deterministic verdict. No model involved: given a target, a baseline and
 * the latest observed value, the status follows by rule.
 */
export function resolveStatus(args: {
  target: PromiseTarget;
  baseline: number | null;
  actual: number | null;
  deadlinePassed: boolean;
}): { status: PromiseStatus; progressPct: number | null } {
  const { target, baseline, actual, deadlinePassed } = args;
  if (target.metricKey == null || target.targetValue == null || actual == null) {
    return { status: "unresolvable", progressPct: null };
  }

  let progress: number;
  if (target.kind === "cumulative_change") {
    // "create 10M jobs": progress = (actual − baseline) / target
    if (baseline == null) return { status: "unresolvable", progressPct: null };
    const moved = actual - baseline;
    const wanted = target.direction === "decrease" ? -Math.abs(target.targetValue) : Math.abs(target.targetValue);
    progress = (moved / wanted) * 100;
  } else {
    // "keep unemployment under 4%": progress relative to the threshold
    if (target.direction === "decrease") {
      if (baseline == null) return { status: actual <= target.targetValue ? "kept" : deadlinePassed ? "broken" : "pending", progressPct: null };
      const need = baseline - target.targetValue;
      progress = need === 0 ? 100 : ((baseline - actual) / need) * 100;
    } else {
      if (baseline == null) return { status: actual >= target.targetValue ? "kept" : deadlinePassed ? "broken" : "pending", progressPct: null };
      const need = target.targetValue - baseline;
      progress = need === 0 ? 100 : ((actual - baseline) / need) * 100;
    }
  }

  const pct = Math.round(progress);
  if (pct >= 100) return { status: "kept", progressPct: pct };
  if (!deadlinePassed) return { status: "pending", progressPct: pct };
  if (pct >= 50) return { status: "partial", progressPct: pct };
  return { status: "broken", progressPct: pct };
}
