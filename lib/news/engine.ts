import { OUTLETS, OUTLET_BY_ID, leanOf, LEAN_TOTALS, type Lean } from "./outlets";

/**
 * News engine: read outlets' feeds, group articles into stories, measure who
 * covered each story, and check the official numbers stories report.
 *
 * Grouping is deterministic (no model): TF-IDF over headline + summary,
 * cosine similarity, linked only when two articles from DIFFERENT outlets are
 * clearly about the same thing, then each story is trimmed to members close
 * to its centre so one loose link can't chain unrelated stories together.
 * Precision over recall: a missed link makes two smaller stories; a wrong
 * one tells readers an outlet covered something it didn't.
 */

export interface Article { id: string; outlet: string; title: string; link: string; summary: string; published: string; image?: string; imageW?: number }
export interface StoryArticle { outlet: string; name: string; lean: Lean; title: string; link: string; published: string; number?: NumberCheck; image?: string }
export interface NumberCheck { verdict: "match" | "approx" | "monthly" | "different"; said: number }
export interface StoryNumbers {
  metric: string; label: string; source: string; url: string;
  official: number; officialLabel: string; previous?: number; monthly?: number;
  counts: { match: number; approx: number; monthly: number; different: number; none: number };
}
export interface Story {
  id: string; slug: string;
  /** Our own neutral wording when available (lib/news/titles), else `headline`. */
  title: string;
  /** The most typical outlet headline, as published. */
  headline?: string;
  /** When these counts were read (the feed refresh), and when they last changed. */
  asOf?: string; updatedAt?: string;
  firstSeen: string; lastSeen: string;
  articles: StoryArticle[];
  outlets: number;
  coverage: Record<Lean, number>;                 // outlets covering, per lean
  rate: { left: number; center: number; right: number };   // share of each side's outlets that covered it
  blindspot: "left" | "right" | null;              // the side that MISSED it
  blindspotLabel?: string | null;                 // same wording everywhere: blindspotLabel()
  topic: string;
  numbers?: StoryNumbers | null;
  /** Each side's most typical headline (for "how each side headlined it"). */
  sides?: Partial<Record<"left" | "center" | "right", StoryArticle>>;
  /** One photo for the story, from an outlet's own feed (credited and linked). */
  photo?: { url: string; outlet: string; name: string; link: string; alts?: { url: string; name: string }[] } | null;
  score: number;
}

/* ── Feeds ─────────────────────────────────────────────────────────── */

const UA = "Mozilla/5.0 (compatible; VoteUnbiasedBot/1.0; +https://voteunbiased.org)";
const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ").trim();
const tag = (x: string, t: string) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? m[1] : ""; };
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/** The best photo an RSS item carries: media:content / media:thumbnail /
 * enclosure / the first <img> in its body. Prefers the widest; drops
 * tracking pixels, audio/video and tiny thumbnails; upgrades known small sizes. */
