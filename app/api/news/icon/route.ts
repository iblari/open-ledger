import { OUTLETS } from "@/lib/news/outlets";

/**
 * GET /api/news/icon?d=nytimes.com — an outlet's site icon, served from our
 * domain so readers' browsers don't call a third party. Only outlets we read.
 */
const ALLOWED = new Set(OUTLETS.map(o => o.domain));
export const revalidate = 604800;

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d") || "";
  if (!ALLOWED.has(d)) return new Response("unknown outlet", { status: 404 });
  for (const src of [`https://www.google.com/s2/favicons?domain=${d}&sz=64`, `https://${d}/favicon.ico`]) {
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(6000), next: { revalidate: 604800 } });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) {
        return new Response(await r.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable" } });
      }
    } catch { /* next source */ }
  }
  return new Response(null, { status: 404 });
}
