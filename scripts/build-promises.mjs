#!/usr/bin/env node
/**
 * build-promises.mjs — extract promises from archived speeches, then resolve
 * every stored promise against live ground-truth data.
 *
 *   node scripts/build-promises.mjs            # resolve only (no API cost)
 *   node scripts/build-promises.mjs --extract  # + re-extract from speeches
 *
 * Extraction needs ANTHROPIC_API_KEY. Resolution needs nothing but the
 * benchmark API, so the scheduled job can re-score the archive for free as
 * new data lands each month — which is the whole point of a promise tracker.
 */
import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import path from "path";

const API = process.env.API_URL || "https://voteunbiased.org";
const OUT = path.join(process.cwd(), "public", "promises.json");
const DO_EXTRACT = process.argv.includes("--extract");

// Term ends — the default deadline when a speaker names no timeframe.
const TERM_END = { trump2: "2029-01-20", biden: "2025-01-20", trump1: "2021-01-20", obama: "2017-01-20" };

async function loadExisting() {
  try { return JSON.parse(await readFile(OUT, "utf8")); }
  catch { return { generatedAt: null, promises: [] }; }
}

// ── 1. Extraction pass (optional) ─────────────────────────────────
async function extractFromSpeeches(existing) {
  const { extractPromises } = await import("../lib/promise-extract.ts").catch(() => ({}));
  if (!extractPromises) { console.error("extractor unavailable (needs tsx); skipping"); return existing; }
  const dir = path.join(process.cwd(), "public", "speeches");
  const seen = new Set(existing.map(p => p.quote.toLowerCase().slice(0, 60)));
  const added = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    const sp = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    // Prefer `segments` (clean, punctuated prose) and fall back to raw
    // captions; caption objects use {time,text}, segments {time,text}.
    const caps = (sp.segments?.length ? sp.segments : sp.captions || [])
      .map(c => ({ start: c.time ?? c.start ?? 0, text: c.text || "" }))
      .filter(c => c.text.length > 2);
    if (!caps.length) { console.error(`${f}: no usable text, skipping`); continue; }
    const admin = sp.admin || (f.includes("trump") ? "trump2" : "biden");
    // ~90-second windows: long enough for a full promise sentence.
    const windows = [];
    let cur = [], start = caps[0]?.start ?? 0;
    for (const c of caps) {
      cur.push(c.text);
      const joined = cur.join(" ");
      if ((c.start - start) > 90 || joined.length > 1200) { windows.push({ text: joined, t: start }); cur = []; start = c.start; }
    }
    if (cur.length) windows.push({ text: cur.join(" "), t: start });
    console.error(`${f}: ${windows.length} windows`);
    for (const w of windows) {
      try {
        const found = await extractPromises(w.text, {
          speaker: sp.speaker || "President", admin,
          spokenAt: sp.date || "2025-03-04",
          sourceTitle: sp.title || f, sourceUrl: sp.videoId ? `https://www.youtube.com/watch?v=${sp.videoId}` : null,
          videoTime: Math.round(w.t),
          defaultDeadline: TERM_END[admin] || null,
        });
        for (const p of found) {
          const k = p.quote.toLowerCase().slice(0, 60);
          if (!seen.has(k)) { seen.add(k); added.push(p); }
        }
      } catch (e) { console.error("  window failed:", e.message); }
    }
  }
  console.error(`extracted ${added.length} new promises`);
  return [...existing, ...added];
}

// ── 2. Resolution pass (deterministic, free) ──────────────────────
async function resolveAll(promises) {
  const bench = await fetch(`${API}/api/benchmark-data`).then(r => r.json());
  const { resolveStatus } = await import("../lib/promises.ts");
  const now = new Date();

  for (const p of promises) {
    const t = p.target;
    if (!t.metricKey || t.targetValue == null || !bench.metrics?.[t.metricKey]) {
      p.resolution = {
        status: "unresolvable", actualValue: null, progressPct: null,
        asOf: now.toISOString().slice(0, 10),
        evidence: p.unresolvableReason || "No official series measures this promise as stated.",
        evaluatedAt: now.toISOString(), source: "—",
      };
      continue;
    }
    const md = bench.metrics[t.metricKey];
    const series = md.series.find(s => s.id === (p.admin || "trump2")) || md.series.find(s => s.current);
    const pts = [...(series?.data || [])].sort((a, b) => a.month - b.month);
    if (!pts.length) { p.resolution = { status: "pending", actualValue: null, progressPct: null, asOf: "—", evidence: "No observations yet for this term.", evaluatedAt: now.toISOString(), source: "FRED" }; continue; }

    const baseline = pts[0].value;         // value at the start of the term
    const actual = pts[pts.length - 1].value;
    const deadlinePassed = t.deadline ? new Date(t.deadline) < now : false;
    const { status, progressPct } = resolveStatus({ target: t, baseline, actual, deadlinePassed });

    const unit = md.unit === "%" ? "%" : md.unit === "M" ? "M" : md.unit === "$" ? "$" : "";
    p.resolution = {
      status, actualValue: actual, progressPct,
      asOf: `month ${pts[pts.length - 1].month} of the term`,
      evidence: t.kind === "cumulative_change"
        ? `${md.label}: ${baseline}${unit} at the start of the term → ${actual}${unit} now (${(actual - baseline) >= 0 ? "+" : ""}${(actual - baseline).toFixed(1)}${unit} of a promised ${t.direction === "decrease" ? "−" : "+"}${t.targetValue}${unit}).`
        : `${md.label} is ${actual}${unit} versus a promised ${t.direction === "decrease" ? "≤" : "≥"}${t.targetValue}${unit} (was ${baseline}${unit} when the term began).`,
      evaluatedAt: now.toISOString(),
      source: "FRED via Vote Unbiased benchmark data",
    };
  }
  return promises;
}

const existing = await loadExisting();
let promises = existing.promises || [];
if (DO_EXTRACT) promises = await extractFromSpeeches(promises);
promises = await resolveAll(promises);
promises.sort((a, b) => (b.spokenAt || "").localeCompare(a.spokenAt || ""));

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  method: "Promises are captured verbatim from official speeches and live coverage, then scored by deterministic arithmetic against FRED-backed series. We report whether the NUMBER was reached — not whether the speaker caused it.",
  promises,
}, null, 1));
const counts = promises.reduce((a, p) => { a[p.resolution.status] = (a[p.resolution.status] || 0) + 1; return a; }, {});
console.error(`promises: ${promises.length} →`, counts);
