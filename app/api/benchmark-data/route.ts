import { NextResponse } from 'next/server';

export const revalidate = 86400;

// ── Administrations aligned to inauguration ──
const ADMINS = [
  { id: 'nixon',   name: 'Nixon',    inaug: '1969-01-20', party: 'R' },
  { id: 'carter',  name: 'Carter',   inaug: '1977-01-20', party: 'D' },
  { id: 'reagan',  name: 'Reagan',   inaug: '1981-01-20', party: 'R' },
  { id: 'bush41',  name: 'Bush 41',  inaug: '1989-01-20', party: 'R' },
  { id: 'clinton', name: 'Clinton',  inaug: '1993-01-20', party: 'D' },
  { id: 'bush43',  name: 'Bush 43',  inaug: '2001-01-20', party: 'R' },
  { id: 'obama',   name: 'Obama',    inaug: '2009-01-20', party: 'D' },
  { id: 'trump1',  name: 'Trump I',  inaug: '2017-01-20', party: 'R' },
  { id: 'biden',   name: 'Biden',    inaug: '2021-01-20', party: 'D' },
  { id: 'trump2',  name: 'Trump II', inaug: '2025-01-20', party: 'R', current: true },
];

// ── All FRED series we need to fetch ──
// Some series don't go back to Nixon — that's fine, those admins just won't appear for that metric
const FRED_SERIES: Record<string, string> = {
  UNRATE:            'UNRATE',            // Unemployment rate %, monthly, from 1948
  CPIAUCSL:          'CPIAUCSL',          // CPI index, monthly, from 1947 (for YoY + purchasing power)
  GDP_GROWTH:        'A191RL1Q225SBEA',   // Real GDP growth % annualized, quarterly, from 1947
  GDPC1:             'GDPC1',             // Real GDP level billions 2017$, quarterly, from 1947
  CIVPART:           'CIVPART',           // Labor force participation %, monthly, from 1948
  PAYEMS:            'PAYEMS',            // Nonfarm payrolls thousands, monthly, from 1939
  MANEMP:            'MANEMP',            // Manufacturing employment thousands, monthly, from 1939
  FEDFUNDS:          'FEDFUNDS',          // Federal funds rate %, monthly, from 1954
  CSCICP03USM665S:   'CSCICP03USM665S',   // Consumer confidence, monthly, from 1960
  GFDEGDQ188S:       'GFDEGDQ188S',       // Debt-to-GDP %, quarterly, from 1966
  GASREGCOVM:        'GASREGCOVM',        // Gas price $/gal, monthly, from 1990
  LES1252881600Q:    'LES1252881600Q',    // Median weekly earnings $, quarterly, from 1979
  BOPGSTB:           'BOPGSTB',           // Trade balance millions, monthly, from 1992
};

// ── Metric definitions ──
interface MetricDef {
  key: string;
  label: string;
  short: string;
  unit: string;
  lowerBetter: boolean;
  cat: string;
  transform: 'direct' | 'cpi_yoy' | 'quarterly' | 'gdp_trillions' | 'payroll_change' | 'mfg_millions' | 'wage_yoy' | 'trade_billions' | 'purchasing';
  fredKey: string;
}

