import { randomBytes } from "node:crypto";
import { kvGet, kvSetMany } from "./live-kv";

/**
 * Private Instagram carousel slides. John uploads a 1080x1350 PNG and gets a
 * public URL Instagram can fetch. Stored in the KV in chunks (the REST API
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
export const slideUrl = (id: string) => `https://voteunbiased.org/ig/${id}.png`;

/** Returns an error message, or null if this is a 1080x1350 PNG within the size cap. */
export function checkSlide(buf: Buffer): string | null {
  if (buf.length > SLIDE_MAX_BYTES) return `PNG is ${(buf.length / 1048576).toFixed(1)} MB; max is 4.5 MB`;
  if (buf.length < 33 || PNG_SIG.some((b, i) => buf[i] !== b) || buf.toString("ascii", 12, 16) !== "IHDR") return "not a PNG file";
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== SLIDE_W || h !== SLIDE_H) return `PNG is ${w}x${h}; must be ${SLIDE_W}x${SLIDE_H}`;
  return null;
}

const metaKey = (id: string) => `igslide:${id}:meta`;
const chunkKey = (id: string, i: number) => `igslide:${id}:${i}`;

/** Stores the PNG and returns its id; throws if it can't be read back. */
export async function saveSlide(png: Buffer): Promise<string> {
  const id = randomBytes(16).toString("hex");
  const b64 = png.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  const items: [string, string, number][] = [];
  for (let i = 0; i < n; i++) items.push([chunkKey(id, i), b64.slice(i * CHUNK, (i + 1) * CHUNK), TTL_SEC]);
  items.push([metaKey(id), JSON.stringify({ n, bytes: png.length, at: new Date().toISOString() }), TTL_SEC]);
  await kvSetMany(items);
  if (!(await loadSlide(id))) throw new Error("storage write failed");
  return id;
}

export async function loadSlide(id: string): Promise<Buffer | null> {
  const [rawMeta] = await kvGet([metaKey(id)]);
  if (!rawMeta) return null;
  const { n, bytes } = JSON.parse(rawMeta) as { n: number; bytes: number };
  const parts = await kvGet(Array.from({ length: n }, (_, i) => chunkKey(id, i)));
  if (parts.some(p => p == null)) return null;
  const buf = Buffer.from(parts.join(""), "base64");
  return buf.length === bytes ? buf : null;
}
