/**
 * Scenario Methodology Text & Disclaimers
 *
 * Human-readable explanations for each scenario, plus the general
 * methodology disclosure shown in the Scenarios tab.
 */

import type { ScenarioId } from "./scenarios";

// ── Per-scenario detail cards ─────────────────────────────────────

export interface ScenarioDetail {
  title: string;
  methodology: string;
  caveat: string;
}

export const SCENARIO_DETAILS: Record<ScenarioId, ScenarioDetail> = {
  baseline: {
    title: "Actual Data (Baseline)",
    methodology:
      "Raw values as reported by BLS, BEA, FRED, and Census. No adjustments or modeling applied.",
    caveat: "",
  },
  no_covid: {
    title: "What if COVID-19 Never Happened?",
    methodology:
      "Fits a linear trend to 2017–2019 data and extrapolates through 2020–2021. Post-shock years (2022+) are shifted to close the gap, with the shift fading over a short window so the series reconnects with actual data.",
    caveat:
      "This removes the COVID shock only. It does not account for policy responses (stimulus, Fed rate cuts) that would also not have occurred, nor for second-order effects on supply chains, labor markets, or consumer behavior.",
  },
  no_2008: {
    title: "What if the 2008 Financial Crisis Never Happened?",
    methodology:
      "Fits a linear trend to 2004–2007 data and extrapolates through 2008–2009. Post-shock years (2010+) are shifted with a fading adjustment.",
    caveat:
      "The 2004–2007 trend itself includes the housing bubble's upswing. A 'no crisis' world might have seen a correction anyway — just a smaller one. This model assumes the pre-shock trajectory was sustainable, which is debatable.",
  },
  no_dotcom: {
    title: "What if the Dot-Com Crash Never Happened?",
    methodology:
      "Fits a linear trend to 1997–2000 data and extrapolates through 2001–2002. Post-shock years (2003+) are shifted with a fading adjustment.",
    caveat:
      "The late-1990s trend was driven partly by speculative excess. Extrapolating it assumes those growth rates were sustainable — they almost certainly were not for metrics like the S&P 500. Take this scenario with extra skepticism for market-linked indicators.",
  },
};

// ── General methodology disclosure ────────────────────────────────

export const METHODOLOGY_TEXT = {
  title: "How Scenario Modeling Works",
  paragraphs: [
    "Each scenario removes a specific economic shock by replacing the disruption years with trend-extrapolated values. We fit an ordinary least-squares (OLS) linear regression on the pre-shock years, then project that line forward through the shock window.",
    "Post-shock years are shifted upward or downward to close the gap between the extrapolated and actual values at the end of the shock. This shift fades over a short window so the modeled series smoothly reconnects with actual data.",
    "This is the most transparent and reproducible approach available. It uses only publicly reported data and a single, well-understood statistical method. No proprietary models, no hidden assumptions.",
  ],
  limitations: [
    "Linear regression assumes the pre-shock trend was sustainable and would have continued unchanged. This is a simplification — real economies have cycles.",
    "Removing one shock does not remove the policy responses to that shock (stimulus packages, rate cuts, emergency lending). In a true counterfactual, those responses wouldn't exist either.",
    "These scenarios are independent. The 'no 2008' scenario doesn't consider whether avoiding 2008 would have changed the trajectory leading into COVID.",
    "Some metrics (like the S&P 500) are more volatile than a linear trend can capture. The extrapolated values for these should be interpreted with extra caution.",
  ],
  disclaimer:
    "This is NOT a prediction. It is a transparent, mechanical estimate of what the pre-existing trend would have produced if the disruption hadn't occurred. Reasonable people can disagree about whether the pre-shock trend was sustainable. Use this as a thinking tool, not a conclusion.",
};
