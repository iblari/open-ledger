import { test } from "node:test";
import assert from "node:assert/strict";
import { barsProblem, layoutProblem, parseFigure, moneyBars, plainBars, validBars, type ClaimBars } from "../lib/claim-bars-core";
import { claimBars, withDataLine } from "../lib/og-claim-chart";
import type { OgChart } from "../lib/og-chart";
import type { SharedClaim } from "../lib/claim-lookup";

const claim = (key: string, quote: string): SharedClaim => ({
  key, videoId: "v", quote, rating: "false", actual: "", sources: [], title: "t", speaker: null, date: "2026-01-01T00:00:00Z", live: false,
});
const trend = (p: Partial<OgChart>): OgChart => ({
  W: 900, H: 400, path: "", area: "", sayY: null, dot: [0, 0], said: null, value: "", valueDate: "", saidNum: null, valueNum: 0,
  saidRaw: null, unit: "", label: "Metric", source: "Official", from: "", to: "", change: null, ...p,
});
const label = (f: { num: string; word: string }) => `${f.num} ${f.word}`.trim();

function assertCard(b: ClaimBars | null) {
  assert.ok(b, "card should draw bars");
  assert.equal(barsProblem(b), null);
  for (const tall of [true, false]) assert.equal(layoutProblem(b, tall), null, tall ? "portrait" : "square");
  return b;
}

test("c/11498j9: quote figure overrides stored 25,000 (bare digits)", async () => {
  const c = claim("11498j9", "We have created 25,000,000,000,000 in new wealth for American families.");
  const b = assertCard(await claimBars(c, trend({ unit: "$ trillion", saidRaw: 25000, valueNum: 17 })));
  assert.equal(label(b.saidFig), "$25 trillion");
  assert.equal(label(b.dataFig), "$17 trillion");
  assert.ok(b.data / b.said > 0.5);
});

test("c/11498j9: quote written as $25 trillion, and spelled out", async () => {
  for (const q of ["We added $25 trillion in wealth.", "We added twenty-five trillion dollars in wealth.", "We added $25,000,000,000,000 in wealth."]) {
    const b = assertCard(await claimBars(claim("11498j9", q), trend({ unit: "$ trillion", saidRaw: 25000, valueNum: 17 })));
    assert.equal(label(b.saidFig), "$25 trillion", q);
  }
});

test("c/11498j9: same figure stored in $B and $ units", async () => {
  const q = "We have created 25,000,000,000,000 in new wealth.";
  for (const t of [trend({ unit: "$B", saidRaw: 25000, valueNum: 17000 }), trend({ unit: "$", saidRaw: 25000, valueNum: 17e12 })]) {
    const b = assertCard(await claimBars(claim("11498j9", q), t));
    assert.equal(label(b.saidFig), "$25 trillion");
    assert.equal(label(b.dataFig), "$17 trillion");
  }
});

test("c/0eamvf5: $22.2 trillion said vs $304 billion data share one dollar scale", async () => {
  const c = claim("0eamvf5", "We have 22.2 trillion dollars invested in America.");
  const b = assertCard(await claimBars(c, trend({ unit: "$B", saidRaw: 22200, valueNum: 304 })));
  assert.equal(label(b.saidFig), "$22.2 trillion");
  assert.equal(label(b.dataFig), "$304 billion");
});

test("percent claim keeps one unit", async () => {
  const b = assertCard(await claimBars(claim("pct", "Unemployment is 3.5%"), trend({ unit: "%", saidNum: 3.5, said: "3.5%", valueNum: 4.1, value: "4.1%" })));
  assert.equal(b.saidFig.num, "3.5%");
  assert.equal(b.dataFig.num, "4.1%");
});

test("price-per-unit claim keeps one unit", async () => {
  const b = assertCard(await claimBars(claim("gas", "Gas was $1.85 a gallon"), trend({ unit: "$/gal", saidRaw: 1.85, valueNum: 3.1, value: "$3.10/gal" })));
  assert.equal(b.saidFig.num, "$1.85/gal");
  assert.equal(b.dataFig.num, "$3.10/gal");
});

test("count claim in thousands keeps one unit", async () => {
  const b = assertCard(await claimBars(claim("jobs", "We added 300,000 jobs"), trend({ unit: "thousand", saidNum: 300, said: "300 thousand", valueNum: 150, value: "150 thousand" })));
  assert.equal(b.saidFig.word, b.dataFig.word);
});

