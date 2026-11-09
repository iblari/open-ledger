import { unstable_cache } from "next/cache";
import { buildShareKit } from "./share-kit";
import { getNewsFeed } from "./news/store";
import { kvHgetall, kvHincrMany } from "./live-kv";
import { dayET } from "./traffic";
import { MID, raceTitle } from "./midterms";
import { getResults } from "./results";

/**
 * For You feed, v1. One vertical stream of everything the site makes:
 * news stories, checked claims, official data releases and live results.
 *
 * v1 is NOT personalised. Order = freshness x popularity, plus the visitor's
 * state (for results). Every card carries a plain "why" line. The mix is a
 * fixed weighted rotation so no single kind or topic takes over.
 * v2 will add per-visitor topic learning with a balance rule.
 */

export type Why = string;
interface Base { id: string; href: string; why: Why; at: string; topic: string }
export interface StoryCard extends Base { kind: "story"; title: string; outlets: number; coverage: { left: number; center: number; right: number; unrated: number }; blindspot: string | null; sides: { lean: "left" | "center" | "right"; title: string; outlet: string }[]; photo: string | null; alts: { url: string; name: string }[]; credit: string | null; official: string | null }
export interface ClaimCard extends Base { kind: "claim"; quote: string; speaker: string | null; event: string; rating: string; ratingLabel: string; hook: string; dataLine: string; source: string; video: string | null; image: string; portrait: string; watch: string; yt: { id: string; start: number; end: number } | null }
export interface MetricCard extends Base { kind: "metric"; name: string; value: string; label: string; change: string | null; source: string; video: string | null; image: string; nextRelease: string | null; dash: string | null }
export interface ResultCard extends Base { kind: "result"; title: string; state: string; st: string; pctCounted: number | null; cands: { name: string; p: string; votes: number; pct: number }[]; total: number; source: string; local: boolean; live: boolean; called: string | null }
export type FyCard = StoryCard | ClaimCard | MetricCard | ResultCard;

