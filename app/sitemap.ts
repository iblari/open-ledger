import type { MetadataRoute } from "next";
import { getLedger } from "@/lib/live-kv";
import { claimPath } from "@/lib/claim-link";
import { toVerdict } from "@/lib/live-design";
import { METRICS, ADMINS, SITE } from "@/lib/seo-catalog";
import { getBench } from "@/lib/seo-bench";
import { getBroadcastRecaps } from "@/lib/broadcast-pages";
import { STATES } from "@/lib/midterms";

// Every clean, indexable page: hubs, the benchmark and economy pages (only
// administration × measure pairs that have data), broadcast recaps, and one
// page per settled fact-check.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const u = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly", lastModified: Date = now) =>
    ({ url: `${SITE}${path}`, lastModified, changeFrequency, priority });
  const pages: MetadataRoute.Sitemap = [
    u("/", 1, "daily"), u("/dashboard", 0.9), u("/live", 0.8, "daily"), u("/benchmark", 0.9, "daily"),
    u("/economy", 0.8), u("/broadcasts", 0.8, "daily"), u("/methodology", 0.6, "monthly"), u("/trending", 0.7, "daily"), u("/vote", 0.8, "daily"),
    ...STATES.map(s => u(`/vote/${s.st.toLowerCase()}`, 0.7, "daily")),
    ...METRICS.map(m => u(`/benchmark/${m.slug}`, 0.8, "daily")),
    ...ADMINS.map(a => u(`/economy/${a.slug}`, 0.7)),
  ];
  const bench = await getBench().catch(() => null);
  for (const a of ADMINS) for (const m of METRICS) {
    const s = bench?.metrics[m.key]?.series.find(x => x.id === a.id);
    if (!bench || (s && s.data.length > 1)) pages.push(u(`/economy/${a.slug}/${m.slug}`, 0.6, a.id === "trump2" ? "daily" : "monthly"));
  }
  try {
    for (const b of await getBroadcastRecaps()) pages.push(u(`/broadcasts/${b.slug}`, 0.6, "monthly", new Date(b.date)));
  } catch { /* KV down */ }
  try {
    const seen = new Set<string>();
    for (const e of await getLedger()) for (const c of e.claims) {
      if (!c.quote || !toVerdict(c.rating)) continue;
      const p = claimPath(e.videoId, c.quote);
      if (seen.has(p)) continue; seen.add(p);
      pages.push(u(p, 0.5, "monthly", new Date(e.endedAt || e.startedAt)));
    }
  } catch { /* KV down: the core pages are still a valid sitemap */ }
  return pages;
}
