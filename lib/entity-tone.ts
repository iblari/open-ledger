import { getLedger, getReplayableOne, kvGet, kvSetMany } from "./live-kv";
import { summarize, entityPattern, type Radar } from "./agenda-radar";

/**
 * Tone on air — how speakers talked about each company, person and country.
 *
 * Per broadcast, the sentences that name each entity go to a small model in
 * ONE call, which labels the speaker's stance toward that name:
 *   positive  (praise, celebrating, a deal, good news about it)
 *   neutral   (a factual or passing mention)
 *   concerned (worry, criticism, it falling behind or in trouble)
 *   hostile   (attacks, insults, threats, sanctions, conflict)
 * Rule-based sentiment does badly on political speech ("tremendous",
 * sarcasm), which is why this uses a model — at temperature 0, on a closed
 * label set, labelling stance toward the name rather than whether the topic
 * is good news.
 *
 * Stored once per broadcast (permanent); the radar combines the broadcasts
 * in its 14-day window.
 */
export type ToneLabel = "positive" | "neutral" | "concerned" | "hostile";
export interface Tone {
  label: ToneLabel;
  counts: Record<ToneLabel, number>;   // broadcasts, in the window, by label
  quote: string; date: string; videoId: string; t: number | null;
}
interface BcTone { [name: string]: { label: ToneLabel; quote: string; t: number | null } }

const KEY = (id: string) => `tone:v1:${id}`;
const MODEL = "claude-haiku-4-5-20251001";
const LABELS: ToneLabel[] = ["positive", "neutral", "concerned", "hostile"];

function lines(t: string) {
  return t.split(/\n+/).map(l => {
    const m = l.match(/^\s*\[(\d+):(\d{2})(?::(\d{2}))?\]\s*(.*)$/);
    if (!m) return { t: null as number | null, text: l.trim() };
    return { t: m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2], text: m[4] };
  }).filter(l => l.text);
}

async function labelBroadcast(videoId: string): Promise<BcTone | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const b = await getReplayableOne(videoId).catch(() => null);
  const transcript = b?.transcript || "";
  const sum = summarize(transcript);
  if (sum.words < 500) return null;
  const ls = lines(transcript);

  // The most-mentioned names first; at most 60, two excerpts each.
  const names = [
    ...Object.entries(sum.cos), ...Object.entries(sum.ppl), ...Object.entries(sum.ctry),
  ].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([n]) => n);
  if (!names.length) return {};
  const ex: { name: string; quotes: { text: string; t: number | null }[] }[] = names.map(name => {
    const rx = entityPattern(name);
    const hits: { text: string; t: number | null }[] = [];
    for (let i = 0; i < ls.length && hits.length < 3; i++) {
      rx.lastIndex = 0;
      if (!rx.test(ls[i].text)) continue;
      hits.push({ text: [ls[i - 1]?.text, ls[i].text, ls[i + 1]?.text].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 320), t: ls[i].t });
      i += 2; // don't take overlapping excerpts
    }
    return { name, quotes: hits };
  }).filter(x => x.quotes.length);

  const body = ex.map((x, i) => `${i}. ${x.name}\n${x.quotes.map(q => `   - "${q.text}"`).join("\n")}`).join("\n");
  const system =
    `You label the speaker's stance toward each named company, person or country, using only the excerpts given.\n` +
    `- positive: praise, celebrating it, a deal or investment with it, good news about it\n` +
    `- neutral: a factual or passing mention, no clear stance\n` +
    `- concerned: worry or criticism about it, it struggling, falling behind, being treated unfairly\n` +
    `- hostile: attacking or insulting it, threats, sanctions, conflict, calling it an enemy\n` +
    `Judge the stance toward the NAME, not whether the subject is good news. Sarcasm counts as what is meant.\n` +
    `Reply with JSON only: {"0":"positive","1":"neutral",...}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, temperature: 0, system, messages: [{ role: "user", content: `Broadcast: ${b?.title || ""}\n\n${body}` }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  const text = (data.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in tone reply");
  const parsed = JSON.parse(m[0]) as Record<string, string>;
  const out: BcTone = {};
  ex.forEach((x, i) => {
    const lab = String(parsed[String(i)] || "").toLowerCase() as ToneLabel;
    if (!LABELS.includes(lab)) return;
    const q = x.quotes[x.quotes.length - 1];
    out[x.name] = { label: lab, quote: q.text, t: q.t };
  });
  return out;
}

/** Cron: label up to `max` broadcasts that have a transcript but no tones yet. */
export async function toneBackfill(max = 1): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const ledger = (await getLedger()).filter(e => e.videoId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const have = await kvGet(ledger.map(e => KEY(e.videoId)));
  let done = 0;
  for (let i = 0; i < ledger.length && done < max; i++) {
    if (have[i]) continue;
    const id = ledger[i].videoId;
    const tones = await labelBroadcast(id).catch(() => undefined);
    if (tones === undefined) continue;          // API error: try again next tick
    // No transcript yet: note it for 6 hours, then look again (backfill).
    await kvSetMany([[KEY(id), JSON.stringify(tones ?? { _none: true }), tones ? 0 : 6 * 3600]]);
    done++;
  }
  return done;
}

/** Combine per-broadcast tones over the radar's 14-day window. */
export async function getTones(r: Radar): Promise<Record<string, Tone>> {
  const ledger = (await getLedger()).filter(e => e.videoId && e.startedAt >= r.window.recentFrom)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!ledger.length) return {};
  const raws = await kvGet(ledger.map(e => KEY(e.videoId)));
  const out: Record<string, Tone> = {};
  ledger.forEach((e, i) => {
    let bt: BcTone | null = null;
    try { bt = raws[i] ? JSON.parse(raws[i]!) : null; } catch { bt = null; }
    if (!bt || (bt as { _none?: boolean })._none) return;
    for (const [name, v] of Object.entries(bt)) {
      if (!v || !LABELS.includes(v.label)) continue;
      const cur = out[name] || { label: v.label, counts: { positive: 0, neutral: 0, concerned: 0, hostile: 0 }, quote: "", date: "", videoId: "", t: null };
      cur.counts[v.label]++;
      // Latest broadcast's excerpt (ledger is oldest → newest).
      cur.quote = v.quote; cur.date = e.startedAt; cur.videoId = e.videoId; cur.t = v.t;
      out[name] = cur;
    }
  });
  for (const t of Object.values(out)) {
    // Majority; ties go to the more cautious reading, never to an extreme.
    const order: ToneLabel[] = ["neutral", "concerned", "positive", "hostile"];
    t.label = order.reduce((best, l) => (t.counts[l] > t.counts[best] ? l : best), "neutral" as ToneLabel);
  }
  return out;
}
