/**
 * Polling place lookup for /vote: Google Civic Information API (voterInfoQuery),
 * which serves the Voting Information Project's official state data.
 * Your polling place is set by your registered address, so we look up by
 * address (or by a reverse-geocoded location). Addresses are never stored or logged.
 */
export const ELECTION_ID = "12000"; // 2026 General Midterm Election (Google electionQuery)
export const ELECTION_DAY = "2026-11-03";

export interface Place {
  name: string; address: string; city: string; state: string; zip: string;
  lat: number | null; lng: number | null; hours: string | null; notes: string | null;
}
export interface PollingResult {
  found: boolean;
  input: string;              // normalized address Google matched
  st: string | null;
  polling: Place[];           // where to vote on election day
  early: Place[];             // early-vote sites (if any still open)
  dropoff: Place[];           // ballot drop boxes
  official: { name: string | null; url: string | null; locator: string | null };
}

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

export async function lookupPolling(address: string): Promise<PollingResult | { error: string }> {
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  if (!key) return { error: "not-configured" };
  const q = new URLSearchParams({ key, electionId: ELECTION_ID, address, officialOnly: "true" });
  const r = await fetch(`https://www.googleapis.com/civicinfo/v2/voterinfo?${q}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
  if (!r) return { error: "unavailable" };
  const j = await r.json().catch(() => null) as {
    error?: { message?: string }; normalizedInput?: Addr;
    pollingLocations?: Loc[]; earlyVoteSites?: Loc[]; dropOffLocations?: Loc[];
    state?: { electionAdministrationBody?: { name?: string; electionInfoUrl?: string; votingLocationFinderUrl?: string } }[];
  } | null;
  if (!j) return { error: "unavailable" };
  if (j.error) return { error: /address/i.test(j.error.message || "") ? "bad-address" : "no-data" };
  const n = j.normalizedInput || {};
  const body = j.state?.[0]?.electionAdministrationBody || {};
  const polling = (j.pollingLocations || []).map(place);
  return {
    found: polling.length > 0,
    input: [n.line1, n.city, n.state, n.zip].filter(Boolean).join(", "),
    st: n.state || null,
    polling: polling.slice(0, 3),
    early: (j.earlyVoteSites || []).map(place).slice(0, 5),
    dropoff: (j.dropOffLocations || []).map(place).filter(p => p.hours).slice(0, 40),
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
