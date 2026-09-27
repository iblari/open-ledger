import { useId } from "react";
import { BODY, FAR_LEGS, HEAD, MARK_ASPECT, MARK_VIEWBOX, markBars } from "@/lib/cheetah-mark";

/**
 * The cheetah mark (see lib/cheetah-mark.ts). `height` in px; width follows
 * the 3:1 artboard. Small sizes get fewer, thicker bars so it doesn't smear.
 */
export default function CheetahMark({
  height = 20, ink = "currentColor", accent = "#E0493A", bars, title,
  style,
}: { height?: number; ink?: string; accent?: string; bars?: number; title?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const n = bars ?? (height < 14 ? 0 : 7);
  return (
    <svg
      width={Math.round(height * MARK_ASPECT)} height={height} viewBox={MARK_VIEWBOX}
      role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}
    >
      <defs>
        <clipPath id={`${id}c`}>
          {markBars(n).map(b => <rect key={b.y} x={0} y={b.y} width={240} height={b.h} />)}
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <path d={`${FAR_LEGS} ${BODY}`} fill={ink} style={{ transition: "fill .25s ease" }} />
        <path d={HEAD} fill={accent} />
      </g>
    </svg>
  );
}
