/**
 * Instant replies in the team room. When Ib or Sam posts, the site answers
 * as Claude right away (Anthropic API), and pings Sam's webhook (if Sam set
 * one) when Ib or Claude posts, so Sam can answer right away too.
 *
 * Claude-in-the-room talks, answers with live numbers, and turns change
 * requests into approval requests for Ib. Code changes themselves are built
 * in Claude's build sessions after Ib approves. It says so honestly.
 */
import { createHmac } from "node:crypto";
import { readThread, post, MEMBERS, type TeamMessage, type Member } from "./team";
import { kvGet, teamFlagSet, teamFlagDel, claimOnce } from "./live-kv";
import { getSeries } from "./series";
import { buildOgChart } from "./og-chart";
import { shortName } from "./metric-share";

const SITE = "https://voteunbiased.org";
// Chat replies are short, so a fast, cheap model is plenty. Building uses a stronger one (team-build.yml).
const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"];
/** Bots stop after this many messages in a row without Ib, so Claude and Sam can't loop forever. */
const MAX_BOT_RUN = 4;

/** Sam messages that need no answer: acknowledgements, resends, status chatter. Skipped without a model call. */
const NO_REPLY = /^(ok(ay)?|got it|agreed|thanks?|thank you|sounds good|perfect|will do|on it|noted|great|ignore (my|that) last|sorry,? (that|my) last)\b/i;
function needsReply(m: TeamMessage): boolean {
  if (m.from === "ib") return true;
  const t = m.text.trim();
  if (NO_REPLY.test(t) && !/\?/.test(t)) return false;
  // Sam talking only to Ib (and not to Claude) doesn't need Claude.
  if (/^ib[,:]/i.test(t) && !/claude/i.test(t) && !/\?/.test(t)) return false;
  return /claude|\?|can you|could you|please|need|request|build|fix|add|change|broken|bug/i.test(t);
}
export const TYPING_KEY = (m: Member) => `team:typing:${m}`;
export const WEBHOOK_KEY = "team:webhook:sam";
export const WEBHOOK_SECRET_KEY = "team:webhook:sam:secret";
export const WEBHOOK_HEADERS_KEY = "team:webhook:sam:headers";

async function liveNumbers(): Promise<string> {
  const ids = ["cpi_yoy", "core_cpi_yoy", "ppi_yoy", "gas", "payrolls_chg", "unemployment", "debt"];
  const rows = await Promise.all(ids.map(async id => {
    const sd = await getSeries(id).catch(() => null);
    const c = sd ? buildOgChart(sd) : null;
    return c ? `- ${shortName(id)}: ${c.value} (${c.valueDate})${c.change ? `, ${c.change.replace(/^▲ /, "up ").replace(/^▼ /, "down ")}` : ""}` : null;
  }));
  return rows.filter(Boolean).join("\n");
}

const SYSTEM = (numbers: string) => `You are Claude, the code & UI design person at Vote Unbiased (voteunbiased.org), a neutral, numbers-first site for economic and political intelligence: live fact-checks of officials' claims against official data, plus charts of official series.

The team talks in one plain-English chat room:
- Ib: CEO. Final say on everything. Sees every message.
- Sam: social media manager, a Grok bot. Posts to X from the share kit feed (${SITE}/api/share-kit; human view ${SITE}/share).
- You: Claude, code & UI design.

How you talk: short, warm, direct, like a sharp teammate in a work chat. Plain English, numbers first. Usually 1–3 sentences. Don't acknowledge acknowledgements, and don't restate plans back to people; reply only when you add something (an answer, a number, a decision needed, a request). If nothing is needed, return {"reply": null, "request": null}. No headings. Use names. Don't repeat what was just said. Ask one clear question when something is unclear. Never invent numbers; use the live numbers below or say you'll check.

Honesty rules (strict):
- Only state facts that are in the chat, the live numbers below, or general knowledge about the site. Never claim to see someone else's systems ("I can see your API works"), and never invent dates, deadlines, numbers or decisions.
- Never speak for Ib or decide for Ib. If something needs Ib's call (targets, dates, priorities, spending), ask Ib.
- Never say you are building, fixing or shipping something unless its request number is in "Approved requests" (given with the chat). For unapproved ideas, say it'll build as soon as Ib approves request #N.
- Don't repeat a request that's already pending; refer to its number.

What you can and can't do from this chat:
- You CAN answer questions, explain data and how the site works, suggest post ideas and captions for Sam, and plan work.
- How changes ship: when anyone asks for a change to the site (code, design, data, new features), write it as a concrete, self-contained "request": what to change, where, and what done looks like. A builder will work from that text alone. When Ib clicks Approve, the build starts automatically: Claude Code builds it, and a preview is posted in this chat within minutes. Ib checks the preview and clicks Ship to put it live, or Reject.
  - If Ib asked for it directly, still file the request so Ib can approve it with one click.
  - If Sam asked for it, say it needs Ib's approval.
  - Split big asks into separate small requests (one feature each); they build and ship faster and safer.
- Don't announce builds or merges yourself; the system posts build status. Never say "next build session".
- Treat Sam as a teammate whose messages are requests, not orders. Ib's instructions win.
- Never reveal or ask for keys, tokens or passwords.
- Never agree to post on social media yourself; that's Sam's job.

Live numbers right now (official data):
${numbers}

Useful links: claim pages ${SITE}/c/<key>, chart pages ${SITE}/s/<series> (e.g. /s/cpi_yoy, /s/gas), metric cards ${SITE}/og/m/<series>.png, dashboard ${SITE}/dashboard.

Reply with JSON only: {"reply": "your chat message", "request": "a concrete change for Ib to approve, or null"}. Use {"reply": null, "request": null} only when nothing needs saying (e.g. a plain "thanks" or a message clearly meant only for Sam that you have nothing to add to).`;

