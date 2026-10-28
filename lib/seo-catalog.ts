/**
 * The catalog behind the indexable economy pages (/benchmark, /economy,
 * /embed, /methodology): clean URL slugs, the federal agency and FRED series
 * behind every metric, and how each one is calculated.
 *
 * Keys match /api/benchmark-data (month-aligned, month 0 = inauguration
 * month, first 48 months of each administration). Counts shown anywhere on
 * the site should come from here, never from a hard-coded number.
 */

export const SITE = "https://voteunbiased.org";

export interface MetricInfo {
  key: string;            // /api/benchmark-data key
  slug: string;           // /benchmark/{slug}
  name: string;           // human name for titles
  agency: string;         // primary federal (or official) publisher
  agencyUrl: string;
  series: string[];       // FRED series IDs
  method: string;         // how the number is calculated
  /** Dashboard metric key, for "open in the interactive dashboard". */
  dash?: string;
}

const fred = (id: string) => `https://fred.stlouisfed.org/series/${id}`;
export const fredUrl = fred;

export const METRICS: MetricInfo[] = [
  { key: "gdp_growth", slug: "gdp", name: "GDP Growth", agency: "Bureau of Economic Analysis (BEA)", agencyUrl: "https://www.bea.gov/data/gdp/gross-domestic-product", series: ["A191RL1Q225SBEA"], dash: "gdp",
    method: "Real GDP growth at a seasonally adjusted annual rate, as published quarterly by the BEA. Each quarter's value is carried across its three months." },
  { key: "real_gdp", slug: "real-gdp", name: "Real GDP", agency: "Bureau of Economic Analysis (BEA)", agencyUrl: "https://www.bea.gov/data/gdp/gross-domestic-product", series: ["GDPC1"], dash: "real_gdp",
    method: "Inflation-adjusted GDP in trillions of chained 2017 dollars (quarterly). Because the economy grows over decades, administrations are ranked on the % change since their own month 0, not on the level." },
  { key: "unemployment", slug: "unemployment", name: "Unemployment Rate", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cps/", series: ["UNRATE"], dash: "unemployment",
    method: "The official U-3 unemployment rate from the BLS Current Population Survey, monthly and seasonally adjusted. Lower ranks better." },
  { key: "lfpr", slug: "labor-force-participation", name: "Labor Force Participation", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cps/", series: ["CIVPART"], dash: "lfpr",
    method: "Share of the civilian population 16 and over that is working or looking for work (BLS, monthly)." },
  { key: "jobs", slug: "jobs", name: "Jobs Added per Month", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/ces/", series: ["PAYEMS"], dash: "jobs",
    method: "Month-over-month change in total nonfarm payrolls from the BLS establishment survey, in thousands of jobs." },
  { key: "mfg", slug: "manufacturing-jobs", name: "Manufacturing Jobs", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/ces/", series: ["MANEMP"], dash: "mfg",
    method: "Total manufacturing employment in millions (BLS, monthly). Ranked on the % change since each administration's month 0." },
  { key: "inflation", slug: "inflation-cpi", name: "Inflation (CPI)", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cpi/", series: ["CPIAUCSL"], dash: "inflation",
    method: "Year-over-year % change in the Consumer Price Index for All Urban Consumers (CPI-U), seasonally adjusted. Lower ranks better." },
  { key: "core_cpi", slug: "core-inflation", name: "Core Inflation", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cpi/", series: ["CPILFESL"],
    method: "Year-over-year % change in CPI excluding food and energy (BLS). Lower ranks better." },
  { key: "gas", slug: "gas-prices", name: "Gas Prices", agency: "Energy Information Administration (EIA)", agencyUrl: "https://www.eia.gov/petroleum/gasdiesel/", series: ["GASREGCOVM"], dash: "gas",
    method: "Average U.S. retail price of regular gasoline, dollars per gallon, monthly (EIA via FRED). Ranked on the % change since month 0." },
  { key: "wages", slug: "wages", name: "Real Wages", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cps/earnings.htm", series: ["LES1252881600Q"], dash: "wages",
    method: "Year-over-year % change in median usual weekly earnings of full-time workers in constant dollars (BLS, quarterly)." },
  { key: "purchasing", slug: "purchasing-power", name: "Purchasing Power of the Dollar", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/cpi/", series: ["CPIAUCSL"], dash: "purchasing",
    method: "What a dollar at the start of the term buys at each later month: CPI at month 0 divided by CPI at that month. Ranked on the % change since month 0." },
  { key: "fed_rate", slug: "interest-rates", name: "Federal Funds Rate", agency: "Federal Reserve", agencyUrl: "https://www.federalreserve.gov/monetarypolicy/openmarket.htm", series: ["FEDFUNDS"], dash: "fed_rate",
    method: "Effective federal funds rate, monthly average (Federal Reserve). Set by the Fed, not the president; shown for context." },
  { key: "debt_gdp", slug: "debt-gdp", name: "Debt-to-GDP", agency: "U.S. Treasury and OMB (via St. Louis Fed)", agencyUrl: "https://fiscaldata.treasury.gov/", series: ["GFDEGDQ188S"], dash: "debt_gdp",
    method: "Total public debt as a percent of GDP, quarterly (Treasury and OMB data compiled by the St. Louis Fed). Lower ranks better." },
  { key: "trade", slug: "trade-balance", name: "Trade Balance", agency: "Census Bureau and BEA", agencyUrl: "https://www.census.gov/foreign-trade/", series: ["BOPGSTB"], dash: "trade",
    method: "Monthly U.S. balance of trade in goods and services, in billions of dollars (Census Bureau and BEA). Negative = deficit." },
  { key: "mortgage", slug: "mortgage-rates", name: "30-Year Mortgage Rate", agency: "Freddie Mac", agencyUrl: "https://www.freddiemac.com/pmms", series: ["MORTGAGE30US"],
    method: "Average 30-year fixed mortgage rate from Freddie Mac's weekly survey, one reading per month. Lower ranks better." },
  { key: "housing_starts", slug: "housing-starts", name: "Housing Starts", agency: "Census Bureau", agencyUrl: "https://www.census.gov/construction/nrc/", series: ["HOUST"],
    method: "New privately owned housing units started, thousands at a seasonally adjusted annual rate (Census Bureau, monthly)." },
  { key: "retail", slug: "retail-sales", name: "Retail Sales", agency: "Census Bureau", agencyUrl: "https://www.census.gov/retail/", series: ["RSAFS"],
    method: "Monthly retail and food services sales in billions of dollars (Census Bureau). Ranked on the % change since month 0." },
  { key: "openings", slug: "job-openings", name: "Job Openings", agency: "Bureau of Labor Statistics (BLS JOLTS)", agencyUrl: "https://www.bls.gov/jlt/", series: ["JTSJOL"],
    method: "Total nonfarm job openings in millions (BLS Job Openings and Labor Turnover Survey, monthly, from 2000)." },
  { key: "openings_per_worker", slug: "job-openings-per-job-seeker", name: "Job Openings per Job Seeker", agency: "Bureau of Labor Statistics (BLS)", agencyUrl: "https://www.bls.gov/jlt/", series: ["JTSJOL", "UNEMPLOY"],
    method: "Job openings divided by the number of unemployed people (both BLS). Above 1 means more openings than job seekers." },
  { key: "saving", slug: "saving-rate", name: "Personal Saving Rate", agency: "Bureau of Economic Analysis (BEA)", agencyUrl: "https://www.bea.gov/data/income-saving/personal-saving-rate", series: ["PSAVERT"],
    method: "Personal saving as a percent of disposable personal income (BEA, monthly)." },
  { key: "consumer_conf", slug: "consumer-sentiment", name: "Consumer Sentiment", agency: "University of Michigan Surveys of Consumers", agencyUrl: "https://www.sca.isr.umich.edu/", series: ["UMCSENT"], dash: "consumer_conf",
    method: "University of Michigan Index of Consumer Sentiment (1966 = 100), monthly." },
  { key: "sp500", slug: "sp500", name: "S&P 500", agency: "S&P Dow Jones Indices (via FRED)", agencyUrl: "https://www.spglobal.com/spdji/", series: ["SP500"], dash: "sp500",
    method: "Monthly average of the S&P 500 daily close. FRED is licensed only the last ~10 years, so only recent administrations are covered." },
  { key: "ten_year", slug: "10-year-treasury", name: "10-Year Treasury Yield", agency: "Federal Reserve", agencyUrl: "https://www.federalreserve.gov/releases/h15/", series: ["GS10"], dash: "ten_year",
    method: "Monthly average of the 10-year constant-maturity Treasury yield (Federal Reserve H.15)." },
  { key: "five_year", slug: "5-year-treasury", name: "5-Year Treasury Yield", agency: "Federal Reserve", agencyUrl: "https://www.federalreserve.gov/releases/h15/", series: ["GS5"], dash: "five_year",
    method: "Monthly average of the 5-year constant-maturity Treasury yield (Federal Reserve H.15)." },
  { key: "yield_curve", slug: "yield-curve", name: "Yield Curve (10Y–2Y)", agency: "Federal Reserve", agencyUrl: "https://www.federalreserve.gov/releases/h15/", series: ["T10Y2YM"], dash: "yield_curve",
    method: "10-year minus 2-year Treasury yield, in percentage points (monthly). Below zero (inverted) has preceded every U.S. recession since the late 1970s." },
  { key: "deficit", slug: "budget-deficit", name: "Federal Budget Balance", agency: "U.S. Treasury (Monthly Treasury Statement)", agencyUrl: "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/", series: ["MTSDS133FMS"], dash: "deficit",
    method: "Rolling 12-month sum of the monthly federal surplus or deficit (Treasury), in billions. Negative = deficit." },
];

