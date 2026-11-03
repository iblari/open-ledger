import { STATE_LOOKUP } from "./state-voting";

/**
 * Address suggestions as you type (OpenStreetMap via Photon). Runs in the
 * visitor's browser so the free service's per-IP limits aren't shared by
 * everyone (it throttles server traffic); the server route is the fallback.
 */
export const ABBR = Object.fromEntries(Object.entries(STATE_LOOKUP).map(([k, v]) => [v.name.toLowerCase(), k]));
ABBR["district of columbia"] = "DC";
type F = { geometry?: { coordinates?: [number, number] }; properties: { housenumber?: string; street?: string; name?: string; city?: string; town?: string; district?: string; county?: string; state?: string; postcode?: string; countrycode?: string; type?: string } };

export async function photon(q: string, layers: string[], bias: { lat: number; lon: number } | null) {
  const p = new URLSearchParams({ q, limit: "8", lang: "en" });
  for (const l of layers) p.append("layer", l);
  if (bias) { p.set("lat", String(bias.lat)); p.set("lon", String(bias.lon)); p.set("zoom", "11"); p.set("location_bias_scale", "0.4"); }
  const r = await fetch(`https://photon.komoot.io/api/?${p}`, { signal: AbortSignal.timeout(3500) }).catch(() => null);
  return r?.ok ? ((await r.json().catch(() => ({}))).features || []) as F[] : [];
}
const line = (num: string | undefined, street: string | undefined, f: F["properties"]) => {
  const st = ABBR[(f.state || "").toLowerCase()];
  const city = f.city || f.town || f.district || f.county;
  if (!street || !st) return null;
  // No ZIP: OpenStreetMap's postcodes are often the neighbouring ZIP, which makes the voter-file lookup miss.
  return `${num ? num + " " : ""}${street}, ${city ? city + ", " : ""}${st}`;
};


export async function suggestAddresses(q: string, bias: { lat: number; lon: number } | null): Promise<string[]> {
  q = q.trim().slice(0, 120);
  if (q.length < 3) return [];
  const m = q.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  const [houses, streets] = await Promise.all([
    photon(q, ["house"], bias),
    m ? photon(m[2], ["street"], bias) : Promise.resolve([] as F[]),
  ]);
  // Rank by distance from the visitor (exact houses get a head start), so nearby streets win.
  const km = (f: F) => {
    const c = f.geometry?.coordinates; if (!bias || !c) return 500;
    const dLat = (c[1] - bias.lat) * 111, dLon = (c[0] - bias.lon) * 111 * Math.cos((bias.lat * Math.PI) / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  };
  const cands: { s: string; d: number }[] = [];
  for (const f of houses) if (f.properties.countrycode === "US" && (!m || f.properties.housenumber?.toLowerCase() === m[1].toLowerCase())) {
    const s1 = line(f.properties.housenumber, f.properties.street, f.properties); if (s1) cands.push({ s: s1, d: km(f) * 0.6 });
  }
  for (const f of streets) if (f.properties.countrycode === "US") { const s1 = line(m![1], f.properties.name, f.properties); if (s1) cands.push({ s: s1, d: km(f) }); }
  if (!m) for (const f of houses) if (f.properties.countrycode === "US") { const s1 = line(f.properties.housenumber, f.properties.street, f.properties); if (s1) cands.push({ s: s1, d: km(f) }); }
  const out: string[] = [];
  for (const c of cands.sort((x, y) => x.d - y.d)) if (!out.includes(c.s)) out.push(c.s);
  return out.slice(0, 5);
}
