import { claimOnce, kvGet, kvSetMany } from "./live-kv";
import { aggregate, getRadar, loadSummaries, type Radar } from "./agenda-radar";

/**
 * Signal scorekeeping — does the agenda radar predict anything?
 *
 * Grading a forecaster: every time the radar flags a subject (Watch, Rising
 * or New), a 21-day window opens and we check whether the matching real-world
 * thing happened inside it. Then we compare the hit rate with how often that
 * thing happens in ANY 21-day window (the base rate, i.e. pure chance).
 *
 * Outcomes are fixed in advance, per subject, so nothing is matched after the
 * fact:
 *   - policy subjects  → a presidential document (executive order,
 *                        proclamation, memorandum) whose TITLE is on that
 *                        subject, from the Federal Register API
 *   - oil / fuel       → a ≥7% / ≥5% move in Brent / US gasoline (FRED)
 *   - the Fed          → any change in the Fed's target rate (FRED)
 *   - countries        → a presidential document naming the country
 *
 * The record starts with a backtest (the radar re-run day by day over every
 * broadcast covered so far) and grows forward daily. Nothing is published as
 * "predictive" until a subject has enough resolved flags to beat chance.
 */
const WINDOW_DAYS = 21;
const DAY = 864e5;

type Outcome =
  | { kind: "fr"; label: string; rx: RegExp }
  | { kind: "move"; label: string; series: string; pct: number }
  | { kind: "change"; label: string; series: string };

const THEME_OUTCOMES: Record<string, Outcome> = {
  tariffs: { kind: "fr", label: "Presidential action on tariffs or imports", rx: /dut(y|ies)|tariff|adjusting imports|import surcharge|reciprocal trade|de minimis/i },
  ships_defense: { kind: "fr", label: "Presidential action on shipbuilding or the Navy", rx: /shipbuild|shipyard|maritime|naval|navy/i },
  chips_ai: { kind: "fr", label: "Presidential action on chips or AI", rx: /semiconductor|artificial intelligence|super ?intelligence|polysilicon|data cent/i },
  power: { kind: "fr", label: "Presidential action on power or nuclear", rx: /nuclear|electric|bulk-power|grid|reactor/i },
  metals: { kind: "fr", label: "Presidential action on steel, metals or minerals", rx: /steel|alumin|copper|critical mineral|rare earth/i },
  pharma: { kind: "fr", label: "Presidential action on drugs or pharma", rx: /pharmaceutical|drug pric|prescription/i },
  housing: { kind: "fr", label: "Presidential action on housing", rx: /housing|mortgage|homeown/i },
  crypto: { kind: "fr", label: "Presidential action on crypto", rx: /digital asset|crypto|bitcoin|stablecoin/i },
  taxes: { kind: "fr", label: "Presidential action on taxes", rx: /\btax/i },
  oil_gas: { kind: "move", label: "Brent oil moves 7% or more", series: "DCOILBRENTEU", pct: 0.07 },
  fuel: { kind: "move", label: "US gasoline moves 5% or more", series: "GASREGW", pct: 0.05 },
  rates: { kind: "change", label: "The Fed changes its target rate", series: "DFEDTARU" },
};
const COUNTRY_OUTCOMES: Record<string, Outcome> = Object.fromEntries(
  ([["China", /china|chinese/i], ["Iran", /iran/i], ["Venezuela", /venezuela/i], ["Russia", /russia/i],
    ["Canada", /canada|canadian/i], ["Mexico", /mexic/i], ["Israel", /israel/i], ["Saudi Arabia", /saudi/i],
    ["India", /\bindia/i], ["Japan", /japan/i], ["South Korea", /korea/i], ["Ukraine", /ukrain/i],
    ["European Union", /european union|\beu\b/i], ["Taiwan", /taiwan/i], ["Cuba", /cuba/i]] as [string, RegExp][])
    .map(([c, rx]) => [c, { kind: "fr", label: `Presidential action naming ${c}`, rx } as Outcome]),
);

export interface Flag {
  id: string; key: string; label: string; outcome: string;
  status: string; opened: string; windowEnd: string;
  source: "backtest" | "live";
  result: "pending" | "hit" | "miss";
  evidence?: { date: string; text: string; url?: string };
  baseRate?: number;
}
export interface ScoreRow {
  key: string; label: string; outcome: string;
  flags: number; resolved: number; hits: number; pending: number;
  expected: number; baseRate: number; pValue: number | null;
  verdict: "collecting" | "no edge" | "promising" | "beats chance";
}
export interface Scorecard { generatedAt: string; since: string; rows: ScoreRow[]; flags: Flag[]; sources: { frDocs: number; series: Record<string, number> } }

/* ── Outcome data (cached daily) ─────────────────────────────────────── */

interface FrDoc { date: string; title: string; url: string }
export interface Sources { fetchedAt: string; fr: FrDoc[]; series: Record<string, [string, number][]> }
const SRC_KEY = "signals:src:v1";
const FLAGS_KEY = "signals:flags:v1";
const SINCE = "2025-06-01";

