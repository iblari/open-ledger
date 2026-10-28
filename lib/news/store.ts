import { kvGet, kvSetMany } from "../live-kv";
import { getSeries } from "../series";
import { fetchAll, cluster, buildStories, type Story, type Official } from "./engine";

/**
 * Stored News feed. Refreshed every 20 minutes by /api/cron/news: feeds are
 * re-read (last 48 hours), regrouped, and the result saved. Each story is also
 * kept on its own for 30 days so its page still opens after it leaves the feed.
 */
const FEED_KEY = "news:feed:v1";
const STORY_KEY = (id: string) => `news:story:v1:${id}`;
export interface NewsFeed { at: string; articles: number; outlets: number; failed: string[]; stories: Story[] }

const fmtMonth = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Latest official figures the number check compares against. */
async function officials(): Promise<Record<string, Official>> {
  const out: Record<string, Official> = {};
  const [cpi, mom, core, un, pay] = await Promise.all(["cpi_yoy", "cpi_mom", "core_cpi_yoy", "unemployment", "payrolls_chg"].map(id => getSeries(id).catch(() => null)));
  const last = (s: typeof cpi, k = 1) => s?.lines[0]?.points.slice(-k)[0];
  if (cpi) out.cpi = { metric: "cpi", label: "Inflation (CPI), 12-month change", source: "BLS", url: "https://www.bls.gov/cpi/", value: +last(cpi)!.v.toFixed(1), label2: fmtMonth(last(cpi)!.d), previous: +last(cpi, 2)!.v.toFixed(1), monthly: mom ? +last(mom)!.v.toFixed(1) : undefined, unit: "%" };
  if (core) out.core_cpi = { metric: "core_cpi", label: "Core inflation (CPI ex food & energy), 12-month change", source: "BLS", url: "https://www.bls.gov/cpi/", value: +last(core)!.v.toFixed(1), label2: fmtMonth(last(core)!.d), previous: +last(core, 2)!.v.toFixed(1), unit: "%" };
  if (un) out.unemployment = { metric: "unemployment", label: "Unemployment rate", source: "BLS", url: "https://www.bls.gov/cps/", value: +last(un)!.v.toFixed(1), label2: fmtMonth(last(un)!.d), previous: +last(un, 2)!.v.toFixed(1), unit: "%" };
  if (pay) out.payrolls = { metric: "payrolls", label: "Jobs added (nonfarm payrolls)", source: "BLS", url: "https://www.bls.gov/ces/", value: Math.round(last(pay)!.v), label2: fmtMonth(last(pay)!.d), previous: Math.round(last(pay, 2)!.v), unit: "K" };
  return out;
}

export async function refreshNews(): Promise<NewsFeed> {
  const [{ articles, failed }, offs] = await Promise.all([fetchAll(48), officials().catch(() => ({}))]);
  const stories = buildStories(cluster(articles), articles, offs).slice(0, 80);
  const feed: NewsFeed = { at: new Date().toISOString(), articles: articles.length, outlets: new Set(articles.map(a => a.outlet)).size, failed, stories };
  await kvSetMany([[FEED_KEY, JSON.stringify(feed), 0], ...stories.map(s => [STORY_KEY(s.id), JSON.stringify(s), 30 * 86400] as [string, string, number])]);
  return feed;
}

export async function getNewsFeed(): Promise<NewsFeed | null> {
  const [raw] = await kvGet([FEED_KEY]).catch(() => [null]);
  return raw ? JSON.parse(raw) as NewsFeed : null;
}
export async function getStory(id: string): Promise<Story | null> {
  const feed = await getNewsFeed();
  const live = feed?.stories.find(s => s.id === id);
  if (live) return live;
  const [raw] = await kvGet([STORY_KEY(id)]).catch(() => [null]);
  return raw ? JSON.parse(raw) as Story : null;
}
