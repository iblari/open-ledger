import { randomBytes } from "node:crypto";
import { kvGet, kvSetMany } from "./live-kv";

/**
 * Private Instagram carousel slides. John uploads a 1080x1350 PNG (or a short
 * H.264 MP4 clip) and gets a public URL Instagram can fetch. Stored in the KV in chunks (the REST API
 * caps request size); the id is 128 random bits and nothing lists the slides.
 */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
/** Vercel functions reject request bodies over 4.5 MB, so that is the real cap. */
export const SLIDE_MAX_BYTES = 4.5 * 1024 * 1024;
const TTL_SEC = 60 * 60 * 24 * 90;
const CHUNK = 400_000;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const SLIDE_ID_RE = /^[a-f0-9]{32}$/;
export type SlideKind = "png" | "mp4";
export const slideUrl = (id: string, kind: SlideKind = "png") => `https://voteunbiased.org/ig/${id}.${kind}`;

/** Sniffs the file type from its first bytes (an MP4 starts with a size, then "ftyp"). */
export function sniffKind(buf: Buffer): SlideKind | null {
  if (buf.length >= 8 && PNG_SIG.every((b, i) => buf[i] === b)) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") return "mp4";
  return null;
}

/** Returns an error message, or null if this is an H.264 MP4 within the size cap. Width/height come from the avc1 sample entry. */
export function checkVideo(buf: Buffer): { error: string } | { width: number; height: number } {
  if (buf.length > SLIDE_MAX_BYTES) return { error: `MP4 is ${(buf.length / 1048576).toFixed(1)} MB; max is 4.5 MB (the platform's request limit)` };
  const at = buf.indexOf("avc1", 0, "ascii");
  if (at < 4 || buf.length < at + 32) return { error: "not an H.264 (avc1) MP4 file" };
  return { width: buf.readUInt16BE(at + 28), height: buf.readUInt16BE(at + 30) };
}

/** Returns an error message, or null if this is a 1080x1350 PNG within the size cap. */
export function checkSlide(buf: Buffer): string | null {
  if (buf.length > SLIDE_MAX_BYTES) return `PNG is ${(buf.length / 1048576).toFixed(1)} MB; max is 4.5 MB`;
  if (buf.length < 33 || PNG_SIG.some((b, i) => buf[i] !== b) || buf.toString("ascii", 12, 16) !== "IHDR") return "not a PNG file";
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== SLIDE_W || h !== SLIDE_H) return `PNG is ${w}x${h}; must be ${SLIDE_W}x${SLIDE_H}`;
  return null;
}

/** Chunked video upload: each request carries up to 4 MB; the finished clip may be up to 50 MB. */
export const UPLOAD_CHUNK_MAX_BYTES = 4 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const SUB = 300_000; // binary bytes per KV value (400,000 base64 chars)
export const UPLOAD_ID_RE = /^[a-f0-9]{32}$/;
const partMetaKey = (id: string, i: number) => `igslide:${id}:p${i}:meta`;
const partKey = (id: string, i: number, j: number) => `igslide:${id}:p${i}:${j}`;

/** Normalises an upload_id (32 hex chars or a UUID) to the 32-hex id the public URL will use; null if invalid. */
export function parseUploadId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const id = v.trim().toLowerCase().replace(/-/g, "");
  return UPLOAD_ID_RE.test(id) ? id : null;
}

/** Stages one chunk of a video upload. Re-sending the same index replaces it. */
export async function savePart(id: string, index: number, data: Buffer): Promise<{ width?: number; height?: number }> {
  const items: [string, string, number][] = [];
  const n = Math.max(1, Math.ceil(data.length / SUB));
  for (let j = 0; j < n; j++) items.push([partKey(id, index, j), data.subarray(j * SUB, (j + 1) * SUB).toString("base64"), TTL_SEC]);
  const at = data.indexOf("avc1", 0, "ascii");
  const dims = at >= 4 && data.length >= at + 32 ? { width: data.readUInt16BE(at + 28), height: data.readUInt16BE(at + 30) } : {};
  items.push([partMetaKey(id, index), JSON.stringify({ n, bytes: data.length, ...dims }), TTL_SEC]);
  await kvSetMany(items);
  return dims;
}

