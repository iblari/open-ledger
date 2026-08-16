import { NextResponse } from "next/server";
import { getLedger, getRecentBroadcasts, recordInLedger } from "@/lib/live-kv";

/**
 * GET /api/ledger — the permanent record of every broadcast covered.
 *
 * Unlike /api/live-recent (a 72-hour replay cache) nothing here expires.
 * Returns per-broadcast rows plus weekly rollups, which is the shape the
 * "how many press conferences a week, and how did they score" question
 * actually needs.
 */
export const dynamic = "force-dynamic";

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET() {
  // Self-healing backfill: anything sitting in the 72-hour cache that never
  // made it into the ledger gets recorded now. This is what rescues the
  // broadcasts already in flight when the ledger shipped — after their 72
  // hours they would be unrecoverable.
  const [ledger, recent] = await Promise.all([getLedger(), getRecentBroadcasts()]);
  const known = new Set(ledger.map(e => e.videoId));
  const missing = recent.filter(b => !known.has(b.videoId));
  if (missing.length) {
    await Promise.all(missing.map(b => recordInLedger(b).catch(() => null)));
  }
  const entries = missing.length ? await getLedger() : ledger;

  const weeks = new Map<string, {
    week: string; broadcasts: number; claims: number;
    true: number; misleading: number; false: number; unscored: number;
  }>();
  const bySpeaker = new Map<string, { speaker: string; broadcasts: number; claims: number; true: number; misleading: number; false: number }>();

  for (const e of entries) {
    const wk = isoWeek(new Date(e.startedAt));
    const w = weeks.get(wk) || { week: wk, broadcasts: 0, claims: 0, true: 0, misleading: 0, false: 0, unscored: 0 };
    w.broadcasts++; w.claims += e.counts.total;
    w.true += e.counts.true; w.misleading += e.counts.misleading; w.false += e.counts.false;
    w.unscored += e.counts.unverifiable + e.counts.unconfirmed + e.counts.projection;
    weeks.set(wk, w);

    // Only attribute where the title was unambiguous. Lumping a cabinet
    // meeting under one name would invent data.
    if (e.speaker) {
      const s = bySpeaker.get(e.speaker) || { speaker: e.speaker, broadcasts: 0, claims: 0, true: 0, misleading: 0, false: 0 };
      s.broadcasts++; s.claims += e.counts.total;
      s.true += e.counts.true; s.misleading += e.counts.misleading; s.false += e.counts.false;
      bySpeaker.set(e.speaker, s);
    }
  }

  return NextResponse.json({
    ok: true,
    // Stated plainly: this record starts when the ledger shipped. Anything
    // covered before that was pruned by the 72-hour cache and is gone.
    recordBegins: entries.length ? entries[entries.length - 1].startedAt : null,
    totals: {
      broadcasts: entries.length,
      claims: entries.reduce((n, e) => n + e.counts.total, 0),
    },
    weeks: [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)),
    bySpeaker: [...bySpeaker.values()].sort((a, b) => b.claims - a.claims),
    broadcasts: entries.map(({ claims, ...meta }) => ({ ...meta, claimCount: claims.length })),
  });
}
