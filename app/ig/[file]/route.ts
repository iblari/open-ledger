import { loadSlide, SLIDE_ID_RE } from "@/lib/ig-slides";

/**
 * GET /ig/{id}.png or /ig/{id}.mp4 — a slide or clip John uploaded. Public so
 * Instagram/Buffer can fetch it, but the id is unguessable, nothing lists it,
 * it is not in the sitemap, and it carries noindex. (No robots.txt Disallow:
 * that would stop Meta's fetcher too.) MP4s support Range requests.
 */
export const dynamic = "force-dynamic";

const HIDE = { "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex" };
const MIME = { png: "image/png", mp4: "video/mp4" } as const;

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-f0-9]{32})\.(png|mp4)$/i.exec(file);
  const slide = m && SLIDE_ID_RE.test(m[1]) ? await loadSlide(m[1]).catch(() => null) : null;
  if (!slide || slide.kind !== m![2].toLowerCase()) return new Response("not found", { status: 404, headers: { ...HIDE, "Cache-Control": "no-store" } });
  const { buf, kind } = slide;
  const base = { ...HIDE, "Content-Type": MIME[kind], "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };

  const range = kind === "mp4" ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "") : null;
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : buf.length - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : buf.length - 1;
    start = Math.max(0, start);
    end = Math.min(end, buf.length - 1);
    if (start > end) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${buf.length}` } });
    const part = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: { ...base, "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${buf.length}` },
    });
  }
  return new Response(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(buf.length) } });
}
