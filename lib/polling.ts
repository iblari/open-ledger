/**
 * Polling place lookup for /vote: Google Civic Information API (voterInfoQuery),
 * which serves the Voting Information Project's official state data.
 * Your polling place is set by your registered address, so we look up by
 * address (or by a reverse-geocoded location). Addresses are never stored or logged.
 */
import { STATE_LOOKUP } from "./state-voting";

export const ELECTION_ID = "12000"; // 2026 General Midterm Election (Google electionQuery)
export const ELECTION_DAY = "2026-11-03";

export interface Place {
  name: string; address: string; city: string; state: string; zip: string;
  lat: number | null; lng: number | null; hours: string | null; notes: string | null;
}
export interface PollingResult {
  found: boolean;
  /** Some of the data came from Google's unofficial sources (only used when the official feed had nothing). */
  unofficial?: boolean;
  home?: { lat: number; lng: number } | null;
  stateLookup?: { name: string; url: string } | null;
  input: string;              // normalized address Google matched
  st: string | null;
  polling: Place[];           // where to vote on election day
  early: Place[];             // early-vote sites (if any still open)
  dropoff: Place[];           // ballot drop boxes
  official: { name: string | null; url: string | null; locator: string | null };
}


/** Address → coordinates with the Census Bureau geocoder (free, official, US-only). */
export async function geocode(address: string): Promise<{ lat: number; lng: number; st: string | null } | null> {
  const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${q}`, { signal: AbortSignal.timeout(8000), cache: "no-store" }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) as { result?: { addressMatches?: { coordinates: { x: number; y: number }; addressComponents?: { state?: string } }[] } } | null : null;
  const m = j?.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, st: m.addressComponents?.state || null } : null;
}
const stateFromText = (a: string) => { const m = a.toUpperCase().match(/\b([A-Z]{2})\b[\s,]*(\d{5})?\s*$/) || a.toUpperCase().match(/,\s*([A-Z]{2})\b/); return m && STATE_LOOKUP[m[1]] ? m[1] : null; };
const dist = (a: { lat: number; lng: number }, b: Place) => b.lat == null ? 1e9 : (a.lat - b.lat) ** 2 + ((a.lng - b.lng!) * Math.cos((a.lat * Math.PI) / 180)) ** 2;

type Addr = { locationName?: string; line1?: string; city?: string; state?: string; zip?: string };
type Loc = { address?: Addr; latitude?: number; longitude?: number; pollingHours?: string; notes?: string };

const titleCase = (s: string) => s && s === s.toUpperCase()
  ? s.toLowerCase().replace(/(^|[\s\-/(.])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\s(Of|The|And|At|For|On|In|To|By|Near)\b/g, w => w.toLowerCase())
    .replace(/\b(Tcnj|Ymca|Ywca|Vfw|Ny|Nj|Nyc|Dc|Usa|Us)\b/g, w => w.toUpperCase())
  : s;
/** Drop boxes list every day of the season; keep the election-day line. */
function dayHours(h?: string): string | null {
  if (!h) return null;
  const lines = h.split("\n").map(x => x.trim()).filter(Boolean);
  const today = lines.find(l => /Nov 3\b/.test(l));
  const h1 = (today || (lines.length <= 2 ? lines.join(" · ") : null))?.replace(/^\w{3}, Nov 3:\s*/, "") ?? null;
  // Drop boxes open around the clock until polls close: "12 am - 8 pm" reads better as "until 8 pm".
  return h1?.replace(/^12(:00)? am\s*-\s*/i, "until ") ?? null;
}
const place = (l: Loc): Place => ({
  name: titleCase(l.address?.locationName || "Polling place"),
  address: titleCase(l.address?.line1 || ""), city: titleCase(l.address?.city || ""), state: l.address?.state || "", zip: l.address?.zip || "",
  lat: typeof l.latitude === "number" ? l.latitude : null, lng: typeof l.longitude === "number" ? l.longitude : null,
  hours: dayHours(l.pollingHours), notes: l.notes ? titleCase(l.notes) : null,
});

type Raw = {
  error?: { message?: string }; normalizedInput?: Addr;
  pollingLocations?: Loc[]; earlyVoteSites?: Loc[]; dropOffLocations?: Loc[];
  state?: { electionAdministrationBody?: { name?: string; electionInfoUrl?: string; votingLocationFinderUrl?: string } }[];
};
async function civic(key: string, address: string, officialOnly: boolean): Promise<Raw | null> {
  const q = new URLSearchParams({ key, electionId: ELECTION_ID, address, officialOnly: String(officialOnly) });
  const r = await fetch(`https://www.googleapis.com/civicinfo/v2/voterinfo?${q}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
  return r ? await r.json().catch(() => null) as Raw | null : null;
}

