/**
 * Sam's share kit: everything Vote Unbiased's social media manager needs to
 * post, as one feed (GET /api/share-kit, see SAM.md).
 *
 * Every item has a stable `id` and a `firstSeenAt` (when the site first
 * published it), so `?updated_since=` returns only what's new. Fields are
 * separate so Sam can edit; `caption` is a ready draft in Sam's format:
 *   Claim: "…" <the data, with source>. <link> #Topic
 * Drafts are built from the data (no model), neutral, numbers first.
 */
import { getTrendingClaims, TRENDING_RATINGS } from "./trending-claims";
import { getSeries, CATALOG_BY_ID } from "./series";
import { buildOgChart } from "./og-chart";
import { shortName, dashboardMetricFor, SHARE_METRICS, sourceLabel } from "./metric-share";
import { getRadar } from "./agenda-radar";
import { topicOf } from "./claim-topics";
import { loadTopicTags } from "./topic-tags";
import { kvGet, kvSetMany } from "./live-kv";
import { getMediaManifest, metricClipName } from "./og-media";

const SITE = "https://voteunbiased.org";
const TCO = 23;            // X counts every link as 23 characters
const MAX_POST = 280;
export const utm = (campaign: string) => `utm_source=x&utm_medium=social&utm_campaign=${campaign}`;
const withUtm = (url: string, campaign: string) => `${url}${url.includes("?") ? "&" : "?"}${utm(campaign)}`;
const RATING_LABEL: Record<string, string> = { FALSE: "False", TRUE: "True", "MOSTLY TRUE": "Mostly true", "MOSTLY FALSE": "Mostly false" };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…" : s);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const HASHTAG: Record<string, string> = {
  "Jobs & employment": "#Jobs", "Wages & income": "#Wages", "Inflation & prices": "#Inflation", "Interest rates & the Fed": "#Fed",
  "Economy (general)": "#Economy", "Stock market": "#Stocks", "Taxes": "#Taxes", "Debt & spending": "#NationalDebt", "Fraud & waste": "#Fraud",
  "Trade & tariffs": "#Tariffs", "Manufacturing": "#Manufacturing", "Investment": "#Investment", "Energy": "#Energy", "Housing": "#Housing",
  "Health & benefits": "#Healthcare", "Drug prices": "#DrugPrices", "Immigration": "#Immigration", "Crime & policing": "#Crime", "Education": "#Education",
  "Defense & military": "#Defense", "War & foreign affairs": "#ForeignPolicy", "Elections": "#Elections",
};
const METRIC_TAG: Record<string, string> = {
  cpi_yoy: "#Inflation", cpi_mom: "#Inflation", core_cpi_yoy: "#Inflation", ppi_yoy: "#Inflation", ppi_mom: "#Inflation",
  gas: "#GasPrices", payrolls_chg: "#Jobs", unemployment: "#Jobs", debt: "#NationalDebt", deficit_12m: "#NationalDebt",
  fed_funds: "#Fed", mortgage: "#Housing", treasury_10y: "#Bonds", sp500: "#Stocks", gdp_growth: "#Economy", real_wages: "#Wages",
};
const AGENCIES = /\b(BLS|BEA|EIA|IMF|CBO|OECD|FRED|CBP|FBI|CDC|EPA|USDA|Census Bureau|Treasury|Federal Reserve|World Bank|Statistics Canada|Eurostat|OPEC|AAA|Gallup|Ballotpedia|CMS|KFF|SSA|DHS|DOJ|GAO|OMB|FDA|NOAA|NASA|UN|WHO)\b/;

/** First sentence of the finding: the data, numbers first. */
function dataLineOf(actual: string): string {
  const s = squash(actual);
  return (s.split(/(?<=[.;])\s+(?=[A-Z$0-9])/)[0] || s).replace(/[.;]\s*$/, "");
}
function sourceOf(actual: string, sources: { title: string; url: string }[], seriesId?: string | null): string {
  const named = actual.match(AGENCIES)?.[1];
  if (named) return named;
  const cat = seriesId ? CATALOG_BY_ID.get(seriesId)?.source : null;
  if (cat) return cat;
  try { return sources[0] ? new URL(sources[0].url).hostname.replace(/^www\./, "") : "official data"; } catch { return "official data"; }
}

