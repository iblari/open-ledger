import { NextResponse } from "next/server";
import { memberFor, keyFrom } from "@/lib/team";
import { kvGet, kvSetMany } from "@/lib/live-kv";
import { GH_TOKEN_KEY } from "@/lib/team-build";

/** POST /api/team/config {githubToken} — Ib or Claude only. The token the site
 *  uses to start builds and merge/close their PRs. GET shows whether it's set. */
export const dynamic = "force-dynamic";
const ok = (req: Request) => { const m = memberFor(keyFrom(req)); return m === "ib" || m === "claude"; };

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const [t] = await kvGet([GH_TOKEN_KEY]);
  return NextResponse.json({ githubToken: !!t });
}
export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const { githubToken } = (await req.json().catch(() => ({}))) as { githubToken?: string };
  if (!githubToken || !/^(github_pat_|ghp_)/.test(githubToken)) return NextResponse.json({ error: "githubToken required" }, { status: 400 });
  await kvSetMany([[GH_TOKEN_KEY, githubToken, 0]]);
  return NextResponse.json({ ok: true });
}
