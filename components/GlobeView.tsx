"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { geoOrthographic, geoPath, geoGraticule, geoDistance, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import { BASES, CSGS, BTF_EVENTS, PERSONNEL_BY_COUNTRY, THEATERS, type Base, type CSG, type BtfEvent } from "@/lib/abroad-data";

/* ── Design tokens (match site T.*) ── */
const C = {
  ocean: "#dce8f0",
  land: "#e8e2d8",
  landStroke: "#c4bfb4",
  graticule: "#c4bfb4",
  base: "#0d7377",
  csg: "#b8372d",
  btf: "#6b4e9e",
  personnel: "#c4782e",
  bg: "#f8f5f0",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
};

/* ── Types ── */
type Selection = { kind: "base" | "csg" | "btf"; data: any } | null;

type GlobeViewProps = {
  theater: string;
  layers: { bases: boolean; csgs: boolean; btf: boolean; personnel: boolean };
  onSelect: (selection: Selection) => void;
  mob?: boolean;
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

/* ── Lerp helper ── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ── Component ── */
export default function GlobeView({ theater, layers, onSelect, mob }: GlobeViewProps) {
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
        const s = Math.min(rect.width, 500);
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

  // Filter markers by theater
  const filterRegion = (region: string) => {
    if (theater === "global") return true;
    return region === theater;
  };

  const filterCSGRegion = (csg: CSG) => {
    if (theater === "global") return true;
    // rough region assignment for CSGs by longitude/latitude
    const { lat, lon } = csg;
    if (theater === "indopac") return lon > 100 || lon < -100;
    if (theater === "europe") return lon > -30 && lon < 40 && lat > 30;
    if (theater === "mideast") return lon > 30 && lon < 80 && lat > 10 && lat < 40;
    if (theater === "atlantic") return lon > -90 && lon < -30;
    return true;
  };

  const filterBTFRegion = (b: BtfEvent) => {
    if (theater === "global") return true;
    if (theater === "indopac") return b.lon > 100;
    if (theater === "europe") return b.lon > -10 && b.lon < 40;
    if (theater === "mideast") return b.lon > 30 && b.lon < 80;
    return true;
  };

  // Marker click
  const handleBaseClick = (base: Base) => {
    onSelect({ kind: "base", data: base });
  };
  const handleCSGClick = (csg: CSG) => {
    onSelect({ kind: "csg", data: csg });
  };
  const handleBTFClick = (btf: BtfEvent) => {
    onSelect({ kind: "btf", data: btf });
  };

  // Reset
  const handleReset = () => {
    setRotation([0, -20, 0]);
    setScale(1);
    setAutoRotate(false);
    onSelect(null);
  };

  return (
    <div>
      {/* Controls row */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, alignItems: "center",
      }}>
        <button onClick={handleReset} style={pillStyle(false)}>Reset</button>
        <button onClick={() => setAutoRotate(!autoRotate)} style={pillStyle(autoRotate)}>
          {autoRotate ? "Stop spin" : "Auto-rotate"}
        </button>
      </div>

      {/* Globe container */}
      <div ref={containerRef} style={{
        width: "100%", maxWidth: 500, aspectRatio: "1", margin: "0 auto",
        background: C.ocean, borderRadius: "50%", overflow: "hidden",
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.06)",
        cursor: dragRef.current.dragging ? "grabbing" : "grab",
        touchAction: "none",
      }}>
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
          style={{ display: "block" }}
        >
          {/* Ocean */}
          <circle cx={dims.w / 2} cy={dims.h / 2} r={baseScale * scale} fill={C.ocean} />

          {/* Land */}
          {world && (
            <path d={path(world) || ""} fill={C.land} stroke={C.landStroke} strokeWidth={0.5} />
          )}

          {/* Graticule */}
          <path d={path(graticule()) || ""} fill="none" stroke={C.graticule} strokeWidth={0.3} opacity={0.3} />

          {/* Personnel density circles */}
          {layers.personnel && PERSONNEL_BY_COUNTRY.map((p) => {
            if (!isVisible(p.lon, p.lat)) return null;
            const pt = projection([p.lon, p.lat]);
            if (!pt) return null;
            const r = Math.sqrt(p.count / 1000) * 2;
            return (
              <circle key={`pers-${p.country}`} cx={pt[0]} cy={pt[1]} r={r}
                fill={C.personnel} opacity={0.22} />
            );
          })}

          {/* Bases */}
          {layers.bases && BASES.filter((b) => filterRegion(b.region)).map((b) => {
            if (!isVisible(b.lon, b.lat)) return null;
            const pt = projection([b.lon, b.lat]);
            if (!pt) return null;
            const r = b.type === "persistent" ? 4 : 3;
            return (
              <circle key={`base-${b.id}`} cx={pt[0]} cy={pt[1]} r={r}
                fill={C.base} stroke="#fff" strokeWidth={0.5}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); handleBaseClick(b); }}
              />
            );
          })}

          {/* CSGs / ARGs */}
          {layers.csgs && CSGS.filter(filterCSGRegion).map((c) => {
            if (!isVisible(c.lon, c.lat)) return null;
            const pt = projection([c.lon, c.lat]);
            if (!pt) return null;
            const r = c.type === "CSG" ? 6 : 5;
            return (
              <g key={`csg-${c.id}`} style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); handleCSGClick(c); }}>
                <circle cx={pt[0]} cy={pt[1]} r={r + 3} fill={C.csg} opacity={0.15} />
                <circle cx={pt[0]} cy={pt[1]} r={r} fill={C.csg} stroke="#fff" strokeWidth={0.8} />
              </g>
            );
          })}

          {/* BTF events — rotated diamonds */}
          {layers.btf && BTF_EVENTS.filter(filterBTFRegion).map((b) => {
            if (!isVisible(b.lon, b.lat)) return null;
            const pt = projection([b.lon, b.lat]);
            if (!pt) return null;
            return (
              <rect key={`btf-${b.id}`} x={pt[0] - 4} y={pt[1] - 4} width={8} height={8}
                fill={C.btf} stroke="#fff" strokeWidth={0.5}
                transform={`rotate(45 ${pt[0]} ${pt[1]})`}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); handleBTFClick(b); }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Pill button style ── */
function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    borderRadius: 6,
    border: `1.5px solid ${active ? C.accent : C.rule}`,
    background: active ? `${C.accent}12` : "#fff",
    color: active ? C.accent : C.ink,
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}