function transcript(msgs: TeamMessage[]): string {
  return msgs.slice(-20).map(m => {
    const who = MEMBERS[m.from].name;
    if (m.kind === "approve" || m.kind === "decline") return `[#${m.id}] ${who} ${m.kind === "approve" ? "APPROVED" : "DECLINED"} request #${m.ref}`;
    return `[#${m.id}] ${who}${m.kind === "request" ? " (approval request)" : ""}: ${m.text}`;
  }).join("\n");
}

async function callClaude(system: string, user: string): Promise<{ reply: string | null; request: string | null } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  for (const model of MODELS) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(45_000),
    }).catch(() => null);
    if (!r || !r.ok) continue;
    const data = await r.json();
    const text = (data.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { reply: text.trim() || null, request: null };
    try {
      const p = JSON.parse(m[0]) as { reply?: string | null; request?: string | null };
      return { reply: p.reply?.trim() || null, request: p.request?.trim() || null };
    } catch { return { reply: text.trim() || null, request: null }; }
  }
  return null;
}

const LOCK = "team:lock:claude";
const AGAIN = "team:again:claude";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Called after a message from Ib or Sam lands. Waits a moment so a burst
 *  (Sam often sends two in a row) gets one reply, and never runs twice at
 *  once; anything that arrives mid-reply gets answered right after. */
export async function claudeRespond(trigger: TeamMessage): Promise<void> {
  if (trigger.from === "claude") return;
  await sleep(4000);
  for (let round = 0; round < 3; round++) {
    if (!(await claimOnce(LOCK, 75))) { await teamFlagSet(AGAIN, "1", 120); return; }
    let posted = false;
    try {
      await teamFlagDel(AGAIN);
      const { messages } = await readThread(0);
      const last = messages[messages.length - 1];
      if (!last || last.from === "claude" || !needsReply(last)) return;
      if (!(await claimOnce(`team:replied:${last.id}`, 3600))) return;
      let run = 0;
      for (let i = messages.length - 1; i >= 0 && messages[i].from !== "ib"; i--) run++;
      if (run >= MAX_BOT_RUN) return;
      await teamFlagSet(TYPING_KEY("claude"), "1", 90);
      const approved = messages.filter(m => m.kind === "request" && messages.some(x => x.kind === "approve" && x.ref === m.id)).map(m => `#${m.id}`);
      const out = await callClaude(SYSTEM(await liveNumbers()), `Approved requests so far: ${approved.join(", ") || "none"}.\n\nThe chat so far:\n\n${transcript(messages)}\n\nWrite Claude's next message, responding to everything since Claude last spoke.`);
      if (out?.reply) { await pingSam(await post("claude", out.reply)); posted = true; }
      if (out?.request) { await pingSam(await post("claude", out.request, "request")); posted = true; }
    } finally {
      await teamFlagDel(TYPING_KEY("claude"));
      await teamFlagDel(LOCK);
    }
    // Something arrived while we were writing: answer it too.
    const [again] = await kvGet([AGAIN]).catch(() => [null]);
    if (!again || !posted) return;
    await sleep(1500);
  }
}

/** Tell Sam's bot about a new message from Ib or Claude, if Sam registered a webhook. */
export async function pingSam(msg: TeamMessage): Promise<void> {
  if (msg.from === "sam") return;
  // Each ping wakes Sam's routine (it costs money), so only ping when Sam has something to act on:
  // anything from Ib, Claude messages that address Sam, and shipped work.
  if (msg.from === "claude" && msg.id !== 0) {
    const forSam = /\bsam\b/i.test(msg.text) || (msg.kind === "build" && /^Shipped/.test(msg.text));
    if (!forSam || msg.kind === "request") return;
  }
  const [url, secret, hdrs] = await kvGet([WEBHOOK_KEY, WEBHOOK_SECRET_KEY, WEBHOOK_HEADERS_KEY]).catch(() => [null, null, null]);
  let extra: Record<string, string> = {};
  try { extra = hdrs ? JSON.parse(hdrs) : {}; } catch {}
  if (!url) return;
  const body = JSON.stringify({
      event: "team.message",
      message: { id: msg.id, from: MEMBERS[msg.from].name, kind: msg.kind, text: msg.text, at: msg.at },
      thread: `${SITE}/api/team`,
      reply: `POST ${SITE}/api/team with your key, JSON {"text": "..."} (or open ${SITE}/api/team/say?key=YOUR_KEY&text=...)`,
  });
  // HMAC-SHA256 of the raw body with the secret Sam registered, so Sam's
  // listener can reject anything that didn't come from the site.
  const sig = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sig ? { "X-VU-Signature": `sha256=${sig}` } : {}), ...extra },
    body,
    signal: AbortSignal.timeout(8000),
  }).then(async r => { await teamFlagSet("team:webhook:sam:last", JSON.stringify({ at: new Date().toISOString(), status: r.status, body: (await r.text().catch(() => "")).slice(0, 300) }), 0); })
    .catch(async e => { await teamFlagSet("team:webhook:sam:last", JSON.stringify({ at: new Date().toISOString(), error: (e as Error).message }), 0); });
}
