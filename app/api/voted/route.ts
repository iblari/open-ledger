import { NextResponse } from "next/server";
import { claimOnce, kvHincrMany, kvHgetall } from "@/lib/live-kv";

/**
 * "Did you vote?" — anonymous count of readers who say they voted.
 * POST {st, device}: counts once per device. GET: totals.
 * We never ask, store or infer who anyone voted for.
 */
export const dynamic = "force-dynamic";
const KEY = "vote:voted:2026";
const TTL = 400 * 86400;

export async function GET() {
  const all = await kvHgetall(KEY).catch(() => ({} as Record<string, number>));
  return NextResponse.json({ total: all.total || 0, byState: Object.fromEntries(Object.entries(all).filter(([k]) => k !== "total")) }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as { st?: string; device?: string };
  const device = String(b.device || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  const st = /^[A-Z]{2}$/.test(String(b.st || "")) ? String(b.st) : null;
  if (device.length >= 8 && await claimOnce(`vote:voted:dev:${device}`, TTL)) {
    await kvHincrMany(KEY, ["total", ...(st ? [st] : [])], TTL).catch(() => {});
  }
  const all = await kvHgetall(KEY).catch(() => ({} as Record<string, number>));
  return NextResponse.json({ ok: true, total: all.total || 0 });
}
