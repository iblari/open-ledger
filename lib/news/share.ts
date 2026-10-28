import { LEAN_TOTALS } from "./outlets";
import type { Story } from "./engine";

/** Shared pieces for a story's preview card, page metadata and share-kit item. */
const SITE = "https://voteunbiased.org";
export const storyPath = (s: Story) => `/news/${s.slug}`;
/** The card URL changes when the counts do, so X and others fetch a fresh one. */
export const storyImage = (s: Story) =>
  `${SITE}/news/${s.slug}/opengraph-image?v=${s.coverage.left}-${s.coverage.center}-${s.coverage.right}`;

export const etTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** One neutral line: how many of each side's outlets covered it. */
export function storyDataLine(s: Story): string {
  const c = s.coverage;
  return `Covered by ${c.left} of ${LEAN_TOTALS.left} left-leaning (${pct(s.rate.left)}), ${c.center} of ${LEAN_TOTALS.center} center (${pct(s.rate.center)}) and ${c.right} of ${LEAN_TOTALS.right} right-leaning (${pct(s.rate.right)}) outlets we read, as of ${etTime(s.asOf || s.lastSeen)}`;
}
