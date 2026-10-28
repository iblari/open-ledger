import { permanentRedirect } from "next/navigation";
import { metricForDash } from "@/lib/seo-catalog";

/**
 * /live-benchmark moved: the monthly benchmark now lives at /benchmark/{metric}
 * (clean, indexable) and inside the dashboard. Server-side 308 so search
 * engines move the ranking signals instead of indexing a JS redirect page.
 */
export default async function LiveBenchmarkRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const m = typeof sp.metric === "string" ? metricForDash(sp.metric) : null;
  permanentRedirect(m ? `/benchmark/${m.slug}` : "/benchmark");
}
