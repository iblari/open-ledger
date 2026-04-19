/**
 * US Military Spending — Active Conflict Streams
 *
 * Each stream has:
 *   anchorTotal  — known cumulative spend (USD) at anchorDate
 *   dailyRate    — estimated sustained daily burn rate (USD/day)
 *   perSecond    — dailyRate / 86400 (pre-computed for the ticker)
 *
 * The ticker extrapolates from the anchor:
 *   estimated = anchorTotal + dailyRate × daysSinceAnchor
 *
 * Sources cited inline. All figures are DIRECT military cost estimates
 * (not indirect economic impacts) from credible institutional sources.
 */

export type ConflictStream = {
  id: string;
  name: string;
  shortName: string;
  theater: string;
  /** Date the conflict / spending stream began */
  startDate: string;
  /** Date at which anchorTotal was estimated */
  anchorDate: string;
  /** Cumulative USD spent as of anchorDate */
  anchorTotal: number;
  /** Estimated daily spend rate in current phase (USD/day) */
  dailyRate: number;
  /** dailyRate / 86400 */
  perSecond: number;
  /** Primary source for the anchor figure */
  source: string;
  /** URL to source */
  sourceUrl: string;
  /** Brief methodology note */
  note: string;
};

export const CONFLICT_STREAMS: ConflictStream[] = [
  {
    id: "epic-fury",
    name: "Operation Epic Fury — Iran",
    shortName: "Iran",
    theater: "ME",
    startDate: "2026-02-28",
    anchorDate: "2026-03-12",
    anchorTotal: 16_500_000_000, // $16.5B by day 12
    dailyRate: 250_000_000,      // ~$250M/day sustained ops phase
    perSecond: 250_000_000 / 86400, // ~$2,894/sec
    source: "CSIS Iran War Cost Estimate Update",
    sourceUrl: "https://www.csis.org/analysis/iran-war-cost-estimate-update-113-billion-day-6-165-billion-day-12",
    note: "CSIS estimate of direct military cost (operations + munitions + sustainment). Initial phase ~$1B/day, sustained phase ~$250M/day.",
  },
  {
    id: "ukraine-aid",
    name: "Ukraine Military Aid",
    shortName: "Ukraine",
    theater: "EU",
    startDate: "2022-02-24",
    anchorDate: "2025-01-20",
    anchorTotal: 66_900_000_000, // $66.9B military aid committed
    dailyRate: 1_100_000,        // ~$1.1M/day (minimal — aid largely frozen since Jan 2025)
    perSecond: 1_100_000 / 86400,
    source: "U.S. Dept of State / Kiel Institute Ukraine Support Tracker",
    sourceUrl: "https://www.state.gov/bureau-of-political-military-affairs/releases/2025/01/u-s-security-cooperation-with-ukraine",
    note: "Total military assistance since Feb 2022. New commitments largely halted since Jan 2025; NDAA FY26 authorized $400M. Daily rate reflects logistics/maintenance only.",
  },
  {
    id: "israel-aid",
    name: "Israel / Gaza Military Aid",
    shortName: "Israel",
    theater: "ME",
    startDate: "2023-10-07",
    anchorDate: "2025-10-07",
    anchorTotal: 21_700_000_000, // $21.7B in military aid
    dailyRate: 12_000_000,       // ~$12M/day ($3.8B MOU/yr + supplemental pace)
    perSecond: 12_000_000 / 86400,
    source: "Brown University Costs of War / Hartung",
    sourceUrl: "https://costsofwar.watson.brown.edu/paper/AidToIsrael",
    note: "Military aid and arms transfers Oct 2023 – Sep 2025. Ongoing rate based on $3.8B/yr MOU + supplemental appropriations pace.",
  },
  {
    id: "red-sea-houthi",
    name: "Red Sea / Houthi Operations",
    shortName: "Houthis",
    theater: "ME",
    startDate: "2023-11-19",
    anchorDate: "2026-02-01",
    anchorTotal: 4_500_000_000,  // ~$4.5B (munitions + operations)
    dailyRate: 8_000_000,        // ~$8M/day ongoing naval ops
    perSecond: 8_000_000 / 86400,
    source: "CNN / Brown University Costs of War",
    sourceUrl: "https://www.cnn.com/2025/04/04/politics/cost-us-military-houthis-limited-impact",
    note: "Cumulative munitions ($1.16B Navy-reported) + operational costs. Includes SM-2/SM-6 interceptors at $2-4M each.",
  },
];

/** Compute the estimated total spend for a stream as of a given timestamp */
export function estimateTotal(stream: ConflictStream, now: number): number {
  const anchorMs = new Date(stream.anchorDate).getTime();
  const elapsedDays = Math.max(0, (now - anchorMs) / 86_400_000);
  return stream.anchorTotal + stream.dailyRate * elapsedDays;
}

/** Compute grand total across all streams */
export function estimateGrandTotal(streams: ConflictStream[], now: number): number {
  return streams.reduce((sum, s) => sum + estimateTotal(s, now), 0);
}

/** Format a dollar amount with commas and no decimals */
export function formatUSD(n: number): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Format with full digit display for the big counter (e.g. $109,600,000,000) */
export function formatUSDFull(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
