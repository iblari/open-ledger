"use client";

// State Atlas — interactive US choropleth (Phase A).
//
// - Real-geo D3 + us-atlas TopoJSON, fetched once on mount.
// - 5 cost-of-living metrics from lib/state-data.ts.
// - Two views: "Latest value" and "vs National avg".
// - Hover tooltip with state name + metric value + (in vs-avg mode) deviation.
// - Editorial styling matching the rest of the dashboard.
//
// Phase B will add: a "Change since 2020" view (needs historical data) and a
// tilegrid map style toggle. Phase C+ adds more metric sets.

import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { feature as topoFeature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import { C as EC, SERIF as ESERIF, SANS as ESANS } from "@/lib/design-tokens";
import { PillToggle } from "@/components/PillToggle";
import { StateTrendChart, stateLineColor } from "@/components/StateTrendChart";
import { StateTileGrid } from "@/components/StateTileGrid";
import {
  STATE_METRICS,
  STATE_METRIC_ORDER,
  STATE_CATEGORY_LABELS,
  STATE_NAMES,
  STATE_NAME_TO_CODE,
  type StateCode,
  type StateMetric,
  type StateMetricCategory,
  metricsForCategory,
  metricMean,
  metricExtent,
  formatMetricValue,
  formatDeviation,
} from "@/lib/state-data";

const MAX_SELECTED = 5;
type MapStyle = "geo" | "tile";

type ViewMode = "latest" | "vs_avg";

// Same teal/orange palette as the federal heatmap.
const IMPROVE_RGB = "13, 115, 119";
const DECLINE_RGB = "194, 65, 12";

function colorFor(m: StateMetric, v: number | undefined, view: ViewMode): string {
  if (v === undefined || !isFinite(v)) return EC.rule;
  if (view === "latest") {
    const [lo, hi] = metricExtent(m);
    const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    const alpha = 0.18 + t * 0.72;
    const hue = m.costLike ? DECLINE_RGB : IMPROVE_RGB;
    return `rgba(${hue}, ${alpha})`;
  }
  // vs_avg
  const avg = metricMean(m);
  const dev = v - avg;
  const vals = Object.values(m.latest) as number[];
  const maxDev = Math.max(...vals.map(x => Math.abs(x - avg)));
  const t = maxDev === 0 ? 0 : Math.abs(dev) / maxDev;
  const alpha = 0.18 + t * 0.72;
  // For cost-like metrics, "higher than average" reads as worse → orange.
  // For non-cost metrics, "higher than average" reads as better → teal.
  const isHigher = dev >= 0;
  const hue = m.costLike
    ? (isHigher ? DECLINE_RGB : IMPROVE_RGB)
    : (isHigher ? IMPROVE_RGB : DECLINE_RGB);
  return `rgba(${hue}, ${alpha})`;
}

type TooltipState = { name: string; html: string; x: number; y: number } | null;

export function StateAtlas() {
  const [mk, setMk] = useState<string>(STATE_METRIC_ORDER[0]);
  const [view, setView] = useState<ViewMode>("latest");
  const [mapStyle, setMapStyle] = useState<MapStyle>("geo");
  const [topo, setTopo] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  // Selected states (max 5) — drives the per-state lines in the trend chart
  // and the thicker stroke on the map. Order preserved for stable colors.
  const [selected, setSelected] = useState<StateCode[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const metric = STATE_METRICS[mk];

  function toggleSelect(code: StateCode) {
    setSelected(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, code];
    });
  }
  function colorIndexFor(code: StateCode): number {
    return selected.indexOf(code);
  }

  // Fetch topojson once on mount. us-atlas is ~150KB; CDN cached forever.
  useEffect(() => {
    let cancelled = false;
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(j => { if (!cancelled) setTopo(j); })
      .catch(e => { if (!cancelled) setLoadError(String(e.message || e)); });
    return () => { cancelled = true; };
  }, []);

  // Build state features once topology arrives.
  const features = useMemo<Feature<Geometry, { name: string }>[]>(() => {
    if (!topo) return [];
    // us-atlas shape: { objects: { states: { ... } } }
    const t = topo as { objects: { states: unknown } };
    const fc = topoFeature(t as never, t.objects.states as never) as unknown as FeatureCollection<Geometry, { name: string }>;
    return fc.features;
  }, [topo]);

  // Memoize the path generator (depends only on projection — no inputs change).
  const pathFn = useMemo(() => geoPath(geoAlbersUsa().scale(1100).translate([450, 260])), []);

  // Render / re-render the SVG paths whenever metric, view, features or
  // selection changes. Selected states get a thicker colored stroke from the
  // trend chart's palette — visually links the map to the lines below.
  useEffect(() => {
    if (!svgRef.current || features.length === 0) return;
    const svg = select(svgRef.current);
    const sel = svg
      .selectAll<SVGPathElement, Feature<Geometry, { name: string }>>("path.state")
      .data(features, d => d.properties.name);
    sel.enter()
      .append("path")
      .attr("class", "state")
      .attr("d", d => pathFn(d) || "")
      .style("cursor", "pointer")
      .merge(sel as never)
      .attr("fill", d => {
        const code = STATE_NAME_TO_CODE[d.properties.name];
        const v = code ? metric.latest[code] : undefined;
        return colorFor(metric, v, view);
      })
      .attr("stroke", d => {
        const code = STATE_NAME_TO_CODE[d.properties.name];
        if (code && selected.includes(code)) return stateLineColor(selected.indexOf(code));
        return "#fff";
      })
      .attr("stroke-width", d => {
        const code = STATE_NAME_TO_CODE[d.properties.name];
        return code && selected.includes(code) ? 2.5 : 0.8;
      });
    sel.exit().remove();
  }, [features, metric, view, pathFn, selected]);

  function handleEnter(e: React.MouseEvent<SVGPathElement>, d: Feature<Geometry, { name: string }>) {
    const code = STATE_NAME_TO_CODE[d.properties.name];
    if (!code) return;
    const v = metric.latest[code];
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    let html: string;
    if (view === "vs_avg" && v !== undefined) {
      const avg = metricMean(metric);
      const dev = v - avg;
      html = `${formatMetricValue(metric, v)} <span style="opacity:.55">(${formatDeviation(metric, dev)} vs avg)</span>`;
    } else {
      html = formatMetricValue(metric, v);
    }
    setTooltip({
      name: d.properties.name,
      html,
      x: e.clientX - rect.left + 14,
      y: e.clientY - rect.top - 14,
    });
  }

  // Attach pointer + click handlers via D3 — React doesn't bind to dynamically-
  // added SVG paths cleanly. Re-attach whenever the data shape changes.
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    svg.selectAll<SVGPathElement, Feature<Geometry, { name: string }>>("path.state")
      .on("mousemove", function (ev, d) {
        handleEnter(ev as unknown as React.MouseEvent<SVGPathElement>, d);
      })
      .on("mouseleave", () => setTooltip(null))
      .on("click", function (_ev, d) {
        const code = STATE_NAME_TO_CODE[d.properties.name];
        if (code) toggleSelect(code);
      });
  }, [features, metric, view, selected]);

  return (
    <>
    <div style={{ background: EC.card, border: `1px solid ${EC.rule}`, borderRadius: 4, overflow: "hidden" }}>
      {/* Toggle bar — View + Map style. Metric picker lives below in a
          grouped row because we now have 14 metrics across 3 categories. */}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center",
        gap: 16, padding: "10px 14px",
        background: EC.paper, borderBottom: `1px solid ${EC.rule}`,
        flexWrap: "wrap",
      }}>
        <PillToggle<MapStyle>
          label="Map"
          value={mapStyle}
          onChange={setMapStyle}
          options={[
            { value: "geo", label: "Geographic" },
            { value: "tile", label: "Tilegrid" },
          ]}
        />
        <PillToggle<ViewMode>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "latest", label: "Latest" },
            { value: "vs_avg", label: "vs Avg" },
          ]}
        />
      </div>

      {/* Grouped metric picker — 3 sections (Cost / Tax / Demographics).
          Each section header is a small caps label; pills wrap inline. */}
      <div style={{
        padding: "12px 14px 10px",
        background: EC.card,
        borderBottom: `1px solid ${EC.rule}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {(["cost", "tax", "demo"] as StateMetricCategory[]).map(cat => {
          const keys = metricsForCategory(cat);
          if (keys.length === 0) return null;
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: ESANS, fontSize: 10, fontWeight: 500,
                letterSpacing: "0.12em", textTransform: "uppercase", color: EC.mute,
                minWidth: 110,
              }}>{STATE_CATEGORY_LABELS[cat]}</span>
              <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                {keys.map(k => {
                  const active = mk === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setMk(k)}
                      aria-pressed={active}
                      style={{
                        fontSize: 11, padding: "4px 10px",
                        border: `1px solid ${active ? EC.ink : EC.rule}`,
                        borderRadius: 3,
                        background: active ? EC.ink : "transparent",
                        color: active ? EC.bg : EC.sub,
                        fontWeight: 500,
                        fontFamily: ESANS,
                        cursor: "pointer",
                        transition: "all 0.12s",
                      }}
                    >
                      {STATE_METRICS[k].shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Map — either real-geo D3 choropleth or tilegrid cartogram */}
      {mapStyle === "tile" && (
        <StateTileGrid
          metric={metric}
          colorFor={(m, v) => colorFor(m, v, view)}
          formatValue={(v) => {
            if (v === undefined) return "—";
            if (view === "vs_avg") {
              const dev = v - metricMean(metric);
              return `${formatMetricValue(metric, v)} (${formatDeviation(metric, dev)} vs avg)`;
            }
            return formatMetricValue(metric, v);
          }}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      )}
      {mapStyle === "geo" && (
      <div ref={wrapRef} style={{ position: "relative", padding: 16, background: EC.card }}>
        {loadError && (
          <div style={{ textAlign: "center", padding: 40, fontFamily: ESANS, fontSize: 13, color: EC.sub }}>
            Couldn&rsquo;t load the map data. <span style={{ color: EC.mute }}>({loadError})</span>
          </div>
        )}
        {!topo && !loadError && (
          <div style={{ textAlign: "center", padding: 80, fontFamily: ESANS, fontSize: 12, color: EC.mute, letterSpacing: "0.04em" }}>
            Loading map…
          </div>
        )}
        {topo !== null && (
          <svg ref={svgRef}
            viewBox="0 0 900 540"
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "auto", display: "block" }}
            aria-label="US state choropleth map"
          />
        )}
        {tooltip && (
          <div style={{
            position: "absolute",
            left: tooltip.x, top: tooltip.y,
            background: EC.ink, color: "#fff",
            padding: "8px 12px", borderRadius: 4,
            fontSize: 12, fontFamily: ESANS, lineHeight: 1.4,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            minWidth: 160, zIndex: 10,
            fontVariantNumeric: "tabular-nums",
          }}>
            <div style={{ fontFamily: ESERIF, fontWeight: 600, fontSize: 13 }}>{tooltip.name}</div>
            <div style={{
              fontFamily: ESERIF, fontWeight: 500, marginTop: 2,
              color: metric.costLike ? "#fed7aa" : "#8ee3e6",
            }} dangerouslySetInnerHTML={{ __html: tooltip.html }} />
          </div>
        )}
      </div>
      )}

      {/* Legend strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: EC.paper, borderTop: `1px solid ${EC.rule}`,
        fontSize: 11, color: EC.sub, letterSpacing: "0.03em", flexWrap: "wrap", gap: 10,
        fontFamily: ESANS,
      }}>
        <span>
          <strong style={{ color: EC.ink, fontWeight: 500 }}>{metric.label}</strong>
          {" — "}
          {view === "latest"
            ? <>{metric.desc} <span style={{ color: EC.mute }}>· {metric.source} · {metric.asOf}</span></>
            : <>deviation from the 51-jurisdiction unweighted mean of {formatMetricValue(metric, metricMean(metric))}.</>}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {view === "latest" ? (
            <>
              <span>Lower</span>
              <ColorRamp single hue={metric.costLike ? DECLINE_RGB : IMPROVE_RGB} />
              <span>Higher</span>
            </>
          ) : (
            <>
              <span>{metric.costLike ? "Below avg" : "Above avg"}</span>
              <ColorRamp diverging firstHue={metric.costLike ? IMPROVE_RGB : DECLINE_RGB} secondHue={metric.costLike ? DECLINE_RGB : IMPROVE_RGB} />
              <span>{metric.costLike ? "Above avg" : "Below avg"}</span>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Trend chart + selected-state chips */}
    <StateTrendChart metric={metric} selected={selected} />

    {selected.length > 0 && (
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8,
        marginTop: 10, padding: "0 2px",
      }}>
        <span style={{
          fontFamily: ESANS, fontSize: 10, color: EC.sub,
          letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
        }}>
          On chart
        </span>
        {selected.map((code) => {
          const idx = colorIndexFor(code);
          const color = stateLineColor(idx);
          return (
            <button key={code} onClick={() => toggleSelect(code)} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 3,
              border: `1px solid ${color}`,
              background: `${color}10`,
              color: color,
              fontFamily: ESANS, fontSize: 11, fontWeight: 500,
              cursor: "pointer", letterSpacing: "-0.01em",
            }} aria-label={`Remove ${STATE_NAMES[code]} from chart`}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
              {STATE_NAMES[code]}
              <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.7, marginLeft: 2 }}>×</span>
            </button>
          );
        })}
        <button onClick={() => setSelected([])} style={{
          padding: "4px 10px", borderRadius: 3,
          border: `1px dashed ${EC.rule}`, background: "transparent",
          color: EC.sub, fontFamily: ESANS, fontSize: 11, fontWeight: 500,
          cursor: "pointer", marginLeft: "auto",
        }}>
          Clear all
        </button>
      </div>
    )}

    {selected.length === 0 && (
      <p style={{
        fontFamily: ESANS, fontSize: 11, color: EC.mute,
        marginTop: 10, padding: "0 2px", fontStyle: "italic",
      }}>
        Tip: click any state on the map to add its 10-year line to the chart. Up to {MAX_SELECTED} at a time.
      </p>
    )}
    </>
  );
}

function ColorRamp({ single, hue, diverging, firstHue, secondHue }: {
  single?: boolean;
  diverging?: boolean;
  hue?: string;
  firstHue?: string;
  secondHue?: string;
}) {
  const cellStyle = { width: 16, height: 10, display: "inline-block" } as const;
  if (single && hue) {
    return (
      <div style={{ display: "flex", border: `1px solid ${EC.rule}`, borderRadius: 2, overflow: "hidden" }}>
        {[0.18, 0.32, 0.46, 0.6, 0.74, 0.88].map((a, i) =>
          <i key={i} style={{ ...cellStyle, background: `rgba(${hue}, ${a})` }} />
        )}
      </div>
    );
  }
  if (diverging && firstHue && secondHue) {
    return (
      <div style={{ display: "flex", border: `1px solid ${EC.rule}`, borderRadius: 2, overflow: "hidden" }}>
        {[0.74, 0.46, 0.22].map((a, i) =>
          <i key={"a" + i} style={{ ...cellStyle, background: `rgba(${firstHue}, ${a})` }} />
        )}
        <i style={{ ...cellStyle, background: EC.paper }} />
        {[0.22, 0.46, 0.74].map((a, i) =>
          <i key={"b" + i} style={{ ...cellStyle, background: `rgba(${secondHue}, ${a})` }} />
        )}
      </div>
    );
  }
  return null;
}
