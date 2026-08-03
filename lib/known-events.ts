/**
 * Known economic events — the bookmarkable calendar.
 *
 * WHY THIS EXISTS
 * Live coverage only surfaces events once a stream goes live, and the White
 * House announces most events a few HOURS ahead. That leaves nothing for a
 * viewer to plan around, so nobody builds a habit — they only catch coverage
 * by luck.
 *
 * But the events that matter most to an economic accountability site are
 * published a YEAR in advance: FOMC decisions (with a Powell press conference
 * that is always fact-check-worthy) and the BLS releases that every political
 * claim about jobs and inflation is argued over.
 *
 * Dates below are transcribed from the primary sources:
 *   FOMC 2026 calendar — federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   BLS release schedule — bls.gov/schedule/news_release/
 * Recurring BLS releases follow published rules (Employment Situation: first
 * Friday, 8:30am ET; CPI: mid-month, 8:30am ET), so we generate those and
 * label them as scheduled-by-rule rather than pretending each was verified.
 */

export interface KnownEvent {
  id: string;
  title: string;
  detail: string;
  /** ISO start, UTC. */
  startsAt: string;
  durationMin: number;
  kind: "fomc" | "jobs" | "cpi";
  source: string;
  sourceUrl: string;
  /** Do we expect a live video feed we can fact-check? */
  liveCoverage: boolean;
}

/** FOMC meetings — second day is the decision + press conference (2:00pm ET). */
const FOMC_2026_DECISION_DAYS = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];
const FOMC_2027_DECISION_DAYS = [
  // Tentative schedule published by the Board; refreshed each year.
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-16",
  "2027-07-28", "2027-09-22", "2027-10-27", "2027-12-08",
];

/** ET → UTC. US Eastern is UTC-4 (Mar–Nov) and UTC-5 otherwise. */
function etToUtcIso(day: string, hour: number, minute = 0): string {
  const [y, m, d] = day.split("-").map(Number);
  const dst = m > 3 && m < 11; // close enough for scheduling display
  const offset = dst ? 4 : 5;
  return new Date(Date.UTC(y, m - 1, d, hour + offset, minute)).toISOString();
}

/** First Friday of a month — the Employment Situation rule. */
function firstFriday(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function knownEvents(now = new Date()): KnownEvent[] {
  const out: KnownEvent[] = [];

  for (const day of [...FOMC_2026_DECISION_DAYS, ...FOMC_2027_DECISION_DAYS]) {
    out.push({
      id: `fomc-${day}`,
      title: "Fed interest-rate decision + Powell press conference",
      detail: "FOMC statement at 2:00pm ET, Chair's press conference at 2:30pm — the most fact-checked economic hour of the quarter.",
      startsAt: etToUtcIso(day, 14),
      durationMin: 120,
      kind: "fomc",
      source: "Federal Reserve",
      sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
      liveCoverage: true,
    });
  }

  // Next 12 months of the two releases politicians argue about most.
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    out.push({
      id: `jobs-${y}-${String(m).padStart(2, "0")}`,
      title: "Jobs report (Employment Situation)",
      detail: "BLS releases payrolls and the unemployment rate at 8:30am ET. Expect claims about it within the hour.",
      startsAt: etToUtcIso(firstFriday(y, m), 8, 30),
      durationMin: 60,
      kind: "jobs",
      source: "Bureau of Labor Statistics",
      sourceUrl: "https://www.bls.gov/schedule/news_release/empsit.htm",
      liveCoverage: false,
    });
    // CPI lands mid-month; BLS publishes the exact day per release.
    out.push({
      id: `cpi-${y}-${String(m).padStart(2, "0")}`,
      title: "Inflation report (CPI)",
      detail: "BLS consumer price index, 8:30am ET, mid-month. The number behind most cost-of-living claims.",
      startsAt: etToUtcIso(`${y}-${String(m).padStart(2, "0")}-13`, 8, 30),
      durationMin: 60,
      kind: "cpi",
      source: "Bureau of Labor Statistics",
      sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm",
      liveCoverage: false,
    });
  }

  return out
    .filter(e => new Date(e.startsAt).getTime() > now.getTime() - 3600_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The next N upcoming events. */
export function upcomingKnownEvents(limit = 6, now = new Date()): KnownEvent[] {
  return knownEvents(now).slice(0, limit);
}
