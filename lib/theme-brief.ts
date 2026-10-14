import { getLedger, getReplayableOne, kvGet, kvSetMany } from "./live-kv";
import { THEMES, SUM_KEY, type BcSummary } from "./agenda-radar";

/**
 * Theme brief — "what are they actually saying about this?"
 *
 * For one radar theme: the transcript lines that matched it in the radar's
 * 14-day window (newest broadcasts first) go to a small model, which writes
 * 2–3 plain bullets of what is being pushed or claimed. Every bullet cites
 * the excerpt it came from, so the UI can link to that exact moment — the
 * summary never says anything the transcript can't show.
 *
 * Cached per theme AND per set of broadcasts: a new broadcast that mentions
 * the theme produces a new key, so the brief refreshes on its own.
 */
export interface BriefPoint { text: string; videoId: string; title: string; date: string; t: number | null; quote: string }
export interface ThemeBrief { key: string; label: string; points: BriefPoint[]; broadcasts: number; earlier: boolean; generatedAt: string }

const MODEL = "claude-haiku-4-5-20251001";
const WINDOW_DAYS = 14;
const MAX_BC = 10, PER_BC = 3, MAX_EX = 28;
const KEY = (k: string, sig: string) => `theme-brief:v1:${k}:${sig}`;

function lines(t: string) {
  return t.split(/\n+/).map(l => {
    const m = l.match(/^\s*\[(\d+):(\d{2})(?::(\d{2}))?\]\s*(.*)$/);
    if (!m) return { t: null as number | null, text: l.trim() };
    return { t: m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2], text: m[4] };
  }).filter(l => l.text);
}
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** Broadcasts (newest first) that mention the theme: last 14 days, or — for
 *  a theme that has gone quiet — the most recent ones before that. */
async function sources(key: string) {
  const ledger = (await getLedger()).filter(e => e.videoId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!ledger.length) return { picks: [], earlier: false };
  const sums = (await kvGet(ledger.map(e => SUM_KEY(e.videoId)))).map(r => { try { return r ? JSON.parse(r) as BcSummary : null; } catch { return null; } });
  const cutoff = new Date(Date.parse(ledger[0].startedAt) - WINDOW_DAYS * 864e5).toISOString();
  const hits = ledger.map((e, i) => ({ e, n: sums[i]?.themes?.[key] || 0 })).filter(x => x.n > 0);
  const recent = hits.filter(x => x.e.startedAt >= cutoff);
  return recent.length ? { picks: recent.slice(0, MAX_BC), earlier: false } : { picks: hits.slice(0, 4), earlier: true };
}

export async function getThemeBrief(key: string, opts: { cachedOnly?: boolean } = {}): Promise<ThemeBrief | null> {
  const def = THEMES.find(t => t.key === key);
  if (!def) return null;
  const { picks, earlier } = await sources(key);
  if (!picks.length) return { key, label: def.label, points: [], broadcasts: 0, earlier, generatedAt: new Date().toISOString() };
  const ck = KEY(key, hash(picks.map(p => p.e.videoId).join(",")));
  const [hit] = await kvGet([ck]);
  if (hit) { try { return JSON.parse(hit) as ThemeBrief; } catch { /* rebuild */ } }
  if (opts.cachedOnly) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Excerpts: each matching line with the line either side, no overlaps.
  const ex: { text: string; t: number | null; videoId: string; title: string; date: string }[] = [];
  for (const p of picks) {
    if (ex.length >= MAX_EX) break;
    const b = await getReplayableOne(p.e.videoId).catch(() => null);
    const ls = lines(b?.transcript || "");
    let got = 0;
    for (let i = 0; i < ls.length && got < PER_BC && ex.length < MAX_EX; i++) {
      def.rx.lastIndex = 0;
      if (!def.rx.test(ls[i].text)) continue;
      const text = [ls[i - 1]?.text, ls[i].text, ls[i + 1]?.text].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 340);
      ex.push({ text, t: ls[i].t, videoId: p.e.videoId, title: p.e.title, date: p.e.startedAt });
      got++; i += 2;
    }
  }
  if (!ex.length) return null;

  const body = ex.map((x, i) => `[${i}] ${x.date.slice(0, 10)} — ${x.title}\n"${x.text}"`).join("\n\n");
  const system =
    `You summarize what officials are saying about one topic, for a non-expert reader, using ONLY the transcript excerpts given.\n` +
    `Write 2 or 3 bullets. Each bullet:\n` +
    `- is one sentence, at most 22 words, plain English;\n` +
    `- says who and what: the specific claim, plan, demand or number being pushed (e.g. "Trump says…", "The administration is pushing…");\n` +
    `- reports what was SAID — do not judge whether it is true, and add nothing the excerpts don't contain;\n` +
    `- covers a different point from the other bullets, most-repeated point first;\n` +
    `- cites the single excerpt number that best supports it.\n` +
    `Ignore excerpts where the keyword is incidental (e.g. "invest" in an unrelated sense). If speakers aren't named, use the broadcast title.\n` +
    `Reply with JSON only: {"bullets":[{"text":"...","src":0}]}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0, system, messages: [{ role: "user", content: `Topic: ${def.label}\n\n${body}` }] }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  const text = (data.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in brief reply");
  const parsed = JSON.parse(m[0]) as { bullets?: { text?: string; src?: number }[] };
  const points: BriefPoint[] = (parsed.bullets || []).slice(0, 3).flatMap(bl => {
    const s = ex[Number(bl.src)];
    const t = String(bl.text || "").trim();
    if (!t || !s) return [];
    return [{ text: t, videoId: s.videoId, title: s.title, date: s.date, t: s.t, quote: s.text }];
  });
  const brief: ThemeBrief = { key, label: def.label, points, broadcasts: picks.length, earlier, generatedAt: new Date().toISOString() };
  if (points.length) await kvSetMany([[ck, JSON.stringify(brief), 21 * 86400]]).catch(() => {});
  return brief;
}

/** Cron: pre-write briefs for themes on the radar's tabs, so a tap is instant. */
export async function warmThemeBriefs(keys: string[], max = 1): Promise<number> {
  let done = 0;
  for (const k of keys) {
    if (done >= max) break;
    if (await getThemeBrief(k, { cachedOnly: true }).catch(() => null)) continue;
    const b = await getThemeBrief(k).catch(() => null);
    if (b) done++;
  }
  return done;
}