/** Sam's format, fitted to 280 (links count as 23). */
function claimCaption(quote: string, data: string, source: string, link: string, tag: string | null): string {
  const src = data.includes(source) ? "" : ` (${source})`;
  const tail = ` ${link}${tag ? ` ${tag}` : ""}`;
  const fixed = `Claim: "" ${src}.`.length + 1 + TCO + (tag ? tag.length + 1 : 0);
  let room = MAX_POST - fixed;
  const qs = squash(quote);
  const d = clip(data, Math.max(80, room - Math.min(qs.length, 110)));
  room -= d.length;
  const q = clip(qs, Math.max(40, room));
  return `Claim: "${q}" ${d}${src}${/[….!?]$/.test(d + src) ? "" : "."}${tail}`;
}

/* ── first-seen bookkeeping (stable timestamps for ?updated_since) ─────── */

const SEEN_KEY = "sharekit:seen:v2";
type Seen = Record<string, string>;
async function loadSeen(): Promise<Seen | null> {
  try { const [raw] = await kvGet([SEEN_KEY]); return raw ? (JSON.parse(raw) as Seen) : {}; } catch { return null; }
}
async function saveSeen(seen: Seen): Promise<void> {
  const cut = Date.now() - 180 * 864e5;
  // Only claims age out; a metric's current reading can be months old (debt).
  for (const [k, v] of Object.entries(seen)) if (k.startsWith("claim:") && Date.parse(v) < cut) delete seen[k];
  await kvSetMany([[SEEN_KEY, JSON.stringify(seen), 0]]).catch(() => {});
}

/* ── types ─────────────────────────────────────────────────────────────── */

export interface KitClaim {
  id: string; type: "claim"; key: string;
  claimText: string; speaker: string | null; event: string; saidAt: string;
  rating: string; ratingLabel: string;
  dataLine: string; source: string;
  topic: string; hashtag: string | null;
  link: string; image: string; video: string | null; watch: string;
  caption: string;
  firstSeenAt: string;
}
export interface KitMetric {
  id: string; type: "metric"; metric: string; name: string;
  value: string; observationDate: string; observationLabel: string; change: string | null;
  dataLine: string; source: string; hashtag: string | null;
  link: string; dashboardLink: string | null; image: string; video: string | null;
  caption: string;
  /** When this observation first appeared on the site (the release-day trigger). */
  dataUpdatedAt: string;
  releasedLast24h: boolean;
}
export interface ShareKit {
  generatedAt: string;
  updatedSince: string | null;
  brand: { video: string; tagline: string; url: string };
  rules: string[];
  claims: KitClaim[];
  metrics: KitMetric[];
  onAir: { theme: string; change: string; url: string } | null;
}

