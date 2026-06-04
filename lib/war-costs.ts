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
  /** Detailed methodology for drill-down */
  methodology: {
    anchorExplainer: string;
    rateExplainer: string;
    caveats: string;
    additionalSources: { label: string; url: string }[];
  };
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
    methodology: {
      anchorExplainer: "CSIS published cumulative cost estimates at two milestones: $11.3B at day 6 (March 6) and $16.5B at day 12 (March 12). These include operations, munitions expended, and munitions replacement costs. We anchor at the day 12 figure.",
      rateExplainer: "The initial strike phase (Feb 28–Mar 5) burned ~$1.88B/day due to heavy use of Tomahawks ($2M each) and JASSMs. The sustained phase since ~Mar 5 costs ~$200–300M/day. We use $250M/day as the midpoint. The Penn Wharton Budget Model projected $47B through April at roughly this rate.",
      caveats: "Munitions replacement costs are estimates — actual Pentagon contracts may differ. Does not include long-term veteran care, base reconstruction, or economic disruption costs. Classified programs not included.",
      additionalSources: [
        { label: "CSIS: $3.7B first 100 hours", url: "https://www.csis.org/analysis/37-billion-estimated-cost-epic-furys-first-100-hours" },
        { label: "Penn Wharton: $47B projection", url: "https://www.thedp.com/article/2026/04/penn-wharton-budget-model-iran-strike-cost-operation-epic-fury-trump" },
        { label: "ABC7: Daily cost breakdown", url: "https://abc7chicago.com/post/iran-war-cost-heres-how-operation-epic-fury-is-expected-every-day/18684961/" },
      ],
    },
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
    methodology: {
      anchorExplainer: "The State Department reported $66.9B in military assistance committed since Russia's full-scale invasion (Feb 24, 2022) through January 2025. The Kiel Institute tracker corroborates at €114.6B total (all aid types, not just military). We use the military-only figure.",
      rateExplainer: "New aid commitments were largely frozen after January 20, 2025. The NDAA for FY2026/2027 authorized only $400M via USAI — a fraction of prior years. The $1.1M/day rate reflects estimated ongoing logistics and maintenance costs for already-delivered systems, not new packages.",
      caveats: "This counts committed military aid, not necessarily disbursed. Some allocated funds have not yet been drawn down. The distinction between 'committed' ($66.9B) and 'disbursed' (~$42B per Ukraine Oversight) matters — we use the higher committed figure because those funds are obligated.",
      additionalSources: [
        { label: "Kiel Institute Ukraine Support Tracker", url: "https://www.kielinstitut.de/topics/war-against-ukraine/ukraine-support-tracker/" },
        { label: "CFR: How much aid has the US sent", url: "https://www.cfr.org/articles/how-much-us-aid-going-ukraine" },
        { label: "Ukraine Oversight (disbursements)", url: "https://www.ukraineoversight.gov/Funding/" },
      ],
    },
  },
  {
    id: "israel-aid",
    name: "Israel / Gaza Military Aid",
    shortName: "Israel",
    theater: "ME",
    startDate: "2023-10-07",
    anchorDate: "2025-10-07",
    anchorTotal: 21_700_000_000,  // $21.7B in military aid over 2 years
    dailyRate: 29_700_000,        // ~$29.7M/day (actual average: $21.7B / 730 days)
    perSecond: 29_700_000 / 86400,
    source: "Brown University Costs of War / Hartung",
    sourceUrl: "https://costsofwar.watson.brown.edu/paper/AidToIsrael",
    note: "Military aid and arms transfers Oct 2023 – Sep 2025. Daily rate is the actual 2-year average ($21.7B ÷ 730 days = $29.7M/day), which captures both the $3.8B/yr MOU baseline and supplemental emergency packages.",
    methodology: {
      anchorExplainer: "Brown University's Costs of War project (researcher William Hartung, Quincy Institute) documented $21.7B in US military aid to Israel from October 7, 2023 through September 30, 2025. Year 1 (Biden): $17.9B. Year 2 (Trump): $3.8B. This includes FMF, emergency supplementals, and missile defense funding.",
      rateExplainer: "We use the actual historical average: $21.7B ÷ 730 days = $29.7M/day. This is higher than the $3.8B/yr MOU baseline ($10.4M/day) because it includes emergency packages — the $8.7B April 2024 supplemental ($3.5B FMF + $5.2B missile defense), the $4B Rubio fast-track in March 2025, and $8B in notified arms sales in January 2025. The rate may slow if supplemental pace decreases.",
      caveats: "Counts military aid and arms transfers only — not humanitarian aid or economic support. Does not include the tens of billions in future arms sale agreements already notified to Congress. The year-2 drop ($17.9B → $3.8B) could mean the forward rate is lower than the 2-year average; we use the average as the best available estimate.",
      additionalSources: [
        { label: "CFR: US aid to Israel in four charts", url: "https://www.cfr.org/articles/us-aid-israel-four-charts" },
        { label: "CRS: US Foreign Aid to Israel", url: "https://www.congress.gov/crs-product/RL33222" },
        { label: "Military.com: $21.7B since war began", url: "https://www.military.com/daily-news/2025/10/07/us-has-given-least-217-billion-military-aid-israel-war-gaza-began-report-says.html" },
      ],
    },
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
    methodology: {
      anchorExplainer: "CNN reported ~$1B in costs for the March 2025 Trump offensive alone (3 weeks). The Navy reported $1.16B in munitions through mid-July 2024. Brown University estimated $4.8–7.2B for all regional operations (Yemen + sustainment + Israel support). We use a conservative $4.5B for Houthi ops specifically, separating Israel aid into its own stream.",
      rateExplainer: "The $8M/day rate reflects ongoing carrier strike group operational costs in the Red Sea. Each SM-2 interceptor costs ~$2.1M, SM-6 costs ~$4.3M. Vice Adm. McLane reported 120 SM-2s and 80 SM-6s expended through January 2025. The asymmetry — million-dollar missiles vs. thousand-dollar drones — is a key cost driver.",
      caveats: "Separating Houthi-specific costs from broader Middle East operations is imprecise. Some costs overlap with the Israel aid stream (e.g., carrier deployments serve both missions). We count munitions + direct operational costs only, not ship depreciation or crew hazard pay.",
      additionalSources: [
        { label: "Breaking Defense: Red Sea cost-effective solutions", url: "https://breakingdefense.com/2024/05/high-price-of-red-sea-shootdowns-speeds-navys-pursuit-of-cost-effective-solutions/" },
        { label: "Brown: Wider Middle East costs", url: "https://costsofwar.watson.brown.edu/paper/WiderMiddleEastCosts" },
        { label: "Responsible Statecraft: Cost just went up", url: "https://responsiblestatecraft.org/operation-prosperity-guardian/" },
      ],
    },
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

/*
 * ── Monthly time-series data ──
 *
 * Cumulative spend per conflict per month (in $B).
 * Reconstructed from supplemental appropriations timelines, DoD press releases,
 * CSIS cost estimates, and Brown University Costs of War data.
 *
 * Values are cumulative totals in $B at end of that month.
 * null = conflict not yet started.
 */

export type SpendRow = {
  month: string;       // "YYYY-MM"
  ukraine: number;
  israel: number | null;
  houthis: number | null;
  iran: number | null;
};

// Helper to interpolate between known quarterly anchors for monthly granularity
// Values between anchors are linearly interpolated; this is a simplification
// but avoids false precision on exact monthly drawdowns.
export const MONTHLY_SPEND: SpendRow[] = [
  // ── 2022 ──
  { month: "2022-02", ukraine: 0.6,  israel: null, houthis: null, iran: null },
  { month: "2022-03", ukraine: 2.0,  israel: null, houthis: null, iran: null },
  { month: "2022-04", ukraine: 3.3,  israel: null, houthis: null, iran: null },
  { month: "2022-05", ukraine: 5.0,  israel: null, houthis: null, iran: null },
  { month: "2022-06", ukraine: 7.3,  israel: null, houthis: null, iran: null },
  { month: "2022-07", ukraine: 9.0,  israel: null, houthis: null, iran: null },
  { month: "2022-08", ukraine: 11.5, israel: null, houthis: null, iran: null },
  { month: "2022-09", ukraine: 14.5, israel: null, houthis: null, iran: null },
  { month: "2022-10", ukraine: 16.5, israel: null, houthis: null, iran: null },
  { month: "2022-11", ukraine: 19.0, israel: null, houthis: null, iran: null },
  { month: "2022-12", ukraine: 21.9, israel: null, houthis: null, iran: null },
  // ── 2023 ──
  { month: "2023-01", ukraine: 23.5, israel: null, houthis: null, iran: null },
  { month: "2023-02", ukraine: 26.0, israel: null, houthis: null, iran: null },
  { month: "2023-03", ukraine: 29.0, israel: null, houthis: null, iran: null },
  { month: "2023-04", ukraine: 31.5, israel: null, houthis: null, iran: null },
  { month: "2023-05", ukraine: 34.0, israel: null, houthis: null, iran: null },
  { month: "2023-06", ukraine: 37.0, israel: null, houthis: null, iran: null },
  { month: "2023-07", ukraine: 39.5, israel: null, houthis: null, iran: null },
  { month: "2023-08", ukraine: 41.5, israel: null, houthis: null, iran: null },
  { month: "2023-09", ukraine: 44.0, israel: null, houthis: null, iran: null },
  { month: "2023-10", ukraine: 45.5, israel: 0.8,  houthis: null, iran: null },
  { month: "2023-11", ukraine: 46.5, israel: 1.8,  houthis: 0.05, iran: null },
  { month: "2023-12", ukraine: 48.0, israel: 3.8,  houthis: 0.2,  iran: null },
  // ── 2024 ──
  { month: "2024-01", ukraine: 48.5, israel: 4.2,  houthis: 0.4,  iran: null },
  { month: "2024-02", ukraine: 49.2, israel: 4.8,  houthis: 0.6,  iran: null },
  { month: "2024-03", ukraine: 50.0, israel: 5.5,  houthis: 0.8,  iran: null },
  { month: "2024-04", ukraine: 51.5, israel: 8.5,  houthis: 1.0,  iran: null },
  { month: "2024-05", ukraine: 53.5, israel: 11.0, houthis: 1.2,  iran: null },
  { month: "2024-06", ukraine: 56.5, israel: 14.0, houthis: 1.5,  iran: null },
  { month: "2024-07", ukraine: 58.0, israel: 15.0, houthis: 1.7,  iran: null },
  { month: "2024-08", ukraine: 60.0, israel: 15.8, houthis: 1.8,  iran: null },
  { month: "2024-09", ukraine: 62.0, israel: 16.5, houthis: 2.0,  iran: null },
  { month: "2024-10", ukraine: 63.5, israel: 17.0, houthis: 2.1,  iran: null },
  { month: "2024-11", ukraine: 65.0, israel: 17.5, houthis: 2.3,  iran: null },
  { month: "2024-12", ukraine: 66.5, israel: 17.9, houthis: 2.4,  iran: null },
  // ── 2025 ──
  { month: "2025-01", ukraine: 66.8, israel: 18.8, houthis: 2.6,  iran: null },
  { month: "2025-02", ukraine: 66.9, israel: 19.3, houthis: 2.8,  iran: null },
  { month: "2025-03", ukraine: 66.9, israel: 20.0, houthis: 3.5,  iran: null },
  { month: "2025-04", ukraine: 66.9, israel: 20.3, houthis: 3.8,  iran: null },
  { month: "2025-05", ukraine: 67.0, israel: 20.5, houthis: 4.0,  iran: null },
  { month: "2025-06", ukraine: 67.0, israel: 20.8, houthis: 4.0,  iran: null },
  { month: "2025-07", ukraine: 67.0, israel: 21.0, houthis: 4.1,  iran: null },
  { month: "2025-08", ukraine: 67.0, israel: 21.3, houthis: 4.1,  iran: null },
  { month: "2025-09", ukraine: 67.0, israel: 21.5, houthis: 4.2,  iran: null },
  { month: "2025-10", ukraine: 67.0, israel: 21.6, houthis: 4.2,  iran: null },
  { month: "2025-11", ukraine: 67.0, israel: 21.6, houthis: 4.3,  iran: null },
  { month: "2025-12", ukraine: 67.0, israel: 21.7, houthis: 4.3,  iran: null },
  // ── 2026 ──
  { month: "2026-01", ukraine: 67.0, israel: 22.0, houthis: 4.4,  iran: null },
  { month: "2026-02", ukraine: 67.0, israel: 22.2, houthis: 4.5,  iran: 0.0 },
  { month: "2026-03", ukraine: 67.1, israel: 22.4, houthis: 4.5,  iran: 27.5 },
];

/** Compute period-over-period deltas */
export type DeltaRow = {
  label: string;
  month: string;
  ukraine: number;
  israel: number;
  houthis: number;
  iran: number;
  total: number;
};

/** Format a month string into a display label */
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(mo) - 1]} '${y.slice(2)}`;
}

