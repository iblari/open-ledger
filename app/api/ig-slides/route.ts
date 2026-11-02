import { NextResponse } from "next/server";
import { memberFor } from "@/lib/team";
import { checkSlide, saveSlide, slideUrl, SLIDE_MAX_BYTES } from "@/lib/ig-slides";

/**
 * POST /api/ig-slides — John's private carousel upload (see JOHN.md).
 * Header `Authorization: Bearer <JOHN_KEY>` only (no ?key=, so the key never
 * lands in a URL). Body is one 1080x1350 PNG, sent as any of:
 *   - raw bytes, Content-Type: image/png
 *   - multipart/form-data with a `file` field
 *   - JSON {"image_base64": "..."} (a data: URL prefix is fine)
 * Returns {"url": "https://voteunbiased.org/ig/<id>.png"}.
 */
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function readPng(req: Request): Promise<Buffer | string> {
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (type.startsWith("multipart/form-data")) {
    const f = (await req.formData()).get("file");
    if (!f || typeof f === "string") return "multipart upload needs a `file` field";
    return Buffer.from(await f.arrayBuffer());
  }
  if (type.startsWith("application/json")) {
    const j = (await req.json().catch(() => null)) as { image_base64?: unknown } | null;
    if (typeof j?.image_base64 !== "string") return 'JSON body needs {"image_base64": "..."}';
    return Buffer.from(j.image_base64.replace(/^data:image\/png;base64,/, ""), "base64");
  }
  return Buffer.from(await req.arrayBuffer());
}

export async function POST(req: Request) {
  const h = req.headers.get("authorization");
  const key = h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  if (memberFor(key) !== "john") return fail("bad key", 401);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > SLIDE_MAX_BYTES * 1.4) return fail("body too large; max PNG size is 4.5 MB", 413);

  const png = await readPng(req).catch(() => "could not read the upload");
  if (typeof png === "string") return fail(png, 400);
  const bad = checkSlide(png);
  if (bad) return fail(bad, bad.includes("MB") ? 413 : 400);

  try {
    const id = await saveSlide(png);
    return NextResponse.json({ url: slideUrl(id), bytes: png.length, width: 1080, height: 1350 }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
