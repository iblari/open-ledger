/**
 * The team thread: one plain-English conversation between Ib (CEO),
 * Claude (code & UI design), Sam (X social media manager) and John (Instagram social
 * media manager). Lives at /team, API at /api/team.
 *
 * Each member has a key; only SHA-256 hashes are in the code. Sam's messages
 * are requests: anything that changes the live site needs Ib's approval
 * (a `request` message that Ib approves or declines).
 */
import { createHash } from "node:crypto";
import { teamAppend, teamRead } from "./live-kv";

export type Member = "ib" | "sam" | "claude" | "john";
/** Outside bots (Grok) that post with their own key and get webhook pings. */
export const BOTS = ["sam", "john"] as const;
export type Bot = (typeof BOTS)[number];
export const MEMBERS: Record<Member, { name: string; role: string }> = {
  ib: { name: "Ib", role: "CEO" },
  claude: { name: "Claude", role: "Code & UI design" },
  sam: { name: "Sam", role: "Social media manager (X)" },
  john: { name: "John", role: "Social media manager (Instagram)" },
};
const HASHES: Record<string, Member> = {
  "6da4b8ec8af9173c6ef22d440fe0d4cc41a746caf960b6ca4ca37f700a8e8b82": "ib",
  "7e0d537301844adbf2db16207ac7ba8de9f6372ee8f69f0413bc42931b0c07df": "sam",
  "4621e3663dc00edd66d0688d1b649025e2218510915d11ed68fb6af1da679370": "claude",
  "a689b3e322b9ca4b8dbfff0cd7df14d8f15f1380198604d1480dd39ea672ae85": "john",
};

export function memberFor(key: string | null | undefined): Member | null {
  if (!key) return null;
  return HASHES[createHash("sha256").update(key.trim()).digest("hex")] ?? null;
}

/** The key from `Authorization: Bearer …` or `?key=`. */
export function keyFrom(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return new URL(req.url).searchParams.get("key");
}

export type Kind = "message" | "request" | "approve" | "decline" | "build" | "ship" | "reject";
const IB_ONLY: Kind[] = ["approve", "decline", "ship", "reject"];
export interface TeamMessage {
  id: number; from: Member; text: string; at: string;
  kind: Kind; ref?: number;
}
export interface TeamRequest { id: number; from: Member; text: string; at: string; status: "pending" | "approved" | "declined"; decidedAt?: string }

export async function readThread(since = 0): Promise<{ messages: TeamMessage[]; requests: TeamRequest[] }> {
  const all = (await teamRead(0)).map((s, i) => ({ ...(JSON.parse(s) as Omit<TeamMessage, "id">), id: i + 1 }));
  const requests: TeamRequest[] = all.filter(m => m.kind === "request").map(m => {
    const d = all.find(x => (x.kind === "approve" || x.kind === "decline") && x.ref === m.id);
    return { id: m.id, from: m.from, text: m.text, at: m.at, status: d ? (d.kind === "approve" ? "approved" : "declined") : "pending", decidedAt: d?.at };
  });
  return { messages: all.filter(m => m.id > since), requests };
}

export async function post(from: Member, text: string, kind: Kind = "message", ref?: number): Promise<TeamMessage> {
  const clean = text.replace(/\r/g, "").trim().slice(0, 4000);
  if (!clean && !IB_ONLY.includes(kind)) throw new Error("empty message");
  if (IB_ONLY.includes(kind) && from !== "ib") throw new Error("only Ib approves, ships or rejects");
  if (kind === "build" && from !== "claude") throw new Error("only Claude posts builds");
  // A link opened twice (GET posting) shouldn't post twice.
  const recent = (await readThread(0)).messages.slice(-20);
  const dupe = recent.find(m => m.from === from && m.text === clean && m.kind === kind && m.ref === ref && Date.now() - Date.parse(m.at) < 10 * 60_000);
  if (dupe) return dupe;
  const msg = { from, text: clean, at: new Date().toISOString(), kind, ...(ref ? { ref } : {}) };
  const n = await teamAppend(JSON.stringify(msg));
  return { ...msg, id: n };
}
