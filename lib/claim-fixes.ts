import { normQuote } from "./claim-link";

/**
 * Hand-corrected fact-checks: a transcription or verdict the pipeline got
 * wrong, replaced at read time (trending feed, share kit, /c/[key]) without
 * touching the stored record. Matched by broadcast and the stored quote.
 */
interface ClaimFix {
  videoId: string;
  from: string;
  quote: string;
  rating: string;
  actual: string;
  explanation: string;
  sources: { title: string; url: string }[];
}

const FIXES: ClaimFix[] = [
  {
    // Captions ran "98, 99%" together as "9899%", so the check rated an impossible number.
    videoId: "_MWwc6p33yM",
    from: "CNN at 9899% approval",
    quote: "CNN at 98, 99% approval",
    rating: "FALSE",
    actual:
      "CNN's September 2026 SSRS poll put Trump's approval at 33% overall; the 98% figure is CNN's reading among MAGA Republicans only",
    explanation:
      "In the broadcast, Trump cites a CNN approval figure of 98 to 99% and then says a CNN poll had him at 99% of the Republican Party. " +
      "A 98% figure appeared in a September 2026 CNN analysis, but it covers self-identified MAGA Republicans, a subset of the party. " +
      "CNN's own SSRS poll in September put overall approval at 33%, and its October 15–18 poll put approval among all Republicans at 74%.",
    sources: [
      { title: "CNN poll: Trump's midterm woes deepen amid worsened economic backdrop (Sept. 23, 2026)", url: "https://www.cnn.com/2026/09/23/politics/cnn-poll-donald-trump-economy-midterms-vis" },
      { title: "CNN poll: Trump's approval rating hits a new low as midterms enter final stretch (Oct. 21, 2026)", url: "https://www.cnn.com/2026/10/21/politics/cnn-poll-trump-democrats-republicans-midterms" },
    ],
  },
];

export function fixClaim<T extends { quote: string; rating: string; actual?: string; explanation?: string; sources?: { title: string; url: string }[] }>(videoId: string, c: T): T {
  const q = normQuote(c.quote);
  const f = FIXES.find(x => x.videoId === videoId && normQuote(x.from) === q);
  return f ? { ...c, quote: f.quote, rating: f.rating, actual: f.actual, explanation: f.explanation, sources: f.sources } : c;
}
