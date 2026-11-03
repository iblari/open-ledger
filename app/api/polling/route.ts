import { NextResponse } from "next/server";
import { lookupPolling, reverseGeocode } from "@/lib/polling";

/**
 * GET /api/polling?address=…  or  ?lat=…&lng=…
 * Your assigned polling place, early-vote sites and drop boxes for Nov 3.
 * Nothing about the request is stored or logged.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  let address = (u.searchParams.get("address") || "").trim().slice(0, 200);
  const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
  let home: { lat: number; lng: number } | null = null;
  if (!address && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    address = (await reverseGeocode(lat, lng)) || "";
    if (!address) return NextResponse.json({ error: "no-address" }, { headers: { "Cache-Control": "no-store" } });
    home = { lat, lng };
  }
  if (address.length < 5) return NextResponse.json({ error: "bad-address" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  // Google's per-user quota: count each visitor separately (a hash of their IP, never the IP itself).
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  const quotaUser = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vu:" + ip))).toString("hex").slice(0, 32);
  const r = await lookupPolling(address, home, quotaUser);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
