/**
 * Shipping from the team room.
 *   Ib approves a request → the site starts .github/workflows/team-build.yml
 *   (Claude Code builds it on branch team/req-N and opens a PR) → the
 *   workflow reports back with a Vercel preview → Ib clicks Ship (merge,
 *   live in ~2 min) or Reject (close the PR). Nothing goes live without Ib.
 */
import { kvGet, kvSetMany, claimOnce } from "./live-kv";
import { post, readThread, type TeamMessage } from "./team";

const REPO = "iblari/open-ledger";
export const GH_TOKEN_KEY = "team:config:github";
export type BuildStatus = "queued" | "building" | "ready" | "failed" | "shipped" | "rejected";
export interface BuildState { request: number; status: BuildStatus; at: string; pr?: number; prUrl?: string; preview?: string; branch?: string; run?: string; summary?: string; error?: string }
const BKEY = (id: number) => `team:build:${id}`;

export async function getBuild(id: number): Promise<BuildState | null> {
  const [raw] = await kvGet([BKEY(id)]).catch(() => [null]);
  return raw ? (JSON.parse(raw) as BuildState) : null;
}
export async function getBuilds(ids: number[]): Promise<Record<number, BuildState>> {
  if (!ids.length) return {};
  const raws = await kvGet(ids.map(BKEY)).catch(() => []);
  const out: Record<number, BuildState> = {};
  ids.forEach((id, i) => { if (raws[i]) out[id] = JSON.parse(raws[i]!); });
  return out;
}
export async function setBuild(b: BuildState): Promise<void> {
  await kvSetMany([[BKEY(b.request), JSON.stringify({ ...b, at: new Date().toISOString() }), 0]]);
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const [token] = await kvGet([GH_TOKEN_KEY]);
  if (!token) throw new Error("GitHub token not configured");
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

/** Ib approved request `reqId`: start the build. */
export async function startBuild(reqId: number): Promise<void> {
  if (!(await claimOnce(`team:starting:${reqId}`, 300))) return;
  const { messages } = await readThread(0);
  const req = messages.find(m => m.id === reqId && m.kind === "request");
  if (!req) return;
  const prev = await getBuild(reqId);
  if (prev && ["queued", "building", "ready", "shipped"].includes(prev.status)) return;
  // Context: the conversation around the request, so the builder knows what was meant.
  const ctx = messages.filter(m => m.id <= reqId && (m.kind === "message" || m.kind === "request")).slice(-12)
    .map(m => `${m.from}: ${m.text}`).join("\n").slice(-6000);
  const r = await gh(`/actions/workflows/team-build.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { request_id: String(reqId), request: req.text.slice(0, 4000), context: ctx } }),
  }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
  if (!r.ok) {
    const err = `couldn't start the build (${r.status})`;
    await setBuild({ request: reqId, status: "failed", at: "", error: err });
    await post("claude", `I couldn't start building #${reqId}: ${err}. I'll look into it.`, "build", reqId);
    return;
  }
  await setBuild({ request: reqId, status: "queued", at: "", branch: `team/req-${reqId}` });
  await post("claude", `On it. Building #${reqId} now. I'll post a preview here for Ib to check before anything goes live.`, "build", reqId);
}

/** Ib clicked Ship on request `reqId`: merge its PR. */
export async function shipBuild(reqId: number): Promise<TeamMessage | null> {
  // A double click (or two devices) must merge once and say nothing twice.
  if (!(await claimOnce(`team:shipping:${reqId}`, 120))) return null;
  const b = await getBuild(reqId);
  if (b?.status === "shipped") return null;
  if (!b || b.status !== "ready" || !b.pr) return post("claude", `#${reqId} isn't ready to ship yet.`, "build", reqId);
  const r = await gh(`/pulls/${b.pr}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "squash", commit_title: `Team room #${reqId} (#${b.pr})` }) });
  if (!r.ok) {
    const msg = ((await r.json().catch(() => ({}))) as { message?: string }).message || String(r.status);
    return post("claude", `Merging #${reqId} failed: ${msg}. The preview is still there; I'll sort it out.`, "build", reqId);
  }
  await setBuild({ ...b, status: "shipped" });
  return post("claude", `Shipped #${reqId}. It'll be live on voteunbiased.org in about 2 minutes.`, "build", reqId);
}

/** Ib clicked Reject: close the PR, nothing changes on the site. */
export async function rejectBuild(reqId: number): Promise<TeamMessage | null> {
  const b = await getBuild(reqId);
  if (!b) return null;
  if (b.pr) await gh(`/pulls/${b.pr}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) }).catch(() => {});
  await setBuild({ ...b, status: "rejected" });
  return post("claude", `Rejected #${reqId}. Nothing changed on the site. Tell me what to do differently and I'll redo it.`, "build", reqId);
}