async function fetchFr(): Promise<FrDoc[]> {
  const out: FrDoc[] = [];
  for (let page = 1; page <= 5; page++) {
    const u = `https://www.federalregister.gov/api/v1/documents.json?per_page=1000&page=${page}&order=oldest` +
      `&conditions[type][]=PRESDOCU&conditions[publication_date][gte]=${SINCE}` +
      `&fields[]=title&fields[]=publication_date&fields[]=signing_date&fields[]=html_url`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) break;
    const j = await r.json();
    for (const d of j.results || []) out.push({ date: d.signing_date || d.publication_date, title: d.title, url: d.html_url });
    if (!j.next_page_url) break;
  }
  return out;
}

async function fetchSeries(id: string): Promise<[string, number][]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${SINCE}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.observations || []).filter((o: { value: string }) => o.value !== ".").map((o: { date: string; value: string }) => [o.date, Number(o.value)] as [string, number]);
}

async function getSources(): Promise<Sources> {
  const [raw] = await kvGet([SRC_KEY]).catch(() => [null]);
  if (raw) { try { const s = JSON.parse(raw) as Sources; if (Date.now() - Date.parse(s.fetchedAt) < 12 * 3600e3) return s; } catch { /* refetch */ } }
  const ids = [...new Set(Object.values(THEME_OUTCOMES).filter(o => o.kind !== "fr").map(o => (o as { series: string }).series))];
  const [fr, ...ser] = await Promise.all([fetchFr().catch(() => []), ...ids.map(id => fetchSeries(id).catch(() => []))]);
  const s: Sources = { fetchedAt: new Date().toISOString(), fr, series: Object.fromEntries(ids.map((id, i) => [id, ser[i]])) };
  await kvSetMany([[SRC_KEY, JSON.stringify(s), 2 * 86400]]).catch(() => {});
  return s;
}

/* ── Did the outcome happen in (from, to]? ────────────────────────────── */

const day = (iso: string) => iso.slice(0, 10);
function priceOn(series: [string, number][], d: string): number | null {
  let v: number | null = null;
  for (const [t, x] of series) { if (t > d) break; v = x; }
  return v;
}
function check(o: Outcome, src: Sources, from: string, to: string): { hit: boolean; evidence?: Flag["evidence"] } {
  if (o.kind === "fr") {
    const doc = src.fr.find(d => d.date > from && d.date <= to && o.rx.test(d.title));
    return doc ? { hit: true, evidence: { date: doc.date, text: doc.title, url: doc.url } } : { hit: false };
  }
  const ser = src.series[o.series] || [];
  const p0 = priceOn(ser, from);
  if (p0 == null) return { hit: false };
  for (const [t, x] of ser) {
    if (t <= from) continue;
    if (t > to) break;
    if (o.kind === "change" ? x !== p0 : Math.abs(x / p0 - 1) >= o.pct) {
      const txt = o.kind === "change" ? `Target rate ${p0}% → ${x}%` : `${o.series === "GASREGW" ? "Gasoline" : "Brent"} ${p0} → ${x} (${x > p0 ? "+" : ""}${(((x / p0) - 1) * 100).toFixed(1)}%)`;
      return { hit: true, evidence: { date: t, text: txt } };
    }
  }
  return { hit: false };
}
/** Chance: the share of all 21-day windows over the past year that contain the outcome. */
function baseRate(o: Outcome, src: Sources, until: string): number {
  const end = Date.parse(until) - WINDOW_DAYS * DAY;
  const start = end - 365 * DAY;
  let n = 0, h = 0;
  for (let t = start; t <= end; t += DAY) {
    const from = new Date(t).toISOString().slice(0, 10), to = new Date(t + WINDOW_DAYS * DAY).toISOString().slice(0, 10);
    n++; if (check(o, src, from, to).hit) h++;
  }
  return n ? h / n : 0;
}

/* ── Flags ───────────────────────────────────────────────────────────── */

const FLAGGED = new Set(["rising", "new", "watch"]);
function candidates(r: Radar): { key: string; label: string; o: Outcome; status: string }[] {
  const out: { key: string; label: string; o: Outcome; status: string }[] = [];
  for (const t of r.themes) if (FLAGGED.has(t.status) && THEME_OUTCOMES[t.key]) out.push({ key: `theme:${t.key}`, label: t.label, o: THEME_OUTCOMES[t.key], status: t.status });
  for (const c of r.countries) if (FLAGGED.has(c.status) && COUNTRY_OUTCOMES[c.name]) out.push({ key: `country:${c.name}`, label: c.name, o: COUNTRY_OUTCOMES[c.name], status: c.status });
  return out;
}
function outcomeFor(key: string): Outcome | undefined {
  const [k, v] = key.split(":");
  return k === "theme" ? THEME_OUTCOMES[v] : COUNTRY_OUTCOMES[v];
}
/** Open a flag unless the same subject already has one whose window is still open. */
function openFlags(existing: Flag[], r: Radar, on: string, source: Flag["source"]): Flag[] {
  const added: Flag[] = [];
  for (const c of candidates(r)) {
    const open = [...existing, ...added].some(f => f.key === c.key && f.windowEnd >= on);
    if (open) continue;
    added.push({
      id: `${c.key}@${on}`, key: c.key, label: c.label, outcome: c.o.label, status: c.status,
      opened: on, windowEnd: new Date(Date.parse(on) + WINDOW_DAYS * DAY).toISOString().slice(0, 10),
      source, result: "pending",
    });
  }
  return added;
}
function resolve(flags: Flag[], src: Sources, today: string): void {
  for (const f of flags) {
    if (f.result !== "pending") continue;
    const o = outcomeFor(f.key); if (!o) continue;
    const r = check(o, src, f.opened, f.windowEnd < today ? f.windowEnd : today);
    if (r.hit) { f.result = "hit"; f.evidence = r.evidence; }
    else if (f.windowEnd < today) f.result = "miss";
    if (f.baseRate == null) f.baseRate = Math.round(baseRate(o, src, f.opened) * 1000) / 1000;
  }
}

