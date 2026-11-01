import { kvGet } from "./live-kv";
import { SERIES_KEY, cleanMapping, type ClaimSeries } from "./claim-series";
import { getSeries } from "./series";
import { buildOgChart, type OgChart } from "./og-chart";
import { listTrendingClaims } from "./trending-claims";
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
