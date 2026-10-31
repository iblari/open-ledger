import { unstable_cache } from "next/cache";
import { fredSeries, STATE_BY_CODE, CPI_REGION } from "./local";

/**
 * A state's last ten years in official numbers, for the /vote state pages:
 *  economy  real GDP growth                  BEA via FRED ({ST}RGSP)
 *  jobs     unemployment rate, annual avg   BLS via FRED ({ST}UR)
 *  homes    house prices, yearly change     FHFA via FRED ({ST}STHPI)
 *  rent     CPI rent, yearly change          BLS, the state's Census region
 *  taxes    state tax collections / GDP     Census via FRED ({ST}TOTLTAX, {ST}NGSP)
 *  migrants net international migration    Census population estimates, per 1,000
 * The year in progress (where shown) is partial and flagged. 2020 migration is
 * left blank: the Census estimates for 2020 cover only part of the year.
 */
export interface Trend { key: string; label: string; unit: string; points: { y: number; v: number | null; partial?: boolean }[]; source: string; url: string; note?: string; scope?: string }

const FIRST = 2016;
type Pt = { d: string; v: number };
const byYear = (pts: Pt[]) => { const m = new Map<number, number[]>(); for (const p of pts) { const y = +p.d.slice(0, 4); m.set(y, [...(m.get(y) || []), p.v]); } return m; };
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const r1 = (v: number) => Math.round(v * 10) / 10;
const thisYear = () => new Date().getUTCFullYear();

function annualAvg(pts: Pt[], per: number) {
  return [...byYear(pts)].map(([y, v]) => ({ y, v: avg(v), n: v.length, per })).sort((a, b) => a.y - b.y);
}
function yoyAnnual(pts: Pt[], per: number) {
  // Average of the year vs the same months a year earlier (fair for a partial year).
  const by = byYear(pts); const out: { y: number; v: number; partial: boolean }[] = [];
  const months = (y: number) => pts.filter(p => +p.d.slice(0, 4) === y).map(p => p.d.slice(5, 7));
  for (const [y, vs] of by) {
    const ms = new Set(months(y));
    const prev = pts.filter(p => +p.d.slice(0, 4) === y - 1 && ms.has(p.d.slice(5, 7))).map(p => p.v);
    if (prev.length !== vs.length || !prev.length) continue;
    out.push({ y, v: (avg(vs) / avg(prev) - 1) * 100, partial: vs.length < per });
  }
  return out.sort((a, b) => a.y - b.y);
}
const keep = <T extends { y: number }>(a: T[]) => a.filter(p => p.y >= FIRST);

/* Census population estimates: net international migration per 1,000 residents, by state name. */
async function migrationRaw(): Promise<Record<string, Record<number, number>>> {
  const files = [
    "https://www2.census.gov/programs-surveys/popest/datasets/2010-2019/national/totals/nst-est2019-alldata.csv",
    "https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/state/totals/NST-EST2025-ALLDATA.csv",
  ];
  const out: Record<string, Record<number, number>> = {};
  for (const f of files) {
    const t = await (await fetch(f, { signal: AbortSignal.timeout(20_000), cache: "no-store" })).text();
    const lines = t.split(/\r?\n/).filter(Boolean); const head = lines[0].split(",");
    const iName = head.indexOf("NAME");
    for (const l of lines.slice(1)) {
      const c = l.split(","); const name = c[iName];
      for (let y = 2010; y <= 2030; y++) {
        const im = head.indexOf(`INTERNATIONALMIG${y}`), ip = head.indexOf(`POPESTIMATE${y}`);
        if (im < 0 || ip < 0 || y === 2020) continue;
        const m = +c[im], p = +c[ip];
        if (Number.isFinite(m) && p > 0) (out[name] ||= {})[y] = r1((m / p) * 1000);
      }
    }
  }
  return out;
}
const migration = unstable_cache(async () => { try { return await migrationRaw(); } catch { return {}; } }, ["census-intl-mig-v1"], { revalidate: 86400 });

