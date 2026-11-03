"use client";
import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/polling";

/**
 * Interactive polling map (Leaflet + OpenStreetMap tiles, loaded on demand).
 * Pinch/scroll to zoom, drag to pan, tap a pin for details and directions.
 *  red = your polling place · dark = other precincts' polling places · grey = drop boxes · blue = you
 */
type L = any; // eslint-disable-line @typescript-eslint/no-explicit-any
declare global { interface Window { L?: L } }
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/leaflet";
let loading: Promise<L> | null = null;
function loadLeaflet(): Promise<L> {
  if (typeof window === "undefined") return Promise.reject();
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `${LEAFLET}.css`; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = `${LEAFLET}.js`; s.async = true;
    s.onload = () => res(window.L); s.onerror = () => { loading = null; rej(new Error("leaflet")); };
    document.head.appendChild(s);
  });
  return loading;
}

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const addr = (p: Place) => [p.address, p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const dirs = (p: Place) => {
  const ll = `${p.lat},${p.lng}`;
  return `<div style="display:flex;gap:10px;margin-top:6px"><a href="https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(p.name)}" target="_blank" rel="noopener">Apple Maps ↗</a><a href="https://www.google.com/maps/dir/?api=1&destination=${ll}" target="_blank" rel="noopener">Google Maps ↗</a></div>`;
};
const pin = (color: string, size: number) => `<span style="display:block;width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"></span>`;

export default function PollMap({ mine, home, others, drops, onPick }: {
  mine: Place; home?: { lat: number; lng: number } | null; others: Place[]; drops: Place[]; onPick?: (p: Place) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L>(null);
  const layer = useRef<L>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then(Lf => {
      if (!alive || !box.current || map.current) return;
      const m = Lf.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, tap: true });
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      map.current = m; layer.current = Lf.layerGroup().addTo(m);
      draw(true);
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { draw(false); }, [mine, home, others, drops]); // redraw when pins change

  function draw(fit: boolean) {
    const Lf = window.L, m = map.current, g = layer.current;
    if (!Lf || !m || !g) return;
    g.clearLayers();
    const add = (p: Place, color: string, size: number, label: string, z = 0) => {
      if (p.lat == null || p.lng == null) return;
      const mk = Lf.marker([p.lat, p.lng], { icon: Lf.divIcon({ className: "", html: pin(color, size), iconSize: [size, size], iconAnchor: [size / 2, size] }), zIndexOffset: z, title: p.name });
      mk.bindPopup(`<div style="font:13px/1.4 'DM Sans',system-ui,sans-serif;min-width:180px"><div style="font-size:10.5px;letter-spacing:.08em;color:#8A8378;font-weight:700">${label}</div><b style="font-size:14px">${esc(p.name)}</b><div style="color:#6B655C">${esc(addr(p))}</div>${p.hours ? `<div>${esc(p.hours)}</div>` : ""}${dirs(p)}</div>`);
      mk.on("click", () => onPick?.(p));
      mk.addTo(g);
    };
    drops.forEach(d => add(d, "#8A8378", 16, "BALLOT DROP BOX"));
    others.filter(o => !(o.lat === mine.lat && o.lng === mine.lng)).forEach(o => add(o, "#3d3833", 18, "ANOTHER PRECINCT'S POLLING PLACE", 100));
    add(mine, "#C1272D", 28, "YOUR POLLING PLACE", 1000);
    if (home) Lf.circleMarker([home.lat, home.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#2F6FB0", fillOpacity: 1 }).bindTooltip("You").addTo(g);
    if (fit && mine.lat != null) {
      const pts: [number, number][] = [[mine.lat, mine.lng!]];
      if (home) pts.push([home.lat, home.lng]);
      m.fitBounds(Lf.latLngBounds(pts).pad(0.6), { maxZoom: 16 });
      if (pts.length === 1) m.setZoom(15);
    }
  }
  const recenter = () => {
    const Lf = window.L, m = map.current; if (!Lf || !m || mine.lat == null) return;
    const pts: [number, number][] = [[mine.lat, mine.lng!]]; if (home) pts.push([home.lat, home.lng]);
    m.fitBounds(Lf.latLngBounds(pts).pad(0.6), { maxZoom: 16 });
  };

  if (failed) return null;
  return (
    <div style={{ position: "relative" }}>
      <div ref={box} style={{ height: 300, borderRadius: 12, overflow: "hidden", background: "#E9EEE6", zIndex: 0 }} />
      <button type="button" onClick={recenter} aria-label="Back to my polling place" style={{ position: "absolute", right: 10, top: 10, zIndex: 500, background: "#fff", border: "1px solid #D9D2C7", borderRadius: 8, padding: "6px 9px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',system-ui,sans-serif" }}>Recenter</button>
    </div>
  );
}