export interface AdminInfo { id: string; slug: string; name: string; full: string; party: "D" | "R"; start: number; aliases?: string[] }
export const ADMINS: AdminInfo[] = [
  { id: "nixon", slug: "nixon", name: "Nixon", full: "Richard Nixon", party: "R", start: 1969 },
  { id: "carter", slug: "carter", name: "Carter", full: "Jimmy Carter", party: "D", start: 1977 },
  { id: "reagan", slug: "reagan", name: "Reagan", full: "Ronald Reagan", party: "R", start: 1981 },
  { id: "bush41", slug: "george-hw-bush", name: "Bush 41", full: "George H. W. Bush", party: "R", start: 1989, aliases: ["bush41", "bush-41", "bush-sr"] },
  { id: "clinton", slug: "clinton", name: "Clinton", full: "Bill Clinton", party: "D", start: 1993 },
  { id: "bush43", slug: "george-w-bush", name: "Bush 43", full: "George W. Bush", party: "R", start: 2001, aliases: ["bush43", "bush-43", "bush"] },
  { id: "obama", slug: "obama", name: "Obama", full: "Barack Obama", party: "D", start: 2009 },
  { id: "trump1", slug: "trump-first-term", name: "Trump I", full: "Donald Trump (first term)", party: "R", start: 2017, aliases: ["trump1", "trump-1", "trump-2017"] },
  { id: "biden", slug: "biden", name: "Biden", full: "Joe Biden", party: "D", start: 2021 },
  { id: "trump2", slug: "trump-second-term", name: "Trump II", full: "Donald Trump (second term)", party: "R", start: 2025, aliases: ["trump2", "trump-2", "trump-2025", "trump"] },
];

export const METRIC_COUNT = METRICS.length;
export const ADMIN_COUNT = ADMINS.length;
export const FIRST_YEAR = Math.min(...ADMINS.map(a => a.start));

export const metricBySlug = (s: string) => METRICS.find(m => m.slug === s.toLowerCase()) ?? null;
export const metricByKey = (k: string) => METRICS.find(m => m.key === k) ?? null;
export const adminBySlug = (s: string) => ADMINS.find(a => a.slug === s.toLowerCase()) ?? null;
/** Old or informal names (?admin=bush, /economy/trump) → the canonical admin. */
export const adminByAlias = (s: string) => ADMINS.find(a => a.slug === s.toLowerCase() || a.id === s.toLowerCase() || a.aliases?.includes(s.toLowerCase())) ?? null;
/** Dashboard ?metric= key → benchmark metric. */
export const metricForDash = (k: string) => METRICS.find(m => m.dash === k || m.key === k) ?? null;

export const benchmarkUrl = (m: MetricInfo) => `${SITE}/benchmark/${m.slug}`;
export const economyUrl = (a: AdminInfo, m?: MetricInfo) => `${SITE}/economy/${a.slug}${m ? `/${m.slug}` : ""}`;
