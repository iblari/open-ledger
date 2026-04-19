"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { geoOrthographic, geoPath, geoGraticule, geoDistance, geoCircle } from "d3-geo";
import { feature } from "topojson-client";
import {
  THEATERS,
  ASSET_TYPES,
  ALERT_COLORS,
  POSTURE_RANGES,
  type PostureAsset,
  type AssetType,
  type AlertLevel,
} from "@/lib/abroad-data";

/* ── Design tokens ── */
function getGlobeColors(dark: boolean) {
  return dark ? {
    ocean: "#1a2a35", land: "#2a2620", landStroke: "#3a3630", graticule: "#3a3630",
    bg: "#111111", ink: "#e8e4df", sub: "#a09a94", mute: "#6b6560",
    rule: "#2a2725", accent: "#e05a50", paper: "#1e1c1a",
    gradCenter: "#1e2a30", gradEdge: "#0e1820", labelHalo: "#1a2a35",
    containerBg: "#1a1a1a", zoomBtnBg: "#2a2725", zoomBtnBorder: "#3a3630",
    zoomBtnColor: "#e8e4df", markerStroke: "#111",
    shadow: "rgba(0,0,0,0.25)",
  } : {
    ocean: "#dce8f0", land: "#e8e2d8", landStroke: "#c4bfb4", graticule: "#c4bfb4",
    bg: "#f8f5f0", ink: "#1a1a1a", sub: "#5c5856", mute: "#9a9490",
    rule: "#e2ded6", accent: "#b8372d", paper: "#f3ede5",
    gradCenter: "#f5f0e8", gradEdge: "#b8ccd6", labelHalo: "#f5f0e8",
    containerBg: "#fff", zoomBtnBg: "#fff", zoomBtnBorder: "#e2ded6",
    zoomBtnColor: "#1a1a1a", markerStroke: "#fff",
    shadow: "rgba(0,0,0,0.12)",
  };
}

/* ── Types ── */
export type GlobeViewProps = {
  assets: PostureAsset[];
  theater: string;
  assetTypes: Record<string, boolean>;
  selected: PostureAsset | null;
  onSelect: (asset: PostureAsset | null) => void;
  showRanges?: boolean;
  mob?: boolean;
  dark?: boolean;
};

/* ── Cached world data ── */
let worldCache: any = null;
let worldPromise: Promise<any> | null = null;

function loadWorld(): Promise<any> {
  if (worldCache) return Promise.resolve(worldCache);
  if (worldPromise) return worldPromise;
  worldPromise = fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json")
    .then((r) => r.json())
    .then((topo) => {
      worldCache = feature(topo, topo.objects.land);
      return worldCache;
    });
  return worldPromise;
}

/* ── Country labels with tiers ── */
const COUNTRY_LABELS: { name: string; lat: number; lon: number; size?: number; tier: 1 | 2 | 3 }[] = [
  // Tier 1 — always visible
  { name: "United States", lat: 39, lon: -98, size: 1.1, tier: 1 },
  { name: "Russia", lat: 60, lon: 100, size: 1.2, tier: 1 },
  { name: "China", lat: 35, lon: 103, size: 1.1, tier: 1 },
  { name: "India", lat: 22, lon: 78, size: 1, tier: 1 },
  { name: "Brazil", lat: -10, lon: -52, size: 1.1, tier: 1 },
  { name: "Canada", lat: 56, lon: -96, size: 1, tier: 1 },
  { name: "Australia", lat: -25, lon: 134, size: 1.1, tier: 1 },
  // Tier 2 — zoom >= 1.15
  { name: "Japan", lat: 36, lon: 138, tier: 2 },
  { name: "Germany", lat: 51, lon: 10, tier: 2 },
  { name: "UK", lat: 54, lon: -2, tier: 2 },
  { name: "France", lat: 46, lon: 2, tier: 2 },
  { name: "Turkey", lat: 39, lon: 35, tier: 2 },
  { name: "Saudi Arabia", lat: 24, lon: 45, tier: 2 },
  { name: "Iran", lat: 33, lon: 53, tier: 2 },
  { name: "South Korea", lat: 36, lon: 128, tier: 2 },
  { name: "Mexico", lat: 23, lon: -102, tier: 2 },
  { name: "Indonesia", lat: -3, lon: 117, tier: 2 },
  { name: "Poland", lat: 52, lon: 20, tier: 2 },
  { name: "Ukraine", lat: 49, lon: 32, tier: 2 },
  { name: "Egypt", lat: 26, lon: 30, tier: 2 },
  { name: "Argentina", lat: -35, lon: -64, tier: 2 },
  // Tier 3 — zoom >= 1.8
  { name: "Italy", lat: 42, lon: 12, tier: 3 },
  { name: "Spain", lat: 40, lon: -4, tier: 3 },
  { name: "Norway", lat: 64, lon: 10, tier: 3 },
  { name: "Greece", lat: 39, lon: 22, tier: 3 },
  { name: "Iraq", lat: 33, lon: 44, tier: 3 },
  { name: "Syria", lat: 35, lon: 38, tier: 3 },
  { name: "Israel", lat: 31, lon: 35, tier: 3 },
  { name: "Jordan", lat: 31, lon: 36.5, tier: 3 },
  { name: "Kuwait", lat: 29.5, lon: 48, tier: 3 },
  { name: "Qatar", lat: 25.3, lon: 51.2, tier: 3 },
  { name: "Bahrain", lat: 26, lon: 50.5, tier: 3 },
  { name: "Philippines", lat: 13, lon: 122, tier: 3 },
  { name: "Taiwan", lat: 23.5, lon: 121, tier: 3 },
  { name: "North Korea", lat: 40, lon: 127, tier: 3 },
  { name: "Iceland", lat: 65, lon: -19, tier: 3 },
  { name: "Colombia", lat: 4, lon: -73, tier: 3 },
  { name: "Nigeria", lat: 10, lon: 8, tier: 3 },
  { name: "South Africa", lat: -30, lon: 25, tier: 3 },
  { name: "Kenya", lat: 0, lon: 38, tier: 3 },
  { name: "Libya", lat: 27, lon: 17, tier: 3 },
  { name: "Algeria", lat: 28, lon: 2, tier: 3 },
  { name: "Guam", lat: 13.5, lon: 144.8, tier: 3 },
  { name: "Greenland", lat: 72, lon: -40, tier: 3 },
  { name: "Cuba", lat: 22, lon: -79, tier: 3 },
];

