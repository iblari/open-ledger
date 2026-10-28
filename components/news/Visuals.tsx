import { blindspotLabel, type Story } from "@/lib/news/engine";
import { OUTLET_BY_ID } from "@/lib/news/outlets";
import { LEAN_COLOR } from "./NewsChrome";

/**
 * News visuals we draw ourselves from our own data: no article photos.
 * Server-rendered SVG, so they cost nothing to load.
 */
const SIDE = ["left", "center", "right"] as const;
const NAME = { left: "Left outlets", center: "Center", right: "Right outlets" };

/** Share of each side's outlets that covered the story. */
export function CoverageGraphic({ s, compact = false }: { s: Story; compact?: boolean }) {
  const W = compact ? 300 : 360, H = s.blindspot ? (compact ? 128 : 150) : (compact ? 108 : 128), bx = compact ? 96 : 110, bw = W - bx - 20, gap = compact ? 22 : 26, top = compact ? 34 : 42;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Covered by ${Math.round(s.rate.left * 100)}% of left-leaning, ${Math.round(s.rate.center * 100)}% of center and ${Math.round(s.rate.right * 100)}% of right-leaning outlets`}
      style={{ display: "block", background: "#fff", border: "1px solid #E2DED6", borderRadius: 12 }}>
      <text x={16} y={compact ? 20 : 24} fontSize={10.5} fill="#8C8479" letterSpacing="0.08em">WHO COVERED IT</text>
      {SIDE.map((l, i) => {
        const y = top + i * gap, v = s.rate[l], w = Math.max(v > 0 ? 4 : 0, v * bw);
        return (
          <g key={l}>
            <text x={16} y={y + 11} fontSize={compact ? 11 : 12} fill="#5c5856">{NAME[l]}</text>
            <rect x={bx} y={y} width={bw} height={compact ? 13 : 15} rx={4} fill="#EFEBE4" />
            {w > 0 && <rect x={bx} y={y} width={w} height={compact ? 13 : 15} rx={4} fill={LEAN_COLOR[l]} />}
            <text x={bx + w + 7} y={y + 11} fontSize={compact ? 11 : 12} fontWeight={600} fill="#14110E">{Math.round(v * 100)}%</text>
          </g>
        );
      })}
      {s.blindspot && (
        <g>
          <rect x={16} y={top + 3 * gap + 2} width={compact ? 236 : 250} height={20} rx={10} fill="#EEECF6" />
          <text x={27} y={top + 3 * gap + 16} fontSize={11} fontWeight={600} fill="#4D3E8F">Blindspot: {blindspotLabel(s.blindspot)!.toLowerCase()}</text>
        </g>
      )}
    </svg>
  );
}

/** One dot per outlet that covered it, by side. Fits any story. */
export function DotThumb({ s, w = 96, h = 64 }: { s: Story; w?: number; h?: number }) {
  const rows = SIDE.map(l => s.coverage[l]);
  const per = 10, r = 3.6, dx = 8.4;
  return (
    <svg viewBox={`0 0 96 64`} width={w} height={h} role="img" aria-label={`${s.coverage.left} left, ${s.coverage.center} center, ${s.coverage.right} right-leaning outlets`} style={{ display: "block", borderRadius: 8, flex: "none" }}>
      <rect width={96} height={64} fill="#F3EFE8" />
      {SIDE.map((l, i) => {
        const n = rows[i], show = Math.min(n, per);
        return (
          <g key={l}>
            {Array.from({ length: show }, (_, j) => <circle key={j} cx={10 + j * dx} cy={16 + i * 16} r={r} fill={LEAN_COLOR[l]} />)}
            {n === 0 && <circle cx={10} cy={16 + i * 16} r={r} fill="none" stroke={LEAN_COLOR[l]} strokeWidth={1.2} />}
            {n > per && <text x={10 + per * dx - 2} y={19 + i * 16} fontSize={8} fill="#5c5856">+{n - per}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** The official series behind a data story, ending at the latest figure. */
export function DataThumb({ points, value, unit, w = 96, h = 64 }: { points: number[]; value: number; unit: string; w?: number; h?: number }) {
  const lo = Math.min(...points), hi = Math.max(...points), rng = hi - lo || 1;
  const xy = points.map((v, i) => [6 + (i / Math.max(1, points.length - 1)) * 84, 54 - ((v - lo) / rng) * 30] as const);
  const last = xy[xy.length - 1];
  return (
    <svg viewBox="0 0 96 64" width={w} height={h} role="img" aria-label={`Official figure ${value}${unit}`} style={{ display: "block", borderRadius: 8, flex: "none" }}>
      <rect width={96} height={64} fill="#E6F1EF" />
      <polyline points={xy.map(p => p.join(",")).join(" ")} fill="none" stroke="#0E7477" strokeWidth={2.2} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill="#0E7477" />
      <text x={6} y={16} fontSize={12.5} fontWeight={700} fill="#0E5E61">{value}{unit}</text>
    </svg>
  );
}

/** Outlet site icons, served through /api/news/icon. */
export function OutletIcons({ ids, max = 6, size = 18 }: { ids: string[]; max?: number; size?: number }) {
  const uniq = [...new Set(ids)];
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {uniq.slice(0, max).map((id, i) => {
        const o = OUTLET_BY_ID.get(id);
        if (!o) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={id} src={`/api/news/icon?d=${o.domain}`} alt={o.name} title={o.name} width={size} height={size} loading="lazy"
            style={{ width: size, height: size, borderRadius: 5, background: "#fff", border: "1px solid #E2DED6", marginLeft: i ? 3 : 0, objectFit: "cover", padding: 1 }} />
        );
      })}
      {uniq.length > max && <span style={{ fontSize: 11.5, color: "#5c5856", marginLeft: 5 }}>+{uniq.length - max}</span>}
    </span>
  );
}