export async function buildShareKit(opts: { updatedSince?: string | null } = {}): Promise<ShareKit> {
  const now = new Date().toISOString();
  const [claimsAll, manifest, seenRaw] = await Promise.all([getTrendingClaims().catch(() => []), getMediaManifest(), loadSeen(), loadTopicTags()]);
  const seen: Seen = seenRaw ?? {};
  // First run: date everything by its own date, so the backlog isn't "new".
  const bootstrap = seenRaw != null && !seen._init;
  let dirty = false;
  const firstSeen = (id: string, natural: string) => {
    if (!seen[id]) { seen[id] = bootstrap ? natural : now; dirty = true; }
    return seen[id];
  };

  const claims: KitClaim[] = claimsAll
    .filter(c => TRENDING_RATINGS.has(c.rating) && c.quote)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 60)
    .map(c => {
      const page = `${SITE}${c.path}`;
      const link = withUtm(page, "claim");
      const dataLine = dataLineOf(c.actual || "");
      const source = sourceOf(c.actual || "", c.sources || [], c.series?.series);
      const topic = topicOf(c.quote);
      const hashtag = HASHTAG[topic] ?? null;
      const id = `claim:${c.key}`;
      return {
        id, type: "claim" as const, key: c.key,
        claimText: squash(c.quote), speaker: c.speaker || null, event: c.title, saidAt: c.date,
        rating: c.rating, ratingLabel: RATING_LABEL[c.rating] || c.rating,
        dataLine, source, topic, hashtag,
        link, image: `${page}/opengraph-image`,
        video: manifest[c.key] ? `${SITE}/og/v/${c.key}.mp4` : null,
        watch: `${SITE}/live?v=${c.videoId}${c.videoTime != null ? `&t=${Math.max(0, Math.floor(c.videoTime))}` : ""}`,
        caption: claimCaption(c.quote, dataLine, source, link, hashtag),
        firstSeenAt: firstSeen(id, c.date),
      };
    });

  const metrics = (await Promise.all(SHARE_METRICS.map(async mid => {
    const sd = await getSeries(mid).catch(() => null);
    const c = sd ? buildOgChart(sd) : null;
    const pts = sd?.lines[0]?.points;
    if (!sd || !c || !pts?.length) return null;
    const obs = pts[pts.length - 1].d;
    const name = shortName(mid);
    const dash = dashboardMetricFor(mid);
    const link = withUtm(`${SITE}/s/${mid}`, "metric");
    const change = c.change ? c.change.replace(/^▲ /, "up ").replace(/^▼ /, "down ") : null;
    const dataLine = `${name}: ${c.value} (${c.valueDate})${change ? `, ${change}` : ""}`;
    const hashtag = METRIC_TAG[mid] ?? null;
    const source = sourceLabel(mid, sd.source);
    const clipName = metricClipName(mid);
    const updated = firstSeen(`metric:${mid}:${obs}`, obs + "T12:00:00.000Z");
    const m: KitMetric = {
      id: `metric:${mid}:${obs}`, type: "metric", metric: mid, name,
      value: c.value, observationDate: obs, observationLabel: c.valueDate, change,
      dataLine, source, hashtag,
      link, dashboardLink: dash ? withUtm(`${SITE}/dashboard?view=month&metric=${dash}`, "metric") : null,
      image: `${SITE}/og/m/${mid}.png?d=${obs}`,
      video: manifest[clipName]?.date === obs ? `${SITE}/og/v/${clipName}.mp4?d=${obs}` : null,
      caption: `${dataLine}. Source: ${source}. ${link}${hashtag ? ` ${hashtag}` : ""}`,
      dataUpdatedAt: updated,
      releasedLast24h: Date.now() - Date.parse(updated) < 864e5,
    };
    return m;
  }))).filter((m): m is KitMetric => !!m);

  if (bootstrap) { seen._init = now; dirty = true; }
  if (dirty && seenRaw != null) await saveSeen(seen);

  const since = opts.updatedSince && !isNaN(Date.parse(opts.updatedSince)) ? Date.parse(opts.updatedSince) : null;
  const radar = await getRadar().catch(() => null);
  const top = radar?.themes.filter(t => t.market && (t.status === "rising" || t.status === "new")).sort((a, b) => b.z - a.z)[0];
  return {
    generatedAt: now,
    updatedSince: since != null ? new Date(since).toISOString() : null,
    brand: { video: `${SITE}/og/v/brand.mp4`, tagline: "Economic & political intelligence. In real time.", url: withUtm(SITE, "brand") },
    rules: [
      "Numbers first. State what was said and what the official data shows; no adjectives about people, no predictions, no party framing.",
      "Use the site's rating exactly (True / Mostly true / False). Never upgrade or soften it.",
      "Always link the exact claim or chart page; the preview card carries the chart and the rating.",
      "X caches a link's card for about a week; to refresh a card, add &v=2 to the link.",
      "Links carry UTM tags (utm_source=x, utm_medium=social) so visits from posts are counted.",
    ],
    claims: since != null ? claims.filter(c => Date.parse(c.firstSeenAt) > since) : claims,
    metrics: since != null ? metrics.filter(m => Date.parse(m.dataUpdatedAt) > since) : metrics,
    onAir: top ? { theme: top.label, change: top.baseRate > 0 ? `${(top.recentRate / top.baseRate).toFixed(1)}× more talk in 14 days` : "new in the last 14 days", url: withUtm(`${SITE}/live#radar-h`, "radar") } : null,
  };
}
