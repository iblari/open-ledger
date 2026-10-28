import { unstable_cache } from "next/cache";
import { yoy, type Pt } from "./period-math";
import { STATE_BY_CODE, CPI_REGION, PADD, type Housing, type Padd, type Pair, type LocalSnapshot } from "./local-shared";
export * from "./local-shared";

/* ── Fetch ────────────────────────────────────────────────────────── */

async function fredRaw(id: string): Promise<Pt[]> {
  const key = process.env.FRED_API_KEY;
  if (key) {
    const q = new URLSearchParams({ series_id: id, api_key: key, file_type: "json", observation_start: "1960-01-01" });
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?${q}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (r.ok) {
      const j = await r.json() as { observations?: { date: string; value: string }[] };
      return (j.observations || []).map(o => ({ d: o.date, v: parseFloat(o.value) })).filter(o => Number.isFinite(o.v));
    }
  }
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const t = await r.text();
  return t.split(/\r?\n/).slice(1).map(l => l.split(",")).map(([d, v]) => ({ d, v: parseFloat(v) })).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.d) && Number.isFinite(p.v));
}
/** One FRED series, cached 6 hours. */
export const fredSeries = (id: string) => unstable_cache(() => fredRaw(id), ["local-fred-v1", id], { revalidate: 21600 })();

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: string) => `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const weekLabel = (d: string) => `week of ${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
const quarterLabel = (d: string) => `Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1} ${d.slice(0, 4)}`;
const fredUrl = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

/** Latest 12-month change for both series, at the latest period BOTH have. */
async function yoyPair(localId: string, usId: string, freq: "m" | "q", place: string, source: string, label = monthLabel): Promise<Pair | null> {
  const [a, b] = await Promise.all([fredSeries(localId), fredSeries(usId)]);
  const la = yoy(a, freq), lb = yoy(b, freq);
  const bm = new Map(lb.map(p => [p.d, p.v]));
  const last = [...la].reverse().find(p => bm.has(p.d));
  if (!last) return null;
  return {
    local: { value: +last.v.toFixed(1), date: last.d, label: label(last.d) },
    us: { value: +bm.get(last.d)!.toFixed(1), date: last.d, label: label(last.d) },
    place, source, url: fredUrl(localId),
  };
}

async function build(code: string, housing: Housing): Promise<LocalSnapshot | null> {
  const st = STATE_BY_CODE.get(code);
  if (!st) return null;
  const reg = CPI_REGION[st.cpi], pd = PADD[st.padd];
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);
  const [cpi, shelter, homes, gas, wages] = await Promise.all([
    safe(yoyPair(`CUUR${reg.code}SA0`, "CPIAUCNS", "m", `${reg.name} region`, "BLS CPI")),
    safe(housing === "owner"
      ? yoyPair(`CUUR${reg.code}SEHC`, "CUUR0000SEHC", "m", `${reg.name} region`, "BLS CPI, owners' equivalent rent")
      : yoyPair(`CUUR${reg.code}SEHA`, "CUUR0000SEHA", "m", `${reg.name} region`, "BLS CPI, rent of primary residence")),
    housing === "owner" ? safe(yoyPair(`${st.code}STHPI`, "USSTHPI", "q", st.name, "FHFA house price index", quarterLabel)) : Promise.resolve(null),
    safe((async (): Promise<Pair | null> => {
      const [a, b] = await Promise.all([fredSeries(pd.fred), fredSeries("GASREGW")]);
      const bm = new Map(b.map(p => [p.d, p.v]));
      const last = [...a].reverse().find(p => bm.has(p.d));
      if (!last) return null;
      return { local: { value: +last.v.toFixed(2), date: last.d, label: weekLabel(last.d) }, us: { value: +bm.get(last.d)!.toFixed(2), date: last.d, label: weekLabel(last.d) },
        place: `${pd.name} (PADD)`, source: "EIA weekly retail gasoline", url: fredUrl(pd.fred) };
    })()),
    safe(yoyPair(`SMU${st.fips}000000500000003`, "CEU0500000003", "m", st.name, "BLS average hourly earnings, private sector")),
  ]);
  // Pay vs prices only when both readings are for the same month.
  const payVsPrices = wages && cpi && wages.local.date === cpi.local.date
    ? { local: +(wages.local.value - cpi.local.value).toFixed(1), us: +(wages.us.value - cpi.us.value).toFixed(1) } : null;
  return { state: st.code, stateName: st.name, housing, region: reg.name, padd: pd.name, cpi, shelter, homes, gas, wages, payVsPrices };
}

/** Snapshot for a state, cached 6 hours. */
export const getLocalSnapshot = (code: string, housing: Housing) =>
  unstable_cache(() => build(code, housing), ["local-snap-v1", code, housing], { revalidate: 21600 })();

/* ── Benchmarks: your region at the same month of every term ───────── */

const PADD_MONTHLY: Record<Padd, string> = { east: "GASREGECM", midwest: "GASREGMWM", gulf: "GASREGGCM", rocky: "GASREGRMM", west: "GASREGWCM" };
export const LOCAL_BENCH = new Set(["inflation", "gas"]);
export interface LocalBenchRow { admin: string; local: number | null; us: number | null; date: string; localDate?: string }
export interface LocalBench { metric: string; place: string; unit: string; month: number; rows: LocalBenchRow[]; source: string; url: string; since: string }

/** Month `m` of a term (month 0 = the January of the inauguration) for every
 *  administration, regional and national, from the same kind of series. */
export async function getLocalBench(metric: string, code: string, month: number, admins: { id: string; start: number }[]): Promise<LocalBench | null> {
  const st = STATE_BY_CODE.get(code);
  if (!st || !LOCAL_BENCH.has(metric)) return null;
  const isGas = metric === "gas";
  const localId = isGas ? PADD_MONTHLY[st.padd] : `CUUR${CPI_REGION[st.cpi].code}SA0`;
  const usId = isGas ? "GASREGCOVM" : "CPIAUCNS";
  const [a, b] = await Promise.all([fredSeries(localId), fredSeries(usId)]);
  const la = isGas ? a : yoy(a, "m"), lb = isGas ? b : yoy(b, "m");
  const am = new Map(la.map(p => [p.d.slice(0, 7), p.v])), bm = new Map(lb.map(p => [p.d.slice(0, 7), p.v]));
  const rows = admins.map(ad => {
    const y = ad.start + Math.floor(month / 12), mo = (month % 12) + 1;
    const k = `${y}-${String(mo).padStart(2, "0")}`;
    const r = (v: number | undefined) => (v == null ? null : +v.toFixed(isGas ? 2 : 1));
    // Early regional CPI was published every other month (or quarterly):
    // use the nearest month within two, and say which month it is.
    let lk = k;
    if (!am.has(k)) for (const off of [-1, 1, -2, 2]) {
      const dt = new Date(Date.UTC(y, mo - 1 + off, 1)); const kk = dt.toISOString().slice(0, 7);
      if (am.has(kk)) { lk = kk; break; }
    }
    return { admin: ad.id, local: r(am.get(lk)), us: r(bm.get(k)), date: k, localDate: lk };
  });
  return {
    metric, month, unit: isGas ? "$/gal" : "%",
    place: isGas ? `${PADD[st.padd].name} (PADD)` : `${CPI_REGION[st.cpi].name} region`,
    rows, source: isGas ? "EIA retail gasoline, monthly" : "BLS CPI-U, not seasonally adjusted, 12-month change",
    url: fredUrl(localId), since: la[0]?.d.slice(0, 4) || "",
  };
}
