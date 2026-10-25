/**
 * Which official series a dashboard link is about, for its share card.
 * Dashboard metric keys (?metric=inflation) map to catalog series; catalog
 * ids (?metric=cpi_mom, ppi_yoy) work directly.
 */
import { CATALOG_BY_ID } from "./series";

const DASH_TO_SERIES: Record<string, string> = {
  inflation: "cpi_yoy", core_cpi: "core_cpi_yoy", gas: "gas", unemployment: "unemployment",
  jobs: "payrolls_chg", mfg: "mfg_jobs", fed_rate: "fed_funds", mortgage: "mortgage", sp500: "sp500",
  gdp_growth: "gdp_growth", real_gdp: "gdp_growth", wages: "real_wages", deficit: "deficit_12m", debt_gdp: "debt",
  trade: "trade_balance", housing_starts: "housing_starts", retail: "retail_sales", consumer_conf: "consumer_sentiment",
  openings: "job_openings", openings_per_worker: "job_openings", lfpr: "lfpr", ten_year: "treasury_10y",
  five_year: "treasury_10y", yield_curve: "treasury_10y", purchasing: "cpi_yoy", saving: "retail_sales",
};

export function shareSeriesFor(metric: string | null | undefined): string | null {
  if (!metric) return null;
  const m = metric.trim().toLowerCase();
  if (CATALOG_BY_ID.has(m) && !CATALOG_BY_ID.get(m)!.wb) return m;
  const id = DASH_TO_SERIES[m];
  return id && CATALOG_BY_ID.has(id) ? id : null;
}

/** Short name for titles ("US inflation", "Gas prices"). */
export function shortName(id: string): string {
  const label = CATALOG_BY_ID.get(id)?.label || id;
  return label.replace(/\s*\(.*?\)\s*/g, " ").replace(/, (average price|monthly|total)$/i, "").replace(/\s+/g, " ").trim();
}

/** The dashboard metric that shows a series, for "compare presidents" links. */
export function dashboardMetricFor(id: string): string | null {
  const pref: Record<string, string> = { cpi_yoy: "inflation", core_cpi_yoy: "core_cpi", payrolls_chg: "jobs", gdp_growth: "gdp_growth", debt: "debt_gdp", treasury_10y: "ten_year" };
  if (pref[id]) return pref[id];
  for (const [k, v] of Object.entries(DASH_TO_SERIES)) if (v === id) return k;
  return null;
}

/** Series Sam's share kit offers by default. */
export const SHARE_METRICS = ["cpi_yoy", "cpi_mom", "core_cpi_yoy", "ppi_yoy", "ppi_mom", "gas", "unemployment", "payrolls_chg", "debt", "deficit_12m",
  "treasury_10y", "mortgage", "fed_funds", "sp500", "approval", "border_sw", "murder_rate", "oil_wti", "consumer_sentiment", "real_wages"];
