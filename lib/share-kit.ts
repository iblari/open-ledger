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
import { excerpt } from "./quote-fit";
import { getReleaseCalendar, type CalendarItem } from "./release-calendar";
import { getNewsFeed } from "./news/store";
import { storyImage, storyDataLine } from "./news/share";

const SITE = "https://voteunbiased.org";
const TCO = 23;            // X counts every link as 23 characters
const MAX_POST = 280;
export const utm = (campaign: string) => `utm_source=x&utm_medium=social&utm_campaign=${campaign}`;
const withUtm = (url: string, campaign: string, content?: string) => `${url}${url.includes("?") ? "&" : "?"}${utm(campaign)}${content ? `&utm_content=${content}` : ""}`;
const RATING_LABEL: Record<string, string> = { FALSE: "False", TRUE: "True", "MOSTLY TRUE": "Mostly true", "MOSTLY FALSE": "Mostly false" };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + "…" : s);
/** Instagram-sized cards (1080×1350 portrait, 1080×1080 square), same designs as `image`. */
const igImages = (kind: "m" | "c" | "n", id: string, v?: string) => ({
  imagePortrait: `${SITE}/og/ig/portrait/${kind}/${id}.png${v ? `?v=${v}` : ""}`,
  imageSquare: `${SITE}/og/ig/square/${kind}/${id}.png${v ? `?v=${v}` : ""}`,
});
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

