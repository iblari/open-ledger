import { kvGet, kvSetMany } from "./live-kv";

/**
 * Claim charts — one small, checkable chart per True/False claim.
 *
 * Claims checked against our own series (metricKey) are charted on the
 * client from the FRED feed; nothing here. Claims checked by web search have
 * no series, so this pulls the figures out of what the check cited:
 *
 *   1. Source text = our written finding (actual + explanation) plus the
 *      cited pages, fetched and cut down to the sentences that share words
 *      with the claim.
 *   2. A small model proposes: what was SAID (one number), what the DATA
 *      says (one number, same unit), and up to 6 dated data points for
 *      context — each with the exact text span it came from.
 *   3. Every data number is kept ONLY if its span appears word-for-word in
 *      the source text AND the span's number matches the value. Anything
 *      that fails is dropped, never repaired. Fewer than two dated points →
 *      no timeline, just said-vs-data.
 *
 * Stored per claim permanently (a fact-check's sources don't change).
 */

export interface ChartPoint { label: string; value: number; src: number; span: string }
export interface ClaimChart {
  v: 1;
  metric: string;             // "Fentanyl-involved deaths, US"
  unit: string;               // "%", "$", "deaths", "jobs", …
  said: { value: number; label: string } | null;
  data: { value: number; label: string; src: number; span: string } | null;
  points: ChartPoint[];       // time-ordered, oldest first; [] when < 2 verified
  sources: { title: string; url: string }[];   // src 0 = our finding
  dropped: number;            // proposals that failed verification
  at: string;
}
export interface ClaimForChart {
  key: string; quote: string; rating: string; actual: string; explanation?: string;
  claimedValue?: number | null; sources: { title: string; url: string }[];
}

const MODEL = "claude-haiku-4-5-20251001";
export const CHART_KEY = (k: string) => `claim-chart:v3:${k}`;

/* ── Source text ───────────────────────────────────────────────────── */

const STOP = new Set("the a an and or of to in on for is are was were be been it that this with as at by from we our they their have has had not but than more less over under about into per year years".split(" "));
const words = (s: string) => (s.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w));

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, "-")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** The sentences of a page most related to the claim (and that contain a number). */
function relevant(text: string, keys: Set<string>, max = 30): string {
  const sents = text.split(/(?<=[.!?])\s+|\n/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 600 && /\d/.test(s));
  const scored = sents.map((s, i) => ({ s, i, n: words(s).filter(w => keys.has(w)).length })).filter(x => x.n >= 2);
  return scored.sort((a, b) => b.n - a.n).slice(0, max).sort((a, b) => a.i - b.i).map(x => x.s).join("\n");
}

async function fetchPage(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VoteUnbiasedBot/1.0; +https://voteunbiased.org)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8000), redirect: "follow",
    });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("html")) return "";
    return htmlToText((await r.text()).slice(0, 1_500_000));
  } catch { return ""; }
}

