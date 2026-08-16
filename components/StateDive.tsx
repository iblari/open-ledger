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
 *
 * Encoding contract — read this before touching computeTargets: height and
 * colour are ZERO-BASED. A prism twice as tall means twice the value. A
 * truncated axis in a 3D skyline is not a stylistic choice, it is a false claim
 * about how different two counties are, and unlike a bar chart there is no axis
 * on screen for the reader to catch it with.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

const nf = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * `fmt` is the abbreviated form for the tooltip and legend, where space is the
 * constraint; `exact` is the figure itself. A reader who has opened the detail
 * panel is asking for the number, and "$67K" is not a number they can quote,
 * check against the Census tables, or cite.
 *
 * `nominal` marks the three ACS dollar series. They are published in the dollars
 * of their own survey year and we do NOT deflate them here, so every comparison
 * across the slider is a nominal one — CPI rose roughly a third between the 2012
 * and 2023 windows, enough to turn a real decline into an apparent gain. Every
 * surface that shows these values has to say so, because a reader who assumes
 * otherwise draws exactly the wrong conclusion with full confidence.
 */
const CM: Record<CountyMetric, {
  label: string; short: string; unit: string; sqrt?: boolean; nominal?: boolean;
  fmt: (v: number) => string; exact: (v: number) => string;
}> = {
  pop: {
    label: "Population", short: "Population", unit: "people", sqrt: true,
    fmt: v => v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : `${Math.round(v)}`,
    exact: v => nf(v),
  },
  income: {
    label: "Median household income", short: "Income", unit: "nominal US dollars", nominal: true,
    fmt: v => `$${Math.round(v / 1e3)}K`, exact: v => `$${nf(v)}`,
  },
  home: {
    label: "Median home value", short: "Home value", unit: "nominal US dollars", nominal: true,
    fmt: v => `$${Math.round(v / 1e3)}K`, exact: v => `$${nf(v)}`,
  },
  rent: {
    label: "Median gross rent", short: "Rent", unit: "nominal US dollars per month", nominal: true,
    fmt: v => `$${Math.round(v)}/mo`, exact: v => `$${nf(v)} / month`,
  },
  unemp: {
    label: "Unemployment rate", short: "Unemployment", unit: "percent of the labor force",
    fmt: v => `${v.toFixed(1)}%`, exact: v => `${v.toFixed(1)}%`,
  },
  poverty: {
    label: "Poverty rate", short: "Poverty", unit: "percent of people",
    fmt: v => `${v.toFixed(1)}%`, exact: v => `${v.toFixed(1)}%`,
  },
};
const METRIC_ORDER: CountyMetric[] = ["pop", "income", "home", "rent", "unemp", "poverty"];

const FIPS: Record<string, string> = {
  AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",
  GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",
  MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",
  NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",
  SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56",
};

/**
 * FIPS vintage crosswalk: geometry code → data codes to fall back to.
 *
 * The us-atlas counties file is a single ~2018 vintage; the ACS pulls behind
 * public/county-data are not. A county renumbered mid-series therefore has its
 * history split across two records, only one of which the map can find, and the
 * other half was simply dropped on the floor. Oglala Lakota (46102 on the map)
 * showed "no data" for 2012 even though its 49.5% poverty rate is sitting in
 * SD.json under the pre-2015 code 46113. Silently withholding the worst poverty
 * rate in the state from the year it was worst is the precise failure this
 * project exists to prevent.
 *
 * Verified against public/county-data/*.json: these five codes are the only
 * records in any state file with no matching geometry, and no geometry in any
 * state is left without a record.
 *
 * Fallbacks are per-year and fire only when the geometry's own code is null for
 * that year, so a boundary change that merely absorbed territory (51019
 * absorbing Bedford city in 2013) keeps reporting its own post-change figures
 * rather than being overwritten by the annexed place.
 */
const FIPS_ALIAS: Record<string, string[]> = {
  // Valdez-Cordova (2018 map) was split in 2019 into Chugach + Copper River.
  // Neither successor covers the whole shape, so a 2021/2023 figure here is a
  // part standing in for a whole. The tooltip and panel name the borough the
  // number actually came from rather than letting the shape imply full coverage.
  "02261": ["02063", "02066"],
  "02158": ["02270"], // Kusilvak ← Wade Hampton (renamed 2015)
  "46102": ["46113"], // Oglala Lakota ← Shannon (renamed 2015)
  "51019": ["51515"], // Bedford county ← Bedford city (city dissolved into it, 2013)
};
/**
 * Codes that exist only as a fallback target: real data, no shape of their own.
 * They must never be counted as separate counties, or the header claims more
 * counties than the scene draws and the "% missing" check below is diluted by
 * rows that were never going to be rendered.
 */
const ALIAS_TARGETS = new Set(Object.values(FIPS_ALIAS).flat());

/**
 * A county's value for one metric/year, following the vintage crosswalk.
 * `from` is non-null when the number came from a different FIPS code, so the UI
 * can attribute it instead of implying the mapped county reported it itself.
 */
function resolve(d: CountyData, fips: string, mk: CountyMetric, yi: number): { v: number | null; from: string | null } {
  const own = d.counties[fips]?.m[mk]?.[yi];
  if (own != null) return { v: own, from: null };
  for (const alt of FIPS_ALIAS[fips] ?? []) {
    const v = d.counties[alt]?.m[mk]?.[yi];
    if (v != null) return { v, from: alt };
  }
  return { v: null, from: null };
}

// Module-level topo cache — the 840KB counties file is fetched once per session.
let topoCache: unknown | null = null;
/**
 * Per-state feature cache. topoFeature() over the whole object inflated all
 * 3231 counties into GeoJSON on every open just to throw ~98% of them away —
 * the single most expensive thing this overlay did, repeated on every dive.
 * Filtering the geometry list first keeps the work proportional to the state
 * being viewed, and the cache makes a second visit free.
 */
const stateFeatCache = new Map<string, Feature<Geometry, { name: string }>[]>();

