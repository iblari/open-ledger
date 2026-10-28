import { NextResponse } from "next/server";
import { kvGet } from "@/lib/live-kv";
import { PLAN_KEY, LOG_KEY } from "@/lib/verdict-consistency";

/**
 * GET /api/consistency — public log of verdict reconciliations: which
 * repeated claims were reviewed together, the verdict each had, and the one
 * they now share. Originals are kept; nothing here is hidden.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [plan, log] = await kvGet([PLAN_KEY, LOG_KEY]);
  const groups = Object.values(plan ? JSON.parse(plan) : {});
  return NextResponse.json({ ok: true, changes: log ? JSON.parse(log) : [], reviewed: groups }, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
