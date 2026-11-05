import { NextResponse } from "next/server";
import { memberFor } from "@/lib/team";
import { checkSlide, checkVideo, saveSlide, slideUrl, sniffKind, SLIDE_MAX_BYTES } from "@/lib/ig-slides";

/**
 * POST /api/ig-slides — John's private carousel upload (see JOHN.md).
 * Header `Authorization: Bearer <JOHN_KEY>` only (no ?key=, so the key never
 * lands in a URL). Body is one 1080x1350 PNG, sent as any of:
 *   - raw bytes, Content-Type: image/png
 *   - multipart/form-data with a `file` field
 *   - JSON {"image_base64": "..."} (a data: URL prefix is fine)
 * Or one H.264/AAC MP4 clip (raw bytes with Content-Type: video/mp4, or the
 * multipart `file` field); the file type is detected from its bytes.
 * Returns {"url": "https://voteunbiased.org/ig/<id>.png"} (.mp4 for video).
 */
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function readUpload(req: Request): Promise<Buffer | string> {
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
  if (len > SLIDE_MAX_BYTES * 1.4) return fail("body too large; max upload size is 4.5 MB", 413);

  const data = await readUpload(req).catch(() => "could not read the upload");
  if (typeof data === "string") return fail(data, 400);

  let width = 1080, height = 1350;
  const kind = sniffKind(data) ?? "png";
  if (kind === "mp4") {
    const v = checkVideo(data);
    if ("error" in v) return fail(v.error, v.error.includes("MB") ? 413 : 400);
    ({ width, height } = v);
  } else {
    const bad = checkSlide(data);
    if (bad) return fail(bad, bad.includes("MB") ? 413 : 400);
  }

  try {
    const id = await saveSlide(data, kind);
    return NextResponse.json({ url: slideUrl(id, kind), bytes: data.length, width, height }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}
