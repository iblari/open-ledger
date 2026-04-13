import { NextResponse } from 'next/server';

export const revalidate = 86400;

// ── Administrations aligned to inauguration ──
const ADMINS = [
  { id: 'nixon',   name: 'Nixon',    inaug: '1969-01-20', color: '#888780', party: 'R' },
  { id: 'carter',  name: 'Carter',   inaug: '1977-01-20', color: '#888780', party: 'D' },
  { id: 'reagan',  name: 'Reagan',   inaug: '1981-01-20', color: '#888780', party: 'R' },
  { id: 'bush41',  name: 'Bush 41',  inaug: '1989-01-20', color: '#888780', party: 'R' },
  { id: 'clinton', name: 'Clinton',  inaug: '1993-01-20', color: '#888780', party: 'D' },
  { id: 'bush43',  name: 'Bush 43',  inaug: '2001-01-20', color: '#888780', party: 'R' },
  { id: 'obama',   name: 'Obama',    inaug: '2009-01-20', color: '#888780', party: 'D' },
  { id: 'trump1',  name: 'Trump I',  inaug: '2017-01-20', color: '#888780', party: 'R' },
  { id: 'biden',   name: 'Biden',    inaug: '2021-01-20', color: '#888780', party: 'D' },
  { id: 'trump2',  name: 'Trump II', inaug: '2025-01-20', color: '#E24B4A', party: 'R', current: true },
];

// ── FRED series ──
const SERIES = {
  unemployment: 'UNRATE',
  cpi:          'CPIAUCSL',
  gdp:          'A191RL1Q225SBEA',
};

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

// ── Align raw monthly/quarterly data to months-in-office for each admin ──
interface AlignedPoint { month: number; value: number }
interface AdminSeries { id: string; name: string; party: string; current: boolean; data: AlignedPoint[] }

function alignToTerm(
  parsed: { date: Date; value: number }[],
  inaugDateStr: string,
  maxMonths: number
): AlignedPoint[] {
  const inaug = new Date(inaugDateStr);
  const points: AlignedPoint[] = [];
  for (const p of parsed) {
    const m = monthsDiff(inaug, p.date);
    if (m < 0 || m > maxMonths) continue;
    points.push({ month: m, value: Math.round(p.value * 100) / 100 });
  }
  return points;
}

// ── Calculate CPI YoY % change from raw CPI index ──
function cpiToYoY(parsed: { date: Date; value: number }[]): { date: Date; value: number }[] {
  // Build a map of year-month → value for quick lookup
  const map = new Map<string, number>();
  for (const p of parsed) {
    const key = `${p.date.getFullYear()}-${p.date.getMonth()}`;
    map.set(key, p.value);
  }
  const result: { date: Date; value: number }[] = [];
  for (const p of parsed) {
    const priorKey = `${p.date.getFullYear() - 1}-${p.date.getMonth()}`;
    const priorVal = map.get(priorKey);
    if (priorVal && priorVal > 0) {
      result.push({
        date: p.date,
        value: Math.round(((p.value / priorVal) - 1) * 10000) / 100, // YoY %
      });
    }
  }
  return result;
}

// ── For quarterly GDP, interpolate to monthly by holding value for 3 months ──
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

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'FRED_API_KEY not configured' }, { status: 200 });
  }

  try {
    // Fetch all three series in parallel — start from 1968 to have CPI prior-year data for Nixon
    const [unrateRaw, cpiRaw, gdpRaw] = await Promise.all([
      fetchFRED(SERIES.unemployment, apiKey, '1968-01-01'),
      fetchFRED(SERIES.cpi, apiKey, '1967-01-01'), // need 1 year prior for YoY calc
      fetchFRED(SERIES.gdp, apiKey, '1968-01-01'),
    ]);

    const unrateParsed = parseObs(unrateRaw);
    const cpiYoY = cpiToYoY(parseObs(cpiRaw));
    const gdpMonthly = quarterlyToMonthly(parseObs(gdpRaw));

    const maxMonths = 48;

    // Build per-admin aligned series for each metric
    const buildMetric = (parsed: { date: Date; value: number }[]): AdminSeries[] => {
      return ADMINS.map(a => ({
        id: a.id,
        name: a.name,
        party: a.party,
        current: !!a.current,
        data: alignToTerm(parsed, a.inaug, maxMonths),
      }));
    };

    // Current months in office
    const now = new Date();
    const currentMonth = monthsDiff(new Date('2025-01-20'), now);

    return NextResponse.json({
      lastUpdated: new Date().toISOString(),
      currentMonth: Math.max(0, currentMonth),
      admins: ADMINS.map(a => ({ id: a.id, name: a.name, party: a.party, current: !!a.current })),
      metrics: {
        unemployment: {
          label: 'Unemployment Rate',
          unit: '%',
          lowerBetter: true,
          series: buildMetric(unrateParsed),
        },
        inflation: {
          label: 'CPI Inflation (YoY)',
          unit: '%',
          lowerBetter: true,
          series: buildMetric(cpiYoY),
        },
        gdp: {
          label: 'Real GDP Growth',
          unit: '%',
          lowerBetter: false,
          series: buildMetric(gdpMonthly),
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Benchmark API error:', message);
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
