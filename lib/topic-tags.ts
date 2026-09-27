// Stored topic tags: loading them into the classifier, finding claims that
// still need one, and tagging those with a model.

import { getTopicTagMap, setTopicTags, getLedgerHealed } from "./live-kv";
import { setTopicOverrides, TOPICS } from "./claim-topics";
import { normalizeQuote } from "./align";
// Hand-reviewed tags for every claim recorded up to 27 Sep 2026, kept in the
// repo so the backfill is auditable line by line. KV tags (model-assigned,
// for claims after that) layer on top.
import SEED from "./topic-tags-seed.json";
const SEED_TAGS = SEED as Record<string, string>;

let loadedAt = 0;
/** Install stored tags into topicOf(). Cached for a minute per instance —
 *  tags only ever get added, so briefly stale means briefly using the
 *  keyword fallback for the newest claims, never a wrong tag. */
export async function loadTopicTags(): Promise<number> {
  if (Date.now() - loadedAt < 60_000) return -1;
  try {
    const tags = { ...SEED_TAGS, ...(await getTopicTagMap()) };
    setTopicOverrides(tags);
    loadedAt = Date.now();
    return Object.keys(tags).length;
  } catch (e) {
    console.error("[topic-tags] load failed, using keyword fallback:", (e as Error).message);
    return 0;
  }
}

/** Ledger quotes with no stored tag, newest broadcast first. */
export async function untaggedQuotes(limit = 500): Promise<{ quote: string; broadcast: string }[]> {
  const [ledger, kv] = await Promise.all([getLedgerHealed(), getTopicTagMap()]);
  const tags = { ...SEED_TAGS, ...kv };
  const seen = new Set<string>();
  const out: { quote: string; broadcast: string }[] = [];
  for (const e of ledger) {
    for (const c of e.claims) {
      if (!c.quote) continue;
      const k = normalizeQuote(c.quote);
      if (!k || tags[k] || seen.has(k)) continue;
      seen.add(k);
      out.push({ quote: c.quote, broadcast: e.title });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const VALID = new Set<string>(TOPICS);

/** Validate and store { quote: topic }. Unknown topics are rejected, not
 *  coerced — a typo must not quietly create a new bar. */
export async function storeTags(byQuote: Record<string, string>): Promise<{ stored: number; rejected: string[] }> {
  const good: Record<string, string> = {};
  const rejected: string[] = [];
  for (const [q, t] of Object.entries(byQuote)) {
    const k = normalizeQuote(q);
    if (k && VALID.has(t)) good[k] = t; else rejected.push(q.slice(0, 60));
  }
  const stored = await setTopicTags(good);
  loadedAt = 0;
  return { stored, rejected };
}

const MODEL = "claude-haiku-4-5-20251001";

/**
 * Tag up to `max` untagged claims with a model. Runs on the cron tick, so a
 * new broadcast's claims are tagged within minutes of being checked.
 * Temperature 0 and a closed list: this is classification, not writing.
 */
export async function tagPending(max = 40): Promise<{ tagged: number; pending: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { tagged: 0, pending: -1 };
  const todo = await untaggedQuotes(max);
  if (!todo.length) return { tagged: 0, pending: 0 };

  const list = todo.map((t, i) => `${i}. [${t.broadcast}] ${t.quote}`).join("\n");
  const system =
    `You assign each political claim to exactly one subject from this closed list:\n` +
    TOPICS.map(t => `- ${t}`).join("\n") +
    `\n\nRules: pick what the claim is ABOUT, using the broadcast title for context. ` +
    `Fraud, stolen or improper payments → "Fraud & waste". Tax cuts, tax credits, no tax on tips → "Taxes". ` +
    `Gas, grocery and consumer prices → "Inflation & prices"; oil production and supply → "Energy". ` +
    `Other countries' internal affairs, wars, hostages → "War & foreign affairs". Military pay, bases, alliances' defense costs → "Defense & military". ` +
    `Use "Other" only when none fits (history trivia, personal anecdotes). ` +
    `Reply with JSON only: {"0":"Topic", "1":"Topic", ...}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0, system, messages: [{ role: "user", content: list }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  const text = (data.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in tagger reply");
  const parsed = JSON.parse(m[0]) as Record<string, string>;
  const byQuote: Record<string, string> = {};
  todo.forEach((t, i) => { const topic = parsed[String(i)]; if (topic) byQuote[t.quote] = topic; });
  const { stored } = await storeTags(byQuote);
  return { tagged: stored, pending: todo.length - stored };
}