function stateFeatures(topo: unknown, stateFips: string): Feature<Geometry, { name: string }>[] {
  const hit = stateFeatCache.get(stateFips);
  if (hit) return hit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = topo as any;
  const obj = t.objects.counties;
  const subset = { ...obj, geometries: obj.geometries.filter((g: { id?: unknown }) => String(g.id).startsWith(stateFips)) };
  const fc = topoFeature(t, subset) as unknown as FeatureCollection<Geometry, { name: string }>;
  stateFeatCache.set(stateFips, fc.features);
  return fc.features;
}

const PAPER = new THREE.Color("#efe9df");
const WARM = new THREE.Color("#c2410c");
const HOVER_TINT = new THREE.Color("#1d4ed8");
/**
 * "No data" grey. The previous value (#d8d3c9) sat within a few percent
 * luminance of the ramp's low end, so a county that reported nothing looked
 * like the poorest or smallest county in the state — the most consequential
 * confusion available on a choropleth, and one the reader cannot detect.
 * Missing is now darker and cooler than anything the ramp produces and, more
 * decisively, is drawn flat instead of as a short prism.
 */
const MISSING = new THREE.Color("#bdb7ac");
const MAX_H = 58, MIN_H = 2.5;
/**
 * Flat, but not literally zero: a zero scale component makes the normal matrix
 * singular and Lambert shading collapses to black, which reads as a third
 * category rather than as absence. 0.01 is indistinguishable from flat at every
 * reachable camera distance while keeping the top face lit.
 */
const MISSING_H = 0.01;
/** Colour ramp band the prisms actually use; the legend must match it exactly. */
const RAMP_LO = 0.08, RAMP_HI = 1.0;
/** Fingers are imprecise; a 6px threshold turned deliberate taps into ignored drags. */
const TAP_SLOP = 10;

const SR_ONLY: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)",
  whiteSpace: "nowrap", border: 0,
};

