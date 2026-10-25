/**
 * Sam's share kit — everything Vote Unbiased's social media manager needs
 * to post, in one feed: ready links (with UTM tags), the preview image and
 * video each link will show, the numbers, and a plain draft line.
 *
 * Drafts are deterministic (built from the data, no model), neutral, and
 * meant to be edited: they state what was said and what the data shows,
 * nothing more.
 */
import { getTrendingClaims } from "./trending-claims";
import { getSeries } from "./series";
import { buildOgChart } from "./og-chart";
import { shortName, dashboardMetricFor, SHARE_METRICS } from "./metric-share";
import { getRadar } from "./agenda-radar";

const SITE = "https://voteunbiased.org";
export const utm = (campaign: string) => `utm_source=x&utm_medium=social&utm_campaign=${campaign}`;
const withUtm = (url: string, campaign: string) => `${url}${url.includes("?") ? "&" : "?"}${utm(campaign)}`;
const VERDICT: Record<string, string> = { FALSE: "False", TRUE: "True", "MOSTLY TRUE": "Mostly true" };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

export interface KitClaim {
  key: string; verdict: string; quote: string; who: string | null; event: string; date: string;
  finding: string; url: string; image: string; video: string; watch: string; chart: string | null; draft: string;
}
export interface KitMetric {
  id: string; name: string; value: string; date: string; change: string | null; source: string;
  url: string; dashboardUrl: string | null; image: string; draft: string;
}
export interface ShareKit {
  generatedAt: string;
  brand: { video: string; tagline: string; url: string };
  rules: string[];
  claims: KitClaim[];
  metrics: KitMetric[];
  onAir: { theme: string; change: string; url: string } | null;
}

export async function buildShareKit(): Promise<ShareKit> {
  const claims = await getTrendingClaims().catch(() => []);
  const kitClaims: KitClaim[] = claims.filter(c => c.series?.series).slice(0, 25).map(c => {
    const verdict = VERDICT[c.rating] || c.rating;
    const url = `${SITE}${c.path}`;
    const who = c.speaker || null;
    const finding = clip((c.actual || "").replace(/\s+/g, " ").trim(), 220);
    const draft = `${verdict.toUpperCase()}: ${who ? `${who.split(" ").slice(-1)[0]}: ` : ""}“${clip(c.quote, 120)}”\n\n${clip(finding, 160)}\n\nChart + sources ↓`;
    return {
      key: c.key, verdict, quote: c.quote, who, event: c.title, date: c.date, finding,
      url: withUtm(url, "claim"), image: `${url}/opengraph-image`, video: `${SITE}/og/v/${c.key}.mp4`,
      watch: `${SITE}/live?v=${c.videoId}${c.videoTime != null ? `&t=${Math.max(0, Math.floor(c.videoTime))}` : ""}`,
      chart: c.series?.series ?? null, draft,
    };
  });

  const metrics = (await Promise.all(SHARE_METRICS.map(async id => {
    const sd = await getSeries(id).catch(() => null);
    const c = sd ? buildOgChart(sd) : null;
    if (!sd || !c) return null;
    const name = shortName(id);
    const dash = dashboardMetricFor(id);
    const m: KitMetric = {
      id, name, value: c.value, date: c.valueDate, change: c.change, source: sd.source,
      url: withUtm(`${SITE}/s/${id}`, "metric"),
      dashboardUrl: dash ? withUtm(`${SITE}/dashboard?view=month&metric=${dash}`, "metric") : null,
      image: `${SITE}/og/m/${id}.png`,
      draft: `${name}: ${c.value} (${c.valueDate})${c.change ? `, ${c.change.replace(/^▲ /, "up ").replace(/^▼ /, "down ")}` : ""}.\n\nOfficial ${sd.source} data, charted ↓`,
    };
    return m;
  }))).filter((m): m is KitMetric => !!m);

  const radar = await getRadar().catch(() => null);
  const top = radar?.themes.filter(t => t.market && (t.status === "rising" || t.status === "new")).sort((a, b) => b.z - a.z)[0];
  return {
    generatedAt: new Date().toISOString(),
    brand: { video: `${SITE}/og/v/brand.mp4`, tagline: "Economic & political intelligence. In real time.", url: withUtm(SITE, "brand") },
    rules: [
      "State what was said and what the official data shows. No adjectives about people, no predictions, no party framing.",
      "Always link the claim or chart page — the preview card carries the chart and the verdict.",
      "Use the verdict exactly as published (False / Mostly true / True). Never upgrade or soften it.",
      "X caches a link's card for about a week; to refresh a card, add ?v=2 to the link.",
      "Links already carry UTM tags (utm_source=x, utm_medium=social) so visits from posts are counted.",
    ],
    claims: kitClaims,
    metrics,
    onAir: top ? { theme: top.label, change: top.baseRate > 0 ? `${(top.recentRate / top.baseRate).toFixed(1)}× more talk in 14 days` : "new in the last 14 days", url: withUtm(`${SITE}/live#radar-h`, "radar") } : null,
  };
}
