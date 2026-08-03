/**
 * Server-side data for the /live page.
 *
 * The two states are decided BEFORE paint (spec: "a live viewer never sees
 * the landing page flash first"), which means this runs on the server and
 * hands the client its initial view already chosen.
 */

import { knownEvents } from "./known-events";

export interface HomeCheck {
  time: string; verdict: "ok" | "mis" | "con";
  quote: string; said: string | null; actual: string;
  source: string; sourceUrl?: string;
}
export interface HomeLive {
  title: string; venue: string; startedAt: string; videoId: string;
  checks: HomeCheck[];
  counts: { match: number; misleading: number; contradicted: number };
}
export interface HomeArchiveItem {
  id: string; title: string; venue: string; date: string; duration: string;
  counts: { match: number; misleading: number; contradicted: number };
  total: number;
}
export interface HomeScheduleItem {
  type: "data" | "fed" | "speech";
  title: string; startsAt: string; description: string;
}

const VERDICT: Record<string, "ok" | "mis" | "con" | null> = {
  "TRUE": "ok", "MOSTLY TRUE": "ok", "MISLEADING": "mis", "FALSE": "con",
};

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface RawClaim {
  rating: string; quote: string; actual: string; videoTime?: number;
  claimedValue?: number | null; groundTruth?: { source: string };
  sources?: { title: string; url: string }[];
}

function toChecks(claims: RawClaim[]): HomeCheck[] {
  return claims
    .map(c => {
      const v = VERDICT[(c.rating || "").toUpperCase()];
      if (!v) return null;
      return {
        time: stamp(c.videoTime ?? 0),
        verdict: v,
        quote: c.quote,
        said: c.claimedValue != null ? String(c.claimedValue) : null,
        actual: c.actual,
        source: c.groundTruth?.source || c.sources?.[0]?.title || "Official data",
        sourceUrl: c.sources?.[0]?.url,
      } as HomeCheck;
    })
    .filter((c): c is HomeCheck => c !== null)
    .sort((a, b) => b.time.localeCompare(a.time)); // newest on top
}

function tally(claims: RawClaim[]) {
  const n = (r: string) => claims.filter(c => (c.rating || "").toUpperCase() === r).length;
  return { match: n("TRUE") + n("MOSTLY TRUE"), misleading: n("MISLEADING"), contradicted: n("FALSE") };
}

async function j<T>(url: string, ms = 6000): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export async function loadLiveHome(origin: string): Promise<{
  live: HomeLive | null;
  archive: HomeArchiveItem[];
  schedule: HomeScheduleItem[];
}> {
  const [feed, recent, discover] = await Promise.all([
    j<{ state: { status: string; title?: string; videoId?: string; startedAt?: string; source?: string }; claims: RawClaim[] }>(`${origin}/api/live-feed`),
    j<{ recent: { videoId: string; title: string; source: string; startedAt: string; endedAt: string; claims: RawClaim[] }[] }>(`${origin}/api/live-recent`),
    j<{ upcoming: { title: string; scheduledStart: string; channelLabel: string }[] }>(`${origin}/api/live-discover`, 8000),
  ]);

  const st = feed?.state;
  const live: HomeLive | null = st?.status === "live" && st.videoId
    ? {
        title: st.title || "Live broadcast",
        venue: st.source === "youtube" ? "Official stream" : (st.source || "Live feed"),
        startedAt: st.startedAt || new Date().toISOString(),
        videoId: st.videoId,
        checks: toChecks(feed?.claims || []),
        counts: tally(feed?.claims || []),
      }
    : null;

  const archive: HomeArchiveItem[] = (recent?.recent || []).map(b => {
    const mins = Math.max(1, Math.round((Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 60000));
    return {
      id: b.videoId,
      title: b.title,
      venue: b.source === "youtube" ? "Official stream" : b.source,
      date: b.endedAt,
      duration: `${mins} min`,
      counts: tally(b.claims || []),
      total: (b.claims || []).length,
    };
  });

  // Announced streams first (they're dated and imminent), then the year-ahead
  // economic calendar so the rail is never empty.
  const announced: HomeScheduleItem[] = (discover?.upcoming || []).map(u => ({
    type: "speech" as const, title: u.title,
    startsAt: u.scheduledStart, description: `${u.channelLabel} — we'll fact-check it live.`,
  }));
  const known: HomeScheduleItem[] = knownEvents().slice(0, 5).map(k => ({
    type: k.kind === "fomc" ? "fed" : "data",
    title: k.title, startsAt: k.startsAt, description: k.detail,
  }));

  return { live, archive, schedule: [...announced, ...known].slice(0, 6) };
}
