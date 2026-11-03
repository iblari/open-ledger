import { NextResponse } from "next/server";
import { nearbyPolling } from "@/lib/polling";

/** GET /api/polling/nearby?lat=&lng= → other polling places around a point (for the map). */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return NextResponse.json({ places: [] }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const quotaUser = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vu:" + ip))).toString("hex").slice(0, 32);
  const places = await nearbyPolling(lat, lng, quotaUser).catch(() => []);
  return NextResponse.json({ places }, { headers: { "Cache-Control": "no-store" } });
}
