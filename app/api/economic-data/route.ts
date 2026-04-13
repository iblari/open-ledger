import { NextResponse } from 'next/server';

export const revalidate = 86400; // 24 hours ISR

// ── FRED Series Map ──
const SERIES_MAP: Record<string, string> = {
  real_gdp:       'GDPC1',
  gdp:            'A191RL1A225NBEA',
  unemployment:   'UNRATE',
  lfpr:           'CIVPART',
  jobs:           'PAYEMS',
  mfg:            'MANEMP',
  inflation:      'FPCPITOTLZGUSA',
  gas:            'GASREGCOVM',
  wages:          'LES1252881600Q',
  fed_rate:       'FEDFUNDS',
  purchasing:     'CPIAUCSL',
  median_income:  'MEHOINUSA672N',
  debt_gdp:       'GFDEGDQ188S',
  deficit:        'FYFSD',
  trade:          'BOPGSTB',
  sp500:          'SP500',
  consumer_conf:  'CSCICP03USM665S',
};

// ── President mapping by year ──
function getPresident(year: number): string {
  if (year >= 2025) return 'trump2';
  if (year >= 2021) return 'biden';
  if (year >= 2017) return 'trump1';
  if (year >= 2009) return 'obama';
  if (year >= 2001) return 'bush';
  if (year >= 1993) return 'clinton';
  return 'pre-clinton';
}

// ── Fetch a single FRED series ──
async function fetchSeries(seriesId: string, apiKey: string): Promise<{ date: string; value: string }[]> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&frequency=a&observation_start=1993-01-01`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = await res.json();
  return json.observations || [];
}

// ── Deduplicate: keep last observation per year ──
function dedupeByYear(observations: { date: string; value: string }[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const obs of observations) {
    if (obs.value === '.') continue; // FRED uses "." for missing
    const val = parseFloat(obs.value);
    if (isNaN(val)) continue;
    const year = new Date(obs.date).getFullYear();
    map.set(year, val); // last wins
  }
  return map;
}

// ── Transform raw FRED data into {y, v, a} format ──
function transform(
  metricKey: string,
  yearValues: Map<number, number>,
  allYearValues?: Map<number, number> // for YoY calculations
): { y: number; v: number; a: string }[] {
  const points: { y: number; v: number; a: string }[] = [];
  const sortedYears = Array.from(yearValues.keys()).sort((a, b) => a - b);

  for (const year of sortedYears) {
    const raw = yearValues.get(year)!;
    let value: number;

    switch (metricKey) {
      case 'real_gdp':
        // GDPC1 is in billions → divide by 1000 for trillions
        value = raw / 1000;
        break;

      case 'jobs': {
        // PAYEMS is thousands, calculate YoY change in millions
        const prevYear = allYearValues?.get(year - 1);
        if (prevYear === undefined) continue;
        value = (raw - prevYear) / 1000;
        break;
      }

      case 'mfg':
        // MANEMP is thousands → divide by 1000 for millions
        value = raw / 1000;
        break;

      case 'wages': {
        // LES1252881600Q: median real weekly earnings → YoY % change
        const prevWage = allYearValues?.get(year - 1);
        if (prevWage === undefined || prevWage === 0) continue;
        value = ((raw - prevWage) / Math.abs(prevWage)) * 100;
        break;
      }

      case 'purchasing': {
        // CPIAUCSL index → purchasing power of $1 relative to 1993
        const cpi1993 = allYearValues?.get(1993);
        if (!cpi1993) continue;
        value = 1 / (raw / cpi1993);
        break;
      }

      case 'deficit':
        // FYFSD is in millions, positive = surplus, negative = deficit
        // Our format: deficit = positive number (flip sign), in billions
        value = (raw * -1) / 1000;
        break;

      case 'trade':
        // BOPGSTB in millions → billions, absolute value
        value = Math.abs(raw) / 1000;
        break;

      default:
        value = raw;
    }

    const president = getPresident(year);
    if (president === 'pre-clinton') continue;

    points.push({
      y: year,
      v: Math.round(value * 100) / 100, // 2 decimal places
      a: president,
    });
  }

  return points;
}

// ── Main handler ──
export async function GET() {
  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'FRED_API_KEY not configured', usingFallback: true },
      { status: 200 }
    );
  }

  try {
    // Fetch all series in parallel
    const entries = Object.entries(SERIES_MAP);
    const rawResults = await Promise.all(
      entries.map(([, seriesId]) => fetchSeries(seriesId, apiKey))
    );

    // Build deduped year→value maps for each metric
    const yearMaps: Record<string, Map<number, number>> = {};
    entries.forEach(([key], i) => {
      yearMaps[key] = dedupeByYear(rawResults[i]);
    });

    // Transform each metric
    const metrics: Record<string, { y: number; v: number; a: string }[]> = {};

    for (const [key] of entries) {
      // For metrics that need YoY or reference calculations, pass the raw map
      const needsRaw = ['jobs', 'wages', 'purchasing'];
      metrics[key] = transform(
        key,
        yearMaps[key],
        needsRaw.includes(key) ? yearMaps[key] : undefined
      );
    }

    return NextResponse.json({
      lastUpdated: new Date().toISOString(),
      metrics,
      source: 'Federal Reserve Economic Data (FRED)',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('FRED API error:', message);
    return NextResponse.json(
      { error: message, usingFallback: true },
      { status: 200 }
    );
  }
}
