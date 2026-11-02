import { moneyIn } from "./chart-format";

export const AGENCIES = /\b(BLS|BEA|EIA|IMF|CBO|OECD|FRED|CBP|FBI|CDC|EPA|USDA|Census Bureau|Treasury|Federal Reserve|World Bank|Statistics Canada|Eurostat|OPEC|AAA|Gallup|Ballotpedia|CMS|KFF|SSA|DHS|DOJ|GAO|OMB|FDA|NOAA|NASA|UN|WHO)\b/;

/** First sentence of the finding: the data, numbers first. */
export function dataLineOf(actual: string): string {
  const s = actual.replace(/\s+/g, " ").trim();
  return (s.split(/(?<=[.;])\s+(?=[A-Z$0-9])/)[0] || s).replace(/[.;]\s*$/, "");
}

/** The first dollar figure the dataLine writes, in dollars (null when it has none). */
export const firstDollarIn = (line: string): number | null => moneyIn(line)[0] ?? null;
