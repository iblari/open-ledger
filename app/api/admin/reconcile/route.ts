import { NextRequest, NextResponse } from "next/server";
import { reconcile } from "@/lib/verdict-consistency";

/**
 * POST /api/admin/reconcile  (auth: ADMIN_KEY)  { apply?: boolean, limit?: number }
 * Review repeated claims that got different verdicts on unchanged data.
 * Without apply: stores/extends the plan only (see /api/consistency).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("authorization") !== `Bearer ${key}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const r = await reconcile({ apply: body.apply === true, limit: Number(body.limit) || 8 });
  return NextResponse.json({ ok: true, groups: r.groups, decided: r.decided, changed: r.changed, pending: r.plan.filter(g => !g.decision).length });
}
