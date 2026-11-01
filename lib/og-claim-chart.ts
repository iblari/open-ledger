import { kvGet } from "./live-kv";
import { SERIES_KEY, cleanMapping, type ClaimSeries } from "./claim-series";
import { getSeries } from "./series";
import { buildOgChart, type OgChart } from "./og-chart";
import { listTrendingClaims } from "./trending-claims";
import { getClaimChart } from "./claim-chart";
import { fmtU, unitOf } from "./chart-format";
import type { SharedClaim } from "./claim-lookup";

/** The chart behind a claim's verdict, when it maps to an official series: ~5 years,
 *  the claimed value as a dashed line, the reading at the claim as a dot. */
export async function claimChart(c: SharedClaim, size?: { W: number; H: number }): Promise<OgChart | null> {
  try {
    const [raw] = await kvGet([SERIES_KEY(c.key)]);
    const map = cleanMapping(raw ? JSON.parse(raw) as ClaimSeries : null, { quote: c.quote, actual: c.actual, explanation: c.explanation, date: c.date });
    const sd = map?.series ? await getSeries(map.series, map.countries) : null;
    if (!sd || !map) return null;
    // Same fallback as the page: the checker's extracted value when the
    // mapping didn't restate it. Claims about the past get no said line.
    const historical = map.terms || !!map.since;
    const said = historical ? null : map.said ?? (await listTrendingClaims().catch(() => [])).find(x => x.key === c.key)?.claimedValue ?? null;
    return buildOgChart(sd, { lineKey: map.saidCountry, anchor: c.date, said, ...size });
  } catch { return null; }
}

// Brighter than the page palette: these sit on near-black.
export const STAMP: Record<string, string> = {
  true: "#2BA393", misleading: "#E08A2E", false: "#E0493A",
  projection: "#7FA3C2", unconfirmed: "#7FA3C2", unverifiable: "#A39D93", checking: "#A39D93",
};
export const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export interface ClaimBars { said: number; data: number; saidText: string; dataText: string; metric: string; source: string }

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** The two figures for the Said-vs-Data bars: the official series reading when the
 *  claim maps to one, else the figures verified from the cited sources (cached only,
 *  never built while rendering). */
export async function claimBars(c: SharedClaim, trend: OgChart | null): Promise<ClaimBars | null> {
  if (trend && trend.saidNum != null && trend.said) {
    return { said: trend.saidNum, data: trend.valueNum, saidText: trend.said, dataText: trend.value, metric: trend.label, source: trend.source };
  }
  try {
    const ch = await getClaimChart(c, false);
    if (!ch?.data || !ch.said) return null;
    const unit = unitOf(ch);
    const src = ch.sources[ch.data.src];
    const source = src?.url ? (src.title && !/^https?:/.test(src.title) ? src.title : host(src.url)) : (c.sources.find(s => s.url)?.title || "Vote Unbiased fact-check");
    return { said: ch.said.value, data: ch.data.value, saidText: fmtU(ch.said.value, unit), dataText: fmtU(ch.data.value, unit), metric: ch.metric, source };
  } catch { return null; }
}
