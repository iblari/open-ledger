/**
 * The og-media branch's manifest (v/index.json, written by
 * scripts/render-og-videos.mjs): which MP4s exist, and for metric clips the
 * observation date each was rendered from. Lets the share kit hand out a
 * video URL only when the video exists and shows the current number.
 */
const RAW = "https://raw.githubusercontent.com/iblari/open-ledger/og-media/v/index.json";

export interface MediaEntry { date?: string; renderedAt?: string; bytes?: number }
export type MediaManifest = Record<string, MediaEntry>;

export async function getMediaManifest(): Promise<MediaManifest> {
  try {
    const r = await fetch(RAW, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as MediaManifest) : {};
  } catch {
    return {};
  }
}

/** Metrics that get an animated clip (Sam's release-day list). */
export const VIDEO_METRICS = ["cpi_yoy", "cpi_mom", "core_cpi_yoy", "ppi_yoy", "ppi_mom", "gas", "payrolls_chg", "unemployment", "debt"];
export const metricClipName = (id: string) => `m-${id}`;
