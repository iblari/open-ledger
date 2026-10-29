import { getNewsFeed } from "./news/store";
import type { TrendCard } from "./bench-lens";

/**
 * Trending cards from the News tab, for the homepage strip: the most widely
 * covered story right now, and the top story one side's outlets mostly skipped.
 * Reads the stored feed (refreshed every 20 minutes); never throws.
 */
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export async function newsTrending(): Promise<TrendCard[]> {
  const feed = await getNewsFeed().catch(() => null);
  if (!feed?.stories.length) return [];
  const day = Date.now() - 36 * 3600_000;
  const recent = feed.stories.filter(s => Date.parse(s.lastSeen) > day && s.outlets >= 5);
  const card = (s: (typeof recent)[number], badge: string, score: number): TrendCard => ({
    id: `news-${s.id}`, kicker: "News", headline: s.title, badge, tone: "neutral",
    date: s.lastSeen, dateLabel: fmtDay(s.lastSeen), href: `/news/${s.slug}`, score,
    coverage: { left: s.coverage.left, center: s.coverage.center, right: s.coverage.right, unrated: s.coverage.unrated },
  });
  const out: TrendCard[] = [];
  const top = [...recent].sort((a, b) => b.outlets - a.outlets || b.lastSeen.localeCompare(a.lastSeen))[0];
  if (top) out.push(card(top, `${top.outlets} outlets covering it`, 5 + Math.min(top.outlets, 30) / 6));
  const blind = recent.filter(s => s.blindspot && s !== top).sort((a, b) => b.outlets - a.outlets)[0];
  if (blind) out.push(card(blind, `Mostly skipped by ${blind.blindspot}-leaning outlets`, 4.5 + Math.min(blind.outlets, 30) / 6));
  return out;
}