/** Cut a finding at a clause boundary to fit, ending cleanly (no "…"). */
function fitClause(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf("; "), cut.lastIndexOf(", "), cut.lastIndexOf(" — "), cut.lastIndexOf(" ("));
  if (at > 40) return cut.slice(0, at).replace(/[,;:(\s]+$/, "");
  // No clause break: end on a whole word, dropping a dangling connector ("…tied to fraud targeting" → "…tied to fraud").
  let w = cut.replace(/\s+\S*$/, "");
  while (/\s(to|of|for|in|on|at|by|with|and|or|the|a|an|from|that|which|as|than|targeting|including|per)$/i.test(w)) w = w.replace(/\s+\S+$/, "");
  return w.replace(/[,;:(\s]+$/, "");
}

/** Sam's format, fitted to 280 (links count as 23), with no sentence cut off:
 *    Claim: "…" <the data> (<source>). <link> #Topic */
/** The source to credit after the data line: none when the line already names one. */
function creditFor(data: string, fallback: string): string | null {
  if (AGENCIES.test(data) || /\b(reports?|reported|according to|per|announced|statistical|central bank|census|bureau|ministry|department|office)\b/i.test(data)) return null;
  return fallback;
}

function claimCaption(quote: string, data: string, source: string, link: string, tag: string | null): { caption: string; quote: string; data: string } {
  const credit = creditFor(data, source);
  const src = credit ? ` (${credit})` : "";
  const tail = ` ${link}${tag ? ` ${tag}` : ""}`;
  const fixed = `Claim: "" ${src}.`.length + 1 + TCO + (tag ? tag.length + 1 : 0);
  const room = MAX_POST - fixed;
  // The data line first (complete, at most ~170), then the quote gets all the room left:
  // whole if it fits, else its sentence with the number, else a clause ending in "…" (an omission mark).
  const qs = squash(quote);
  const d = fitClause(data, Math.max(80, Math.min(170, room - Math.min(qs.length, 60))));
  const q = excerpt(qs, Math.max(40, room - d.length)).text;
  const end = /[….!?]$/.test(d + src) ? "" : ".";
  return { caption: `Claim: "${q}" ${d}${src}${end}${tail}`, quote: q, data: d };
}

/** One line, numbers first: "Said: 301%. Data: 68.9% (IMF)." */
function hookFor(quote: string, data: string, source: string | null, ratingLabel: string): string {
  // Only when both numbers are unmistakably the same kind (%, $, points) and really differ:
  // a wrong pairing ("over 60" as an age vs "3 complaints") would be a factual error in public.
  const saidAll = numbers(quote).filter(n => unitOf(n));
  const said = saidAll.length === 1 ? saidAll[0] : null;
  if (said) {
    const got = numbers(data).find(n => unitOf(n) === unitOf(said));
    const a = valueOf(said), b = got ? valueOf(got) : NaN;
    // Same order of magnitude too: "$42M total" vs "$187.94 per person" are different quantities.
    const ratio = a && b ? Math.max(a, b) / Math.min(a, b) : Infinity;
    if (got && Number.isFinite(a) && Number.isFinite(b) && ratio < 10 && Math.abs(a - b) > Math.max(Math.abs(a), Math.abs(b)) * 0.02) {
      return `Said: ${said}. Data: ${got}${source ? ` (${source})` : ""}.`;
    }
  }
  return `${ratingLabel}: ${fitClause(data, 110)}.`;
}
/** Numbers as written, minus bare years, with long digit strings made readable (90,000,000,000 → 90B). */
function numbers(s: string): string[] {
  const out: string[] = [];
  const re = /[$]?\d[\d,]*(?:\.\d+)?(?:\s?[-–]\s?\d[\d,]*(?:\.\d+)?)?\s?(?:%|percent\b|(?:k|m|b|t)\b|thousand\b|million\b|billion\b|trillion\b|points?\b|pts\b)?/gi;
  for (const m of s.match(re) || []) {
    let t = m.trim().replace(/\s?percent$/i, "%").replace(/,$/, "");
    if (/^(19|20)\d\d$/.test(t)) continue;
    const plain = t.replace(/[$,]/g, "");
    if (/^\d{7,}$/.test(plain)) { const v = Number(plain); t = (t.startsWith("$") ? "$" : "") + (v >= 1e12 ? `${+(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : `${+(v / 1e6).toFixed(1)}M`); }
    out.push(t);
  }
  return out;
}
function valueOf(n: string): number {
  const m = n.replace(/[$,%\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|b|t|thousand|million|billion|trillion)?/i);
  if (!m) return NaN;
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 };
  return parseFloat(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
}
const unitOf = (n: string) => /%/.test(n) ? "%" : /^\$|[BMT]$|billion|million|trillion/i.test(n) ? "$" : /point|pts/i.test(n) ? "pts" : "";

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
  /** Instagram: 1080×1350 and 1080×1080 PNGs of the same card. */
  imagePortrait: string; imageSquare: string;
  caption: string;
  /** One line, numbers first, to lead a post. */
  hook: string;
  firstSeenAt: string;
}
export interface KitMetric {
  id: string; type: "metric"; metric: string; name: string;
  value: string; observationDate: string; observationLabel: string; change: string | null;
  dataLine: string; source: string; hashtag: string | null;
  link: string; dashboardLink: string | null; image: string; video: string | null;
  /** Instagram: 1080×1350 and 1080×1080 PNGs of the same card. */
  imagePortrait: string; imageSquare: string;
  caption: string;
  hook: string;
  /** Next scheduled release of this metric, if known. */
  nextRelease: string | null;
  /** When this observation first appeared on the site (the release-day trigger). */
  dataUpdatedAt: string;
  releasedLast24h: boolean;
}
export interface KitStory {
  id: string; type: "story"; title: string; topic: string;
  outlets: number; coverage: { left: number; center: number; right: number; unrated: number };
  /** Share of each side's outlets that covered it (0–1). */
  rate: { left: number; center: number; right: number };
  dataLine: string; link: string; image: string;
  /** Instagram: 1080×1350 and 1080×1080 PNGs of the same card. */
  imagePortrait: string; imageSquare: string;
  caption: string;
  /** When the counts were read, and when they last changed (for updated_since). */
  asOf: string; updatedAt: string;
}
export interface ShareKit {
  generatedAt: string;
  updatedSince: string | null;
  brand: { video: string; tagline: string; url: string };
  rules: string[];
  /** Upcoming official releases (CPI, jobs, PPI, GDP, gas) for pre-scheduling. */
  calendar: CalendarItem[];
  claims: KitClaim[];
  metrics: KitMetric[];
  /** News stories (outlets covering, by lean), newest counts first. */
  stories: KitStory[];
  onAir: { theme: string; change: string; url: string } | null;
}

export async function buildShareKit(opts: { updatedSince?: string | null } = {}): Promise<ShareKit> {
  const now = new Date().toISOString();
  const [claimsAll, manifest, seenRaw, , calendar] = await Promise.all([getTrendingClaims().catch(() => []), getMediaManifest(), loadSeen(), loadTopicTags(), getReleaseCalendar().catch(() => [] as CalendarItem[])]);
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
      const id = `claim:${c.key}`;
      const link = withUtm(page, "claim", id);
      const dataLine = dataLineOf(c.actual || "");
      const source = sourceOf(c.actual || "", c.sources || [], c.series?.series);
      const topic = topicOf(c.quote);
      const hashtag = HASHTAG[topic] ?? null;
      const cap = claimCaption(c.quote, dataLine, source, link, hashtag);
      const label = RATING_LABEL[c.rating] || c.rating;
      return {
        id, type: "claim" as const, key: c.key,
        claimText: squash(c.quote), speaker: c.speaker || null, event: c.title, saidAt: c.date,
        rating: c.rating, ratingLabel: RATING_LABEL[c.rating] || c.rating,
        dataLine, source, topic, hashtag,
        link, image: `${page}/opengraph-image`, ...igImages("c", c.key),
        video: manifest[c.key] ? `${SITE}/og/v/${c.key}.mp4` : null,
        watch: `${SITE}/live?v=${c.videoId}${c.videoTime != null ? `&t=${Math.max(0, Math.floor(c.videoTime))}` : ""}`,
        caption: cap.caption,
        hook: hookFor(cap.quote, dataLine, creditFor(dataLine, source) ?? (dataLine.match(AGENCIES)?.[1] || null), label),
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
    const link = withUtm(`${SITE}/s/${mid}`, "metric", `metric:${mid}:${obs}`);
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
      image: `${SITE}/og/m/${mid}.png?d=${obs}`, ...igImages("m", mid, obs),
      video: manifest[clipName]?.date === obs ? `${SITE}/og/v/${clipName}.mp4?d=${obs}` : null,
      caption: `${dataLine}. Source: ${source}. ${link}${hashtag ? ` ${hashtag}` : ""}`,
      hook: `${name}: ${c.value}${change ? `, ${change}` : ""}.`,
      nextRelease: calendar.find(r => r.metrics.includes(mid))?.datetime ?? null,
      dataUpdatedAt: updated,
      releasedLast24h: Date.now() - Date.parse(updated) < 864e5,
    };
    return m;
  }))).filter((m): m is KitMetric => !!m);

  if (bootstrap) { seen._init = now; dirty = true; }
  if (dirty && seenRaw != null) await saveSeen(seen);

  const since = opts.updatedSince && !isNaN(Date.parse(opts.updatedSince)) ? Date.parse(opts.updatedSince) : null;
  const feed = await getNewsFeed().catch(() => null);
  const stories: KitStory[] = (feed?.stories || []).filter(st => st.outlets >= 5).slice(0, 25).map(st => {
    const link = withUtm(`${SITE}/news/${st.slug}`, "news", `story:${st.id}`);
    const dataLine = storyDataLine(st);
    return {
      id: `story:${st.id}`, type: "story", title: st.title, topic: st.topic,
      outlets: st.outlets, coverage: st.coverage, rate: st.rate,
      dataLine, link, image: storyImage(st), ...igImages("n", st.slug, `${st.coverage.left}-${st.coverage.center}-${st.coverage.right}`),
      caption: `${st.title}. ${dataLine}. ${link}`,
      asOf: st.asOf || feed!.at, updatedAt: st.updatedAt || st.asOf || feed!.at,
    };
  });
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
      "News stories: post the counts as they are (how many of each side's outlets covered it). Don't call a side's coverage biased or say it is hiding a story.",
      "Links carry UTM tags (utm_source=x, utm_medium=social, utm_content=<item id>) so visits per post are counted: GET /api/traffic?since=YYYY-MM-DD with your team key.",
    ],
    calendar,
    claims: since != null ? claims.filter(c => Date.parse(c.firstSeenAt) > since) : claims,
    metrics: since != null ? metrics.filter(m => Date.parse(m.dataUpdatedAt) > since) : metrics,
    stories: since != null ? stories.filter(st => Date.parse(st.updatedAt) > since) : stories,
    onAir: top ? { theme: top.label, change: top.baseRate > 0 ? `${(top.recentRate / top.baseRate).toFixed(1)}× more talk in 14 days` : "new in the last 14 days", url: withUtm(`${SITE}/live#radar-h`, "radar") } : null,
  };
}
