import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { extractPromises } from "@/lib/promise-extract";
import { resolveStatus, type PromiseRecord, type PromiseFile } from "@/lib/promises";
import { getPromises, setPromises } from "@/lib/live-kv";

export const maxDuration = 300;

/**
 * POST /api/admin/promises   (auth: ADMIN_KEY)
 *   { action: "extract" }  → mine archived speeches for new promises, then resolve
 *   { action: "resolve" }  → re-score the existing archive against fresh data (free)
 *   { action: "add", promise: {...} } → store one promise captured live
 *
 * Resolution is deterministic and costs nothing, so it can run monthly as
 * new FRED data lands — that recurring re-scoring IS the promise tracker.
 */

const TERM_END: Record<string, string> = {
  trump2: "2029-01-20", biden: "2025-01-20", trump1: "2021-01-20", obama: "2017-01-20",
};

async function resolveAll(promises: PromiseRecord[], origin: string): Promise<PromiseRecord[]> {
  let bench: { metrics?: Record<string, { label: string; unit: string; series: { id: string; current: boolean; data: { month: number; value: number }[] }[] }> } = {};
  try { bench = await fetch(`${origin}/api/benchmark-data`).then(r => r.json()); } catch { /* leave unresolved */ }
  const now = new Date();

  for (const p of promises) {
    const t = p.target;
    const md = t.metricKey ? bench.metrics?.[t.metricKey] : undefined;
    if (!md || t.targetValue == null) {
      p.resolution = {
        status: "unresolvable", actualValue: null, progressPct: null,
        asOf: now.toISOString().slice(0, 10),
        evidence: p.unresolvableReason || "No official series measures this promise as stated.",
        evaluatedAt: now.toISOString(), source: "—",
      };
      continue;
    }
    const series = md.series.find(s => s.id === (p.admin || "trump2")) || md.series.find(s => s.current);
    const pts = [...(series?.data || [])].sort((a, b) => a.month - b.month);
    if (!pts.length) {
      p.resolution = { status: "pending", actualValue: null, progressPct: null, asOf: "—", evidence: "No observations yet for this term.", evaluatedAt: now.toISOString(), source: "FRED" };
      continue;
    }
    const baseline = pts[0].value;
    const actual = pts[pts.length - 1].value;
    const deadlinePassed = t.deadline ? new Date(t.deadline) < now : false;
    const { status, progressPct } = resolveStatus({ target: t, baseline, actual, deadlinePassed });
    const u = md.unit === "%" ? "%" : md.unit === "M" ? "M" : md.unit === "$" ? "$" : "";
    p.resolution = {
      status, actualValue: actual, progressPct,
      asOf: `month ${pts[pts.length - 1].month} of the term`,
      evidence: t.kind === "cumulative_change"
        ? `${md.label}: ${baseline}${u} at the start of the term → ${actual}${u} now (${actual - baseline >= 0 ? "+" : ""}${(actual - baseline).toFixed(1)}${u} of a promised ${t.direction === "decrease" ? "−" : "+"}${t.targetValue}${u}).`
        : `${md.label} is ${actual}${u} against a promised ${t.direction === "decrease" ? "≤" : "≥"}${t.targetValue}${u} (${baseline}${u} when the term began).`,
      evaluatedAt: now.toISOString(),
      source: "FRED via Vote Unbiased benchmark data",
    };
  }
  return promises;
}

export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("authorization") !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const origin = new URL(req.url).origin;
  const existing = (await getPromises())?.promises ?? [];

  if (body.action === "add" && body.promise) {
    const next = [...existing, body.promise as PromiseRecord];
    const resolved = await resolveAll(next, origin);
    await setPromises(buildFile(resolved));
    return NextResponse.json({ ok: true, total: resolved.length });
  }

  let promises = existing;
  if (body.action === "extract") {
    const dir = path.join(process.cwd(), "public", "speeches");
    const seen = new Set(existing.map(p => p.quote.toLowerCase().slice(0, 60)));
    const added: PromiseRecord[] = [];
    let files: string[] = [];
    try { files = await readdir(dir); } catch { /* none bundled */ }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const sp = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      // Use whichever source carries MORE of the speech: `segments` are
      // clean but often only curated highlights (22 snippets vs 372 caption
      // lines on the 2025 address), and mining highlights alone finds
      // almost nothing.
      const norm = (arr: { time?: number; start?: number; text?: string }[] = []) =>
        arr.map(c => ({ start: c.time ?? c.start ?? 0, text: c.text || "" })).filter(c => c.text.length > 2);
      const segs = norm(sp.segments);
      const caps = norm(sp.captions);
      const chars = (a: { text: string }[]) => a.reduce((n, c) => n + c.text.length, 0);
      const parts = chars(caps) > chars(segs) * 1.5 ? caps : segs;
      if (!parts.length) continue;
      const admin: string = sp.admin || (f.includes("trump") ? "trump2" : "biden");
      // Group into ~1200-char windows so a full promise sentence stays intact.
      const windows: { text: string; t: number }[] = [];
      let cur: string[] = [], start = parts[0].start;
      for (const c of parts) {
        cur.push(c.text);
        if (cur.join(" ").length > 1200) { windows.push({ text: cur.join(" "), t: start }); cur = []; start = c.start; }
      }
      if (cur.length) windows.push({ text: cur.join(" "), t: start });

      for (const w of windows) {
        try {
          const found = await extractPromises(w.text, {
            speaker: sp.speaker || "President", admin,
            spokenAt: sp.date || new Date().toISOString().slice(0, 10),
            sourceTitle: sp.title || f,
            sourceUrl: sp.videoId ? `https://www.youtube.com/watch?v=${sp.videoId}` : null,
            videoTime: Math.round(w.t),
            defaultDeadline: TERM_END[admin] ?? null,
          });
          for (const p of found) {
            const k = p.quote.toLowerCase().slice(0, 60);
            if (!seen.has(k)) { seen.add(k); added.push(p); }
          }
        } catch (e) { console.error("[promises] window failed:", (e as Error).message); }
      }
    }
    promises = [...existing, ...added];
  }

  const resolved = await resolveAll(promises, origin);
  resolved.sort((a, b) => (b.spokenAt || "").localeCompare(a.spokenAt || ""));
  await setPromises(buildFile(resolved));
  const counts = resolved.reduce<Record<string, number>>((a, p) => {
    const s = p.resolution?.status ?? "pending"; a[s] = (a[s] || 0) + 1; return a;
  }, {});
  return NextResponse.json({ ok: true, total: resolved.length, counts });
}

function buildFile(promises: PromiseRecord[]): PromiseFile {
  return {
    generatedAt: new Date().toISOString(),
    method: "Promises are captured verbatim from official speeches and live coverage, then scored by deterministic arithmetic against FRED-backed series. We report whether the number was reached — not whether the speaker caused it.",
    promises,
  };
}
