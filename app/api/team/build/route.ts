import { NextResponse, after } from "next/server";
import { memberFor, keyFrom, post } from "@/lib/team";
import { getBuild, setBuild, type BuildStatus } from "@/lib/team-build";
import { pingSam } from "@/lib/team-agent";

/** POST /api/team/build — progress reports from the build workflow (Claude's key).
 *  {request_id, status: building|ready|failed, pr?, prUrl?, preview?, run?, summary?, error?} */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (memberFor(keyFrom(req)) !== "claude") return NextResponse.json({ error: "bad key" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { request_id?: string | number; status?: BuildStatus; pr?: number; prUrl?: string; preview?: string; run?: string; summary?: string; error?: string };
  const id = Number(b.request_id);
  if (!id || !b.status || !["building", "ready", "failed"].includes(b.status)) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const prev = (await getBuild(id)) || { request: id, status: "queued" as BuildStatus, at: "" };
  if (prev.status === "shipped" || prev.status === "rejected") return NextResponse.json({ ok: true, ignored: true });
  await setBuild({ ...prev, status: b.status, pr: b.pr ?? prev.pr, prUrl: b.prUrl ?? prev.prUrl, preview: b.preview ?? prev.preview, run: b.run ?? prev.run, summary: b.summary?.slice(0, 3000) ?? prev.summary, error: b.error?.slice(0, 500) });
  let text = "";
  if (b.status === "ready") text = `#${id} is ready for Ib to check.\n\n${(b.summary || "").trim().slice(0, 1800)}\n\nPreview: ${b.preview}\nCode: ${b.prUrl}\n\nIb: Ship to put it live, or Reject.`;
  if (b.status === "failed") text = `Building #${id} didn't work: ${(b.error || "unknown error").slice(0, 400)}. Nothing changed on the site.${b.run ? `\nLog: ${b.run}` : ""}`;
  if (text) {
    const m = await post("claude", text, "build", id);
    after(() => pingSam(m));
  }
  return NextResponse.json({ ok: true });
}