/** Re-run the radar as it would have looked on every past day. */
async function backtest(src: Sources, today: string): Promise<Flag[]> {
  const { ledger, sums } = await loadSummaries();
  return runBacktest(ledger, sums, src, today);
}
/** Pure, for offline checks too. */
export function runBacktest(ledger: Parameters<typeof aggregate>[0], sums: Parameters<typeof aggregate>[1], src: Sources, today: string): Flag[] {
  const ok = ledger.map((e, i) => ({ e, s: sums[i] })).filter(x => x.s && (x.s as { words: number }).words > 500);
  if (ok.length < 6) return [];
  const flags: Flag[] = [];
  const first = Date.parse(ok[0].e.startedAt) + 14 * DAY;
  for (let t = first; t < Date.parse(today); t += DAY) {
    const d = new Date(t).toISOString().slice(0, 10);
    const upto = ok.filter(x => day(x.e.startedAt) <= d);
    if (upto.length < 6) continue;
    const r = aggregate(upto.map(x => x.e), upto.map(x => x.s));
    flags.push(...openFlags(flags, r, d, "backtest"));
  }
  resolve(flags, src, today);
  return flags;
}

/* ── Score ───────────────────────────────────────────────────────────── */

/** One-sided binomial tail: P(X ≥ k) with n trials at rate p. */
function tail(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  let s = 0, c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) s += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
  }
  return Math.min(1, s);
}
export function score(flags: Flag[]): ScoreRow[] {
  const by = new Map<string, Flag[]>();
  for (const f of flags) (by.get(f.key) ?? by.set(f.key, []).get(f.key)!).push(f);
  const rows: ScoreRow[] = [];
  for (const [key, fs] of by) {
    const res = fs.filter(f => f.result !== "pending");
    const hits = res.filter(f => f.result === "hit").length;
    const expected = res.reduce((s, f) => s + (f.baseRate ?? 0), 0);
    const p = res.length ? expected / res.length : 0;
    const pValue = res.length ? tail(res.length, hits, Math.min(0.999, Math.max(0.001, p))) : null;
    const verdict: ScoreRow["verdict"] = res.length < 8 ? "collecting"
      : pValue != null && pValue < 0.05 ? "beats chance"
      : hits > expected ? "promising" : "no edge";
    rows.push({ key, label: fs[0].label, outcome: fs[0].outcome, flags: fs.length, resolved: res.length, hits,
      pending: fs.length - res.length, expected: Math.round(expected * 10) / 10, baseRate: Math.round(p * 100) / 100, pValue, verdict });
  }
  return rows.sort((a, b) => b.resolved - a.resolved || a.label.localeCompare(b.label));
}

/* ── Entry points ────────────────────────────────────────────────────── */

async function readFlags(): Promise<Flag[]> {
  const [raw] = await kvGet([FLAGS_KEY]).catch(() => [null]);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

/** Cron, once a day: seed the backtest the first time, open today's flags, resolve old ones. */
export async function dailySignalJob(): Promise<{ opened: number; resolved: number } | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (!(await claimOnce(`signals:day:${today}`, 2 * 86400))) return null;
  const src = await getSources();
  let flags = await readFlags();
  if (!flags.some(f => f.source === "backtest")) flags = [...(await backtest(src, today)), ...flags];
  const before = flags.filter(f => f.result !== "pending").length;
  const added = openFlags(flags, await getRadar(), today, "live");
  flags.push(...added);
  resolve(flags, src, today);
  await kvSetMany([[FLAGS_KEY, JSON.stringify(flags), 0]]);
  return { opened: added.length, resolved: flags.filter(f => f.result !== "pending").length - before };
}

export async function getScorecard(): Promise<Scorecard> {
  const flags = await readFlags();
  const src = await getSources();
  return {
    generatedAt: new Date().toISOString(),
    since: flags.reduce((m, f) => (f.opened < m ? f.opened : m), new Date().toISOString().slice(0, 10)),
    rows: score(flags),
    flags: [...flags].sort((a, b) => b.opened.localeCompare(a.opened)),
    sources: { frDocs: src.fr.length, series: Object.fromEntries(Object.entries(src.series).map(([k, v]) => [k, v.length])) },
  };
}
