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
  /** Other verified figures in the same unit: the parts that make up the
   *  data figure, or comparisons that give it scale (a previous record,
   *  another country, a target). */
  context?: { label: string; value: number; src: number; span: string; kind: "part" | "compare" }[];
  sources: { title: string; url: string }[];   // src 0 = our finding
  dropped: number;            // proposals that failed verification
  rejected?: { value: number; src: number; span: string }[];
  at: string;
}
export interface ClaimForChart {
  key: string; quote: string; rating: string; actual: string; explanation?: string;
  claimedValue?: number | null; sources: { title: string; url: string }[];
}

const MODEL = "claude-haiku-4-5-20251001";
export const CHART_KEY = (k: string) => `claim-chart:v6:${k}`;

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

/** Numbers written in a span, each with what follows it ("76,282", "36.5%", "2.1 million"). */
function spanNumbers(span: string): { n: number; after: string }[] {
  const t = span.replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d),(\d{3})/g, "$1$2");
  return [...t.matchAll(/-?\d+(?:\.\d+)?/g)].map(m => ({ n: parseFloat(m[0]), after: t.slice(m.index! + m[0].length, m.index! + m[0].length + 9).toLowerCase() }));
}
/** Some number in the span equals the value (allowing a stated scale and
 *  rounding); for percentages, that number must be written as a percent. */
function matches(value: number, span: string, unit: string): boolean {
  if (!Number.isFinite(value)) return false;
  const pct = /^%|percent/i.test(unit.trim());
  return spanNumbers(span).some(({ n, after }) => {
    if (pct && !/^\s*(%|percent|per cent|pct)/.test(after)) return false;
    return [1, 1e3, 1e6, 1e9, 1e12].some(m => {
      const x = n * m;
      return Math.abs(Math.abs(value) - Math.abs(x)) <= Math.max(0.006 * Math.abs(x), 0.051);
    });
  });
}
function verified(value: number, span: string, src: number, texts: string[], unit: string): boolean {
  const t = texts[src];
  if (!t || span.length < 2 || !matches(value, span, unit)) return false;
  const nt = norm(t).replace(/[^a-z0-9%$.,\- ]/g, ""), ns = norm(span).replace(/[^a-z0-9%$.,\- ]/g, "");
  if (nt.includes(ns)) return true;
  // Long spans: the model sometimes trims or re-punctuates a sentence. Accept
  // when the words around the number (±30 chars) appear verbatim.
  const at = ns.search(/\d/);
  if (at < 0 || ns.length < 40) return false;
  const core = ns.slice(Math.max(0, at - 30), at + 30).trim();
  return core.length >= 20 && nt.includes(core);
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
    ` "points":[{"label":"time label, e.g. '2023' or 'Q1 2026'","value":number,"src":n,"span":"exact text"}],\n` +
    ` "context":[{"label":"short name, e.g. 'Previous record (2019)' or 'Construction'","value":number,"src":n,"span":"exact text","kind":"part"|"compare"}]}\n` +
    `Rules:\n` +
    `- "said" is the number the speaker claimed. "said" and "data" must be the SAME measure in the SAME unit (both a % share, both a count, both $). If the sources have no figure for the same measure, set "data" to null — never compare different things (e.g. a % of crime vs a number of people).\n` +
    `- Signs: decreases are negative for BOTH said and data ("84% reduction" → -84, "down 41.5%" → -41.5).\n` +
    `- "data" is the figure the verdict rests on — the official / primary figure for the same thing, not the most extreme estimate.\n` +
    `- "points": 2–6 values of ONE measure at DIFFERENT dates (e.g. annual deaths 2022, 2023, 2024), oldest first. Every point must be the same measure, same definition (never mix monthly and annual rates, or levels and changes), and each label must be a date or period ("2023", "Q1 2026", "Aug 2026"). Parts, categories or estimates from different groups are NOT points. If the sources don't give such a series, return [].\n` +
    `- "context": up to 5 OTHER figures in the SAME unit as "data" that help a reader judge it: "part" = a component that makes up the data figure (e.g. $100B construction + $20B contingency); "compare" = a comparable figure (previous record, the figure for another year/country/company, a stated target, the total it belongs to). Only figures written in the sources. [] if none.\n` +
    `- Every "span" must be copied EXACTLY, character for character, from source [src], and must contain the number (e.g. "76,282"). Never compute or round a value that isn't written.\n` +
    `- If the claim has no number to chart, return {"metric":"","unit":"","said":null,"data":null,"points":[]}.\n` +
    `JSON only.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1300, temperature: 0, system,
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
    context?: { label?: string; value?: number; src?: number; span?: string; kind?: string }[];
  };

  let dropped = 0;
  const rejected: { value: number; src: number; span: string }[] = [];
  const reject = (x: { value?: number; src?: number; span?: string }) => { dropped++; if (rejected.length < 6) rejected.push({ value: Number(x.value), src: Number(x.src), span: String(x.span || "").slice(0, 160) }); };
  let data: ClaimChart["data"] = null;
  if (p.data && typeof p.data.value === "number") {
    const d = p.data;
    if (verified(d.value!, String(d.span || ""), Number(d.src), texts, String(p.unit || ""))) data = { value: d.value!, label: String(d.label || ""), src: Number(d.src), span: String(d.span) };
    else reject(d);
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
  // The checker extracted a claimed value; if the model gave none, use it,
  // signed like the claim ("plunged 22%" is -22).
  if (!said && c.claimedValue != null && Number.isFinite(c.claimedValue)) {
    const down = /\b(down|drop|dropp|plung|fell|fall|declin|reduc|cut|lower|decreas)/i.test(c.quote);
    said = { value: down && c.claimedValue > 0 ? -c.claimedValue : c.claimedValue, label: "" };
  }
  const pts: ChartPoint[] = [];
  for (const q of p.points || []) {
    if (typeof q.value !== "number" || !q.label) continue;
    if (verified(q.value, String(q.span || ""), Number(q.src), texts, String(p.unit || ""))) pts.push({ label: String(q.label), value: q.value, src: Number(q.src), span: String(q.span) });
    else reject(q);
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
  const context: NonNullable<ClaimChart["context"]> = [];
  for (const q of (p.context || []).slice(0, 6)) {
    if (typeof q.value !== "number" || !q.label) continue;
    if (data && Math.abs(q.value - data.value) < 1e-9) continue;     // the data figure again
    if (verified(q.value, String(q.span || ""), Number(q.src), texts, String(p.unit || "")))
      context.push({ label: String(q.label).slice(0, 48), value: q.value, src: Number(q.src), span: String(q.span), kind: q.kind === "part" ? "part" : "compare" });
    else reject(q);
  }
  // Parts must not add up to more than the whole they belong to.
  const parts = context.filter(x => x.kind === "part");
  if (data && parts.length && parts.reduce((a, x) => a + Math.abs(x.value), 0) > Math.abs(data.value) * 1.02) parts.forEach(x => { x.kind = "compare"; });
  return {
    v: 1, metric: String(p.metric || ""), unit: String(p.unit || ""),
    said, data, points: uniq.length >= 2 ? uniq.slice(0, 6) : [], context,
    sources, dropped, rejected, at: new Date().toISOString(),
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
