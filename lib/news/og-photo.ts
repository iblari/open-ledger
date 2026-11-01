/** The story photo as a data URI (satori only draws PNG/JPEG/GIF); tries the chosen photo, then its backups. */
export async function photoData(cands: { url: string; name: string }[]): Promise<{ src: string; name: string } | null> {
  for (const { url: u, name } of cands) {
    if (!/^https:\/\//.test(u)) continue;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0 (compatible; VoteUnbiasedBot/1.0; +https://voteunbiased.org)" } });
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!r.ok || !/^image\/(jpeg|png|gif)$/.test(type)) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 8_000 || buf.byteLength > 4_000_000) continue;
      return { src: `data:${type};base64,${Buffer.from(buf).toString("base64")}`, name };
    } catch { /* try the next one */ }
  }
  return null;
}
