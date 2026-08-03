/**
 * Design tokens for the /live "Control Room" (spec 2a).
 *
 * Deliberately separate from lib/design-tokens.ts: the live page runs a dark
 * stage while the rest of the site is light editorial. Carrying the spec's
 * exact hexes here keeps the two systems from drifting into each other.
 */
export const L = {
  ink: "#14110E",            // dark stage, primary text on light
  stage: "#191512",
  stageAlt: "#1A1613",
  card: "#221D19",
  cardBorder: "#322B25",
  page: "#F8F5F0",
  cardLight: "#FFFEFC",
  cardLightBorder: "#E2DED6",
  true: "#0E7477",
  misleading: "#B45309",
  false: "#C2410C",
  // Slate-blue: reads as "on the record but not settled" without borrowing
  // the true/false palette. Deliberately NOT a verdict colour.
  pending: "#4A6E8A",
  mutedDark: "#8A827A",
  mutedDark2: "#A79E93",
  mutedLight: "#8C8479",
  mutedLight2: "#5F5850",
} as const;

/** Everything a person SAID is serif. Every number from DATA is mono. */
export const F = {
  display: "'Newsreader',Georgia,serif",
  ui: "'DM Sans',-apple-system,sans-serif",
  mono: "'DM Mono',ui-monospace,Menlo,monospace",
} as const;

/**
 * UNVERIFIABLE used to absorb four unrelated situations — a forecast, an
 * unaudited official announcement, a genuine blank, and a search that simply
 * gave up. Viewers read all four as "we couldn't be bothered". Splitting them
 * lets every card say something true and specific.
 */
export type Verdict =
  | "true" | "misleading" | "false"
  | "projection"    // about the future — not checkable yet, tracked as a promise
  | "unconfirmed"   // official announcement, no independent audit or dataset
  | "unverifiable"  // genuinely nothing settles it
  | "checking";

export const VERDICT_COLOR: Record<Verdict, string> = {
  true: L.true, misleading: L.misleading, false: L.false,
  projection: L.pending, unconfirmed: L.pending,
  unverifiable: L.mutedDark, checking: L.mutedDark,
};

/** Plain vocabulary in the feed (scannable); data-first in the export. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  true: "TRUE", misleading: "MISLEADING", false: "FALSE",
  // A claim nobody can settle is a finished RESULT, not work in progress —
  // labelling it CHECKING… promised an answer that was never coming.
  // "PROJECTION" and "UNCONFIRMED" answer the viewer's question — is this a
  // fact, a forecast, or a press release? — where UNVERIFIABLE just shrugged.
  projection: "PROJECTION", unconfirmed: "UNCONFIRMED",
  unverifiable: "UNVERIFIABLE", checking: "CHECKING…",
};

/** Map the pipeline's 5 ratings onto the spec's 3 verdicts. */
export function toVerdict(rating: string): Verdict | null {
  const r = (rating || "").toUpperCase();
  if (r === "TRUE" || r === "MOSTLY TRUE") return "true";
  if (r === "MISLEADING") return "misleading";
  if (r === "FALSE") return "false";
  // Neither a forecast nor an unaudited announcement is a truth outcome, so
  // none of these score on the credibility timeline — but unlike UNVERIFIABLE
  // they still render a meaningful card.
  return null;
}

/** The full outcome, including the non-scoring ones the feed still displays. */
export function toOutcome(rating: string): Verdict {
  const r = (rating || "").toUpperCase();
  if (r === "TRUE" || r === "MOSTLY TRUE") return "true";
  if (r === "MISLEADING") return "misleading";
  if (r === "FALSE") return "false";
  if (r === "PROJECTION") return "projection";
  if (r === "UNCONFIRMED") return "unconfirmed";
  return "unverifiable";
}