/**
 * Never a dead end: 1) official VIP data; 2) if that has no polling place,
 * Google's wider data (flagged unofficial); 3) always the state's official
 * lookup link. Results are sorted by distance from the address.
 */
export async function lookupPolling(address: string, known?: { lat: number; lng: number } | null): Promise<PollingResult | { error: string; stateLookup?: { name: string; url: string } | null }> {
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  const [geo, off] = await Promise.all([known ? Promise.resolve({ ...known, st: null }) : geocode(address), key ? civic(key, address, true) : Promise.resolve(null)]);
  let j = off, unofficial = false;
  // A failed request (timeout, rate limit) is retried once before we treat it as "no data".
  if (key && (!j || (j.error && !/address|parse|election unknown/i.test(j.error.message || "")))) j = await civic(key, address, true);
  const officialOk = !!j && !j.error;
  if (key && (!officialOk || !(j!.pollingLocations || []).length)) {
    const all = await civic(key, address, false);
    if (all && !all.error && ((all.pollingLocations || []).length || (all.dropOffLocations || []).length || (all.earlyVoteSites || []).length)) {
      unofficial = (all.pollingLocations || []).length > 0;
      // Keep official drop boxes if the wider data has none.
      if (officialOk && !(all.dropOffLocations || []).length) all.dropOffLocations = j!.dropOffLocations;
      j = all;
    }
  }
  const st = j?.normalizedInput?.state || geo?.st || stateFromText(address);
  const stateLookup = st ? STATE_LOOKUP[st] ?? null : null;
  if (!j || j.error) {
    if (!key || !j) return { error: key ? "unavailable" : "not-configured", stateLookup };
    return { error: /address|parse/i.test(j.error?.message || "") && !st ? "bad-address" : "no-data", stateLookup };
  }
  const n = j.normalizedInput || {};
  const body = j.state?.[0]?.electionAdministrationBody || {};
  const home = geo ? { lat: geo.lat, lng: geo.lng } : null;
  const near = (xs: Place[]) => home ? [...xs].sort((a, b) => dist(home, a) - dist(home, b)) : xs;
  const polling = near((j.pollingLocations || []).map(place));
  return {
    found: polling.length > 0,
    unofficial,
    home,
    stateLookup: stateLookup ? { ...stateLookup, url: body.votingLocationFinderUrl && !/how-to-guide|ncsbe\.gov\/voting$/.test(body.votingLocationFinderUrl) ? body.votingLocationFinderUrl : stateLookup.url } : null,
    input: [n.line1, n.city, n.state, n.zip].filter(Boolean).join(", "),
    st: st || null,
    polling: polling.slice(0, 5),
    early: near((j.earlyVoteSites || []).map(place)).slice(0, 5),
    dropoff: near((j.dropOffLocations || []).map(place).filter(p => p.hours)).slice(0, 40),
    official: { name: body.name || null, url: body.electionInfoUrl || null, locator: body.votingLocationFinderUrl || null },
  };
}

/** Lat/lng → street address (OpenStreetMap Nominatim), for "use my location". */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`, {
    headers: { "User-Agent": "VoteUnbiased/1.0 (+https://voteunbiased.org)", "Accept-Language": "en-US" }, signal: AbortSignal.timeout(8000), cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json().catch(() => null) as { address?: Record<string, string> } | null;
  const a = j?.address; if (!a || a.country_code !== "us") return null;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.hamlet || a.suburb || "";
  return [street, city, a.state, a.postcode].filter(Boolean).join(", ") || null;
}
