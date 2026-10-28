import { kvGet, kvSetMany } from "../live-kv";
import type { Story } from "./engine";

/**
 * Our own neutral wording for a story's title (outlet headlines carry their
 * framing: "Republicans rip…", "…Mastermind Dead At 96"). A small model
 * restates only what several outlets' headlines agree on; the result is
 * checked for loaded words and length, and cached per story forever. If
 * anything fails, the story keeps the most typical outlet headline.
 */
const KEY = (id: string) => `news:ntitle:v1:${id}`;
const MODEL = "claude-haiku-4-5-20251001";
const LOADED = /\b(rips?|slams?|blasts?|destroys?|eviscerat\w*|rages?|raging|caught|exposes?|exposed|lies?|lied|liar|stunning|shocking|bombshell|disgrac\w*|outrage\w*|scandal\w*|mastermind|darling|radical|extremist|regime|thug\w*|vile|nut|meltdown|humiliat\w*|owned|epic|brutal|dirty|trick|scheme|smear\w*)\b/i;

export function acceptable(t: string): boolean {
  return t.length >= 20 && t.length <= 110 && !LOADED.test(t) && !/[!?]$/.test(t) && !/["“”]/.test(t);
}

async function write(s: Story): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const heads = [...new Set(s.articles.map(a => `${a.name}: ${a.title}`))].slice(0, 12).join("\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 80, temperature: 0,
      system: "Write one neutral news headline for the event these outlets' headlines describe. Rules: state only facts that at least two of the headlines agree on; plain verbs (says, files, holds, dies, charged, endorses); no adjectives about people, no characterizations, no quotes, no question or exclamation marks; name who did what; under 95 characters; sentence case. Output the headline only.",
      messages: [{ role: "user", content: heads }],
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json().catch(() => null);
  const t = String(j?.content?.[0]?.text || "").trim().replace(/^["“]|["”]$/g, "").replace(/\.$/, "");
  return acceptable(t) ? t : null;
}

/** Fill neutral titles for stories (cached; at most `max` new model calls). */
export async function neutralTitles(stories: Story[], max = 25): Promise<void> {
  if (!stories.length) return;
  const cached = await kvGet(stories.map(s => KEY(s.id))).catch(() => stories.map(() => null));
  const todo: Story[] = [];
  stories.forEach((s, i) => { if (cached[i]) s.title = cached[i]!; else todo.push(s); });
  const fresh = await Promise.all(todo.slice(0, max).map(async s => ({ s, t: await write(s) })));
  const save: [string, string, number][] = [];
  for (const { s, t } of fresh) if (t) { s.title = t; save.push([KEY(s.id), t, 0]); }
  if (save.length) await kvSetMany(save).catch(() => {});
}