const SITE = "https://voteunbiased.org";
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
const ageH = (iso: string) => Math.max(0, (Date.now() - Date.parse(iso)) / 3600_000);
const fresh = (iso: string, halfLifeH: number) => Math.pow(0.5, ageH(iso) / halfLifeH);
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Page views today + yesterday, per path (from the site's own beacon). */
async function recentViews(): Promise<Record<string, number>> {
  const y = new Date(Date.now() - 864e5);
  const [a, b] = await Promise.all([kvHgetall(`traffic:v1:${dayET()}`).catch(() => ({})), kvHgetall(`traffic:v1:${ymd(y)}`).catch(() => ({}))]) as Record<string, number>[];
  const out: Record<string, number> = {};
  for (const h of [a, b]) for (const [k, v] of Object.entries(h)) if (k.startsWith("p:")) out[k.slice(2)] = (out[k.slice(2)] || 0) + v;
  return out;
}

/** The broadcast moment: a few seconds before the claim to ~15s after. */
function ytOf(watch: string): ClaimCard["yt"] {
  try {
    const u = new URL(watch); const id = u.searchParams.get("v"); const t = Number(u.searchParams.get("t"));
    if (!id || !/^[\w-]{11}$/.test(id) || !Number.isFinite(t)) return null;
    const start = Math.max(0, Math.floor(t) - 3);
    return { id, start, end: start + 18 };
  } catch { return null; }
}

type Scored<T> = T & { score: number };

/** Everything except results, scored. Cached 5 minutes for all visitors. */
const pool = unstable_cache(async () => {
  const [kit, feed, views] = await Promise.all([buildShareKit(), getNewsFeed().catch(() => null), recentViews()]);
  const byId = new Map((feed?.stories || []).map(s => [`story:${s.id}`, s]));
  const pop = (href: string) => Math.log1p(views[pathOf(href)] || 0);

  const stories: Scored<StoryCard>[] = kit.stories.map(k => {
    const s = byId.get(k.id);
    const href = `/news/${pathOf(k.link).split("/").pop()}`;
    const at = s?.lastSeen || k.updatedAt;
    const sides: StoryCard["sides"] = [];
    if (s) {
      const plain = (t: string) => !/\b(live|watch|opinion|analysis|podcast|newsletter)\b|^[^:]{0,25}:/i.test(t);
      for (const l of ["left", "center", "right"] as const) {
        const a = s.sides?.[l] ?? s.articles.find(x => x.lean === l && plain(x.title));
        if (a) sides.push({ lean: l, title: a.title, outlet: a.name });
      }
    }
    const blind = s?.blindspot ? `Mostly skipped by ${s.blindspot}-leaning outlets` : null;
    return {
      kind: "story" as const, id: k.id, href, at, topic: k.topic, title: k.title, outlets: k.outlets, coverage: k.coverage,
      blindspot: blind, sides: sides.length >= 2 ? sides : [], photo: s?.photo?.url ?? null, alts: s?.photo?.alts ?? [], credit: s?.photo?.name ?? null,
      official: s?.numbers ? `Official figure ${s.numbers.official}${s.numbers.metric === "payrolls" ? "K" : "%"}` : null,
      why: blind ? "Blindspot: one side barely covered this" : k.outlets >= 40 ? `Covered by ${k.outlets} outlets` : "In the news now",
      score: (1 + Math.log1p(k.outlets) + 0.5 * pop(href)) * fresh(at, 18),
    };
  });

  const claims: Scored<ClaimCard>[] = kit.claims.map(c => {
    const href = pathOf(c.link);
    const p = pop(href);
    return {
      kind: "claim" as const, id: c.id, href, at: c.saidAt, topic: c.topic, quote: c.claimText, speaker: c.speaker, event: c.event,
      rating: c.rating, ratingLabel: c.ratingLabel, hook: c.hook, dataLine: c.dataLine, source: c.source,
      video: c.video, image: c.image.replace(SITE, ""), portrait: c.imagePortrait.replace(SITE, ""), watch: c.watch.replace(SITE, ""),
      yt: ytOf(c.watch),
      why: p >= Math.log1p(25) ? "Popular on the site today" : ageH(c.saidAt) < 24 ? "Said in the last 24 hours" : "Recently checked",
      score: (1.5 + p + (c.video ? 0.5 : 0)) * fresh(c.saidAt, 36),
    };
  });

  const metrics: Scored<MetricCard>[] = kit.metrics.map(m => {
    const href = pathOf(m.link);
    const recent = m.releasedLast24h;
    const soon = m.nextRelease && Date.parse(m.nextRelease) - Date.now() < 3 * 864e5 && Date.parse(m.nextRelease) > Date.now();
    return {
      kind: "metric" as const, id: m.id, href, at: m.dataUpdatedAt, topic: m.hashtag?.replace("#", "") || "Economy",
      name: m.name, value: m.value, label: m.observationLabel, change: m.change, source: m.source,
      video: m.video, image: m.image.replace(SITE, ""), nextRelease: m.nextRelease,
      dash: m.dashboardLink ? pathOf(m.dashboardLink) + "?" + (m.dashboardLink.split("?")[1] || "").replace(/&?utm_[^&]*/g, "") : null,
      why: recent ? "New official data today" : soon ? "New numbers out this week" : "Latest official figure",
      score: (1 + (recent ? 3 : 0) + (soon ? 0.6 : 0) + pop(href)) * fresh(m.dataUpdatedAt, 24 * 10),
    };
  });

  return { stories, claims, metrics, at: kit.generatedAt };
}, ["for-you-pool-v2"], { revalidate: 300 });

/** Results cards: official counts only, from the same store as /vote. */
async function resultCards(myState: string | null): Promise<Scored<ResultCard>[]> {
  const res = await getResults(MID.races.map(r => r.id)).catch(() => ({} as Awaited<ReturnType<typeof getResults>>));
  const out: Scored<ResultCard>[] = [];
  for (const r of MID.races) {
    const x = res[r.id];
    if (!x || !x.cands?.length || ageH(x.updatedAt) > 24 * 14) continue;
    const total = x.cands.reduce((s, c) => s + c.votes, 0);
    if (!total) continue;
    const cands = [...x.cands].sort((a, b) => b.votes - a.votes).slice(0, 3).map(c => ({ ...c, pct: c.votes / total }));
    const margin = cands.length > 1 ? cands[0].pct - cands[1].pct : 1;
    const hrs = ageH(x.updatedAt);
    const local = r.st === myState;
    const live = hrs < 12;
    out.push({
      kind: "result", id: `result:${r.id}`, href: `/vote/${r.st.toLowerCase()}`, at: x.updatedAt, topic: "Elections",
      title: raceTitle(r), state: r.state, st: r.st, pctCounted: x.pctCounted, cands, total, source: x.source, local,
      called: x.called ? `${x.called.name} (called by ${x.called.by})` : null,
      live,
      why: local ? "Your state" : margin < 0.03 ? "One of the closest races" : live ? "Live count" : "Election result",
      // Your state leads only while counting is recent (3 days); after that it joins the rotation.
      score: (local && hrs < 72 ? 100 : 0) + (local ? 1 : 0) + (1 - Math.min(margin, 1)) * 2 * fresh(x.updatedAt, 48),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The feed for one visitor. Local results lead; then a fixed rotation
 * (story, claim, story, metric, claim, story, result) taking the best
 * remaining card of each kind, skipping a card whose topic matches the one
 * just shown when another of that kind is close behind.
 */
export async function forYouFeed(myState: string | null, limit = 60): Promise<{ cards: FyCard[]; at: string }> {
  const [p, results] = await Promise.all([pool(), resultCards(myState)]);
  const lanes: Record<FyCard["kind"], Scored<FyCard>[]> = {
    story: [...p.stories].sort((a, b) => b.score - a.score),
    claim: [...p.claims].sort((a, b) => b.score - a.score),
    metric: [...p.metrics].sort((a, b) => b.score - a.score),
    result: results.filter(r => r.score < 100).slice(0, 8),
  };
  const lead = results.filter(r => r.score >= 100).slice(0, 2);
  const out: FyCard[] = lead.map(({ score: _s, ...c }) => { void _s; return c as FyCard; });
  const ROT: FyCard["kind"][] = ["story", "claim", "story", "metric", "claim", "story", "result"];
  let last = out[out.length - 1]?.topic;
  for (let i = 0; out.length < limit && Object.values(lanes).some(l => l.length); i++) {
    const lane = lanes[ROT[i % ROT.length]];
    if (!lane.length) continue;
    let j = lane.slice(0, 3).findIndex(c => c.topic !== last);
    if (j < 0) j = 0;
    const [c] = lane.splice(j, 1);
    const { score: _s, ...card } = c; void _s;
    out.push(card as FyCard);
    last = c.topic;
  }
  return { cards: out, at: p.at };
}

/* ── Measurement: card views and opens per day (fy:v1:<day>) ──────────── */
const FKEY = (d: string) => `fy:v1:${d}`;
const clean = (s: string) => s.replace(/[^\w:\-.]/g, "").slice(0, 80);
export async function recordFy(ev: { session?: boolean; views?: string[]; open?: string; done?: number }) {
  const f: string[] = [];
  if (ev.session) f.push("sess");
  for (const v of (ev.views || []).slice(0, 20)) f.push("views", `v:${clean(v)}`, `k:${clean(v.split(":")[0])}`);
  if (ev.open) f.push("opens", `o:${clean(ev.open)}`);
  if (ev.done && ev.done > 0) f.push(`depth:${ev.done >= 30 ? "30+" : ev.done >= 15 ? "15-29" : ev.done >= 5 ? "5-14" : "1-4"}`);
  if (f.length) await kvHincrMany(FKEY(dayET()), f, 120 * 86400);
}
export async function fyStats(days = 7) {
  const list = Array.from({ length: days }, (_, i) => ymd(new Date(Date.now() - i * 864e5)));
  const hs = await Promise.all(list.map(d => kvHgetall(FKEY(d)).catch(() => ({} as Record<string, number>))));
  const sum: Record<string, number> = {};
  for (const h of hs) for (const [k, v] of Object.entries(h)) sum[k] = (sum[k] || 0) + v;
  const pick = (pre: string) => Object.entries(sum).filter(([k]) => k.startsWith(pre)).map(([k, v]) => ({ id: k.slice(pre.length), n: v })).sort((a, b) => b.n - a.n);
  const sess = sum.sess || 0;
  return {
    days, sessions: sess, cardViews: sum.views || 0, opens: sum.opens || 0,
    cardsPerSession: sess ? +((sum.views || 0) / sess).toFixed(1) : null,
    openRate: sum.views ? +((sum.opens || 0) / sum.views).toFixed(3) : null,
    byKind: Object.fromEntries(pick("k:").map(x => [x.id, x.n])),
    depth: Object.fromEntries(pick("depth:").map(x => [x.id, x.n])),
    topViewed: pick("v:").slice(0, 15), topOpened: pick("o:").slice(0, 15),
    byDay: list.map((d, i) => ({ day: d, sessions: hs[i].sess || 0, views: hs[i].views || 0 })),
  };
}