/** Reads the staged chunk 0..last and, if complete and valid, turns them into the final clip. */
export async function commitParts(id: string, last: number): Promise<{ bytes: number; width: number; height: number } | { error: string; status: number }> {
  const [done] = await kvGet([metaKey(id)]);
  if (done) return { error: "this upload_id is already committed", status: 409 };
  const raw = await kvGet(Array.from({ length: last + 1 }, (_, i) => partMetaKey(id, i)));
  const missing = raw.map((r, i) => (r ? -1 : i)).filter(i => i >= 0);
  if (missing.length) return { error: `missing chunk_index ${missing.slice(0, 10).join(", ")}; upload them, then commit again`, status: 400 };
  const parts = raw.map(r => JSON.parse(r as string) as { n: number; bytes: number; width?: number; height?: number });
  const bytes = parts.reduce((a, p) => a + p.bytes, 0);
  if (bytes > VIDEO_MAX_BYTES) return { error: `MP4 is ${(bytes / 1048576).toFixed(1)} MB; max is 50 MB`, status: 413 };
  const [first] = await kvGet([partKey(id, 0, 0)]);
  if (!first || sniffKind(Buffer.from(first, "base64")) !== "mp4") return { error: "not an MP4 file (chunk 0 must be the start of the file)", status: 400 };
  const dim = parts.find(p => p.width && p.height);
  if (!dim) return { error: "not an H.264 (avc1) MP4 file", status: 400 };
  await kvSetMany([[metaKey(id), JSON.stringify({ parts: parts.map(p => ({ n: p.n, bytes: p.bytes })), bytes, kind: "mp4", at: new Date().toISOString() }), TTL_SEC]]);
  return { bytes, width: dim.width!, height: dim.height! };
}

/** Size and type of a stored slide/clip, without reading its bytes. */
export async function slideInfo(id: string): Promise<{ bytes: number; kind: SlideKind } | null> {
  const [rawMeta] = await kvGet([metaKey(id)]);
  if (!rawMeta) return null;
  const { bytes, kind } = JSON.parse(rawMeta) as { bytes: number; kind?: SlideKind };
  return { bytes, kind: kind || "png" };
}

/** Streams bytes [start, end] of a chunk-uploaded clip, reading only the KV values it needs. Null if it isn't one. */
export async function openParts(id: string, start: number, end: number): Promise<ReadableStream<Uint8Array> | null> {
  const [rawMeta] = await kvGet([metaKey(id)]);
  const meta = rawMeta ? (JSON.parse(rawMeta) as { parts?: { n: number; bytes: number }[] }) : null;
  if (!meta?.parts) return null;
  const pieces: { key: string; from: number; to: number }[] = [];
  let off = 0;
  meta.parts.forEach((p, i) => {
    for (let j = 0; j < p.n; j++) {
      const lo = off + j * SUB, hi = Math.min(off + (j + 1) * SUB, off + p.bytes) - 1;
      if (hi >= start && lo <= end) pieces.push({ key: partKey(id, i, j), from: Math.max(start, lo) - lo, to: Math.min(end, hi) - lo });
    }
    off += p.bytes;
  });
  const BATCH = 8;
  let at = 0;
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (at >= pieces.length) return ctrl.close();
      const batch = pieces.slice(at, at + BATCH);
      const vals = await kvGet(batch.map(b => b.key));
      for (let k = 0; k < batch.length; k++) {
        if (vals[k] == null) return ctrl.error(new Error("clip storage is incomplete"));
        ctrl.enqueue(new Uint8Array(Buffer.from(vals[k]!, "base64").subarray(batch[k].from, batch[k].to + 1)));
      }
      at += BATCH;
    },
  });
}

const metaKey = (id: string) => `igslide:${id}:meta`;
const chunkKey = (id: string, i: number) => `igslide:${id}:${i}`;

/** Stores the PNG or MP4 and returns its id; throws if it can't be read back. */
export async function saveSlide(png: Buffer, kind: SlideKind = "png"): Promise<string> {
  const id = randomBytes(16).toString("hex");
  const b64 = png.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  const items: [string, string, number][] = [];
  for (let i = 0; i < n; i++) items.push([chunkKey(id, i), b64.slice(i * CHUNK, (i + 1) * CHUNK), TTL_SEC]);
  items.push([metaKey(id), JSON.stringify({ n, bytes: png.length, kind, at: new Date().toISOString() }), TTL_SEC]);
  await kvSetMany(items);
  if (!(await loadSlide(id))) throw new Error("storage write failed");
  return id;
}

export async function loadSlide(id: string): Promise<{ buf: Buffer; kind: SlideKind } | null> {
  const [rawMeta] = await kvGet([metaKey(id)]);
  if (!rawMeta) return null;
  const { n, bytes, kind } = JSON.parse(rawMeta) as { n?: number; bytes: number; kind?: SlideKind };
  if (n == null) return null;
  const parts = await kvGet(Array.from({ length: n }, (_, i) => chunkKey(id, i)));
  if (parts.some(p => p == null)) return null;
  const buf = Buffer.from(parts.join(""), "base64");
  return buf.length === bytes ? { buf, kind: kind || "png" } : null;
}
