import { createHash, randomBytes } from "node:crypto";
import { kvPipeline } from "./live-kv";

/**
 * Anonymous likes and comments on For You cards.
 *
 * No accounts. Each browser keeps a random id; people show up as a stable
 * handle like "Reader 4F2A". Likes are de-duplicated per browser id. Comments
 * are checked before they appear: rules first (length, no links, no contact
 * details, rate limits per hashed IP), then a small model screens for
 * harassment, hate, threats, sexual content and spam. Opinions of any side
 * are allowed. Three reports hide a comment; an admin can hide one directly.
 *
 * Keys:  fy:lk:<card>  set of browser ids that liked      fy:likes  hash card -> count
 *        fy:cm:<card>  list of comment JSON (newest first) fy:ccount hash card -> count
 *        fy:hidden     hash commentId -> reason            fy:rep:<commentId> report count
 */
export interface FyComment { id: string; card: string; by: string; text: string; at: string; mine?: boolean }
type Stored = FyComment & { a: string };

const SALT = process.env.ADMIN_KEY || "vu";
const h = (s: string, n = 16) => createHash("sha256").update(SALT + s).digest("hex").slice(0, n);
export const handleOf = (anon: string) => `Reader ${h("handle:" + anon, 4).toUpperCase()}`;
export const validAnon = (a: unknown): a is string => typeof a === "string" && /^[a-f0-9]{16,40}$/.test(a);
const validCard = (c: unknown): c is string => typeof c === "string" && /^[a-z]+:[\w:.\-]{1,90}$/.test(c);

export async function counts(cards: string[]): Promise<Record<string, { likes: number; comments: number }>> {
  const ids = cards.filter(validCard).slice(0, 80);
  if (!ids.length) return {};
  const [l, c] = await kvPipeline([["HMGET", "fy:likes", ...ids], ["HMGET", "fy:ccount", ...ids]]) as (string | null)[][];
  return Object.fromEntries(ids.map((id, i) => [id, { likes: Math.max(0, Number(l?.[i]) || 0), comments: Math.max(0, Number(c?.[i]) || 0) }]));
}

export async function like(card: string, anon: string, on: boolean): Promise<number> {
  if (!validCard(card)) throw new Error("bad card");
  const who = h("like:" + anon);
  const [changed] = await kvPipeline([[on ? "SADD" : "SREM", `fy:lk:${card}`, who]]) as number[];
  if (Number(changed) === 1) {
    const [n] = await kvPipeline([["HINCRBY", "fy:likes", card, on ? 1 : -1]]) as number[];
    return Math.max(0, Number(n) || 0);
  }
  const [n] = await kvPipeline([["HGET", "fy:likes", card]]) as string[];
  return Math.max(0, Number(n) || 0);
}

export async function list(card: string, anon: string | null): Promise<FyComment[]> {
  if (!validCard(card)) return [];
  const [raw] = await kvPipeline([["LRANGE", `fy:cm:${card}`, 0, 99]]) as string[][];
  const all = (raw || []).map(s => { try { return JSON.parse(s) as Stored; } catch { return null; } }).filter((x): x is Stored => !!x);
  if (!all.length) return [];
  const [hid] = await kvPipeline([["HMGET", "fy:hidden", ...all.map(c => c.id)]]) as (string | null)[][];
  const me = anon ? h("own:" + anon) : null;
  return all.filter((_, i) => !hid?.[i]).slice(0, 60).map(({ a, ...c }) => ({ ...c, mine: !!me && a === me }));
}

/* ── Posting ─────────────────────────────────────────────────── */

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ly|gg|xyz|me|tv|info|biz|us)\b)/i;
const CONTACT = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{8,}\d)|(\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b)/i;

async function screen(text: string): Promise<"ok" | "no" | "error"> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "error";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", max_tokens: 5, temperature: 0,
      system: "You screen anonymous comments on a nonpartisan news and data site. Reply NO if the comment contains any of: harassment or insults aimed at a person or group, slurs or hate, threats or calls for violence, sexual content, personal information about someone (addresses, phone numbers, emails), spam or advertising, or text that is meaningless. Reply OK otherwise. Political opinions from ANY side, disagreement, criticism of public figures' actions or policies, and strong language that is not aimed at a person are all OK. Reply with one word: OK or NO.",
      messages: [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!r?.ok) return "error";
  const j = await r.json().catch(() => null);
  const t = String(j?.content?.[0]?.text || "").trim().toUpperCase();
  return t.startsWith("OK") ? "ok" : t.startsWith("NO") ? "no" : "error";
}

export type PostResult = { ok: true; comment: FyComment } | { ok: false; error: string };

export async function post(card: string, anon: string, text: string, ip: string): Promise<PostResult> {
  if (!validCard(card)) return { ok: false, error: "Can't comment here." };
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 2) return { ok: false, error: "Write a little more." };
  if (t.length > 280) return { ok: false, error: "Keep it under 280 characters." };
  if (LINK.test(t)) return { ok: false, error: "Links aren't allowed in comments." };
  if (CONTACT.test(t)) return { ok: false, error: "Leave out emails, phone numbers and addresses." };
  const ipk = h("ip:" + ip), ak = h("rl:" + anon);
  const [a, , b] = await kvPipeline([["INCR", `fy:rl:ip:${ipk}`], ["EXPIRE", `fy:rl:ip:${ipk}`, 600], ["INCR", `fy:rl:a:${ak}`], ["EXPIRE", `fy:rl:a:${ak}`, 600]]) as number[];
  if (Number(a) > 8 || Number(b) > 5) return { ok: false, error: "You're commenting fast. Try again in a few minutes." };
  const verdict = await screen(t);
  if (verdict === "no") return { ok: false, error: "This comment can't be posted. Comments can disagree, but can't attack people, share personal details or advertise." };
  if (verdict === "error") return { ok: false, error: "Couldn't post right now. Try again in a minute." };
  const c: Stored = { id: randomBytes(6).toString("hex"), card, by: handleOf(anon), text: t, at: new Date().toISOString(), a: h("own:" + anon) };
  await kvPipeline([["LPUSH", `fy:cm:${card}`, JSON.stringify(c)], ["LTRIM", `fy:cm:${card}`, 0, 299], ["HINCRBY", "fy:ccount", card, 1]]);
  const { a: _a, ...pub } = c; void _a;
  return { ok: true, comment: { ...pub, mine: true } };
}

/** Report (3 hides it), delete your own, or an admin hide. */
export async function report(card: string, id: string, anon: string): Promise<void> {
  if (!/^[a-f0-9]{12}$/.test(id) || !validCard(card)) return;
  const who = h("rep:" + anon);
  const [added] = await kvPipeline([["SADD", `fy:rep:${id}`, who], ["EXPIRE", `fy:rep:${id}`, 30 * 86400]]) as number[];
  if (Number(added) !== 1) return;
  const [n] = await kvPipeline([["SCARD", `fy:rep:${id}`]]) as number[];
  if (Number(n) >= 3) await hide(card, id, "reports");
}
export async function hide(card: string, id: string, reason: string): Promise<void> {
  const [prev] = await kvPipeline([["HSETNX", "fy:hidden", id, reason]]) as number[];
  if (Number(prev) === 1) await kvPipeline([["HINCRBY", "fy:ccount", card, -1]]);
}
export async function removeOwn(card: string, id: string, anon: string): Promise<boolean> {
  const mine = (await list(card, anon)).find(c => c.id === id && c.mine);
  if (!mine) return false;
  await hide(card, id, "author");
  return true;
}
