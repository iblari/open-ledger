import { NextResponse } from "next/server";
import { suggestAddresses } from "@/lib/address-suggest";

/**
 * GET /api/address-suggest?bias=1 → the visitor's rough location (from their IP) to rank suggestions.
 * GET /api/address-suggest?q=… → server-side fallback suggestions. Nothing is stored.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url), h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  const bias = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
  if (u.searchParams.get("bias")) return NextResponse.json({ bias }, { headers: { "Cache-Control": "private, max-age=3600" } });
  const suggestions = await suggestAddresses(u.searchParams.get("q") || "", bias).catch(() => []);
  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
}
