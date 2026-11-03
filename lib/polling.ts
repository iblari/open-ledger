/**
 * Polling place lookup for /vote: Google Civic Information API (voterInfoQuery),
 * which serves the Voting Information Project's official state data.
 * Your polling place is set by your registered address, so we look up by
 * address (or by a reverse-geocoded location). Addresses are never stored or logged.
 */
import { STATE_LOOKUP } from "./state-voting";
import { kvGet, kvSetMany, kvHincrMany, kvHgetall } from "./live-kv";

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
  /** No match for the exact address, so this came from a neighbouring house number on the same street. */
  matchedNearby?: string | null;
  /** The match came from a nearby address in the area (not the same street): likely, not certain. */
  matchedArea?: boolean;
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
  error?: { code?: number; message?: string }; normalizedInput?: Addr;
  pollingLocations?: (Loc & { sources?: { official?: boolean }[] })[]; earlyVoteSites?: Loc[]; dropOffLocations?: Loc[];
  state?: { electionAdministrationBody?: { name?: string; electionInfoUrl?: string; votingLocationFinderUrl?: string } }[];
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const busy = (j: Raw | null) => !j || j.error?.code === 429 || (j.error?.code ?? 0) >= 500;
/* Google allows this project 151 calls a minute (raising it takes weeks), shared by
   every visitor. A site-wide counter keeps us under it: when the minute is nearly
   full, a lookup waits for the next minute (up to ~10 s), and the optional
   "same street" retries are skipped so primary lookups always get through. */
const PER_MIN = 140;
const minuteKey = () => `polling:rate:${Math.floor(Date.now() / 60_000)}`;
async function used(): Promise<number> { return (await kvHgetall(minuteKey()).catch(() => ({} as Record<string, number>))).n || 0; }
async function takeSlot(maxWaitMs: number): Promise<boolean> {
  const until = Date.now() + maxWaitMs;
  for (;;) {
    if ((await used()) < PER_MIN) { await kvHincrMany(minuteKey(), ["n"], 120).catch(() => {}); return true; }
    const toNext = 60_000 - (Date.now() % 60_000) + 50;
    if (Date.now() + Math.min(toNext, 1500) > until) return false;
    await sleep(Math.min(toNext, 1500));
  }
}

