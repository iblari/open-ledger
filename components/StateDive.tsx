"use client";

/**
 * StateDive — "dive deeper" fullscreen overlay for the State Atlas.
 *
 * Click a state → every county rendered as an extruded 3D prism (three.js):
 * height + color = the selected metric, drag to orbit/tilt, hover/tap a
 * county for its numbers, click for a full panel with all metrics + a
 * 5-snapshot trend. The 4th dimension is time: a year slider (2012→2023
 * ACS snapshots) animates the skyline. Major cities render as labeled pins.
 *
 * Data: public/county-data/{STATE}.json (built by scripts/fetch-county-data.mjs
 * from Census ACS 5-year; cities located via TIGERweb centroids).
 * Geometry: us-atlas counties-10m TopoJSON (CDN, cached, fetched on open).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import { STATE_NAMES, type StateCode } from "@/lib/state-data";

// ── County data shape (from the build script) ──
interface CountyRec { name: string; m: Record<CountyMetric, (number | null)[]> }
interface CityRec {
  geoid: string; name: string; lat: number; lon: number;
  pop: number | null; income: number | null; home: number | null;
  rent: number | null; unemp: number | null; poverty: number | null;
}
interface CountyData {
  state: string; years: number[];
  counties: Record<string, CountyRec>;
  cities: CityRec[];
  source: string; built: string;
}

type CountyMetric = "pop" | "income" | "home" | "rent" | "unemp" | "poverty";

const CM: Record<CountyMetric, { label: string; short: string; sqrt?: boolean; fmt: (v: number) => string }> = {
  pop:     { label: "Population",         short: "Population", sqrt: true, fmt: v => v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${Math.round(v)}` },
  income:  { label: "Median household income", short: "Income", fmt: v => `$${Math.round(v / 1e3)}K` },
  home:    { label: "Median home value",  short: "Home value", fmt: v => `$${Math.round(v / 1e3)}K` },
  rent:    { label: "Median gross rent",  short: "Rent",       fmt: v => `$${Math.round(v)}/mo` },
  unemp:   { label: "Unemployment rate",  short: "Unemployment", fmt: v => `${v.toFixed(1)}%` },
  poverty: { label: "Poverty rate",       short: "Poverty",    fmt: v => `${v.toFixed(1)}%` },
};
const METRIC_ORDER: CountyMetric[] = ["pop", "income", "home", "rent", "unemp", "poverty"];

const FIPS: Record<string, string> = {
  AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",
  GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",
  MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",
  NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",
  SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56",
};

// Module-level topo cache — the 840KB counties file is fetched once per session.
let topoCache: unknown | null = null;

const PAPER = new THREE.Color("#efe9df");
const WARM = new THREE.Color("#c2410c");
const HOVER_TINT = new THREE.Color("#1d4ed8");
const MISSING = new THREE.Color("#d8d3c9");
const MAX_H = 58, MIN_H = 2.5;

function useIsMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const check = () => setMob(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mob;
}

/** Text label sprite for city pins (canvas-rendered, crisp at 2x). */
function makeLabelSprite(text: string): THREE.Sprite {
  const pad = 10, fs = 26;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;
  ctx.font = `600 ${fs}px 'DM Sans', sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fs + pad * 1.4;
  cv.width = w * 2; cv.height = h * 2;
  const c2 = cv.getContext("2d")!;
  c2.scale(2, 2);
  c2.fillStyle = "rgba(26,26,26,0.88)";
  c2.beginPath();
  // rounded rect
  const r = 6;
  c2.moveTo(r, 0); c2.lineTo(w - r, 0); c2.quadraticCurveTo(w, 0, w, r);
  c2.lineTo(w, h - r); c2.quadraticCurveTo(w, h, w - r, h);
  c2.lineTo(r, h); c2.quadraticCurveTo(0, h, 0, h - r);
  c2.lineTo(0, r); c2.quadraticCurveTo(0, 0, r, 0);
  c2.fill();
  c2.font = `600 ${fs}px 'DM Sans', sans-serif`;
  c2.fillStyle = "#f8f5f0";
  c2.textBaseline = "middle";
  c2.fillText(text, pad, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const scale = 0.16;
  sp.scale.set(w * scale, h * scale, 1);
  return sp;
}

export default function StateDive({ stateCode, onClose }: { stateCode: StateCode; onClose: () => void }) {
  const mob = useIsMobile();
  const mountRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CountyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<CountyMetric>("income");
  const [yearIdx, setYearIdx] = useState<number>(4);
  const [playing, setPlaying] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [hovered, setHovered] = useState<{ fips: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Refs shared with the three.js scene (avoid re-creating the scene on UI state)
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cityGroupRef = useRef<THREE.Group | null>(null);
  const targetsRef = useRef<Map<string, { h: number; color: THREE.Color }>>(new Map());
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dataRef = useRef<CountyData | null>(null);

  // ── Load data + geometry ──
  useEffect(() => {
    let dead = false;
    Promise.all([
      fetch(`/county-data/${stateCode}.json`).then(r => {
        if (!r.ok) throw new Error("county data not built for this state yet");
        return r.json();
      }),
      topoCache
        ? Promise.resolve(topoCache)
        : fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json")
            .then(r => { if (!r.ok) throw new Error("county map unavailable"); return r.json(); })
            .then(t => { topoCache = t; return t; }),
    ])
      .then(([d]) => { if (!dead) { dataRef.current = d as CountyData; setData(d as CountyData); } })
      .catch(e => { if (!dead) setError((e as Error).message); });
    return () => { dead = true; };
  }, [stateCode]);

  // ── Compute prism targets (height + color) for metric × year ──
  const computeTargets = useCallback((d: CountyData, mk: CountyMetric, yi: number) => {
    // Normalize across ALL years so the year slider shows real growth,
    // not a re-normalized shuffle.
    let vmax = -Infinity, vmin = Infinity;
    for (const c of Object.values(d.counties)) {
      for (const v of c.m[mk]) {
        if (v == null) continue;
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
      }
    }
    const span = vmax - vmin || 1;
    const sqrt = CM[mk].sqrt;
    const t = new Map<string, { h: number; color: THREE.Color }>();
    for (const [fips, c] of Object.entries(d.counties)) {
      const v = c.m[mk][yi];
      if (v == null) { t.set(fips, { h: MIN_H, color: MISSING.clone() }); continue; }
      let f = (v - vmin) / span;
      if (sqrt) f = Math.sqrt(f);
      t.set(fips, {
        h: MIN_H + f * MAX_H,
        color: PAPER.clone().lerp(WARM, 0.08 + f * 0.92),
      });
    }
    targetsRef.current = t;
  }, []);

  useEffect(() => {
    if (data) computeTargets(data, metric, yearIdx);
  }, [data, metric, yearIdx, computeTargets]);

  // ── Autoplay the year slider ──
  useEffect(() => {
    if (!playing || !data) return;
    const iv = setInterval(() => setYearIdx(i => (i + 1) % data.years.length), 1200);
    return () => clearInterval(iv);
  }, [playing, data]);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // ── Build the scene (once per state, after data arrives) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !data || !topoCache) return;

    const W = mount.clientWidth, H = mount.clientHeight;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D not supported on this device");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 1, 4000);
    camera.position.set(0, 340, 330);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 120;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xfff5e8, 1.4);
    sun.position.set(-180, 320, 160);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(200, 140, -180);
    scene.add(fill);

    // ── Project this state's counties with the same projection family as
    //    the 2D atlas (geoAlbersUsa handles AK/HI insets), fitted to a
    //    600×600 box, then centered at the scene origin. ──
    const topo = topoCache as { objects: { counties: object } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = topoFeature(topo as any, (topo as any).objects.counties) as unknown as FeatureCollection<Geometry, { name: string }>;
    const fips = FIPS[stateCode];
    const feats = all.features.filter(f => String(f.id).startsWith(fips));
    const fc: FeatureCollection<Geometry, { name: string }> = { type: "FeatureCollection", features: feats };
    const proj = geoAlbersUsa().fitExtent([[0, 0], [600, 600]], fc);
    const pathFn = geoPath(proj);
    const [[bx0, by0], [bx1, by1]] = pathFn.bounds(fc);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;

    const meshes = new Map<string, THREE.Mesh>();
    const group = new THREE.Group();

    // Sanitized ring → Vector2 list. Degenerate rings (NaN coords from
    // projection clipping, consecutive duplicates, near-zero area) crash
    // three's earcut triangulator ("reading 'next'") — filter them out.
    const toShapePts = (ring: number[][]): THREE.Vector2[] => {
      const pts: THREE.Vector2[] = [];
      for (const coord of ring) {
        const p = proj(coord as [number, number]);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        // Negate y: projected screen-y grows downward; after the -90° X
        // rotation local +y lands on world -z, so negating here keeps north up.
        const x = p[0] - cx, y = -(p[1] - cy);
        const last = pts[pts.length - 1];
        if (last && Math.abs(last.x - x) < 1e-6 && Math.abs(last.y - y) < 1e-6) continue;
        pts.push(new THREE.Vector2(x, y));
      }
      // Drop the GeoJSON closing point if it duplicates the first.
      if (pts.length > 1) {
        const a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
      }
      return pts;
    };
    const ringArea = (pts: THREE.Vector2[]): number => {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
        a += p1.x * p2.y - p2.x * p1.y;
      }
      return Math.abs(a / 2);
    };

    for (const f of feats) {
      const id = String(f.id);
      const polys = f.geometry.type === "Polygon"
        ? [(f.geometry as GeoJSON.Polygon).coordinates]
        : f.geometry.type === "MultiPolygon"
          ? (f.geometry as GeoJSON.MultiPolygon).coordinates
          : [];
      const shapes: THREE.Shape[] = [];
      for (const poly of polys) {
        const outer = toShapePts(poly[0]);
        if (outer.length < 3 || ringArea(outer) < 0.05) continue;
        const shape = new THREE.Shape(outer);
        for (let i = 1; i < poly.length; i++) {
          const hole = toShapePts(poly[i]);
          if (hole.length >= 3 && ringArea(hole) > 0.05) shape.holes.push(new THREE.Path(hole));
        }
        shapes.push(shape);
      }
      if (!shapes.length) continue;
      let geom: THREE.ExtrudeGeometry;
      try {
        geom = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
      } catch {
        continue; // skip pathological geometry rather than killing the scene
      }
      const mat = new THREE.MeshLambertMaterial({ color: PAPER.clone() });
      const mesh = new THREE.Mesh(geom, mat);
      // Lay the shape flat (XZ plane); the unit-depth extrusion becomes world
      // +y, and scale.z animates prism height in the render loop.
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1, 1, MIN_H);
      mesh.userData.fips = id;
      // Edge outline for the editorial feel
      const edges = new THREE.EdgesGeometry(geom, 30);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      mesh.add(line);
      group.add(mesh);
      meshes.set(id, mesh);
    }
    scene.add(group);
    meshesRef.current = meshes;

    // Floor plate
    const floorG = new THREE.CylinderGeometry(430, 430, 3, 72);
    const floor = new THREE.Mesh(floorG, new THREE.MeshLambertMaterial({ color: new THREE.Color("#e7e1d6") }));
    floor.position.y = -2.6;
    scene.add(floor);

    // ── City pins ──
    const cityGroup = new THREE.Group();
    for (const city of data.cities) {
      const p = proj([city.lon, city.lat]);
      if (!p) continue;
      const x = p[0] - cx, z = p[1] - cy; // matches county world-z (see y-negation note above)
      const pinH = MAX_H + 26;
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, pinH, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(EC.ink), transparent: true, opacity: 0.55 })
      );
      stick.position.set(x, pinH / 2, z);
      cityGroup.add(stick);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(2.1, 12, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#b8372d") })
      );
      dot.position.set(x, pinH, z);
      cityGroup.add(dot);
      const label = makeLabelSprite(city.name);
      label.position.set(x, pinH + 9, z);
      cityGroup.add(label);
    }
    scene.add(cityGroup);
    cityGroupRef.current = cityGroup;

    // ── Picking ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (clientX: number, clientY: number): string | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(group.children, false);
      return hits.length ? (hits[0].object.userData.fips as string) : null;
    };
    let downAt: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const id = pick(e.clientX, e.clientY);
      hoveredRef.current = id;
      setHovered(id ? { fips: id, x: e.clientX, y: e.clientY } : null);
    };
    const onDown = (e: PointerEvent) => { downAt = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!downAt) return;
      const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
      downAt = null;
      if (dx * dx + dy * dy > 36) return; // was a drag, not a tap
      const id = pick(e.clientX, e.clientY);
      setSelected(prev => (id === prev ? null : id));
      if (e.pointerType !== "mouse") {
        hoveredRef.current = id;
        setHovered(id ? { fips: id, x: e.clientX, y: e.clientY } : null);
      }
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // ── Render loop: lerp prism heights/colors toward targets ──
    let raf = 0;
    let disposed = false;
    const tmp = new THREE.Color();
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const targets = targetsRef.current;
      for (const [id, mesh] of meshes) {
        const tg = targets.get(id);
        if (!tg) continue;
        // depth=1 geometry extrudes along -y after rotation; scale.z is the
        // extrude axis for a rotated ExtrudeGeometry — we scale the local z.
        const cur = mesh.scale.z;
        mesh.scale.z = cur + (tg.h - cur) * 0.14;
        const m = mesh.material as THREE.MeshLambertMaterial;
        tmp.copy(tg.color);
        if (hoveredRef.current === id || selectedRef.current === id) tmp.lerp(HOVER_TINT, 0.28);
        m.color.lerp(tmp, 0.2);
      }
      controls.update();
      renderer.render(scene, camera);
    };

    tick();
    setReady(true);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose()); else mat?.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      meshesRef.current = new Map();
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stateCode]);

  // City visibility toggle
  useEffect(() => {
    if (cityGroupRef.current) cityGroupRef.current.visible = showCities;
  }, [showCities, ready]);

  // Esc closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const years = data?.years ?? [2012, 2015, 2018, 2021, 2023];
  const hoveredRec = hovered && data ? data.counties[hovered.fips] : null;
  const selRec = selected && data ? data.counties[selected] : null;

  const chipStyle = (on: boolean): React.CSSProperties => ({
    padding: mob ? "7px 11px" : "6px 12px", borderRadius: 4, whiteSpace: "nowrap",
    border: `1px solid ${on ? EC.accent + "55" : EC.rule}`,
    background: on ? EC.accent + "0F" : EC.card,
    color: on ? EC.accent : EC.sub,
    fontFamily: ESANS, fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: EC.bg, display: "flex", flexDirection: "column" }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: mob ? "12px 14px" : "14px 24px",
        borderBottom: `1px solid ${EC.rule}`, background: EC.card, flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          border: `1px solid ${EC.rule}`, background: EC.card, borderRadius: 4,
          padding: "6px 12px", fontFamily: ESANS, fontSize: 12, fontWeight: 600,
          color: EC.ink, cursor: "pointer", flexShrink: 0,
        }}>← Atlas</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: ESERIF, fontSize: mob ? 17 : 20, fontWeight: 600, color: EC.ink, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {STATE_NAMES[stateCode]} <span style={{ fontWeight: 400, fontStyle: "italic", color: EC.accent }}>in 3D</span>
          </div>
          {!mob && (
            <div style={{ fontFamily: ESANS, fontSize: 11, color: EC.mute, marginTop: 1 }}>
              {data ? `${Object.keys(data.counties).length} counties · drag to rotate · scroll to zoom · click a county` : "loading…"}
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setShowCities(v => !v)} style={chipStyle(showCities)}>
            {mob ? "Cities" : `Cities ${showCities ? "on" : "off"}`}
          </button>
        </div>
      </div>

      {/* ── Metric chips ── */}
      <div style={{
        display: "flex", gap: 6, padding: mob ? "10px 14px" : "10px 24px",
        overflowX: "auto", flexShrink: 0, background: EC.bg, WebkitOverflowScrolling: "touch",
      }}>
        {METRIC_ORDER.map(k => (
          <button key={k} onClick={() => setMetric(k)} style={chipStyle(metric === k)}>{CM[k].short}</button>
        ))}
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
        {!data && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ESANS, fontSize: 13, color: EC.mute }}>
            Building {STATE_NAMES[stateCode]}…
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", fontFamily: ESANS, fontSize: 13, color: EC.sub, padding: 24, textAlign: "center" }}>
            <span style={{ fontSize: 28 }}>🗺️</span>
            <strong>Couldn&apos;t load the county view</strong>
            <span style={{ color: EC.mute, fontSize: 12 }}>{error}</span>
          </div>
        )}

        {/* Hover tooltip (desktop) */}
        {hovered && hoveredRec && data && !selected && (
          <div style={{
            position: "fixed", left: Math.min(hovered.x + 14, window.innerWidth - 190), top: hovered.y + 12,
            background: EC.ink, color: "#fff", borderRadius: 6, padding: "7px 11px",
            fontFamily: ESANS, fontSize: 11.5, pointerEvents: "none", zIndex: 420, lineHeight: 1.5,
          }}>
            <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 12.5 }}>{hoveredRec.name}</div>
            <div>
              {CM[metric].short}: <strong>{hoveredRec.m[metric][yearIdx] != null ? CM[metric].fmt(hoveredRec.m[metric][yearIdx]!) : "no data"}</strong>
              <span style={{ color: "#9a9490" }}> · {years[yearIdx]}</span>
            </div>
          </div>
        )}

        {/* Selected county panel */}
        {selRec && data && (
          <div style={{
            position: "absolute",
            ...(mob
              ? { left: 10, right: 10, bottom: 10 }
              : { right: 16, top: 16, width: 280 }),
            background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 8,
            padding: "12px 14px", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", zIndex: 410,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontFamily: ESERIF, fontSize: 16, fontWeight: 600, color: EC.ink }}>{selRec.name}</div>
              <button onClick={() => setSelected(null)} style={{ border: "none", background: "none", fontFamily: ESANS, fontSize: 16, color: EC.mute, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
              {METRIC_ORDER.map(k => {
                const arr = selRec.m[k];
                const v = arr[yearIdx];
                const first = arr.find(x => x != null);
                const delta = v != null && first != null && first !== 0 && k !== "unemp" && k !== "poverty"
                  ? ((v - first) / Math.abs(first)) * 100 : null;
                const ppDelta = v != null && first != null && (k === "unemp" || k === "poverty") ? v - first : null;
                return (
                  <div key={k}>
                    <div style={{ fontFamily: ESANS, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: EC.mute }}>{CM[k].short}</div>
                    <div style={{ fontFamily: ESERIF, fontSize: 15, fontWeight: 600, color: k === metric ? EC.accent : EC.ink, fontVariantNumeric: "tabular-nums" }}>
                      {v != null ? CM[k].fmt(v) : "—"}
                    </div>
                    {(delta != null || ppDelta != null) && (
                      <div style={{ fontFamily: ESANS, fontSize: 9.5, color: EC.mute, fontVariantNumeric: "tabular-nums" }}>
                        {ppDelta != null
                          ? `${ppDelta >= 0 ? "+" : "−"}${Math.abs(ppDelta).toFixed(1)}pp since ’${String(years[0]).slice(2)}`
                          : `${delta! >= 0 ? "+" : "−"}${Math.abs(delta!).toFixed(0)}% since ’${String(years[0]).slice(2)}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Mini trend sparkline for the active metric */}
            {(() => {
              const arr = selRec.m[metric].map(v => v);
              const nums = arr.filter((v): v is number => v != null);
              if (nums.length < 2) return null;
              const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
              const W2 = 240, H2 = 34;
              const pts = arr.map((v, i) => v == null ? null : `${(i / (arr.length - 1)) * W2},${H2 - 4 - ((v - lo) / span) * (H2 - 8)}`).filter(Boolean).join(" ");
              return (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${EC.rule}` }}>
                  <div style={{ fontFamily: ESANS, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: EC.mute, marginBottom: 3 }}>
                    {CM[metric].short} · {years[0]}–{years[years.length - 1]}
                  </div>
                  <svg width="100%" height={H2} viewBox={`0 0 ${W2} ${H2}`} preserveAspectRatio="none">
                    <polyline points={pts} fill="none" stroke={EC.accent} strokeWidth={2} />
                  </svg>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Footer: year slider + legend ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: mob ? 10 : 16,
        padding: mob ? "10px 14px calc(10px + env(safe-area-inset-bottom))" : "12px 24px",
        borderTop: `1px solid ${EC.rule}`, background: EC.card, flexShrink: 0, flexWrap: "wrap",
      }}>
        <button onClick={() => setPlaying(p => !p)} style={{
          width: 34, height: 34, borderRadius: "50%", border: `1px solid ${EC.rule}`,
          background: playing ? EC.ink : EC.card, color: playing ? "#fff" : EC.ink,
          fontSize: 12, cursor: "pointer", flexShrink: 0,
        }}>{playing ? "❚❚" : "▶"}</button>
        <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 2 }}>
          <input
            type="range" min={0} max={years.length - 1} step={1} value={yearIdx}
            onChange={e => { setPlaying(false); setYearIdx(Number(e.target.value)); }}
            style={{ width: "100%", accentColor: EC.accent }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ESANS, fontSize: 9.5, color: EC.mute, fontVariantNumeric: "tabular-nums" }}>
            {years.map((y, i) => (
              <span key={y} style={{ fontWeight: i === yearIdx ? 700 : 400, color: i === yearIdx ? EC.accent : EC.mute }}>{y}</span>
            ))}
          </div>
        </div>
        {!mob && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: ESANS, fontSize: 10, color: EC.sub, flexShrink: 0 }}>
            low
            <span style={{ display: "inline-flex", borderRadius: 2, overflow: "hidden", border: `1px solid ${EC.rule}` }}>
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(t => (
                <span key={t} style={{ width: 16, height: 9, background: `#${PAPER.clone().lerp(WARM, t).getHexString()}` }} />
              ))}
            </span>
            high · height &amp; color = {CM[metric].short.toLowerCase()}
          </div>
        )}
        <div style={{ fontFamily: ESANS, fontSize: 9.5, color: EC.mute, flexShrink: 0 }}>
          Census ACS 5-yr
        </div>
      </div>
    </div>
  );
}