export function feedImage(it: string): { url: string; w: number } | null {
  const amp = (u: string) => u.replace(/&amp;/g, "&").replace(/&#038;/g, "&").trim();
  const c: { url: string; w: number }[] = [];
  const attr = (t: string, a: string) => (t.match(new RegExp(`\\b${a}=["']([^"']+)["']`, "i")) || [])[1];
  for (const m of it.matchAll(/<(media:content|media:thumbnail|enclosure)\b[^>]*>/gi)) {
    const t = m[0], url = attr(t, "url"), type = attr(t, "type") || "", medium = attr(t, "medium") || "";
    if (!url || /audio|video/i.test(type + medium) || /\.(mp3|mp4|m4a)\b/i.test(url)) continue;
    if (m[1].toLowerCase() === "enclosure" && type && !/image/i.test(type)) continue;
    c.push({ url: amp(url), w: +(attr(t, "width") || 0) });
  }
  const body = it.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const url = attr(m[0], "src"); if (!url) continue;
    c.push({ url: amp(url), w: +(attr(m[0], "width") || 0) });
  }
  const ok = c.map(x => {
    let url = x.url, w = x.w || +((url.match(/[?&](?:w|width)=(\d+)/) || [])[1] || 0);
    url = url.replace(/ichef\.bbci\.co\.uk\/ace\/standard\/\d+\//, "ichef.bbci.co.uk/ace/standard/976/");
    if (/ichef\.bbci/.test(url)) w = 976;
    return { url, w };
  }).filter(x => /^https:\/\//.test(x.url) && !/pixel|tracking|1x1|spacer|feedburner|gravatar|logo/i.test(x.url) && (x.w === 0 || x.w >= 300));
  if (!ok.length) return null;
  return ok.sort((a, b) => (b.w || 800) - (a.w || 800))[0];
}

/** Lenient RSS/Atom parse (several feeds aren't well-formed XML). Also reads
 * Google News sitemaps (<url> with <news:title>) and Google News search RSS,
 * whose titles end in " - Outlet" and whose <source> names the publisher. */
export function parseFeed(xml: string, outlet: string, domain?: string): Article[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const out: Article[] = [];
  for (const it of items.slice(0, 100)) {
    let title = decode(tag(it, "title"));
    let link = decode(tag(it, "link"));
    if (!link) link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const date = decode(tag(it, "pubDate") || tag(it, "published") || tag(it, "updated") || tag(it, "dc:date"));
    const t = Date.parse(date);
    if (/news\.google\.com/.test(link)) {
      // Google News search feed: keep only the outlet's own articles, drop the " - Outlet" suffix.
      const src = (it.match(/<source[^>]*url="([^"]+)"/i) || [])[1] || "";
      if (domain && src && !src.replace(/^https?:\/\/(www\.)?/, "").startsWith(domain)) continue;
      const name = decode(tag(it, "source"));
      if (name && title.endsWith(" - " + name)) title = title.slice(0, -(name.length + 3));
    }
    if (!title || !/^https?:/.test(link) || !Number.isFinite(t)) continue;
    const summary = /news\.google\.com/.test(link) ? "" : decode(tag(it, "description") || tag(it, "summary") || tag(it, "content:encoded")).slice(0, 320);
    const img = feedImage(it);
    out.push({ id: hash(link), outlet, title: title.slice(0, 240), link, summary, published: new Date(t).toISOString(), ...(img ? { image: img.url, imageW: img.w } : {}) });
  }
  if (!items.length) {
    for (const u of (xml.match(/<url>[\s\S]*?<\/url>/gi) || []).slice(0, 300)) {
      const title = decode(tag(u, "news:title")), link = decode(tag(u, "loc"));
      const t = Date.parse(decode(tag(u, "news:publication_date")));
      if (!title || !/^https?:/.test(link) || !Number.isFinite(t)) continue;
      const img = decode(tag(u, "image:loc"));
      out.push({ id: hash(link), outlet, title: title.slice(0, 240), link, summary: "", published: new Date(t).toISOString(), ...(/^https:/.test(img) ? { image: img, imageW: 0 } : {}) });
    }
  }
  return out;
}

export async function fetchAll(maxAgeH = 48): Promise<{ articles: Article[]; failed: string[] }> {
  const cutoff = Date.now() - maxAgeH * 3600_000;
  const failed: string[] = [];
  const res = await Promise.all(OUTLETS.flatMap(o => o.feeds.map(async url => {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const arts = parseFeed(await r.text(), o.id, o.domain);
      return o.include ? arts.filter(a => o.include!.test(a.link)) : arts;
    } catch { failed.push(o.id); return []; }
  })));
  const seen = new Set<string>(), articles: Article[] = [];
  for (const a of res.flat()) {
    if (Date.parse(a.published) < cutoff || Date.parse(a.published) > Date.now() + 3600_000) continue;
    const k = a.outlet + "|" + a.title.toLowerCase();
    if (seen.has(a.id) || seen.has(k)) continue;
    seen.add(a.id); seen.add(k); articles.push(a);
  }
  return { articles, failed: [...new Set(failed)] };
}

/* ── Grouping ──────────────────────────────────────────────────────── */

const STOP = new Set(("a an the and or but of to in on for at by with from as is are was were be been being it its this that these those he she they we you i his her their our your " +
  "not no yes will would can could should may might must has have had do does did says said say new news report reports reported over after before amid into about up out more most " +
  "than then just also how what why who when where which while live latest update updates watch video photos opinion analysis exclusive breaking here there all one two first last " +
  "year years day days week weeks time times us u.s. america american americans").split(" "));
const stem = (w: string) => w.length > 4 ? w.replace(/(ings|ing|ers|ed|es|s)$/, "") : w;
function tokens(s: string): string[] {
  return (s.toLowerCase().replace(/['’]s\b/g, "").match(/[a-z][a-z0-9.%-]*|\d[\d.,%]*/g) || [])
    .map(w => w.replace(/[.,]+$/, "")).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
}

export function cluster(articles: Article[]): Article[][] {
  const docs = articles.map(a => {
    const tt = tokens(a.title), ts = tokens(a.summary.slice(0, 200));
    const tf = new Map<string, number>();
    for (const w of tt) tf.set(w, (tf.get(w) || 0) + 2);        // headline words count double
    for (const w of ts) tf.set(w, (tf.get(w) || 0) + 1);
    return { a, tf, title: new Set(tt) };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  const vec = docs.map(d => {
    const v = new Map<string, number>(); let n = 0;
    for (const [w, c] of d.tf) { const x = (1 + Math.log(c)) * Math.log(1 + N / (df.get(w) || 1)); v.set(w, x); n += x * x; }
    n = Math.sqrt(n) || 1; for (const [w, x] of v) v.set(w, x / n);
    return v;
  });
  const cos = (i: number, j: number) => { let s = 0; const [a, b] = vec[i].size < vec[j].size ? [vec[i], vec[j]] : [vec[j], vec[i]]; for (const [w, x] of a) { const y = b.get(w); if (y) s += x * y; } return s; };

  // Candidates via shared headline words; link strong pairs from different outlets.
  const inv = new Map<string, number[]>();
  docs.forEach((d, i) => { for (const w of d.title) { if ((df.get(w) || 0) > N * 0.05) continue; (inv.get(w) || inv.set(w, []).get(w)!).push(i); } });
  const parent = docs.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const tried = new Set<string>();
  for (const ids of inv.values()) {
    if (ids.length > 200) continue;
    for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
      const i = ids[x], j = ids[y]; const k = i < j ? `${i},${j}` : `${j},${i}`;
      if (tried.has(k)) continue; tried.add(k);
      if (docs[i].a.outlet === docs[j].a.outlet) continue;
      if (Math.abs(Date.parse(docs[i].a.published) - Date.parse(docs[j].a.published)) > 36 * 3600_000) continue;
      if (cos(i, j) >= 0.34) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  docs.forEach((_, i) => (groups.get(find(i)) || groups.set(find(i), []).get(find(i))!).push(i));

  // Trim to the core: members must be close to the group's centroid.
  const out: Article[][] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const c = new Map<string, number>();
    for (const i of g) for (const [w, x] of vec[i]) c.set(w, (c.get(w) || 0) + x / g.length);
    let n = 0; for (const x of c.values()) n += x * x; n = Math.sqrt(n) || 1;
    const sim = (i: number) => { let s = 0; for (const [w, x] of vec[i]) { const y = c.get(w); if (y) s += x * y; } return s / n; };
    const keep = g.filter(i => sim(i) >= 0.42).sort((a, b) => sim(b) - sim(a));
    if (keep.length >= 2) out.push(keep.map(i => docs[i].a));          // most typical first
  }
  return out;
}

/* ── Official numbers ──────────────────────────────────────────────── */

export interface Official { metric: string; label: string; source: string; url: string; value: number; label2: string; previous?: number; monthly?: number; unit: "%" | "K" }
const METRIC_RULES: { metric: string; re: RegExp }[] = [
  { metric: "core_cpi", re: /\bcore (inflation|cpi|prices)\b/i },
  { metric: "cpi", re: /\b(inflation|consumer price|cpi)\b/i },
  { metric: "unemployment", re: /\bunemployment rate\b|\bjobless rate\b/i },
  { metric: "payrolls", re: /\b(jobs report|nonfarm|payrolls|employers added|added \S+ jobs|jobs in (january|february|march|april|may|june|july|august|september|october|november|december))\b/i },
];
function numbersIn(s: string): { n: number; approx: boolean; pct: boolean }[] {
  const out: { n: number; approx: boolean; pct: boolean }[] = [];
  const re = /(nearly|almost|about|around|roughly|more than|over|under|less than|close to)?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(%|percent|per cent)?/gi;
  for (const m of s.matchAll(re)) {
    const n = parseFloat(m[2].replace(/,/g, ""));
    if (!Number.isFinite(n) || (n >= 1900 && n <= 2100)) continue;   // years
    out.push({ n, approx: !!m[1], pct: !!m[3] });
  }
  return out;
}
/** Which official figure the story is about, and what each article said. */
export function checkNumbers(arts: StoryArticle[], all: Article[], offs: Record<string, Official>): StoryNumbers | null {
  const text = arts.map(a => a.title).join(" ");
  const rule = METRIC_RULES.find(r => offs[r.metric] && arts.filter(a => r.re.test(a.title)).length >= Math.max(2, arts.length * 0.4));
  if (!rule) return null;
  void text;
  const o = offs[rule.metric];
  const counts = { match: 0, approx: 0, monthly: 0, different: 0, none: 0 };
  for (const a of arts) {
    const src = all.find(x => x.link === a.link);
    const s = `${a.title}. ${src?.summary || ""}`;
    const nums = numbersIn(s).filter(x => (o.unit === "%" ? x.pct : !x.pct && x.n >= 10));
    let v: NumberCheck | undefined;
    for (const x of nums) {
      const val = o.unit === "K" && x.n < 1000 ? x.n : o.unit === "K" ? x.n / 1000 : x.n;
      const eq = (a: number | undefined) => a != null && Math.abs(val - a) <= (o.unit === "%" ? 0.051 : 0.6);
      if (eq(o.value) || eq(o.previous)) { v = { verdict: x.approx ? "approx" : "match", said: x.n }; break; }
      // The monthly change is a correct figure too, unless it's presented as the yearly rate.
      if (o.monthly != null && eq(o.monthly)) {
        if (/\b(year|annual|12-month|twelve-month)\b/i.test(s)) { v = { verdict: "monthly", said: x.n }; continue; }
        v = { verdict: "match", said: x.n }; break;
      }
      if (x.approx && Math.abs(val - o.value) <= (o.unit === "%" ? 0.5 : 25)) { v = v || { verdict: "approx", said: x.n }; continue; }
      if (o.unit === "%" ? Math.abs(val) < 30 : true) v = v || { verdict: "different", said: x.n };
    }
    if (v) { a.number = v; counts[v.verdict]++; } else counts.none++;
  }
  return { metric: o.metric, label: o.label, source: o.source, url: o.url, official: o.value, officialLabel: o.label2, previous: o.previous, monthly: o.monthly, counts };
}

/* ── Stories ───────────────────────────────────────────────────────── */

/** Sports, entertainment and lifestyle: not what this tab is for. */
const OFF_TOPIC = /\b(nfl|nba|mlb|nhl|wnba|ncaa|super bowl|world series|playoffs?|quarterback|touchdown|chiefs|lakers|yankees|dodgers|grammy|oscars?|emmy|box office|celebrity|recipe|horoscope|kardashian|taylor swift)\b/i;

const TOPICS: [string, RegExp][] = [
  ["World", /\b(ukraine|russia|china|israel|gaza|iran|nato|venezuela|mexico|canada|brazil|cuba|un\b|united nations|europe|spain|france|germany|britain|uk\b|india|japan|korea|taiwan|syria|lebanon)\b/i],
  ["Economy", /\b(inflation|economy|jobs|unemployment|gdp|tariff|fed|interest rate|stocks?|market|prices|wages|recession|deficit|debt|tax)\b/i],
  ["Elections", /\b(election|midterm|ballot|poll|polls|voter|voting|campaign|senate race|governor race|candidate)\b/i],
  ["Immigration", /\b(immigra|border|deport|asylum|migrant|ice\b)/i],
  ["Crime", /\b(crime|murder|shooting|police|homicide)\b/i],
];
export const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 10).join("-");

export function buildStories(groups: Article[][], all: Article[], offs: Record<string, Official>): Story[] {
  const stories: Story[] = [];
  for (const g of groups) {
    if (OFF_TOPIC.test(g.map(a => a.title).join(" "))) continue;
    const byOutlet = new Map<string, Article>();
    for (const a of [...g].sort((x, y) => x.published.localeCompare(y.published))) if (!byOutlet.has(a.outlet)) byOutlet.set(a.outlet, a);
    if (byOutlet.size < 3) continue;                       // a story needs three outlets
    const arts: StoryArticle[] = [...g].sort((x, y) => x.published.localeCompare(y.published)).map(a => {
      const o = OUTLET_BY_ID.get(a.outlet)!;
      return { outlet: a.outlet, name: o.name, lean: leanOf(o.score), title: a.title, link: a.link, published: a.published, ...(a.image ? { image: a.image } : {}) };
    });
    const { coverage, rate, blindspot } = tally(byOutlet.keys());
    // Headline: among the five most typical articles (cluster() orders by
    // closeness to the centre), a center outlet's plain headline if there is one.
    const plain = (t: string) => !/\b(live|watch|opinion|analysis|podcast|newsletter)\b|^[^:]{0,25}:/i.test(t);
    const typical = g.slice(0, 5).map(a => arts.find(x => x.link === a.link)!).filter(Boolean);
    const pickTitle = typical.find(a => a.lean === "center" && plain(a.title)) || typical.find(a => plain(a.title)) || typical[0] || arts[0];
    const sides: Story["sides"] = {};
    for (const a of g) {
      const sa = arts.find(x => x.link === a.link)!;
      if (sa && sa.lean !== "unrated" && !sides[sa.lean] && plain(sa.title)) sides[sa.lean] = sa;
    }
    // Photo: a center-rated outlet's picture first (the photo itself can frame a
    // story), then the most typical article's; small images last.
    const withImg = g.filter(a => a.image);
    const rank = (a: Article) => (leanOf(OUTLET_BY_ID.get(a.outlet)!.score) === "center" ? 0 : 1) * 10 + (a.imageW && a.imageW < 500 ? 5 : 0) + g.indexOf(a) / 100;
    const ranked = [...withImg].sort((x, y) => rank(x) - rank(y));
    const ph = ranked[0];
    // Two backups from other outlets, in case the first photo won't load.
    const alts = ranked.filter(a => a.outlet !== ph?.outlet && a.image !== ph?.image).slice(0, 2).map(a => ({ url: a.image!, name: OUTLET_BY_ID.get(a.outlet)!.name }));
    const photo = ph ? { url: ph.image!, outlet: ph.outlet, name: OUTLET_BY_ID.get(ph.outlet)!.name, link: ph.link, ...(alts.length ? { alts } : {}) } : null;
    const first = arts[0];
    const id = hash(first.link);
    const allText = arts.map(a => a.title).join(" ");
    const topic = (TOPICS.find(([, re]) => re.test(allText)) || ["Politics"])[0];
    const numbers = checkNumbers(arts, all, offs);
    const lastSeen = arts[arts.length - 1].published;
    const ageH = (Date.now() - Date.parse(lastSeen)) / 3600_000;
    stories.push({
      id, slug: `${slugify(pickTitle.title)}-${id}`, title: pickTitle.title, headline: pickTitle.title, blindspotLabel: blindspotLabel(blindspot),
      firstSeen: first.published, lastSeen, articles: arts, outlets: byOutlet.size, coverage, rate, blindspot, topic, numbers, sides, photo,
      score: byOutlet.size * Math.exp(-ageH / 18),
    });
  }
  return stories.sort((a, b) => b.score - a.score);
}

export { LEAN_TOTALS };

/** Per-side counts, coverage rates and blindspot for a set of outlet ids. */
export function tally(outletIds: Iterable<string>) {
  const coverage = { left: 0, center: 0, right: 0, unrated: 0 } as Record<Lean, number>;
  for (const id of outletIds) { const o = OUTLET_BY_ID.get(id); if (o) coverage[leanOf(o.score)]++; }
  const rate = { left: coverage.left / LEAN_TOTALS.left, center: coverage.center / LEAN_TOTALS.center, right: coverage.right / LEAN_TOTALS.right };
  // Blindspot: rated outlets on one side covered it at no more than a
  // quarter the rate of the other side, which reached at least 20% of its outlets.
  const rated = coverage.left + coverage.center + coverage.right;
  let blindspot: Story["blindspot"] = null;
  if (rated >= 6) {
    if (rate.right >= 0.2 && rate.left <= rate.right / 4) blindspot = "left";
    else if (rate.left >= 0.2 && rate.right <= rate.left / 4) blindspot = "right";
  }
  return { coverage, rate, blindspot };
}

/** Recompute a story's counts after its article list changed (articles kept from earlier runs). */
export function recount(s: Story): Story {
  s.articles.sort((a, b) => a.published.localeCompare(b.published));
  const ids = new Set(s.articles.map(a => a.outlet));
  const { coverage, rate, blindspot } = tally(ids);
  const lastSeen = s.articles[s.articles.length - 1].published;
  const ageH = (Date.now() - Date.parse(lastSeen)) / 3600_000;
  return Object.assign(s, { outlets: ids.size, coverage, rate, blindspot, blindspotLabel: blindspotLabel(blindspot), firstSeen: s.articles[0].published, lastSeen, score: ids.size * Math.exp(-ageH / 18) });
}

/** One wording for a blindspot, used by the API, the pages and the share kit. */
export function blindspotLabel(b: "left" | "right" | null | undefined): string | null {
  return b ? `Mostly skipped by ${b}-leaning outlets` : null;
}
