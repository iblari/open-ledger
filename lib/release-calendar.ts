/**
 * When the next official numbers come out, so Sam can pre-schedule
 * release-day posts. Dates come from FRED's release calendars (which mirror
 * the BLS / BEA schedules); weekly gas prices are EIA's Monday update.
 * Cached for 6 hours: the schedules change rarely.
 */
import { kvGet, kvSetMany } from "./live-kv";

const SITE = "https://voteunbiased.org";
interface Rel { key: string; name: string; agency: string; fredRelease: number; expect: RegExp; metrics: string[]; time: string }
const RELEASES: Rel[] = [
  { key: "cpi", name: "Consumer Price Index (CPI)", agency: "BLS", fredRelease: 10, expect: /consumer price/i, metrics: ["cpi_yoy", "cpi_mom", "core_cpi_yoy"], time: "08:30" },
  { key: "jobs", name: "Jobs report (Employment Situation)", agency: "BLS", fredRelease: 50, expect: /employment situation/i, metrics: ["payrolls_chg", "unemployment"], time: "08:30" },
  { key: "ppi", name: "Producer Price Index (PPI)", agency: "BLS", fredRelease: 46, expect: /producer price/i, metrics: ["ppi_yoy", "ppi_mom"], time: "08:30" },
  { key: "gdp", name: "GDP", agency: "BEA", fredRelease: 53, expect: /gross domestic product/i, metrics: ["gdp_growth"], time: "08:30" },
];

export interface CalendarItem {
  key: string; name: string; agency: string; date: string; timeET: string; datetime: string;
  metrics: string[]; links: string[]; daysAway: number;
}

/** America/New_York offset for a date (EDT -04:00 or EST -05:00). */
function etOffset(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const s = d.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
  return /EDT/.test(s) ? "-04:00" : "-05:00";
}
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function fredDates(r: Rel): Promise<string[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const q = new URLSearchParams({ release_id: String(r.fredRelease), api_key: key, file_type: "json", realtime_start: today(), realtime_end: "9999-12-31", include_release_dates_with_no_data: "true", sort_order: "asc", limit: "10" });
  const res = await fetch(`https://api.stlouisfed.org/fred/release/dates?${q}`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const j = await res.json() as { release_dates?: { release_name?: string; date: string }[] };
  const ds = (j.release_dates || []).filter(x => !x.release_name || r.expect.test(x.release_name)).map(x => x.date);
  return ds.filter(d => d >= today());
}

/** Next EIA gasoline update: Mondays (Tuesday after a Monday federal holiday is rare; we use Monday). */
function nextMondays(n: number): string[] {
  const out: string[] = [];
  const d = new Date(today() + "T12:00:00Z");
  while (out.length < n) {
    if (d.getUTCDay() === 1) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function getReleaseCalendar(): Promise<CalendarItem[]> {
  const ck = "release-calendar:v1";
  const [raw] = await kvGet([ck]).catch(() => [null]);
  let base: { key: string; dates: string[] }[] | null = null;
  try { base = raw ? JSON.parse(raw) : null; } catch {}
  if (!base || !base.length) {
    base = await Promise.all(RELEASES.map(async r => ({ key: r.key, dates: await fredDates(r).catch(() => []) })));
    if (base.some(b => b.dates.length)) await kvSetMany([[ck, JSON.stringify(base), 6 * 3600]]).catch(() => {});
  }
  const t = today();
  const items: CalendarItem[] = [];
  for (const r of RELEASES) {
    const dates = (base.find(b => b.key === r.key)?.dates || []).filter(d => d >= t).slice(0, 2);
    for (const date of dates) items.push(mk(r.key, r.name, r.agency, date, r.time, r.metrics));
  }
  for (const date of nextMondays(2)) items.push(mk("gas", "Weekly gas prices", "EIA", date, "17:00", ["gas"]));
  return items.sort((a, b) => a.datetime.localeCompare(b.datetime));
}

function mk(key: string, name: string, agency: string, date: string, time: string, metrics: string[]): CalendarItem {
  const datetime = `${date}T${time}:00${etOffset(date)}`;
  const daysAway = Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
  return { key, name, agency, date, timeET: time, datetime, metrics, links: metrics.map(m => `${SITE}/s/${m}`), daysAway };
}
