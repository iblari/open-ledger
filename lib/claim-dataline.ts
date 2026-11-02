export const AGENCIES = /\b(BLS|BEA|EIA|IMF|CBO|OECD|FRED|CBP|FBI|CDC|EPA|USDA|Census Bureau|Treasury|Federal Reserve|World Bank|Statistics Canada|Eurostat|OPEC|AAA|Gallup|Ballotpedia|CMS|KFF|SSA|DHS|DOJ|GAO|OMB|FDA|NOAA|NASA|UN|WHO)\b/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** First sentence of the finding: the data, numbers first. */
export function dataLineOf(actual: string): string {
  const s = squash(actual);
  return (s.split(/(?<=[.;])\s+(?=[A-Z$0-9])/)[0] || s).replace(/[.;]\s*$/, "");
}
