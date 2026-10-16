import { kvGet, kvSetMany } from "./live-kv";
import { CATALOG, CATALOG_BY_ID } from "./series";

/**
 * Which official series a claim should be charted against.
 *
 * A small model reads the claim and our finding and picks ONE entry from the
 * catalog (or none). It never supplies data — only the choice, the countries
 * to compare, the number that was said in the series' unit, and the period
 * the claim is about. Everything drawn comes from the source itself.
 */
export interface ClaimSeries {
  v: 1;
  series: string | null;           // catalog id, null = nothing fits
  countries: string[];             // ISO3, World Bank series only
  said: number | null;             // claimed value IN THE SERIES' UNIT, else null
  saidCountry: string | null;      // which line the said value belongs to (comparisons)
  since: string | null;            // ISO date the claim measures from ("since he took office")
  terms: boolean;                  // claim compares presidents → shade terms
  at: string;
}
export interface ClaimForSeries { key: string; quote: string; rating: string; actual: string; explanation?: string; date: string; claimedValue?: number | null }

const MODEL = "claude-haiku-4-5-20251001";
export const SERIES_KEY = (k: string) => `claim-series:v3:${k}`;

const catalogText = CATALOG.map(s => `${s.id} — ${s.label} [${s.unit}] — fits: ${s.about}`).join("\n");

export async function mapClaimToSeries(c: ClaimForSeries): Promise<ClaimSeries | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const system =
    `You choose which official data series best charts a fact-checked claim. Catalog (id — label [unit] — fits):\n${catalogText}\n\n` +
    `Return JSON: {"series": id or null, "countries": [ISO3...], "said": number or null, "saidCountry": ISO3 or null, "since": "YYYY-MM-DD" or null, "terms": true|false}\n` +
    `Rules:\n` +
    `- Pick the series that directly measures what the claim is about. If none does, "series": null. Don't force a loose fit (one company's investment pledge is not "factory construction"; a single city's crime is not a national series).\n` +
    `- Claims about the US use US series. Claims about other countries, or comparing countries, use a World Bank series with "countries" (the country discussed, plus USA when the claim compares to the US; up to 5).\n` +
    `- "said": the speaker's number converted to the series' unit and transform (e.g. "$1.85 a gallon" on gas → 1.85; "1.7% inflation" on cpi_yoy → 1.7; "300% inflation" in Iran on wb_inflation → 300 with saidCountry IRN). Null when the claim is a change that the series doesn't express directly (e.g. "added 72,000 manufacturing jobs" on mfg_jobs, a level in millions).\n` +
    `- Inflation: use the year-over-year series (cpi_yoy) unless the claim explicitly says "per month" / "last month's" rate.\n` +
    `- "said" must be a value the series itself could take: a level for level series (a % drop or a $ gain on a price index is NOT a said value → null).\n` +
    `- "since": the start date the claim measures from, if it states one ("since the president took office" → 2025-01-20; "under Biden" → 2021-01-20). Else null.\n` +
    `- "terms": true when the claim compares administrations (e.g. "lower than under Biden", "worst inflation, inherited from Biden").\n` +
    `JSON only.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, temperature: 0, system,
      messages: [{ role: "user", content: `Claim (said ${c.date.slice(0, 10)}): "${c.quote}"\nVerdict: ${c.rating}\nFinding: ${c.actual}\n${c.explanation ? `Why: ${c.explanation.slice(0, 400)}` : ""}` }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const j = await r.json();
  const text = (j.content || []).filter((x: { type: string }) => x.type === "text").map((x: { text: string }) => x.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON in series reply");
  const p = JSON.parse(m[0]) as Partial<ClaimSeries> & { series?: string | null };
  // "Inflation" means the annual rate unless the claim says monthly outright
  // ("for the last three months, 1.7%" is an annual-rate claim about recent months).
  if (p.series === "cpi_mom" && !/\b(monthly|per month|a month|month over month|month-over-month|last month)\b/i.test(c.quote)) p.series = "cpi_yoy";
  const def = p.series ? CATALOG_BY_ID.get(p.series) : undefined;
  const iso = (x: unknown) => typeof x === "string" && /^[A-Za-z]{3}$/.test(x) ? x.toUpperCase() : null;
  const countries = def?.wb ? (Array.isArray(p.countries) ? p.countries.map(iso).filter((x): x is string => !!x).slice(0, 5) : []) : [];
  return {
    v: 1,
    series: def ? def.id : null,
    countries: def?.wb && !countries.length ? ["USA"] : countries,
    said: def && typeof p.said === "number" && Number.isFinite(p.said) ? p.said : null,
    saidCountry: def?.wb ? iso(p.saidCountry) : null,
    since: typeof p.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.since) ? p.since : null,
    terms: !!p.terms,
    at: new Date().toISOString(),
  };
}

export async function getClaimSeries(c: ClaimForSeries, build = true): Promise<ClaimSeries | null> {
  const [hit] = await kvGet([SERIES_KEY(c.key)]);
  if (hit) { try { return JSON.parse(hit) as ClaimSeries; } catch { /* rebuild */ } }
  if (!build) return null;
  const s = await mapClaimToSeries(c);
  if (s) await kvSetMany([[SERIES_KEY(c.key), JSON.stringify(s), 0]]).catch(() => {});
  return s;
}