async function build(st: string): Promise<Trend[]> {
  const s = STATE_BY_CODE.get(st.toUpperCase()); if (!s) return [];
  const reg = CPI_REGION[s.cpi];
  const [rgsp, ngsp, ur, hpi, tax, rent, mig] = await Promise.all([
    fredSeries(`${s.code}RGSP`), fredSeries(`${s.code}NGSP`), fredSeries(`${s.code}UR`), fredSeries(`${s.code}STHPI`),
    fredSeries(`${s.code}TOTLTAX`), fredSeries(`CUUR${reg.code}SEHA`), migration(),
  ].map(p => (p as Promise<unknown>).catch(() => [])) as [Promise<Pt[]>, Promise<Pt[]>, Promise<Pt[]>, Promise<Pt[]>, Promise<Pt[]>, Promise<Pt[]>, Promise<Record<string, Record<number, number>>>]);
  const fred = (id: string) => `https://fred.stlouisfed.org/series/${id}`;
  const T: Trend[] = [];
  const g = byYear(rgsp);
  const gdp = [...g.keys()].sort().filter(y => g.has(y - 1)).map(y => ({ y, v: r1((avg(g.get(y)!) / avg(g.get(y - 1)!) - 1) * 100) }));
  if (gdp.length) T.push({ key: "gdp", label: "Economy, real GDP growth", unit: "%", points: keep(gdp), source: "BEA", url: fred(`${s.code}RGSP`) });
  const u = annualAvg(ur, 12).map(p => ({ y: p.y, v: r1(p.v), partial: p.y === thisYear() }));
  if (u.length) T.push({ key: "jobs", label: "Unemployment rate", unit: "%", points: keep(u), source: "BLS", url: fred(`${s.code}UR`) });
  const h = yoyAnnual(hpi, 4).map(p => ({ ...p, v: r1(p.v), partial: p.y === thisYear() }));
  if (h.length) T.push({ key: "homes", label: "Home prices, yearly change", unit: "%", points: keep(h), source: "FHFA", url: fred(`${s.code}STHPI`) });
  const rr = yoyAnnual(rent, 12).map(p => ({ ...p, v: r1(p.v), partial: p.y === thisYear() }));
  if (rr.length) T.push({ key: "rent", label: "Rent, yearly change", unit: "%", points: keep(rr), source: "BLS CPI", url: fred(`CUUR${reg.code}SEHA`), scope: `${reg.name} region` });
  const nm = new Map(byYear(ngsp)), tx = byYear(tax);
  const tp = [...tx.keys()].sort().filter(y => nm.has(y)).map(y => ({ y, v: Math.round((avg(tx.get(y)!) / (avg(nm.get(y)!) * 1000)) * 1000) / 10 }));
  if (tp.length) T.push({ key: "taxes", label: "State taxes, share of the economy", unit: "%", points: keep(tp), source: "Census", url: fred(`${s.code}TOTLTAX`), note: "Taxes the state government collects ÷ state GDP" });
  const m = mig[s.name];
  if (m) {
    const ys = Object.keys(m).map(Number).filter(y => y >= FIRST).sort();
    const pts = [] as { y: number; v: number | null }[];
    for (let y = FIRST; y <= Math.max(...ys); y++) pts.push({ y, v: m[y] ?? null });
    T.push({ key: "migration", label: "Net international migration", unit: " per 1,000", points: pts, source: "Census", url: "https://www.census.gov/programs-surveys/popest.html", note: "2020 left out: partial-year estimate" });
  }
  for (const t of T) for (const p of t.points) if (p.y === thisYear() && t.key !== "gdp" && t.key !== "taxes" && t.key !== "migration") (p as { partial?: boolean }).partial = true;
  return T;
}

/** One state's trends, cached six hours. */
export const stateTrends = (st: string) => unstable_cache(() => build(st).catch(() => []), ["state-trends-v2", st.toUpperCase()], { revalidate: 21600 })();