/** One Civic call (wider data, which includes the official feed), retried on rate limits and timeouts. */
async function civic(key: string, address: string, quotaUser?: string, maxWaitMs = 10_000): Promise<Raw | null> {
  if (!(await takeSlot(maxWaitMs))) return { error: { code: 429, message: "site budget" } };
  const q = new URLSearchParams({ key, electionId: ELECTION_ID, address, officialOnly: "false", ...(quotaUser ? { quotaUser } : {}) });
  let j: Raw | null = null;
  for (const wait of [0, 700, 1800]) {
    if (wait) await sleep(wait);
    const r = await fetch(`https://www.googleapis.com/civicinfo/v2/voterinfo?${q}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
    j = r ? await r.json().catch(() => null) as Raw | null : null;
    if (!busy(j)) return j;
  }
  return j;
}
const hasPoll = (j: Raw | null) => !!j && !j.error && (j.pollingLocations || []).length > 0;

/* Results cached by a hash of the address (never the address itself), so repeat
   lookups and refreshes don't spend the per-minute Google quota. */
async function cacheKey(address: string) {
  const norm = address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return "polling:v2:" + Buffer.from(h).toString("hex").slice(0, 32);
}

/**
 * Never a dead end: 1) Google Civic / Voting Information Project for the
 * address; 2) if the exact address isn't in the data, a neighbour on the same
 * side of the same street (almost always the same precinct), flagged; 3) the
 * state's official lookup link, always. Sorted by distance from the address.
 */
export async function lookupPolling(address: string, known?: { lat: number; lng: number } | null, quotaUser?: string): Promise<PollingResult | { error: string; stateLookup?: { name: string; url: string } | null }> {
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  const ck = await cacheKey(address);
  try { const [hit] = await kvGet([ck]); if (hit) { const c = JSON.parse(hit); if (known && c.found) c.home = known; return c; } } catch { /* fetch fresh */ }

  const [geo, first] = await Promise.all([known ? Promise.resolve({ ...known, st: null }) : geocode(address), key ? civic(key, address, quotaUser) : Promise.resolve(null)]);
  let j = first, matchedNearby: string | null = null, neighbourBusy = false;
  if (key && !hasPoll(j) && !busy(j) && (await used()) < PER_MIN - 20) {
    const m = address.match(/^\s*(\d+)([A-Za-z])?\s+(.+)$/);
    if (m) {
      const n = Number(m[1]), rest = m[3];
      for (const pair of [[2, -2], [4, -4], [10, -10]]) {
        const got = await Promise.all(pair.map(d => n + d).filter(x => x > 0).map(x => `${x} ${rest}`).map(a => civic(key, a, quotaUser, 0).then(r => ({ a, r }))));
        const hit = got.find(g => hasPoll(g.r));
        if (hit) { matchedNearby = hit.a; if (!(hit.r!.dropOffLocations || []).length && j && !j.error) hit.r!.dropOffLocations = j.dropOffLocations; j = hit.r; break; }
        if (got.some(g => busy(g.r))) { neighbourBusy = true; break; }
      }
    }
  }
  // Still nothing: look around the home itself. Google accepts "lat,lng" and resolves it to
  // the nearest address it knows, so we probe a small ring (~120 m, then ~260 m) and take
  // the closest polling place found. Flagged as "near you", not "yours".
  let matchedArea = false;
  if (key && geo && !hasPoll(j) && !neighbourBusy && !busy(j)) {
    const ring = (r: number) => [0, 90, 180, 270, 45, 135, 225, 315].map(deg => {
      const t = (deg * Math.PI) / 180, dLat = (r * Math.cos(t)) / 111_320, dLng = (r * Math.sin(t)) / (111_320 * Math.cos((geo.lat * Math.PI) / 180));
      return `${(geo.lat + dLat).toFixed(6)},${(geo.lng + dLng).toFixed(6)}`;
    });
    const tries = [[`${geo.lat.toFixed(6)},${geo.lng.toFixed(6)}`, ...ring(120).slice(0, 3)], ring(120).slice(3, 7), ring(260).slice(0, 4), ring(260).slice(4, 8)];
    for (const wave of tries) {
      if ((await used()) >= PER_MIN - 30) { neighbourBusy = true; break; }
      const got = await Promise.all(wave.map(a => civic(key, a, quotaUser, 0).then(r => ({ a, r }))));
      const hits = got.filter(g => hasPoll(g.r));
      if (hits.length) {
        const best = hits.map(h => ({ h, d: dist(geo, place(h.r!.pollingLocations![0])) })).sort((a, b) => a.d - b.d)[0].h;
        const keepDrops = j && !j.error ? j.dropOffLocations : undefined;
        j = best.r; matchedArea = true;
        const na = j!.normalizedInput; matchedNearby = na ? [na.line1, na.city].filter(Boolean).join(", ") : "an address near you";
        if (!(j!.dropOffLocations || []).length && keepDrops) j!.dropOffLocations = keepDrops;
        break;
      }
      if (got.some(g => busy(g.r))) { neighbourBusy = true; break; }
    }
  }
  const st = j?.normalizedInput?.state || geo?.st || stateFromText(address);
  const stateLookup = st ? STATE_LOOKUP[st] ?? null : null;
  if (!key) return { error: "not-configured", stateLookup };
  if (busy(j) || (neighbourBusy && !hasPoll(j))) return { error: "unavailable", stateLookup };
  if (j!.error) return { error: /address|parse/i.test(j!.error.message || "") && !st ? "bad-address" : "no-data", stateLookup };
  const n = j!.normalizedInput || {};
  const body = j!.state?.[0]?.electionAdministrationBody || {};
  const home = geo ? { lat: geo.lat, lng: geo.lng } : null;
  const near = (xs: Place[]) => home ? [...xs].sort((a, b) => dist(home, a) - dist(home, b)) : xs;
  const rawPoll = j!.pollingLocations || [];
  const polling = near(rawPoll.map(place));
  const out: PollingResult = {
    found: polling.length > 0,
    unofficial: !!matchedNearby || (rawPoll.length > 0 && !rawPoll.some(l => l.sources?.some(x => x.official))),
    matchedNearby,
    matchedArea,
    home,
    stateLookup,
    input: [n.line1, n.city, n.state, n.zip].filter(Boolean).join(", "),
    st: st || null,
    polling: polling.slice(0, 5),
    early: near((j!.earlyVoteSites || []).map(place)).slice(0, 5),
    dropoff: near((j!.dropOffLocations || []).map(place).filter(p => p.hours)).slice(0, 40),
    official: { name: body.name || null, url: body.electionInfoUrl || null, locator: body.votingLocationFinderUrl || null },
  };
  await kvSetMany([[ck, JSON.stringify(out), out.found ? 6 * 3600 : 120]]).catch(() => {});
  return out;
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

/**
 * Other polling places around a point, for the map: probes rings (~0.5 and ~1.2 km)
 * with Google's lat,lng lookups and keeps every distinct polling place found.
 * Cached per ~1 km grid cell for 12 h, so a busy neighbourhood costs one search.
 * Only runs when the per-minute budget has room; primary lookups always come first.
 */
export async function nearbyPolling(lat: number, lng: number, quotaUser?: string): Promise<Place[]> {
  const key = process.env.GOOGLE_CIVIC_API_KEY;
  if (!key) return [];
  const cell = `polling:near:v1:${lat.toFixed(2)},${lng.toFixed(2)}`;
  try { const [hit] = await kvGet([cell]); if (hit) return JSON.parse(hit); } catch { /* search */ }
  const pts: string[] = [];
  for (const [r, n] of [[500, 6], [1200, 8]] as const) for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n + (r === 1200 ? Math.PI / 8 : 0);
    pts.push(`${(lat + (r * Math.cos(t)) / 111_320).toFixed(6)},${(lng + (r * Math.sin(t)) / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(6)}`);
  }
  const seen = new Map<string, Place>();
  for (let i = 0; i < pts.length; i += 4) {
    if ((await used()) >= PER_MIN - 40) break;
    const got = await Promise.all(pts.slice(i, i + 4).map(p => civic(key, p, quotaUser, 0)));
    for (const g of got) for (const l of (g && !g.error ? g.pollingLocations || [] : [])) {
      const p = place(l); if (p.lat == null) continue;
      seen.set(`${p.name}|${p.address}`, p);
    }
    if (got.some(busy)) break;
  }
  const out = [...seen.values()];
  if (out.length) await kvSetMany([[cell, JSON.stringify(out), 12 * 3600]]).catch(() => {});
  return out;
}
