/**
 * The Vote Unbiased mark: a sprinting cheetah drawn in horizontal data bars,
 * head in red for "live". Speed (real-time checks) built out of data.
 *
 * One geometry, two renderers: <CheetahMark> for the site, and markSvg() for
 * the places that need a plain SVG string (favicons, the link preview).
 * Bar count is a parameter because the mark has to survive from a 1200px
 * share card down to a 16px tab: 7 bars read as a chart at large sizes,
 * 4 bars stay legible in a nav or a favicon.
 */

// Artboard: x 0–240, y 20–100 (aspect 3:1).
export const MARK_VIEWBOX = "0 20 240 80";
export const MARK_ASPECT = 3;

export const BODY =
  "M8 46 C28 50 46 46 62 42 C90 34 120 42 150 40 C162 38 170 34 180 36 C190 36 198 34 204 32 L206 25 L212 31 C217 30 224 35 228 41 L229 45 C224 48 217 49 211 49 C204 52 196 56 190 60 C200 62 214 66 226 70 L238 72 L238 76 L224 75 C210 73 196 72 184 70 C178 80 162 80 150 70 C136 62 124 58 108 58 C96 60 88 64 84 68 L50 84 L22 92 L18 89 L44 80 L70 62 C66 56 64 52 62 50 C46 52 26 55 8 50 Z";
export const FAR_LEGS =
  "M176 66 L204 86 L214 94 L211 97 L200 91 L168 72 Z M92 62 L66 92 L50 99 L49 95 L60 89 L80 60 Z";
export const HEAD =
  "M204 32 L206 25 L212 31 C217 30 224 35 228 41 L229 45 C224 48 217 49 211 49 L204 44 Z";

/**
 * Bar layout. 7 = the drawing as designed (11-unit pitch from y 22).
 * 0 = solid silhouette, for favicons where bar gaps would be sub-pixel.
 */
export function markBars(n: number): { y: number; h: number }[] {
  if (n <= 0) return [{ y: 0, h: 120 }];
  if (n >= 7) return Array.from({ length: 7 }, (_, i) => ({ y: 22 + i * 11, h: 7 }));
  // coarser grids for mid sizes: same span (22–95), thicker bars
  const top = 22, bottom = 95;
  const unit = (bottom - top) / (n * 7 + (n - 1) * 4);
  const h = unit * 7, g = unit * 4;
  return Array.from({ length: n }, (_, i) => ({ y: +(top + i * (h + g)).toFixed(2), h: +h.toFixed(2) }));
}

/** Standalone SVG markup (no <svg> wrapper unless `wrap`). */
export function markSvg({
  ink = "#F5F5F2", accent = "#E0493A", bars = 7, id = "vu", wrap = true, width, height,
}: { ink?: string; accent?: string; bars?: number; id?: string; wrap?: boolean; width?: number; height?: number } = {}) {
  const rects = markBars(bars).map(b => `<rect x="0" y="${b.y}" width="240" height="${b.h}"/>`).join("");
  const inner =
    `<defs><clipPath id="${id}-c">${rects}</clipPath></defs>` +
    `<g clip-path="url(#${id}-c)"><path d="${FAR_LEGS} ${BODY}" fill="${ink}"/><path d="${HEAD}" fill="${accent}"/></g>`;
  if (!wrap) return inner;
  const w = width ?? 240, h = height ?? 80;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${MARK_VIEWBOX}">${inner}</svg>`;
}
