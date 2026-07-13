import { NextRequest, NextResponse } from "next/server";
import { setTrendsFeed, type TrendsFeed, type TrendItem, type TrendNarrative } from "@/lib/live-kv";

/**
 * POST /api/admin/trends — receives the computed trends from
 * scripts/detect-trends.mjs (auth: ADMIN_KEY), asks Claude to write the
 * why/matters/watch narrative for each, and stores the finished feed in KV.
 *
 * Grounding contract: the model receives every computed number and is
 * instructed to explain them — it never invents figures. Anything it can't
 * ground in the payload it must attribute ("economists attribute…").
 */

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are the analysis desk for Vote Unbiased (voteunbiased.org), a nonpartisan "no spin — you interpret" data site. You receive computed, sourced findings about what changed in America's counties (Census ACS data, methods included).

For EACH trend, write three short fields:
- "why": what drove this change (2-3 sentences). Use ONLY the numbers provided plus well-established economic context (COVID-era migration, 2021-2023 inflation, remote work, mortgage rates). Attribute interpretations ("economists largely attribute...") rather than asserting causation as fact.
- "matters": why a regular reader should care (1-2 sentences, concrete: rent burden, home equity, local tax bases, political implications stated neutrally).
- "watch": what may happen next / what to watch (1-2 sentences, clearly framed as outlook, not prediction).

RULES: never invent a number not in the payload; never use partisan framing; plain language, no jargon; each field under 65 words.
Return ONLY a JSON array: [{"id": "...", "why": "...", "matters": "...", "watch": "..."}] for every trend, same ids.`;

export async function POST(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  const auth = req.headers.get("authorization") || "";
  if (!adminKey || auth !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  let feed: TrendsFeed;
  try {
    feed = (await req.json()) as TrendsFeed;
    if (!Array.isArray(feed.trends) || feed.trends.length === 0) throw new Error("no trends");
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  // ── One Claude call for all narratives ──
  let narratives: Record<string, TrendNarrative> = {};
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        temperature: 0.4,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ asOf: feed.generatedAt, universe: feed.universe, trends: feed.trends.map(t => ({ id: t.id, headline: t.headline, heroStat: t.heroStat, window: t.window, breadth: t.breadth, facts: t.facts, topCounties: t.top.slice(0, 8), method: t.method })) }) }],
      }),
    });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
    const data = await resp.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const jsonStr = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const arr = JSON.parse(jsonStr) as ({ id: string } & TrendNarrative)[];
    narratives = Object.fromEntries(arr.map(n => [n.id, { why: n.why, matters: n.matters, watch: n.watch }]));
  } catch (e) {
    // Feed still ships without narratives rather than failing the refresh.
    console.error("[trends] narrative generation failed:", (e as Error).message);
  }

  const finished: TrendsFeed = {
    ...feed,
    trends: feed.trends.map((t: TrendItem) => ({ ...t, narrative: narratives[t.id] })),
  };
  await setTrendsFeed(finished);
  const narrated = finished.trends.filter(t => t.narrative).length;
  return NextResponse.json({ ok: true, trends: finished.trends.length, narrated });
}
