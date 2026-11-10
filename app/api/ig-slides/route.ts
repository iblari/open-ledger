import { NextResponse } from "next/server";
import { memberFor } from "@/lib/team";
import { checkSlide, checkVideo, commitParts, parseUploadId, savePart, saveSlide, slideUrl, sniffKind, SLIDE_MAX_BYTES, UPLOAD_CHUNK_MAX_BYTES } from "@/lib/ig-slides";

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
 *
 * Larger videos (up to 50 MB): chunked upload. POST multipart/form-data once
 * per chunk with `upload_id` (32 hex chars or a UUID), `chunk_index` (0, 1, 2…),
 * `is_final` (true/false) and `file` (up to 4 MB). Chunks are staged in the KV.
 * The request with is_final=true carries the last chunk and commits: it checks
 * chunks 0..chunk_index are all present and returns the public .mp4 URL.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function readUpload(req: Request, form: FormData | null): Promise<Buffer | string> {
  const type = (req.headers.get("content-type") || "").toLowerCase();
  if (form) {
    const f = form.get("file");
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

async function uploadChunk(form: FormData) {
  const id = parseUploadId(form.get("upload_id"));
  if (!id) return fail("upload_id must be 32 hex characters (or a UUID); generate 128 random bits per video", 400);
  const idx = Number(form.get("chunk_index"));
  if (!Number.isInteger(idx) || idx < 0 || idx > 99) return fail("chunk_index must be an integer from 0 to 99", 400);
  const final = ["true", "1"].includes(String(form.get("is_final") ?? "false").toLowerCase());
  const f = form.get("file");
  if (!f || typeof f === "string") return fail("multipart upload needs a `file` field", 400);
  const data = Buffer.from(await f.arrayBuffer());
  if (!data.length) return fail("empty chunk", 400);
  if (data.length > UPLOAD_CHUNK_MAX_BYTES) return fail(`chunk is ${(data.length / 1048576).toFixed(1)} MB; max is 4 MB per chunk`, 413);
  if (idx === 0 && sniffKind(data) !== "mp4") return fail("not an MP4 file (chunk 0 must be the start of the file)", 400);

  try {
    await savePart(id, idx, data);
    if (!final) return NextResponse.json({ upload_id: id, chunk_index: idx, bytes: data.length, committed: false }, { status: 202, headers: { "Cache-Control": "no-store" } });
    const r = await commitParts(id, idx);
    if ("error" in r) return fail(r.error, r.status);
    return NextResponse.json({ url: slideUrl(id, "mp4"), bytes: r.bytes, width: r.width, height: r.height, committed: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail((e as Error).message, 502);
  }
}

export async function POST(req: Request) {
  const h = req.headers.get("authorization");
  const key = h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  if (memberFor(key) !== "john") return fail("bad key", 401);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > SLIDE_MAX_BYTES * 1.4) return fail("body too large; max request size is 4.5 MB (send larger videos in 4 MB chunks, see JOHN.md)", 413);

  let form: FormData | null = null;
  if ((req.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) {
    form = await req.formData().catch(() => null);
    if (!form) return fail("could not read the upload", 400);
    if (form.has("upload_id")) return uploadChunk(form);
  }

  const data = await readUpload(req, form).catch(() => "could not read the upload");
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