test("unfixable scale error drops the chart instead of drawing it", async () => {
  const b = await claimBars(claim("x", "We added a lot of wealth."), trend({ unit: "$ trillion", saidRaw: 25000, valueNum: 17 }));
  assert.equal(b, null);
});

test("guard rejects mismatched units, unparsed labels, slivers", () => {
  const ok = moneyBars(25e12, 17e12, "m", "s");
  assert.equal(barsProblem(ok), null);
  assert.match(barsProblem({ ...ok, said: NaN }) ?? "", /unparsed/);
  assert.match(barsProblem({ ...ok, saidFig: { num: "25000", word: "trillion" } }) ?? "", /unparsed|\$|match/);
  assert.match(barsProblem({ ...ok, saidFig: { num: "$25", word: "billion" } }) ?? "", /match/);
  assert.match(barsProblem(plainBars(3.5, 4.1, "3.5%", "4.1 thousand", "%", "m", "s")) ?? "", /unit mismatch/);
  assert.match(barsProblem(moneyBars(2.5e16, 1.7e13, "m", "s")) ?? "", /scale mismatch/);
  assert.equal(validBars(moneyBars(2.5e16, 1.7e13, "m", "s")), null);
  assert.match(layoutProblem(moneyBars(100e12, 0.2e12, "m", "s"), true) ?? "", /sliver/);
  assert.equal(parseFigure({ num: "$25", word: "trillion" }), 25e12);
});

// Sweep over every stored claim when the database is reachable (CI without KV skips it).
test("every stored claim and metric card is clean", { skip: !process.env.UPSTASH_REDIS_REST_URL && !process.env.KV_REST_API_URL }, async () => {
  const kv = await import("../lib/live-kv");
  const { claimHash } = await import("../lib/claim-link");
  const { claimChart } = await import("../lib/og-claim-chart");
  const { getSeries } = await import("../lib/series");
  const { SHARE_METRICS } = await import("../lib/metric-share");
  const { buildOgChart } = await import("../lib/og-chart");
  const fails: string[] = [];

  const recent = await kv.getRecentBroadcasts().catch(() => []);
  const ledger = await kv.getLedgerHealed().catch(() => []);
  const seen = new Set<string>();
  for (const b of [...recent, ...ledger] as { videoId: string; title: string; startedAt: string; claims: { quote: string; rating: string; actual?: string }[] }[]) {
    for (const x of b.claims) {
      const key = claimHash(b.videoId, x.quote);
      if (seen.has(key)) continue;
      seen.add(key);
      const c: SharedClaim = { ...claim(key, x.quote), rating: x.rating, actual: x.actual || "", title: b.title, date: b.startedAt, videoId: b.videoId };
      const t = await claimChart(c, { W: 952, H: 400 });
      const bars = await claimBars(c, t);
      if (!bars) continue;
      const p = barsProblem(bars) || layoutProblem(bars, true) || layoutProblem(bars, false);
      if (p) fails.push(`c/${key}: ${p}`);
    }
  }

  for (const id of SHARE_METRICS) {
    const sd = await getSeries(id).catch(() => null);
    if (!sd) continue;
    const c = buildOgChart(sd, { W: 952, H: 680 });
    if (!c) { fails.push(`m/${id}: no chart`); continue; }
    if (!c.value || /NaN|undefined/.test(c.value + (c.change ?? ""))) fails.push(`m/${id}: unparsed value "${c.value}"`);
  }
  assert.deepEqual(fails, []);
});

test("c/0eamvf5: Data and source come from the feed's dataLine ($232.2 billion, BEA)", async () => {
  const c = { ...claim("0eamvf5", "We have 22.2 trillion dollars invested in America."), actual: "$232.2B actual 2025 FDI per BEA, not the $22.2 trillion claimed. FRED shows a 304B annual rate." };
  const t = withDataLine(c, trend({ unit: "$B", saidRaw: 22200, saidNum: 22200, valueNum: 304, value: "$304B", source: "FRED" }));
  assert.equal(t.value, "$232.2B");
  assert.equal(t.source, "BEA");
  const b = assertCard(await claimBars(c, t));
  assert.equal(label(b.dataFig), "$232.2 billion");
  assert.equal(b.source, "BEA");
});
