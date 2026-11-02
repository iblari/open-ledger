import { loadSlide, SLIDE_ID_RE } from "@/lib/ig-slides";

/**
 * GET /ig/{id}.png — a carousel slide John uploaded. Public so Instagram can
 * fetch it, but the id is unguessable, nothing lists it, it is not in the
 * sitemap, and it carries noindex. (No robots.txt Disallow: that would stop
 * Meta's fetcher too.)
 */
export const dynamic = "force-dynamic";

const HIDE = { "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex" };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.png$/i, "");
  const png = SLIDE_ID_RE.test(id) ? await loadSlide(id).catch(() => null) : null;
  if (!png) return new Response("not found", { status: 404, headers: { ...HIDE, "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(png), {
    headers: { ...HIDE, "Content-Type": "image/png", "Content-Length": String(png.length), "Cache-Control": "public, max-age=86400" },
  });
}
