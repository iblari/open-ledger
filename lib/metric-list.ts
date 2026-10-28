/**
 * The one list of measures, shared by both Data-tab views ("Whole terms"
 * and "Same point in office"): same names, same categories, same order.
 * `key` is the Whole-terms key; `bench` the /api/benchmark-data key.
 */
export const METRIC_CATS: Record<string, string> = {
  growth: "Growth", labor: "Labor Market", prices: "Prices & Wages", people: "Living Standards",
  fiscal: "Fiscal", markets: "Markets & Rates", sentiment: "Sentiment",
};
export interface MetricListItem { key: string; bench: string; name: string; cat: string }
export const METRIC_LIST: MetricListItem[] = [
  { key: "gdp", bench: "gdp_growth", name: "GDP Growth", cat: "growth" },
  { key: "real_gdp", bench: "real_gdp", name: "Real GDP", cat: "growth" },
  { key: "retail", bench: "retail", name: "Retail Sales", cat: "growth" },
  { key: "housing_starts", bench: "housing_starts", name: "Housing Starts", cat: "growth" },
  { key: "unemployment", bench: "unemployment", name: "Unemployment", cat: "labor" },
  { key: "lfpr", bench: "lfpr", name: "Labor Participation", cat: "labor" },
  { key: "jobs", bench: "jobs", name: "Jobs Added", cat: "labor" },
  { key: "mfg", bench: "mfg", name: "Manufacturing Jobs", cat: "labor" },
  { key: "openings", bench: "openings", name: "Job Openings", cat: "labor" },
  { key: "openings_per_worker", bench: "openings_per_worker", name: "Openings per Job Seeker", cat: "labor" },
  { key: "inflation", bench: "inflation", name: "Inflation", cat: "prices" },
  { key: "core_cpi", bench: "core_cpi", name: "Core Inflation", cat: "prices" },
  { key: "gas", bench: "gas", name: "Gas Prices", cat: "prices" },
  { key: "wages", bench: "wages", name: "Real Wages", cat: "prices" },
  { key: "purchasing", bench: "purchasing", name: "Purchasing Power", cat: "prices" },
  { key: "mortgage", bench: "mortgage", name: "Mortgage Rate", cat: "prices" },
  { key: "median_income", bench: "median_income", name: "Median Income", cat: "people" },
  { key: "poverty", bench: "poverty", name: "Poverty Rate", cat: "people" },
  { key: "inequality", bench: "inequality", name: "Inequality", cat: "people" },
  { key: "debt_gdp", bench: "debt_gdp", name: "Debt-to-GDP", cat: "fiscal" },
  { key: "deficit", bench: "deficit", name: "Budget Balance", cat: "fiscal" },
  { key: "trade", bench: "trade", name: "Trade Balance", cat: "fiscal" },
  { key: "fed_rate", bench: "fed_rate", name: "Interest Rate", cat: "fiscal" },
  { key: "saving", bench: "saving", name: "Saving Rate", cat: "fiscal" },
  { key: "sp500", bench: "sp500", name: "S&P 500", cat: "markets" },
  { key: "ten_year", bench: "ten_year", name: "10-Year Treasury", cat: "markets" },
  { key: "five_year", bench: "five_year", name: "5-Year Treasury", cat: "markets" },
  { key: "yield_curve", bench: "yield_curve", name: "Yield Curve (10Y–2Y)", cat: "markets" },
  { key: "consumer_conf", bench: "consumer_conf", name: "Consumer Sentiment", cat: "sentiment" },
];
export const METRIC_BY_BENCH = new Map(METRIC_LIST.map(m => [m.bench, m]));
export const METRIC_BY_KEY = new Map(METRIC_LIST.map(m => [m.key, m]));
