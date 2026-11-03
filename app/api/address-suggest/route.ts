import { NextResponse } from "next/server";
import { STATE_LOOKUP } from "@/lib/state-voting";

/**
 * GET /api/address-suggest?q=3 stallion → up to 5 US address suggestions as you type.
 * OpenStreetMap search (Photon), biased toward the visitor's area. When the exact house
 * isn't mapped, the typed house number is joined to matching streets nearby.
 * Nothing is stored.
 */
export const dynamic = "force-dynamic";
const ABBR = Object.fromEntries(Object.entries(STATE_LOOKUP).map(([k, v]) => [v.name.toLowerCase(), k]));
ABBR["district of columbia"] = "DC";
type F = { properties: { housenumber?: string; street?: string; name?: string; city?: string; town?: string; district?: string; county?: string; state?: string; postcode?: string; countrycode?: string; type?: string } };

async function photon(q: string, layers: string[], bias: { lat: number; lon: number } | null) {
  const p = new URLSearchParams({ q, limit: "8", lang: "en" });
  for (const l of layers) p.append("layer", l);
  if (bias) { p.set("lat", String(bias.lat)); p.set("lon", String(bias.lon)); p.set("zoom", "11"); p.set("location_bias_scale", "0.4"); }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { headers: { "User-Agent": "VoteUnbiased/1.0 (+https://voteunbiased.org)" }, signal: AbortSignal.timeout(4000) }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => ({}))).features || []) as F[] : [];
}
const line = (num: string | undefined, street: string | undefined, f: F["properties"]) => {
  const st = ABBR[(f.state || "").toLowerCase()];
  const city = f.city || f.town || f.district || f.county;
  if (!street || !st) return null;
  return `${num ? num + " " : ""}${street}, ${city ? city + ", " : ""}${st}${f.postcode ? " " + f.postcode.slice(0, 5) : ""}`;
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ suggestions: [] });
  const h = req.headers;
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  const bias = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
  const m = q.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  const [houses, streets] = await Promise.all([
    photon(q, ["house"], bias),
    m ? photon(m[2], ["street"], bias) : Promise.resolve([] as F[]),
  ]);
  const out: string[] = [];
  const push = (s: string | null) => { if (s && !out.includes(s)) out.push(s); };
  for (const f of houses) if (f.properties.countrycode === "US" && (!m || f.properties.housenumber?.toLowerCase() === m[1].toLowerCase())) push(line(f.properties.housenumber, f.properties.street, f.properties));
  for (const f of streets) if (f.properties.countrycode === "US") push(line(m![1], f.properties.name, f.properties));
  if (!m) for (const f of houses) if (f.properties.countrycode === "US") push(line(f.properties.housenumber, f.properties.street, f.properties));
  return NextResponse.json({ suggestions: out.slice(0, 5) }, { headers: { "Cache-Control": "no-store" } });
}