function useIsMobile() {
  const [mob, setMob] = useState(false);
  useEffect(() => {
    const check = () => setMob(window.innerWidth < 768);
    check(); window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mob;
}

/**
 * A reader who sets this has told the operating system that motion makes them
 * unwell or unable to read. An animated skyline that morphs on every slider
 * step is exactly what they meant.
 */
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
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
  const reduce = usePrefersReducedMotion();
  const mountRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<CountyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<CountyMetric>("income");
  const [yearIdx, setYearIdx] = useState<number>(4);
  const [playing, setPlaying] = useState(false);
  const [showCities, setShowCities] = useState(true);
  const [hovered, setHovered] = useState<{ fips: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState(0);
  /** Bumped to force a full scene rebuild after a WebGL context is restored. */
  const [epoch, setEpoch] = useState(0);

  // Refs shared with the three.js scene (avoid re-creating the scene on UI state)
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const cityGroupRef = useRef<THREE.Group | null>(null);
  const targetsRef = useRef<Map<string, { h: number; color: THREE.Color; missing: boolean }>>(new Map());
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const dataRef = useRef<CountyData | null>(null);
  const reduceRef = useRef(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  /** Wakes the render loop; the loop parks itself once nothing is moving. */
  const invalidateRef = useRef<() => void>(() => {});

  useEffect(() => { reduceRef.current = reduce; }, [reduce]);

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

  /**
   * Counties that actually have a shape on the map. Alias-only records (Shannon,
   * Wade Hampton, Bedford city…) hold real data but are folded into a
   * successor's prism, so counting them would make the header promise more
   * counties than the scene draws.
   */
  const countyList = useMemo(() => {
    if (!data) return [] as [string, CountyRec][];
    return (Object.entries(data.counties) as [string, CountyRec][])
      .filter(([k]) => !ALIAS_TARGETS.has(k))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [data]);

  /**
   * Scale domain for the current metric, taken over every year so the slider
   * shows movement rather than a re-normalised shuffle. vmax alone drives the
   * encoding (see computeTargets); vmin is carried only so the legend can tell
   * the reader where the observed values actually begin.
   */
  const scale = useMemo(() => {
    if (!data) return null;
    let vmax = -Infinity, vmin = Infinity;
    for (const [fips] of countyList) {
      for (let yi = 0; yi < data.years.length; yi++) {
        const { v } = resolve(data, fips, metric, yi);
        if (v == null) continue;
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
      }
    }
    return Number.isFinite(vmax) ? { vmin, vmax } : null;
  }, [data, countyList, metric]);

  // ── Compute prism targets (height + color) for metric × year ──
  const computeTargets = useCallback((
    d: CountyData,
    list: [string, CountyRec][],
    mk: CountyMetric,
    yi: number,
    sc: { vmin: number; vmax: number } | null,
  ) => {
    const t = new Map<string, { h: number; color: THREE.Color; missing: boolean }>();
    const vmax = sc && sc.vmax > 0 ? sc.vmax : 0;
    for (const [fips] of list) {
      const { v } = resolve(d, fips, mk, yi);
      if (v == null) {
        // Missing is drawn as an absence: flat, in a grey the ramp never
        // produces. A short prism in a near-ramp colour reads as "lowest
        // value" — a claim we have no basis for and that the reader has no
        // way to argue with.
        t.set(fips, { h: MISSING_H, color: MISSING.clone(), missing: true });
        continue;
      }
      // Zero-based: f is the value as a fraction of the state-wide maximum, so
      // a prism twice as tall really is twice the value. The old (v-vmin)/span
      // form pinned the smallest county at zero height and stretched every gap
      // above it — a truncated axis, with no axis on screen to check it against.
      let f = vmax > 0 ? v / vmax : 0;
      // The square root has to be taken of that zero-based ratio. The root of a
      // range-normalised fraction is the root of "distance above the smallest
      // county", which corresponds to nothing in the world. Only population uses
      // it, and only because counts this skewed otherwise flatten every county
      // outside the largest metro into the floor.
      if (CM[mk].sqrt && vmax > 0) f = Math.sqrt(v / vmax);
      t.set(fips, {
        // MIN_H is a legibility floor only — it stops a real-but-tiny value from
        // vanishing under the floor plate. It is deliberately NOT added to the
        // scaled height, which is how the non-zero baseline crept in before.
        h: Math.max(MIN_H, MAX_H * f),
        color: PAPER.clone().lerp(WARM, RAMP_LO + f * (RAMP_HI - RAMP_LO)),
        missing: false,
      });
    }
    targetsRef.current = t;
  }, []);

  useEffect(() => {
    if (data) { computeTargets(data, countyList, metric, yearIdx, scale); invalidateRef.current(); }
  }, [data, countyList, metric, yearIdx, scale, computeTargets]);

  /**
   * Share of mapped counties with nothing to show for the current view.
   * Connecticut's 2023 population is 100% null; at that point the skyline is a
   * field of flat grey plates and has to say why, or it looks like a rendering
   * bug at best and like a state that emptied out at worst.
   */
  const missingInfo = useMemo(() => {
    if (!data || !countyList.length) return null;
    let miss = 0;
    for (const [fips] of countyList) if (resolve(data, fips, metric, yearIdx).v == null) miss++;
    return { miss, total: countyList.length, frac: miss / countyList.length };
  }, [data, countyList, metric, yearIdx]);

  // ── Autoplay the year slider ──
  useEffect(() => {
    if (!playing || !data) return;
    const iv = setInterval(() => setYearIdx(i => (i + 1) % data.years.length), 1200);
    return () => clearInterval(iv);
  }, [playing, data]);

  // Someone who asked the OS for less motion did not ask for a looping
  // animation; stop it rather than letting a stale toggle keep it running.
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);

  // A state with a shorter series than the one before it would otherwise leave
  // the index past the end of years[], and every county would read undefined —
  // i.e. an entire state rendered as "no data" because of a stale slider.
  useEffect(() => {
    if (data) setYearIdx(i => Math.min(i, data.years.length - 1));
  }, [data]);

  useEffect(() => { selectedRef.current = selected; invalidateRef.current(); }, [selected]);
  useEffect(() => { setSelectedCity(null); setSelected(null); }, [stateCode]);

  // Damping has to track the media query live, because the scene is not rebuilt
  // when the preference changes mid-session.
  useEffect(() => {
    if (controlsRef.current) { controlsRef.current.enableDamping = !reduce; invalidateRef.current(); }
  }, [reduce]);

  // ── Build the scene (once per state, after data arrives) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !data || !topoCache) return;

    const W = mount.clientWidth || 1, H = mount.clientHeight || 1;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D is not available in this browser");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 1, 4000);
    camera.position.set(0, 340, 330);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduceRef.current;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 120;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

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
    const fipsPrefix = FIPS[stateCode];
    const feats = stateFeatures(topoCache, fipsPrefix);
    const fc: FeatureCollection<Geometry, { name: string }> = { type: "FeatureCollection", features: feats };
    const proj = geoAlbersUsa().fitExtent([[0, 0], [600, 600]], fc);
    const pathFn = geoPath(proj);
    const [[bx0, by0], [bx1, by1]] = pathFn.bounds(fc);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;

    const meshes = new Map<string, THREE.Mesh>();
    const group = new THREE.Group();
    let skippedCount = 0;

    /**
     * One material for every county outline instead of one per county. Three
     * thousand identical LineBasicMaterials is three thousand shader-program
     * lookups per frame and three thousand objects to find again on teardown,
     * which is how they were being leaked.
     */
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    /**
     * Distinct outline for "no data". At a shallow camera angle a flat plate
     * and a very short prism look alike from above; a darker edge makes the
     * absence legible from any orbit position, not just a high one.
     */
    const noDataOutlineMat = new THREE.LineBasicMaterial({ color: 0x8c857c, transparent: true, opacity: 0.55 });

    /**
     * Sanitized ring → Vector2 list, or null when the ring cannot be trusted.
     *
     * geoAlbersUsa returns null for coordinates outside its composite. Dropping
     * only the failed points and keeping the survivors stitches them into a
     * different polygon — a county drawn with a plausible but wrong outline, at
     * full confidence, with nothing on screen to hint at it. ExtrudeGeometry
     * will not object, because a self-intersecting ring is still a ring to
     * earcut. A county we refuse to draw is an absence we can count and report
     * (see skippedCount); a county drawn wrong is a lie we cannot detect later.
     */
    const toShapePts = (ring: number[][]): THREE.Vector2[] | null => {
      const pts: THREE.Vector2[] = [];
      for (const coord of ring) {
        const p = proj(coord as [number, number]);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
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
        if (!outer || outer.length < 3 || ringArea(outer) < 0.05) continue;
        const shape = new THREE.Shape(outer);
        // A hole that fails to project takes its polygon with it: an uncut hole
        // is a filled-in lake or an enclave silently annexed by its neighbour,
        // which is the same wrong-outline problem wearing a different hat.
        let holesOk = true;
        for (let i = 1; i < poly.length; i++) {
          const hole = toShapePts(poly[i]);
          if (!hole) { holesOk = false; break; }
          if (hole.length >= 3 && ringArea(hole) > 0.05) shape.holes.push(new THREE.Path(hole));
        }
        if (!holesOk) continue;
        shapes.push(shape);
      }
      if (!shapes.length) { skippedCount++; continue; }
      let geom: THREE.ExtrudeGeometry;
      try {
        geom = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
      } catch {
        skippedCount++;
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
      const line = new THREE.LineSegments(edges, outlineMat);
      mesh.add(line);
      mesh.userData.outline = line;
      group.add(mesh);
      meshes.set(id, mesh);
    }
    scene.add(group);
    meshesRef.current = meshes;
    setSkipped(skippedCount);

    // Floor plate
    const floorG = new THREE.CylinderGeometry(430, 430, 3, 72);
    const floor = new THREE.Mesh(floorG, new THREE.MeshLambertMaterial({ color: new THREE.Color("#e7e1d6") }));
    floor.position.y = -2.6;
    scene.add(floor);

    // ── City pins ──
    // Geometry and materials are built once and shared across every pin; the
    // only per-city allocation left is the label texture, which genuinely
    // differs. That sharing is why the teardown below needs a dispose-once guard.
    const cityGroup = new THREE.Group();
    const cityDots: THREE.Mesh[] = [];
    const pinH = MAX_H + 26;
    const stickGeom = new THREE.CylinderGeometry(0.5, 0.5, pinH, 6);
    const stickMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(EC.ink), transparent: true, opacity: 0.55 });
    const dotGeom = new THREE.SphereGeometry(2.6, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#b8372d") });
    for (let ci = 0; ci < data.cities.length; ci++) {
      const city = data.cities[ci];
      const p = proj([city.lon, city.lat]);
      if (!p) continue;
      const x = p[0] - cx, z = p[1] - cy; // matches county world-z (see y-negation note above)
      const stick = new THREE.Mesh(stickGeom, stickMat);
      stick.position.set(x, pinH / 2, z);
      cityGroup.add(stick);
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.set(x, pinH, z);
      dot.userData.cityIdx = ci;
      cityGroup.add(dot);
      cityDots.push(dot);
      const label = makeLabelSprite(city.name);
      label.position.set(x, pinH + 9, z);
      cityGroup.add(label);
    }
    scene.add(cityGroup);
    cityGroupRef.current = cityGroup;

    // ── Render loop ──
    // The loop parks itself once every prism has reached its target and the
    // controls report no camera movement, and is woken again by invalidate().
    // A permanently spinning rAF pins a core and drains a laptop battery to
    // redraw a picture that has not changed since the reader stopped touching it.
    let raf = 0;
    let running = false;
    let dead = false;
    let paused = false;
    const tmp = new THREE.Color();

    const invalidate = () => {
      if (dead || paused || running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    function tick() {
      if (dead) return;
      const targets = targetsRef.current;
      const snap = reduceRef.current;
      const kH = snap ? 1 : 0.14;
      const kC = snap ? 1 : 0.2;
      let moving = false;
      for (const [id, mesh] of meshes) {
        const tg = targets.get(id);
        if (!tg) continue;
        // depth=1 geometry extrudes along -y after rotation; scale.z is the
        // extrude axis for a rotated ExtrudeGeometry — we scale the local z.
        const cur = mesh.scale.z;
        // Snap inside the epsilon rather than lerping forever: an asymptote
        // never arrives, and "never arrives" is what kept the loop alive.
        if (Math.abs(tg.h - cur) < 0.01) mesh.scale.z = tg.h;
        else { mesh.scale.z = cur + (tg.h - cur) * kH; moving = true; }

        const m = mesh.material as THREE.MeshLambertMaterial;
        tmp.copy(tg.color);
        if (hoveredRef.current === id || selectedRef.current === id) tmp.lerp(HOVER_TINT, 0.28);
        const cd = Math.abs(m.color.r - tmp.r) + Math.abs(m.color.g - tmp.g) + Math.abs(m.color.b - tmp.b);
        if (cd < 0.004) m.color.copy(tmp);
        else { m.color.lerp(tmp, kC); moving = true; }

        const line = mesh.userData.outline as THREE.LineSegments | undefined;
        if (line) {
          const want = tg.missing ? noDataOutlineMat : outlineMat;
          if (line.material !== want) line.material = want;
        }
      }
      const cameraMoved = controls.update();
      renderer.render(scene, camera);
      if (moving || cameraMoved) raf = requestAnimationFrame(tick);
      else running = false;
    }

    controls.addEventListener("change", invalidate);
    invalidateRef.current = invalidate;
    invalidate();
    setReady(true);

    // ── Picking ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (clientX: number, clientY: number): { fips: string } | { city: number } | null => {
      const r = renderer.domElement.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      // City dots first (small targets, always above the prisms), then counties.
      const cityHits = cityGroup.visible ? ray.intersectObjects(cityDots, false) : [];
      if (cityHits.length) return { city: cityHits[0].object.userData.cityIdx as number };
      const hits = ray.intersectObjects(group.children, false);
      return hits.length ? { fips: hits[0].object.userData.fips as string } : null;
    };

    let downAt: [number, number] | null = null;
    // One raycast per animation frame, not one per pointermove: a mouse emits
    // several hundred moves a second and each raycast walks every prism in the
    // state, so the cost scaled with how fast the reader waved the cursor.
    let pendingPt: [number, number] | null = null;
    let hoverRaf = 0;
    const flushHover = () => {
      hoverRaf = 0;
      const p = pendingPt;
      if (!p || dead) return;
      const hit = pick(p[0], p[1]);
      const id = hit && "fips" in hit ? hit.fips : null;
      // Publish only on an actual change of county. Emitting a fresh object on
      // every move re-rendered the whole overlay — panel, legend, table — dozens
      // of times a second to redisplay a tooltip saying the same thing.
      if (id !== hoveredRef.current) {
        hoveredRef.current = id;
        setHovered(id ? { fips: id, x: p[0], y: p[1] } : null);
        invalidate();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pendingPt = [e.clientX, e.clientY];
      if (!hoverRaf) hoverRaf = requestAnimationFrame(flushHover);
    };
    const clearHover = () => {
      pendingPt = null;
      // A pointer that leaves or is cancelled mid-drag never sends pointerup, so
      // the stale downAt turned the next click anywhere into a phantom tap.
      downAt = null;
      if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        setHovered(null);
        invalidate();
      }
    };
    const onDown = (e: PointerEvent) => { downAt = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!downAt) return;
      const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
      downAt = null;
      if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return; // was a drag, not a tap
      const hit = pick(e.clientX, e.clientY);
      if (hit && "city" in hit) {
        setSelectedCity(prev => (prev === hit.city ? null : hit.city));
        setSelected(null);
        return;
      }
      const id = hit ? hit.fips : null;
      setSelected(prev => (id === prev ? null : id));
      if (id) setSelectedCity(null);
      if (e.pointerType !== "mouse") {
        hoveredRef.current = id;
        setHovered(id ? { fips: id, x: e.clientX, y: e.clientY } : null);
      }
      invalidate();
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", clearHover);
    renderer.domElement.addEventListener("pointercancel", clearHover);

    // ── Sizing ──
    // ResizeObserver, not just window.resize: the canvas also changes size when
    // the surrounding layout reflows — mobile browser chrome collapsing, a panel
    // opening — with no window event at all, and a stale aspect ratio silently
    // distorts the shape of the state. Zero dimensions are ignored because a
    // zero-width camera aspect is NaN and blanks the scene permanently.
    let tearingDown = false;
    const applySize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Re-applied on every resize: dragging the window onto a display with a
      // different device pixel ratio otherwise leaves the canvas rendering at
      // the old ratio, soft or aliased for the rest of the session.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      invalidate();
    };
    const ro = new ResizeObserver(applySize);
    ro.observe(mount);
    window.addEventListener("resize", applySize);

    // A backgrounded tab still runs our timers and, in some browsers, still gets
    // animation frames. There is nobody to show them to.
    const onVisibility = () => {
      if (document.hidden) {
        paused = true;
        cancelAnimationFrame(raf);
        running = false;
      } else {
        paused = false;
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── WebGL context loss ──
    // Without preventDefault the context is gone for good and the canvas freezes
    // on its last frame — a picture of one year that keeps being displayed while
    // the reader moves the slider, which is worse than an honest error card.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (tearingDown) return;
      cancelAnimationFrame(raf);
      running = false;
      setReady(false);
      setError("the browser dropped the 3D canvas (WebGL context lost)");
    };
    const onContextRestored = () => {
      if (tearingDown) return;
      setError(null);
      setEpoch(n => n + 1); // full rebuild: every GPU resource was invalidated
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    return () => {
      dead = true;
      tearingDown = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hoverRaf);
      ro.disconnect();
      window.removeEventListener("resize", applySize);
      document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("change", invalidate);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", clearHover);
      renderer.domElement.removeEventListener("pointercancel", clearHover);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      controls.dispose();
      controlsRef.current = null;
      invalidateRef.current = () => {};

      // Dispose-once: the outline materials and the city pin geometry/material
      // are each shared by thousands of objects now, and the traverse below
      // reaches them once per owner. three.js fires a dispose event per call and
      // frees the GPU resource on the first one, so repeat calls are wasted work
      // at best and a use-after-free for anything still referencing them.
      const seen = new Set<unknown>();
      const disposeOnce = (r: { dispose(): void } | null | undefined) => {
        if (!r || seen.has(r)) return;
        seen.add(r);
        r.dispose();
      };
      scene.traverse(o => {
        const obj = o as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
        disposeOnce(obj.geometry);
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        for (const m of mats) {
          // SpriteMaterial.dispose() does not touch material.map, so every city
          // label's canvas texture stayed resident on the GPU for the life of
          // the tab — one leaked texture per pin, per state the reader opened.
          const withMap = m as THREE.Material & { map?: THREE.Texture | null };
          disposeOnce(withMap.map);
          disposeOnce(m);
        }
      });
      disposeOnce(outlineMat);
      disposeOnce(noDataOutlineMat);

      renderer.dispose();
      // dispose() frees three's own caches but leaves the GL context alive.
      // Browsers cap live contexts (around 16) and silently kill the oldest, so
      // a reader touring a dozen states would start getting blank canvases.
      renderer.forceContextLoss();
      // .remove() instead of mount.removeChild(): by the time cleanup runs React
      // may already have detached the mount node, and removeChild throws on a
      // node that is no longer a child — taking the rest of the teardown with it.
      renderer.domElement.remove();

      meshesRef.current = new Map();
      cityGroupRef.current = null;
      hoveredRef.current = null;
      selectedRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stateCode, epoch]);

  // City visibility toggle
  useEffect(() => {
    if (cityGroupRef.current) { cityGroupRef.current.visible = showCities; invalidateRef.current(); }
  }, [showCities, ready]);

  // Esc closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Focus management for a modal overlay. Without it, keyboard and screen reader
  // users stay parked on the atlas underneath and are never told the dialog
  // opened; on close, their place in the page is gone.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    (closeBtnRef.current ?? dialogRef.current)?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  const years = data?.years ?? [2012, 2015, 2018, 2021, 2023];
  const safeYearIdx = Math.min(yearIdx, years.length - 1);
  const year = years[safeYearIdx];
  const hoveredRec = hovered && data ? data.counties[hovered.fips] : null;
  const selRec = selected && data ? data.counties[selected] : null;
  const M = CM[metric];

  /** Same wording everywhere a dollar figure appears, so no single surface can
   *  be screenshotted and quoted as if these were inflation-adjusted. */
  const nominalNote = M.nominal ? "nominal $ (not inflation-adjusted)" : null;

  const chipStyle = (on: boolean): React.CSSProperties => ({
    padding: mob ? "7px 11px" : "6px 12px", borderRadius: 4, whiteSpace: "nowrap",
    border: `1px solid ${on ? EC.accent + "55" : EC.rule}`,
    background: on ? EC.accent + "0F" : EC.card,
    color: on ? EC.accent : EC.sub,
    fontFamily: ESANS, fontSize: 12, fontWeight: on ? 700 : 500, cursor: "pointer",
  });

  // Rows for the text equivalent below (and, when 3D is unavailable, the only
  // view of the data there is). Sorted by value, so the ranking the skyline
  // conveys at a glance is also available to a reader who cannot see it.
  const tableRows = useMemo(() => {
    if (!data) return [] as { fips: string; name: string; v: number | null; from: string | null }[];
    return countyList
      .map(([fips, rec]) => {
        const { v, from } = resolve(data, fips, metric, safeYearIdx);
        return { fips, name: rec.name, v, from };
      })
      .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity) || a.name.localeCompare(b.name));
  }, [data, countyList, metric, safeYearIdx]);

  const dataTable = data ? (
    <table style={{ borderCollapse: "collapse", fontFamily: ESANS, fontSize: 12, width: "100%" }}>
      <caption style={{ textAlign: "left", fontFamily: ESANS, fontSize: 11, color: EC.sub, paddingBottom: 6 }}>
        {M.label} by county, {STATE_NAMES[stateCode]}, {year} — measured in {M.unit}
        {M.nominal ? ", not adjusted for inflation" : ""}. Figures are US Census Bureau American Community
        Survey 5-year estimates covering the five years ending {year}. Sorted highest to lowest.
        {M.sqrt ? " The 3D view draws this metric on a square-root scale." : ""}
      </caption>
      <thead>
        <tr>
          <th scope="col" style={{ textAlign: "left", borderBottom: `1px solid ${EC.rule}`, padding: "3px 8px 3px 0" }}>County</th>
          <th scope="col" style={{ textAlign: "right", borderBottom: `1px solid ${EC.rule}`, padding: "3px 0" }}>{M.label}</th>
        </tr>
      </thead>
      <tbody>
        {tableRows.map(r => (
          <tr key={r.fips}>
            <th scope="row" style={{ textAlign: "left", fontWeight: 400, padding: "2px 8px 2px 0", color: EC.ink }}>
              {r.name}
              {r.from && data.counties[r.from] ? ` (reported as ${data.counties[r.from].name} in ${year})` : ""}
            </th>
            <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "2px 0", color: EC.ink }}>
              {r.v != null ? M.exact(r.v) : "no data"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${STATE_NAMES[stateCode]} counties in 3D`}
      tabIndex={-1}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: EC.bg, display: "flex", flexDirection: "column", outline: "none" }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: mob ? "12px 14px" : "14px 24px",
        borderBottom: `1px solid ${EC.rule}`, background: EC.card, flexShrink: 0,
      }}>
        <button ref={closeBtnRef} onClick={onClose} aria-label="Close and return to the State Atlas" style={{
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
              {data ? `${countyList.length} counties · drag to rotate · scroll to zoom · click a county` : "loading…"}
            </div>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowCities(v => !v)}
            aria-pressed={showCities}
            aria-label="Show city pins"
            style={chipStyle(showCities)}
          >
            {mob ? "Cities" : `Cities ${showCities ? "on" : "off"}`}
          </button>
        </div>
      </div>

      {/* ── Metric chips ── */}
      <div
        role="radiogroup"
        aria-label="Metric shown as prism height and colour"
        style={{
          display: "flex", gap: 6, padding: mob ? "10px 14px" : "10px 24px",
          overflowX: "auto", flexShrink: 0, background: EC.bg, WebkitOverflowScrolling: "touch",
        }}
      >
        {METRIC_ORDER.map(k => (
          <button
            key={k}
            role="radio"
            aria-checked={metric === k}
            onClick={() => setMetric(k)}
            style={chipStyle(metric === k)}
          >{CM[k].short}</button>
        ))}
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {/* The canvas exposes no text of its own; screen readers get the table. */}
        <div ref={mountRef} aria-hidden="true" style={{ position: "absolute", inset: 0 }} />

        {/* Coverage warnings. A skyline that is mostly flat, or that quietly
            draws fewer prisms than the header counts, has to say so — by looking
            at it the reader cannot tell "not reported" from "we lost it". */}
        {(missingInfo && missingInfo.frac > 0.2) || skipped > 0 ? (
          <div aria-live="polite" style={{
            position: "absolute", top: 10, left: 10, right: 10, display: "flex",
            justifyContent: "center", pointerEvents: "none", zIndex: 405,
          }}>
            <div style={{
              background: EC.highlight, border: `1px solid ${EC.rule}`, borderRadius: 6,
              padding: "6px 12px", fontFamily: ESANS, fontSize: 11, color: EC.sub,
              maxWidth: 520, textAlign: "center", lineHeight: 1.5,
            }}>
              {missingInfo && missingInfo.frac > 0.2 && (
                <div>
                  <strong style={{ color: EC.ink }}>
                    {missingInfo.miss === missingInfo.total
                      ? `No ${M.short.toLowerCase()} figures were published for ${year}`
                      : `${Math.round(missingInfo.frac * 100)}% of counties have no ${M.short.toLowerCase()} figure for ${year}`}
                  </strong>
                  {" "}— flat grey footprints mean unreported, not zero.
                </div>
              )}
              {skipped > 0 && (
                <div>{skipped} {skipped === 1 ? "county" : "counties"} could not be drawn (outline falls outside the map projection); their figures are in the table below.</div>
              )}
            </div>
          </div>
        ) : null}

        {!data && !error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ESANS, fontSize: 13, color: EC.mute }}>
            Building {STATE_NAMES[stateCode]}…
          </div>
        )}

        {/* When 3D is unavailable the reader still came here for numbers. The
            table is the fallback; an error card on its own is a dead end. */}
        {error && (
          <div style={{
            position: "absolute", inset: 0, overflow: "auto", background: EC.bg,
            padding: mob ? "16px 14px" : "20px 24px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center", fontFamily: ESANS, fontSize: 13, color: EC.sub, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }} aria-hidden="true">🗺️</span>
              <strong>Couldn&apos;t load the 3D county view</strong>
              <span style={{ color: EC.mute, fontSize: 12 }}>{error}</span>
              {data && <span style={{ color: EC.mute, fontSize: 12 }}>The figures are below.</span>}
            </div>
            {dataTable}
          </div>
        )}

        {/* Hover tooltip (desktop) */}
        {hovered && hoveredRec && data && !selected && (() => {
          // Clamp on both axes. A tooltip that runs off the bottom of a short
          // window is as unreadable as one that runs off the right, and near the
          // footer controls is exactly where the cursor spends its time.
          const TW = 200, TH = 62;
          const left = Math.max(8, Math.min(hovered.x + 14, window.innerWidth - TW));
          const top = hovered.y + 12 + TH > window.innerHeight
            ? Math.max(8, hovered.y - TH - 8)
            : hovered.y + 12;
          const { v, from } = resolve(data, hovered.fips, metric, safeYearIdx);
          return (
            <div style={{
              position: "fixed", left, top,
              background: EC.ink, color: "#fff", borderRadius: 6, padding: "7px 11px",
              fontFamily: ESANS, fontSize: 11.5, pointerEvents: "none", zIndex: 420, lineHeight: 1.5,
              maxWidth: TW,
            }}>
              <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 12.5 }}>{hoveredRec.name}</div>
              <div>
                {M.short}: <strong>{v != null ? M.fmt(v) : "no data"}</strong>
                <span style={{ color: "#9a9490" }}> · {year}</span>
              </div>
              {nominalNote && <div style={{ color: "#9a9490", fontSize: 10 }}>{nominalNote}</div>}
              {from && data.counties[from] && (
                <div style={{ color: "#9a9490", fontSize: 10 }}>reported as {data.counties[from].name}</div>
              )}
            </div>
          );
        })()}

        {/* Selected city panel — municipal stats (city proper, latest ACS) */}
        {selectedCity != null && data && data.cities[selectedCity] && (() => {
          const city = data.cities[selectedCity];
          const rows: [string, number | null, CountyMetric][] = [
            ["Population", city.pop, "pop"],
            ["Median income", city.income, "income"],
            ["Home value", city.home, "home"],
            ["Rent", city.rent, "rent"],
            ["Unemployment", city.unemp, "unemp"],
            ["Poverty", city.poverty, "poverty"],
          ];
          return (
            <div style={{
              position: "absolute",
              ...(mob ? { left: 10, right: 10, bottom: 10 } : { right: 16, top: 16, width: 280 }),
              background: EC.ink, color: "#f8f5f0", borderRadius: 8,
              padding: "12px 14px", boxShadow: "0 8px 30px rgba(0,0,0,0.25)", zIndex: 410,
            }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                <div style={{ fontFamily: ESERIF, fontSize: 16, fontWeight: 600 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#e8837a", marginRight: 7 }} />
                  {city.name}
                </div>
                <button onClick={() => setSelectedCity(null)} aria-label={`Close the ${city.name} panel`} style={{ border: "none", background: "none", fontSize: 16, color: "#9a9490", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ fontFamily: ESANS, fontSize: 9, color: "#9a9490", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
                City proper · ACS 5-yr ending {data.years[data.years.length - 1]} · dollars nominal
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 12px" }}>
                {rows.map(([label, v, mk]) => (
                  <div key={label}>
                    <div style={{ fontFamily: ESANS, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#9a9490" }}>{label}</div>
                    <div style={{ fontFamily: ESERIF, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v != null ? CM[mk].exact(v) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Selected county panel */}
        {selRec && selected && data && (
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
              <button onClick={() => setSelected(null)} aria-label={`Close the ${selRec.name} panel`} style={{ border: "none", background: "none", fontFamily: ESANS, fontSize: 16, color: EC.mute, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
              {METRIC_ORDER.map(k => {
                const { v, from } = resolve(data, selected, k, safeYearIdx);
                // The base year is the first year this county actually reported,
                // which is often not years[0]. Printing years[0] regardless
                // attributed a 2015→2023 change to a 2012 starting point that
                // never existed — and for a renamed county that is every county
                // in the panel. A delta measured from the year already on screen
                // is always zero, so it is suppressed rather than shown as "+0%".
                const bi = data.years.findIndex((_, i) => resolve(data, selected, k, i).v != null);
                const base = bi >= 0 ? resolve(data, selected, k, bi).v : null;
                const comparable = v != null && base != null && bi >= 0 && bi !== safeYearIdx;
                const pp = k === "unemp" || k === "poverty";
                const delta = comparable && !pp && base !== 0 ? ((v - base) / Math.abs(base)) * 100 : null;
                const ppDelta = comparable && pp ? v - base : null;
                const span = `’${String(years[bi] ?? years[0]).slice(2)}→’${String(year).slice(2)}`;
                return (
                  <div key={k}>
                    <div style={{ fontFamily: ESANS, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: EC.mute }}>
                      {CM[k].short}{CM[k].nominal ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}> · nominal $</span> : null}
                    </div>
                    {/* Exact, not abbreviated: this panel is where a reader
                        copies a figure down, and "$67K" cannot be checked. */}
                    <div style={{ fontFamily: ESERIF, fontSize: 15, fontWeight: 600, color: k === metric ? EC.accent : EC.ink, fontVariantNumeric: "tabular-nums" }}>
                      {v != null ? CM[k].exact(v) : "—"}
                    </div>
                    {from && data.counties[from] && (
                      <div style={{ fontFamily: ESANS, fontSize: 9, color: EC.mute }}>
                        reported as {data.counties[from].name}
                      </div>
                    )}
                    {(delta != null || ppDelta != null) && (
                      <div style={{ fontFamily: ESANS, fontSize: 9.5, color: EC.mute, fontVariantNumeric: "tabular-nums" }}>
                        {ppDelta != null
                          ? `${ppDelta >= 0 ? "+" : "−"}${Math.abs(ppDelta).toFixed(1)}pp ${span}`
                          : `${delta! >= 0 ? "+" : "−"}${Math.abs(delta!).toFixed(0)}% ${span}${CM[k].nominal ? " nominal" : ""}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Mini trend sparkline for the active metric */}
            {(() => {
              const series = years.map((_, i) => resolve(data, selected, metric, i).v);
              const nums = series.filter((v): v is number => v != null);
              if (nums.length < 2) return null;
              const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
              const W2 = 240, H2 = 34;
              const xy = (v: number, i: number) =>
                [(i / (series.length - 1)) * W2, H2 - 4 - ((v - lo) / span) * (H2 - 8)] as const;
              // Break the line at every gap. Filtering the nulls out and keeping
              // the survivors' positional x drew a straight segment across the
              // gap, which reads as a measured trend through years that were
              // never published — a fabricated value with nothing to warn of it.
              const segs: string[][] = [];
              let run: string[] = [];
              series.forEach((v, i) => {
                if (v == null) { if (run.length) segs.push(run); run = []; return; }
                const [x, y] = xy(v, i);
                run.push(`${x},${y}`);
              });
              if (run.length) segs.push(run);
              return (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${EC.rule}` }}>
                  <div style={{ fontFamily: ESANS, fontSize: 8.5, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: EC.mute, marginBottom: 3 }}>
                    {M.short} · {years[0]}–{years[years.length - 1]}
                    {M.nominal ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}> · nominal $</span> : null}
                  </div>
                  <svg width="100%" height={H2} viewBox={`0 0 ${W2} ${H2}`} preserveAspectRatio="none" role="img"
                    aria-label={`${M.short} from ${years[0]} to ${years[years.length - 1]}, ranging ${M.exact(lo)} to ${M.exact(hi)}`}>
                    {segs.map((s, i) => s.length > 1
                      ? <polyline key={i} points={s.join(" ")} fill="none" stroke={EC.accent} strokeWidth={2} />
                      // A lone observation between two gaps still happened; a dot
                      // records it without implying a trend on either side of it.
                      : <circle key={i} cx={Number(s[0].split(",")[0])} cy={Number(s[0].split(",")[1])} r={2.2} fill={EC.accent} />
                    )}
                  </svg>
                  {/* The sparkline is min–max normalised, so its shape alone says
                      nothing about magnitude — a $2K wobble and a $200K climb
                      draw the identical line. Print the ends of its range. */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ESANS, fontSize: 9, color: EC.mute, fontVariantNumeric: "tabular-nums" }}>
                    <span>low {M.fmt(lo)}</span>
                    <span>high {M.fmt(hi)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Footer: year slider + legend + provenance ── */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        padding: mob ? "10px 14px calc(10px + env(safe-area-inset-bottom))" : "12px 24px",
        borderTop: `1px solid ${EC.rule}`, background: EC.card, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: mob ? 10 : 16, flexWrap: "wrap" }}>
          <button
            onClick={() => setPlaying(p => !p)}
            aria-label={playing ? "Pause the year animation" : "Play the year animation"}
            aria-pressed={playing}
            style={{
              width: 34, height: 34, borderRadius: "50%", border: `1px solid ${EC.rule}`,
              background: playing ? EC.ink : EC.card, color: playing ? "#fff" : EC.ink,
              fontSize: 12, cursor: "pointer", flexShrink: 0,
            }}
          ><span aria-hidden="true">{playing ? "❚❚" : "▶"}</span></button>
          <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 2 }}>
            <input
              type="range" min={0} max={years.length - 1} step={1} value={safeYearIdx}
              onChange={e => { setPlaying(false); setYearIdx(Number(e.target.value)); }}
              aria-label="Year of the ACS 5-year estimate"
              // Without valuetext a screen reader announces the slider index
              // ("3 of 5"), which is not a year and tells the reader nothing
              // about what they are looking at.
              aria-valuetext={`${year}, five-year estimate covering ${year - 4} to ${year}`}
              style={{ width: "100%", accentColor: EC.accent }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ESANS, fontSize: 9.5, color: EC.mute, fontVariantNumeric: "tabular-nums" }}>
              {years.map((y, i) => (
                <span key={y} style={{ fontWeight: i === safeYearIdx ? 700 : 400, color: i === safeYearIdx ? EC.accent : EC.mute }}>{y}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Legend ──
            Rendered at every viewport size. Hiding it on mobile left the
            majority of readers facing a colour ramp with no key, no units and no
            stated scope — the encoding was unreadable exactly where it was most
            used, and an unreadable encoding is an unverifiable claim. */}
        <div style={{
          display: "flex", alignItems: "center", gap: mob ? 6 : 10, flexWrap: "wrap",
          fontFamily: ESANS, fontSize: mob ? 9.5 : 10, color: EC.sub, fontVariantNumeric: "tabular-nums",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {/* Zero, not the smallest observed value: heights and colours are
                zero-based now, so the low end of the ramp genuinely is nothing.
                Printing vmin here would re-assert the truncated axis in words
                after we removed it from the geometry. */}
            <span>0</span>
            <span style={{ display: "inline-flex", borderRadius: 2, overflow: "hidden", border: `1px solid ${EC.rule}` }}>
              {/* Swatch stops are computed from the same RAMP_LO..RAMP_HI band
                  the prisms use; the old 0.1–0.9 strip advertised colours the
                  scene never rendered at either end. */}
              {[0, 0.25, 0.5, 0.75, 1].map(f => (
                <span key={f} style={{ width: mob ? 13 : 16, height: 9, background: `#${PAPER.clone().lerp(WARM, RAMP_LO + f * (RAMP_HI - RAMP_LO)).getHexString()}` }} />
              ))}
            </span>
            <span>{scale ? M.fmt(scale.vmax) : "—"}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: mob ? 13 : 16, height: 9, background: `#${MISSING.getHexString()}`, border: `1px solid ${EC.rule}`, display: "inline-block" }} />
            no data (flat)
          </span>
          <span>
            height &amp; colour = {M.short.toLowerCase()}
            {M.sqrt ? " · √ scale" : ""}
            {nominalNote ? ` · ${nominalNote}` : ""}
            {" · "}scaled within {STATE_NAMES[stateCode]}
            {scale ? `, all years (lowest county ${M.fmt(scale.vmin)})` : ""}
          </span>
        </div>

        {/* ── Provenance ──
            The slider stops are end-years of overlapping five-year windows, so
            2021 and 2023 are not two independent readings: three of the five
            survey years are the same sample. Without this note a small step
            between adjacent stops reads as a real, measured change. */}
        <div style={{ fontFamily: ESANS, fontSize: 9.5, color: EC.mute, lineHeight: 1.5 }}>
          Census ACS 5-year estimates; each label is the last year of a five-year window
          ({year - 4}–{year} for {year}). Adjacent stops overlap — 2021 and 2023 share three years of sample —
          so steps between them are smoothed, not independent readings.
          {M.nominal ? " Dollar figures are as published for each survey year and are not adjusted for inflation." : ""}
        </div>
      </div>

      {/* ── Text equivalent ──
          One table covers keyboard users, screen readers, anyone who wants the
          exact figures, and any browser where WebGL is unavailable. It is the
          canonical rendering of the data; the skyline is an illustration of it. */}
      {!error && <div style={SR_ONLY}>{dataTable}</div>}
    </div>
  );
}