const METRICS: MetricDef[] = [
  // Growth
  { key: 'gdp_growth', label: 'GDP Growth', short: 'GDP%', unit: '%', lowerBetter: false, cat: 'growth', transform: 'quarterly', fredKey: 'GDP_GROWTH' },
  { key: 'real_gdp', label: 'Real GDP', short: 'GDP', unit: 'T', lowerBetter: false, cat: 'growth', transform: 'gdp_trillions', fredKey: 'GDPC1' },
  // Labor
  { key: 'unemployment', label: 'Unemployment', short: 'Unemp', unit: '%', lowerBetter: true, cat: 'labor', transform: 'direct', fredKey: 'UNRATE' },
  { key: 'lfpr', label: 'Labor Participation', short: 'LFPR', unit: '%', lowerBetter: false, cat: 'labor', transform: 'direct', fredKey: 'CIVPART' },
  { key: 'jobs', label: 'Nonfarm Payrolls', short: 'Jobs', unit: 'K', lowerBetter: false, cat: 'labor', transform: 'payroll_change', fredKey: 'PAYEMS' },
  { key: 'mfg', label: 'Manufacturing Jobs', short: 'Mfg', unit: 'M', lowerBetter: false, cat: 'labor', transform: 'mfg_millions', fredKey: 'MANEMP' },
  // Prices
  { key: 'inflation', label: 'Inflation (CPI YoY)', short: 'CPI', unit: '%', lowerBetter: true, cat: 'prices', transform: 'cpi_yoy', fredKey: 'CPIAUCSL' },
  { key: 'gas', label: 'Gas Prices', short: 'Gas', unit: '$', lowerBetter: true, cat: 'prices', transform: 'direct', fredKey: 'GASREGCOVM' },
  { key: 'wages', label: 'Real Wages (YoY)', short: 'Wages', unit: '%', lowerBetter: false, cat: 'prices', transform: 'wage_yoy', fredKey: 'LES1252881600Q' },
  { key: 'purchasing', label: 'Purchasing Power', short: '$Pwr', unit: '$', lowerBetter: false, cat: 'prices', transform: 'purchasing', fredKey: 'CPIAUCSL' },
  // Fiscal
  { key: 'fed_rate', label: 'Interest Rate', short: 'Rate', unit: '%', lowerBetter: true, cat: 'fiscal', transform: 'direct', fredKey: 'FEDFUNDS' },
  { key: 'debt_gdp', label: 'Debt-to-GDP', short: 'D/GDP', unit: '%', lowerBetter: true, cat: 'fiscal', transform: 'quarterly', fredKey: 'GFDEGDQ188S' },
  { key: 'trade', label: 'Trade Balance', short: 'Trade', unit: 'B', lowerBetter: false, cat: 'fiscal', transform: 'trade_billions', fredKey: 'BOPGSTB' },
  // Sentiment
  { key: 'consumer_conf', label: 'Consumer Confidence', short: 'Conf', unit: '', lowerBetter: false, cat: 'sentiment', transform: 'direct', fredKey: 'CSCICP03USM665S' },
];

const CATS: Record<string, string> = {
  growth: 'Growth',
  labor: 'Labor Market',
  prices: 'Prices & Wages',
  fiscal: 'Fiscal',
  sentiment: 'Sentiment',
};

// ── Helpers ──
function monthsDiff(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

async function fetchFRED(seriesId: string, apiKey: string, start: string): Promise<{ date: string; value: string }[]> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = await res.json();
  return (json.observations || []).filter((o: { value: string }) => o.value !== '.');
}

function parseObs(obs: { date: string; value: string }[]): { date: Date; value: number }[] {
  return obs.map(o => ({ date: new Date(o.date), value: parseFloat(o.value) })).filter(o => !isNaN(o.value));
}

interface AlignedPoint { month: number; value: number }
interface AdminSeries { id: string; name: string; party: string; current: boolean; data: AlignedPoint[] }

function alignToTerm(parsed: { date: Date; value: number }[], inaugDateStr: string, maxMonths: number): AlignedPoint[] {
  const inaug = new Date(inaugDateStr);
  const points: AlignedPoint[] = [];
  for (const p of parsed) {
    const m = monthsDiff(inaug, p.date);
    if (m < 0 || m > maxMonths) continue;
    points.push({ month: m, value: Math.round(p.value * 100) / 100 });
  }
  return points;
}

// ── Transform functions ──

function cpiToYoY(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  const map = new Map<string, number>();
  for (const p of parsed) map.set(`${p.date.getFullYear()}-${p.date.getMonth()}`, p.value);
  const result: { date: Date; value: number }[] = [];
  for (const p of parsed) {
    const priorVal = map.get(`${p.date.getFullYear() - 1}-${p.date.getMonth()}`);
    if (priorVal && priorVal > 0) {
      result.push({ date: p.date, value: Math.round(((p.value / priorVal) - 1) * 10000) / 100 });
    }
  }
  return result;
}

function quarterlyToMonthly(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  const result: { date: Date; value: number }[] = [];
  for (const p of parsed) {
    for (let i = 0; i < 3; i++) {
      const d = new Date(p.date);
      d.setMonth(d.getMonth() + i);
      result.push({ date: d, value: p.value });
    }
  }
  return result;
}

function toTrillions(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  return parsed.map(p => ({ date: p.date, value: p.value / 1000 }));
}

function toMillions(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  return parsed.map(p => ({ date: p.date, value: p.value / 1000 }));
}

function toBillions(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  return parsed.map(p => ({ date: p.date, value: p.value / 1000 }));
}

function monthlyChange(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  const sorted = [...parsed].sort((a, b) => a.date.getTime() - b.date.getTime());
  const result: { date: Date; value: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    result.push({ date: sorted[i].date, value: sorted[i].value - sorted[i - 1].value });
  }
  return result;
}