/* ── Lerp helper ── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ── Component ── */
export default function GlobeView({ assets, theater, assetTypes, selected, onSelect, showRanges = false, mob, dark = false }: GlobeViewProps) {
  const C = getGlobeColors(dark);
  const zoomBtnStyle = makeZoomBtnStyle(C);
  const svgRef = useRef<SVGSVGElement>(null);
  const [world, setWorld] = useState<any>(null);
  const [rotation, setRotation] = useState<[number, number, number]>([0, -20, 0]);
  const [scale, setScale] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number; vx: number; vy: number }>({
    dragging: false, lastX: 0, lastY: 0, vx: 0, vy: 0,
  });
  const rotRef = useRef(rotation);
  rotRef.current = rotation;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const autoRef = useRef(autoRotate);
  autoRef.current = autoRotate;
  const animRef = useRef<number>(0);

  // Container sizing
  const [dims, setDims] = useState({ w: 400, h: 400 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const s = Math.min(rect.width - 40, 500); // subtract padding
        setDims({ w: s, h: s });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Load world data
  useEffect(() => {
    loadWorld().then(setWorld);
  }, []);

  // Theater animation
  const prevTheater = useRef(theater);
  useEffect(() => {
    if (prevTheater.current === theater) return;
    prevTheater.current = theater;
    const th = THEATERS.find((t) => t.id === theater);
    if (!th) return;
    const target: [number, number, number] = [-th.center[0], -th.center[1], 0];
    const start = [...rotRef.current] as [number, number, number];
    const duration = 400;
    const t0 = performance.now();
    const animate = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setRotation([
        lerp(start[0], target[0], ease),
        lerp(start[1], target[1], ease),
        lerp(start[2], target[2], ease),
      ]);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [theater]);

  // Auto-rotate + inertia loop
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      const d = dragRef.current;
      if (!d.dragging && (Math.abs(d.vx) > 0.01 || Math.abs(d.vy) > 0.01)) {
        setRotation((r) => [r[0] + d.vx, Math.max(-89, Math.min(89, r[1] - d.vy)), r[2]]);
        d.vx *= 0.92;
        d.vy *= 0.92;
      }
      if (autoRef.current && !d.dragging) {
        setRotation((r) => [r[0] + 0.25, r[1], r[2]]);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Build projection
  const baseScale = (Math.min(dims.w, dims.h) / 2 - 10);
  const projection = geoOrthographic()
    .rotate(rotation)
    .scale(baseScale * scale)
    .translate([dims.w / 2, dims.h / 2])
    .clipAngle(90);

  const path = geoPath(projection);
  const graticule = geoGraticule().step([30, 30]);

  // Visibility check
  const isVisible = useCallback((lon: number, lat: number): boolean => {
    const center = projection.invert!([dims.w / 2, dims.h / 2]);
    if (!center) return false;
    const d = geoDistance([lon, lat], center);
    return d < Math.PI / 2;
  }, [rotation, scale, dims]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    d.dragging = true;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.vx = 0;
    d.vy = 0;
    (e.target as SVGSVGElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    const sens = 0.3 / scaleRef.current;
    d.vx = dx * sens;
    d.vy = dy * sens;
    setRotation((r) => [r[0] + dx * sens, Math.max(-89, Math.min(89, r[1] - dy * sens)), r[2]]);
    d.lastX = e.clientX;
    d.lastY = e.clientY;
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.7, Math.min(4.5, s * (1 - e.deltaY * 0.001))));
  }, []);

  // Filter assets
  const visibleAssets = assets.filter((a) => {
    if (!assetTypes[a.type]) return false;
    if (theater !== "ALL" && a.theater !== theater) return false;
    return true;
  });

  // Center coords
  const centerCoords = projection.invert!([dims.w / 2, dims.h / 2]);
  const centerLat = centerCoords ? centerCoords[1].toFixed(1) : "0";
  const centerLon = centerCoords ? centerCoords[0].toFixed(1) : "0";

  // Radius of projected globe
  const globeR = baseScale * scale;

  // Unique SVG IDs
  const gradId = "globe-grad-" + dims.w;
  const shadowId = "globe-shadow-" + dims.w;
  const pulseId = "pulse-ring";

  return (
    <div
      ref={containerRef}
      style={{
        background: C.containerBg,
        border: `1px solid ${C.rule}`,
        borderRadius: 4,
        padding: 20,
        position: "relative",
        boxShadow: dark ? "0 1px 3px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Compass readout — top-left */}
      <div style={{
        position: "absolute", top: 8, left: 12, zIndex: 2,
        fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.mute,
        letterSpacing: 0.3,
      }}>
        {centerLat}&deg;{Number(centerLat) >= 0 ? "N" : "S"}, {centerLon}&deg;{Number(centerLon) >= 0 ? "E" : "W"}
      </div>

      {/* Globe hint — bottom-left */}
      <div style={{
        position: "absolute", bottom: 8, left: 12, zIndex: 2,
        fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.mute,
        letterSpacing: 0.2,
      }}>
        Drag &middot; scroll to zoom &middot; click a marker
      </div>

      {/* Zoom controls — bottom-right */}
      <div style={{
        position: "absolute", bottom: 8, right: 12, zIndex: 2,
        display: "flex", flexDirection: "column", gap: 2, alignItems: "center",
      }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.mute, marginBottom: 2 }}>
          {scale.toFixed(1)}x
        </span>
        <button onClick={() => setScale((s) => Math.min(4.5, s * 1.3))} style={zoomBtnStyle}>+</button>
        <button onClick={() => setScale((s) => Math.max(0.7, s / 1.3))} style={zoomBtnStyle}>&minus;</button>
        <button onClick={() => { setRotation([0, -20, 0]); setScale(1); }} style={{ ...zoomBtnStyle, fontSize: 9 }}>&#8634;</button>
      </div>

      {/* SVG Globe */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        width="100%"
        height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        style={{
          display: "block",
          cursor: dragRef.current.dragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <defs>
          {/* Radial gradient for sphere — cream center, darker edges */}
          <radialGradient id={gradId} cx="40%" cy="35%" r="55%">
            <stop offset="0%" stopColor={C.gradCenter} />
            <stop offset="60%" stopColor={C.ocean} />
            <stop offset="100%" stopColor={C.gradEdge} />
          </radialGradient>
          {/* Shadow overlay */}
          <radialGradient id={shadowId} cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="transparent" />
            <stop offset="100%" stopColor={C.shadow} />
          </radialGradient>
          {/* Pulse animation for high/critical markers */}
          <style>{`
            @keyframes ${pulseId} {
              0% { r: 8; opacity: 0.5; }
              100% { r: 16; opacity: 0; }
            }
          `}</style>
        </defs>

        {/* Ocean sphere with gradient */}
        <circle cx={dims.w / 2} cy={dims.h / 2} r={globeR} fill={`url(#${gradId})`} />

        {/* Land */}
        {world && (
          <path d={path(world) || ""} fill={C.land} stroke={C.landStroke} strokeWidth={0.5} />
        )}

        {/* Graticule */}
        <path d={path(graticule()) || ""} fill="none" stroke={C.graticule} strokeWidth={0.3} opacity={0.25} />

        {/* Range rings (over land, under markers) */}
        {showRanges && visibleAssets.map((a) => {
          const range = POSTURE_RANGES[a.type];
          if (!range) return null;
          const radiusDeg = (range.km / 6371) * (180 / Math.PI);
          const circle = geoCircle().center([a.lon, a.lat]).radius(radiusDeg)();
          const d = path(circle);
          if (!d) return null;
          const color = ALERT_COLORS[a.alert];
          const isSel = selected?.id === a.id;
          return (
            <path key={`rng-${a.id}`} d={d}
              fill={color} fillOpacity={isSel ? 0.08 : 0.05}
              stroke={color} strokeWidth={isSel ? 1.2 : 0.8}
              strokeDasharray="2 3" strokeOpacity={isSel ? 0.85 : 0.5}
              pointerEvents="none" />
          );
        })}

        {/* Shadow overlay on sphere */}
        <circle cx={dims.w / 2} cy={dims.h / 2} r={globeR} fill={`url(#${shadowId})`} pointerEvents="none" />

        {/* Rim outline */}
        <circle cx={dims.w / 2} cy={dims.h / 2} r={globeR} fill="none" stroke={C.landStroke} strokeWidth={1} />

        {/* Country labels — tiered */}
        {COUNTRY_LABELS.map((c) => {
          // Tier visibility
          if (c.tier === 2 && scale < 1.15) return null;
          if (c.tier === 3 && scale < 1.8) return null;
          if (!isVisible(c.lon, c.lat)) return null;
          const pt = projection([c.lon, c.lat]);
          if (!pt) return null;
          const center = projection.invert!([dims.w / 2, dims.h / 2]);
          const d = center ? geoDistance([c.lon, c.lat], center) : 0;
          const edgeFade = Math.max(0, 1 - (d / (Math.PI / 2)) * 1.8 + 0.8);
          const opacity = Math.min(0.5, edgeFade * 0.5);
          const sz = (c.size || 0.85) * Math.min(10, 7 + scale * 0.8);
          return (
            <text
              key={`lbl-${c.name}`}
              x={pt[0]}
              y={pt[1]}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: sz,
                fontFamily: "'Source Serif 4','Georgia',serif",
                fontWeight: 600,
                fill: C.ink,
                opacity,
                pointerEvents: "none",
                userSelect: "none",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                paintOrder: "stroke",
                stroke: C.labelHalo,
                strokeWidth: 2.5,
                strokeLinejoin: "round",
              }}
            >
              {c.name}
            </text>
          );
        })}

        {/* Asset markers */}
        {visibleAssets.map((asset) => {
          if (!isVisible(asset.lon, asset.lat)) return null;
          const pt = projection([asset.lon, asset.lat]);
          if (!pt) return null;
          const color = ALERT_COLORS[asset.alert];
          const glyph = ASSET_TYPES[asset.type].glyph;
          const isSel = selected?.id === asset.id;
          const isHighAlert = asset.alert === "high" || asset.alert === "critical";
          const r = isSel ? 10 : 7;

          return (
            <g
              key={`asset-${asset.id}`}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(isSel ? null : asset);
              }}
            >
              {/* Pulsing outer ring for high/critical */}
              {isHighAlert && !isSel && (
                <circle
                  cx={pt[0]}
                  cy={pt[1]}
                  r={8}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={0.6}
                  style={{
                    animation: `${pulseId} 2s ease-out infinite`,
                  }}
                />
              )}
              {/* Selected ring */}
              {isSel && (
                <circle cx={pt[0]} cy={pt[1]} r={r + 4} fill="none" stroke={color} strokeWidth={2} opacity={0.4} />
              )}
              {/* Filled circle background */}
              <circle cx={pt[0]} cy={pt[1]} r={r} fill={color} stroke={C.markerStroke} strokeWidth={1.2} />
              {/* Glyph character */}
              <text
                x={pt[0]}
                y={pt[1]}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontSize: isSel ? 9 : 7,
                  fontFamily: "'DM Sans',sans-serif",
                  fontWeight: 700,
                  fill: "#fff",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {glyph}
              </text>
              {/* Label above selected marker */}
              {isSel && (
                <text
                  x={pt[0]}
                  y={pt[1] - r - 6}
                  textAnchor="middle"
                  style={{
                    fontSize: 9,
                    fontFamily: "'DM Sans',sans-serif",
                    fontWeight: 700,
                    fill: C.ink,
                    pointerEvents: "none",
                    paintOrder: "stroke",
                    stroke: C.containerBg,
                    strokeWidth: 3,
                    strokeLinejoin: "round",
                  }}
                >
                  {asset.short}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Zoom button style factory ── */
function makeZoomBtnStyle(colors: ReturnType<typeof getGlobeColors>): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 4,
    border: `1px solid ${colors.zoomBtnBorder}`,
    background: colors.zoomBtnBg,
    color: colors.zoomBtnColor,
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    padding: 0,
  };
}
