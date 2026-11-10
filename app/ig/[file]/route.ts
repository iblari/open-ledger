import { loadSlide, openParts, slideInfo, SLIDE_ID_RE } from "@/lib/ig-slides";

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
  const notFound = () => new Response("not found", { status: 404, headers: { ...HIDE, "Cache-Control": "no-store" } });
  if (!m || !SLIDE_ID_RE.test(m[1])) return notFound();
  const id = m[1];
  const info = await slideInfo(id).catch(() => null);
  if (!info || info.kind !== m[2].toLowerCase()) return notFound();

  if (info.kind === "mp4") {
    const total = info.bytes;
    const base = { ...HIDE, "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    let start = 0, end = total - 1, partial = false;
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      if (start > end || start >= total) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
      partial = true;
    }
    const headers = { ...base, "Content-Length": String(end - start + 1), ...(partial ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}) };
    const status = partial ? 206 : 200;
    if (req.method === "HEAD") return new Response(null, { status, headers });
    const stream = await openParts(id, start, end).catch(() => null);
    if (stream) return new Response(stream, { status, headers });
  }

  const slide = await loadSlide(id).catch(() => null);
  if (!slide) return notFound();
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

export const HEAD = GET;