function wageYoY(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  // Quarterly data — calculate YoY % change (4 quarters back)
  const sorted = [...parsed].sort((a, b) => a.date.getTime() - b.date.getTime());
  const map = new Map<string, number>();
  for (const p of sorted) map.set(`${p.date.getFullYear()}-${p.date.getMonth()}`, p.value);
  const result: { date: Date; value: number }[] = [];
  for (const p of sorted) {
    const priorVal = map.get(`${p.date.getFullYear() - 1}-${p.date.getMonth()}`);
    if (priorVal && priorVal > 0) {
      result.push({ date: p.date, value: Math.round(((p.value / priorVal) - 1) * 10000) / 100 });
    }
  }
  return result;
}

// Purchasing power: value of $1 at inauguration month, relative to CPI at that month
function purchasingPower(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  // For each admin, we compute purchasing power relative to their first month
  // But since this runs before alignment, just return raw CPI — we'll handle per-admin in alignment
  // Actually, let's return 1/CPI * 100 scaled — purchasing power index where higher = more purchasing power
  // Use CPI relative to a base so values are meaningful: value of $1 in Jan 1969 dollars
  const base = parsed.find(p => p.date.getFullYear() === 1969 && p.date.getMonth() === 0);
  const baseVal = base?.value || parsed[0]?.value || 1;
  return parsed.map(p => ({ date: p.date, value: Math.round((baseVal / p.value) * 10000) / 100 }));
}

// ── Main handler ──
export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'FRED_API_KEY not configured' }, { status: 200 });
  }

  try {
    // Fetch all unique FRED series in parallel
    const fredKeys = Object.keys(FRED_SERIES);
    const rawResults = await Promise.all(
      fredKeys.map(k => fetchFRED(FRED_SERIES[k], apiKey, k === 'CPIAUCSL' ? '1967-01-01' : '1968-01-01'))
    );

    // Parse into { date, value }[]
    const parsedMap: Record<string, { date: Date; value: number }[]> = {};
    fredKeys.forEach((k, i) => { parsedMap[k] = parseObs(rawResults[i]); });

    const maxMonths = 48;

    // Build per-admin aligned series for a given transformed dataset
    const buildSeries = (transformed: { date: Date; value: number }[]): AdminSeries[] => {
      return ADMINS.map(a => ({
        id: a.id,
        name: a.name,
        party: a.party,
        current: !!(a as any).current,
        data: alignToTerm(transformed, a.inaug, maxMonths),
      })).filter(s => s.data.length > 0); // Only include admins that have data
    };

    // Apply transforms and build metrics
    const metricsOut: Record<string, {
      label: string; short: string; unit: string; lowerBetter: boolean; cat: string; series: AdminSeries[];
    }> = {};

    for (const m of METRICS) {
      const raw = parsedMap[m.fredKey];
      if (!raw || raw.length === 0) continue;

      let transformed: { date: Date; value: number }[];
      switch (m.transform) {
        case 'direct':
          transformed = raw;
          break;
        case 'cpi_yoy':
          transformed = cpiToYoY(raw);
          break;
        case 'quarterly':
          transformed = quarterlyToMonthly(raw);
          break;
        case 'gdp_trillions':
          transformed = quarterlyToMonthly(toTrillions(raw));
          break;
        case 'payroll_change':
          transformed = monthlyChange(raw);
          break;
        case 'mfg_millions':
          transformed = toMillions(raw);
          break;
        case 'wage_yoy':
          transformed = quarterlyToMonthly(wageYoY(raw));
          break;
        case 'trade_billions':
          transformed = toBillions(raw);
          break;
        case 'purchasing':
          transformed = purchasingPower(raw);
          break;
        default:
          transformed = raw;
      }

      metricsOut[m.key] = {
        label: m.label,
        short: m.short,
        unit: m.unit,
        lowerBetter: m.lowerBetter,
        cat: m.cat,
        series: buildSeries(transformed),
      };
    }

    const now = new Date();
    const currentMonth = monthsDiff(new Date('2025-01-20'), now);

    return NextResponse.json({
      lastUpdated: new Date().toISOString(),
      currentMonth: Math.max(0, currentMonth),
      admins: ADMINS.map(a => ({ id: a.id, name: a.name, party: a.party, current: !!(a as any).current })),
      categories: CATS,
      metrics: metricsOut,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Benchmark API error:', message);
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