/* ── Verification ──────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** The first number written in a span ("76,282", "36.5%", "$4.20", "2.1 million"). */
function spanNumber(span: string): number | null {
  const m = span.replace(/(\d),(\d{3})/g, "$1$2").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
/** Value matches the span's number, allowing a stated scale (thousand…trillion) and rounding. */
function matches(value: number, span: string): boolean {
  const n = spanNumber(span);
  if (n == null || !Number.isFinite(value)) return false;
  return [1, 1e3, 1e6, 1e9, 1e12].some(m => {
    const x = n * m;
    return Math.abs(Math.abs(value) - Math.abs(x)) <= Math.max(0.006 * Math.abs(x), 0.051);
  });
}
function verified(value: number, span: string, src: number, texts: string[]): boolean {
  const t = texts[src];
  return !!t && span.length >= 2 && norm(t).includes(norm(span)) && matches(value, span);
}

/* ── Build ─────────────────────────────────────────────────────────── */

export async function buildClaimChart(c: ClaimForChart): Promise<ClaimChart | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const keys = new Set(words(`${c.quote} ${c.actual} ${c.explanation || ""}`));
  const srcs = (c.sources || []).filter(s => /^https?:\/\//.test(s.url)).slice(0, 4);
  const pages = await Promise.all(srcs.map(s => fetchPage(s.url)));
  const finding = `${c.actual}\n${c.explanation || ""}`.trim();
  const texts = [finding, ...pages.map(p => relevant(p, keys))];
  const sources = [{ title: "Our fact-check finding", url: "" }, ...srcs];

  const body = texts.map((t, i) => `[${i}] ${sources[i].title}${sources[i].url ? ` (${sources[i].url})` : ""}\n${t || "(no readable text)"}`).join("\n\n");
  const system =
    `You turn a fact-check into a small chart, using ONLY the numbered source texts.\n` +
    `Return JSON:\n` +
    `{"metric":"what is measured, with place, e.g. 'Fentanyl-involved deaths, US'",\n` +
    ` "unit":"% | $ | deaths | jobs | people | … (the unit of the values)",\n` +
    ` "said":{"value":number,"label":"short, e.g. 'Said: −22%'"} or null,\n` +
    ` "data":{"value":number,"label":"short, e.g. 'Data: −36.5%'","src":n,"span":"exact text"} or null,\n` +
    ` "points":[{"label":"time label, e.g. '2023' or 'Q1 2026'","value":number,"src":n,"span":"exact text"}]}\n` +
    `Rules:\n` +
    `- "said" is the number the speaker claimed, in the same unit as "data" (a drop of 22% → -22).\n` +
    `- "data" is the figure the verdict rests on — the official / primary figure for the same thing, not the most extreme estimate.\n` +
    `- "points": 2–6 values of ONE measure at DIFFERENT dates (e.g. annual deaths 2022, 2023, 2024), oldest first. Every point must be the same measure, same definition (never mix monthly and annual rates, or levels and changes), and each label must be a date or period ("2023", "Q1 2026", "Aug 2026"). Parts, categories or estimates from different groups are NOT points. If the sources don't give such a series, return [].\n` +
    `- Every "span" must be copied EXACTLY, character for character, from source [src], and must contain the number (e.g. "76,282"). Never compute or round a value that isn't written.\n` +
    `- If the claim has no number to chart, return {"metric":"","unit":"","said":null,"data":null,"points":[]}.\n` +
    `JSON only.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, temperature: 0, system,
      messages: [{ role: "user", content: `Claim: "${c.quote}"\nVerdict: ${c.rating}${c.claimedValue != null ? `\nClaimed value: ${c.claimedValue}` : ""}\n\n${body}` }] }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const j = await r.json();
  const text = (j.content || []).filter((x: { type: string }) => x.type === "text").map((x: { text: string }) => x.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in chart reply");
  const p = JSON.parse(m[0]) as {
    metric?: string; unit?: string;
    said?: { value?: number; label?: string } | null;
    data?: { value?: number; label?: string; src?: number; span?: string } | null;
    points?: { label?: string; value?: number; src?: number; span?: string }[];
  };

  let dropped = 0;
  let data: ClaimChart["data"] = null;
  if (p.data && typeof p.data.value === "number") {
    const d = p.data;
    if (verified(d.value!, String(d.span || ""), Number(d.src), texts)) data = { value: d.value!, label: String(d.label || ""), src: Number(d.src), span: String(d.span) };
    else dropped++;
  }
  // What was said comes from the quote, not a source; keep it only when it
  // agrees with the value the checker extracted (or the quote has no
  // extracted value at all).
  let said: ClaimChart["said"] = null;
  if (p.said && typeof p.said.value === "number" && Number.isFinite(p.said.value)) {
    const cv = c.claimedValue;
    if (cv == null || Math.abs(Math.abs(cv) - Math.abs(p.said.value)) <= Math.max(0.01 * Math.abs(cv), 0.051)) said = { value: p.said.value, label: String(p.said.label || "") };
    else dropped++;
  }
  const pts: ChartPoint[] = [];
  for (const q of p.points || []) {
    if (typeof q.value !== "number" || !q.label) continue;
    if (verified(q.value, String(q.span || ""), Number(q.src), texts)) pts.push({ label: String(q.label), value: q.value, src: Number(q.src), span: String(q.span) });
    else dropped++;
  }
  // A timeline only if every point is a distinct dated period: a label
  // without a year, or two points for the same period (different measures
  // mixed together), drops the whole timeline.
  const period = (l: string) => l.replace(/\(.*?\)/g, "").trim().toLowerCase();
  const yearOf = (l: string) => +(l.match(/\b(19|20)\d{2}\b/)?.[0] || NaN);
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const sortKey = (l: string) => {
    const y = yearOf(l), lo = l.toLowerCase();
    const q = lo.match(/\bq([1-4])\b/); const mi = MONTHS.findIndex(mo => lo.includes(mo));
    return y * 12 + (q ? (+q[1] - 1) * 3 : mi >= 0 ? mi : 0);
  };
  // One source per timeline: figures from different publishers rarely
  // share a definition. Keep the source with the most dated points.
  const bySrc = new Map<number, ChartPoint[]>();
  for (const x of pts) bySrc.set(x.src, [...(bySrc.get(x.src) || []), x]);
  const best = [...bySrc.values()].sort((a, b) => b.length - a.length)[0] || [];
  if (best.length < pts.length) { dropped += pts.length - best.length; pts.splice(0, pts.length, ...best); }
  const dated = pts.every(x => Number.isFinite(yearOf(x.label)));
  const distinct = new Set(pts.map(x => period(x.label))).size === pts.length;
  const uniq = dated && distinct ? [...pts].sort((a, b) => sortKey(a.label) - sortKey(b.label)) : [];
  if (pts.length && !uniq.length) dropped += pts.length;
  return {
    v: 1, metric: String(p.metric || ""), unit: String(p.unit || ""),
    said, data, points: uniq.length >= 2 ? uniq.slice(0, 6) : [],
    sources, dropped, at: new Date().toISOString(),
  };
}

/** Cached chart, building (and storing) it when missing. */
export async function getClaimChart(c: ClaimForChart, build = true): Promise<ClaimChart | null> {
  const [hit] = await kvGet([CHART_KEY(c.key)]);
  if (hit) { try { return JSON.parse(hit) as ClaimChart; } catch { /* rebuild */ } }
  if (!build) return null;
  const ch = await buildClaimChart(c);
  if (ch) await kvSetMany([[CHART_KEY(c.key), JSON.stringify(ch), 0]]).catch(() => {});
  return ch;
}
