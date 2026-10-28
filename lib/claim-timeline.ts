import { getClaimSeries } from "./claim-series";
import { getSeries, getSeriesAsOf, CATALOG_BY_ID } from "./series";
import { hashFromKey } from "./claim-link";
import type { SharedClaim, Repeat } from "./claim-lookup";

/**
 * Repeat-claim timeline: every time the same line was said, on the official
 * series it is about (when the claim maps to one).
 *
 * Each occurrence keeps the verdict it was given at the time. Next to it we
 * show the latest figure PUBLISHED that day (ALFRED vintage), not today's
 * revised number — that is the figure a speaker, and our check, could see.
 * Nothing is re-judged here.
 */
export interface TimelineOcc { date: string; rating: string; path: string; title: string; here: boolean; published: { d: string; v: number } | null }
export interface ClaimTimeline {
  occ: TimelineOcc[];
  series: { id: string; label: string; unit: string; decimals: number; source: string; url: string; points: { d: string; v: number }[] } | null;
  said: number | null;
}

const FRED_ONLY = (id: string) => CATALOG_BY_ID.get(id)?.source === "FRED";

export async function getClaimTimeline(c: SharedClaim, repeats: Repeat[]): Promise<ClaimTimeline | null> {
  if (!repeats.length) return null;
  const occBase = [
    { date: c.date, rating: c.rating, path: "", title: c.title, here: true },
    ...repeats.map(r => ({ date: r.date, rating: r.rating, path: r.path, title: r.title, here: false })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(-40);

  // The series: this claim's mapping, else the first repeat that has one.
  // Read-only (build=false): the page never triggers a model call.
  let mapping = await getClaimSeries({ key: c.key, quote: c.quote, rating: c.rating, actual: c.actual, explanation: c.explanation, date: c.date }, false).catch(() => null);
  if (!mapping?.series) {
    for (const r of repeats.slice(0, 6)) {
      const key = hashFromKey(r.path.split("/").pop() || "");
      const m = await getClaimSeries({ key, quote: c.quote, rating: r.rating, actual: "", date: r.date }, false).catch(() => null);
      if (m?.series) { mapping = m; break; }
    }
  }
  const id = mapping?.series && FRED_ONLY(mapping.series) && !(mapping.countries || []).length ? mapping.series : null;
  const data = id ? await getSeries(id).catch(() => null) : null;

  const published = await Promise.all(occBase.map(o => (id && data ? getSeriesAsOf(id, o.date.slice(0, 10)).catch(() => null) : Promise.resolve(null))));
  const occ: TimelineOcc[] = occBase.map((o, i) => ({ ...o, published: published[i] }));

  let series: ClaimTimeline["series"] = null;
  if (data && data.lines[0]?.points.length) {
    // Window: a year before the first time it was said, to the latest reading.
    const from = new Date(Date.parse(occ[0].date) - 400 * 864e5).toISOString().slice(0, 10);
    const points = data.lines[0].points.filter(p => p.d >= from);
    if (points.length >= 3) series = { id: data.id, label: data.label, unit: data.unit, decimals: data.decimals, source: data.source, url: data.url, points };
  }
  // The claimed figure is not drawn: a mapped "said" value can refer to a
  // different period than the window shown (e.g. a 2022 peak), which would
  // read as a claim about today.
  return { occ, series, said: null };
}
