/**
 * GET /og/v/{key}.mp4 — og:video files, served from the `og-media` branch
 * (rendered by .github/workflows/og-videos.yml).
 *
 * Range requests are answered with 206 partial content: Safari and iMessage
 * won't play a video without them. A claim with no clip yet falls back to
 * the branded loop, so the tag on a claim page is always valid.
 */
export const runtime = "nodejs";
const RAW = "https://raw.githubusercontent.com/iblari/open-ledger/og-media/v/";

async function load(name: string): Promise<ArrayBuffer | null> {
  // Metric clips change when new data lands; claim clips don't.
  const r = await fetch(RAW + name, { next: { revalidate: name.startsWith("m-") ? 300 : 3600 } });
  return r.ok ? r.arrayBuffer() : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-z0-9_-]{1,40}\.mp4$/i.test(file)) return new Response("not found", { status: 404 });
  const buf = (await load(file)) ?? (file !== "brand.mp4" ? await load("brand.mp4") : null);
  const short = file.startsWith("m-");
  if (!buf) return new Response("not found", { status: 404 });
  const size = buf.byteLength;
  const base = {
    "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
    "Cache-Control": short ? "public, max-age=300, s-maxage=300" : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  };
  const m = (req.headers.get("range") || "").match(/bytes=(\d*)-(\d*)/);
  if (m) {
    let start = m[1] ? parseInt(m[1]) : size - parseInt(m[2] || "0");
    let end = m[1] && m[2] ? parseInt(m[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(buf, { status: 200, headers: { ...base, "Content-Length": String(size) } });
}

export async function HEAD(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