/** Format a quarter label from end-of-quarter month */
function quarterLabel(m: string): string {
  const [y, mo] = m.split("-");
  const q = Math.ceil(parseInt(mo) / 3);
  return `Q${q} '${y.slice(2)}`;
}

/**
 * Compute deltas at a given step size.
 * step=1 → MoM, step=3 → QoQ, step=6 → HoH, step=12 → YoY
 * For QoQ/HoH/YoY, we sample at quarter-end months (Mar, Jun, Sep, Dec).
 */
export function computeDeltas(data: SpendRow[], step: number, labelFn?: "month" | "quarter"): DeltaRow[] {
  const result: DeltaRow[] = [];
  // For step > 1, filter to quarter-end months first
  let filtered = data;
  if (step >= 3) {
    filtered = data.filter(r => {
      const mo = parseInt(r.month.split("-")[1]);
      return mo % 3 === 0; // Mar, Jun, Sep, Dec
    });
    // Adjust step: QoQ = every 1 quarter-end, HoH = every 2, YoY = every 4
    const qStep = step === 3 ? 1 : step === 6 ? 2 : step === 12 ? 4 : 1;
    for (let i = qStep; i < filtered.length; i++) {
      const curr = filtered[i];
      const prev = filtered[i - qStep];
      if (!prev) continue;
      const dU = curr.ukraine - prev.ukraine;
      const dI = (curr.israel ?? 0) - (prev.israel ?? 0);
      const dH = (curr.houthis ?? 0) - (prev.houthis ?? 0);
      const dR = (curr.iran ?? 0) - (prev.iran ?? 0);
      result.push({
        label: labelFn === "month" ? monthLabel(curr.month) : quarterLabel(curr.month),
        month: curr.month,
        ukraine: Math.round(dU * 10) / 10,
        israel: Math.round(dI * 10) / 10,
        houthis: Math.round(dH * 10) / 10,
        iran: Math.round(dR * 10) / 10,
        total: Math.round((dU + dI + dH + dR) * 10) / 10,
      });
    }
    return result;
  }
  // MoM: use all monthly data
  for (let i = step; i < data.length; i++) {
    const curr = data[i];
    const prev = data[i - step];
    const dU = curr.ukraine - prev.ukraine;
    const dI = (curr.israel ?? 0) - (prev.israel ?? 0);
    const dH = (curr.houthis ?? 0) - (prev.houthis ?? 0);
    const dR = (curr.iran ?? 0) - (prev.iran ?? 0);
    result.push({
      label: monthLabel(curr.month),
      month: curr.month,
      ukraine: Math.round(dU * 10) / 10,
      israel: Math.round(dI * 10) / 10,
      houthis: Math.round(dH * 10) / 10,
      iran: Math.round(dR * 10) / 10,
      total: Math.round((dU + dI + dH + dR) * 10) / 10,
    });
  }
  return result;
}
