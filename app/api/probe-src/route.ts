import { NextResponse } from "next/server";
/** TEMP: can the server reach these official hosts? (removed after testing) */
export const dynamic = "force-dynamic";
const OK = /^https:\/\/(www\.)?(cbp\.gov|ohss\.dhs\.gov|datahub\.io|news\.gallup\.com)\//;
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  if (!OK.test(u)) return NextResponse.json({ error: "host" }, { status: 400 });
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Accept: "*/*" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    const t = await r.text();
    const links = [...t.matchAll(/href="([^"]+\.(?:csv|xlsx)[^"]*)"/gi)].map(m => m[1]).slice(0, 30);
    return NextResponse.json({ status: r.status, url: r.url, len: t.length, head: t.slice(0, 300), links });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }); }
}
