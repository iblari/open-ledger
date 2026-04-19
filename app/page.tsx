"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import Link from "next/link";

/* ─────────────────────────────────────────────
   DESIGN TOKENS — matches editorial system
───────────────────────────────────────────── */
const C = {
  bg: "#f8f5f0",
  paper: "#f3ede5",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  gold: "#a67c00",
  blue: "#1d4ed8",
  highlight: "#fef9e7",
  improveStrong: "#0d7377",
  improveMed: "#14a3a8",
  improveLight: "#8ee3e6",
  declineStrong: "#c2410c",
  declineMed: "#ea580c",
  declineLight: "#fed7aa",
  neutral: "#d4cfc5",
};

const SERIF = "'Source Serif 4', Georgia, serif";
const SANS = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";

/* ─────────────────────────────────────────────
   ADMINS & METRIC DATA — subset for heatmap
───────────────────────────────────────────── */
const ADMINS: Record<string, { name: string; party: string; years: string; color: string; full: string }> = {
  clinton: { name: "Clinton", party: "D", years: "'93–'01", color: "#1e6b9e", full: "1993–2001" },
  bush:    { name: "Bush W.", party: "R", years: "'01–'09", color: "#8b4c70", full: "2001–2009" },
  obama:   { name: "Obama",   party: "D", years: "'09–'17", color: "#2d6a4f", full: "2009–2017" },
  trump1:  { name: "Trump",   party: "R", years: "'17–'21", color: "#c1272d", full: "2017–2021" },
  biden:   { name: "Biden",   party: "D", years: "'21–'25", color: "#4361a6", full: "2021–2025" },
};
const AID = ["clinton", "bush", "obama", "trump1", "biden"];

type DataPoint = { y: number; v: number; a: string };
type MetricDef = {
  l: string; u: string; inv: boolean; cat: string;
  d: DataPoint[];
};

const METRICS: Record<string, MetricDef> = {
  gdp: { l: "GDP Growth", u: "%", inv: false, cat: "Growth",
    d: [{ y: 1993, v: 2.7, a: "clinton" }, { y: 1994, v: 4.0, a: "clinton" }, { y: 1995, v: 2.7, a: "clinton" }, { y: 1996, v: 3.8, a: "clinton" }, { y: 1997, v: 4.5, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" }, { y: 1999, v: 4.7, a: "clinton" }, { y: 2000, v: 4.1, a: "clinton" }, { y: 2001, v: 1.0, a: "bush" }, { y: 2002, v: 1.7, a: "bush" }, { y: 2003, v: 2.8, a: "bush" }, { y: 2004, v: 3.8, a: "bush" }, { y: 2005, v: 3.5, a: "bush" }, { y: 2006, v: 2.8, a: "bush" }, { y: 2007, v: 2.0, a: "bush" }, { y: 2008, v: -0.1, a: "bush" }, { y: 2009, v: -2.6, a: "obama" }, { y: 2010, v: 2.7, a: "obama" }, { y: 2011, v: 1.5, a: "obama" }, { y: 2012, v: 2.3, a: "obama" }, { y: 2013, v: 1.8, a: "obama" }, { y: 2014, v: 2.3, a: "obama" }, { y: 2015, v: 2.7, a: "obama" }, { y: 2016, v: 1.7, a: "obama" }, { y: 2017, v: 2.2, a: "trump1" }, { y: 2018, v: 2.9, a: "trump1" }, { y: 2019, v: 2.3, a: "trump1" }, { y: 2020, v: -2.8, a: "trump1" }, { y: 2021, v: 5.9, a: "biden" }, { y: 2022, v: 1.9, a: "biden" }, { y: 2023, v: 2.5, a: "biden" }, { y: 2024, v: 2.8, a: "biden" }] },
  unemployment: { l: "Unemployment", u: "%", inv: true, cat: "Jobs",
    d: [{ y: 1993, v: 6.9, a: "clinton" }, { y: 1994, v: 6.1, a: "clinton" }, { y: 1995, v: 5.6, a: "clinton" }, { y: 1996, v: 5.4, a: "clinton" }, { y: 1997, v: 4.9, a: "clinton" }, { y: 1998, v: 4.5, a: "clinton" }, { y: 1999, v: 4.2, a: "clinton" }, { y: 2000, v: 4.0, a: "clinton" }, { y: 2001, v: 4.7, a: "bush" }, { y: 2002, v: 5.8, a: "bush" }, { y: 2003, v: 6.0, a: "bush" }, { y: 2004, v: 5.5, a: "bush" }, { y: 2005, v: 5.1, a: "bush" }, { y: 2006, v: 4.6, a: "bush" }, { y: 2007, v: 4.6, a: "bush" }, { y: 2008, v: 5.8, a: "bush" }, { y: 2009, v: 9.3, a: "obama" }, { y: 2010, v: 9.6, a: "obama" }, { y: 2011, v: 8.9, a: "obama" }, { y: 2012, v: 8.1, a: "obama" }, { y: 2013, v: 7.4, a: "obama" }, { y: 2014, v: 6.2, a: "obama" }, { y: 2015, v: 5.3, a: "obama" }, { y: 2016, v: 4.9, a: "obama" }, { y: 2017, v: 4.4, a: "trump1" }, { y: 2018, v: 3.9, a: "trump1" }, { y: 2019, v: 3.7, a: "trump1" }, { y: 2020, v: 8.1, a: "trump1" }, { y: 2021, v: 5.4, a: "biden" }, { y: 2022, v: 3.6, a: "biden" }, { y: 2023, v: 3.6, a: "biden" }, { y: 2024, v: 4.0, a: "biden" }] },
  inflation: { l: "Inflation (CPI)", u: "%", inv: true, cat: "Prices",
    d: [{ y: 1993, v: 3.0, a: "clinton" }, { y: 1994, v: 2.6, a: "clinton" }, { y: 1995, v: 2.8, a: "clinton" }, { y: 1996, v: 2.9, a: "clinton" }, { y: 1997, v: 2.3, a: "clinton" }, { y: 1998, v: 1.5, a: "clinton" }, { y: 1999, v: 2.2, a: "clinton" }, { y: 2000, v: 3.4, a: "clinton" }, { y: 2001, v: 2.8, a: "bush" }, { y: 2002, v: 1.6, a: "bush" }, { y: 2003, v: 2.3, a: "bush" }, { y: 2004, v: 2.7, a: "bush" }, { y: 2005, v: 3.4, a: "bush" }, { y: 2006, v: 3.2, a: "bush" }, { y: 2007, v: 2.9, a: "bush" }, { y: 2008, v: 3.8, a: "bush" }, { y: 2009, v: -0.3, a: "obama" }, { y: 2010, v: 1.6, a: "obama" }, { y: 2011, v: 3.2, a: "obama" }, { y: 2012, v: 2.1, a: "obama" }, { y: 2013, v: 1.5, a: "obama" }, { y: 2014, v: 1.6, a: "obama" }, { y: 2015, v: 0.1, a: "obama" }, { y: 2016, v: 1.3, a: "obama" }, { y: 2017, v: 2.1, a: "trump1" }, { y: 2018, v: 2.4, a: "trump1" }, { y: 2019, v: 1.8, a: "trump1" }, { y: 2020, v: 1.2, a: "trump1" }, { y: 2021, v: 4.7, a: "biden" }, { y: 2022, v: 8.0, a: "biden" }, { y: 2023, v: 4.1, a: "biden" }, { y: 2024, v: 2.9, a: "biden" }] },
  sp500: { l: "S&P 500", u: "idx", inv: false, cat: "Markets",
    d: [{ y: 1993, v: 452, a: "clinton" }, { y: 1994, v: 460, a: "clinton" }, { y: 1995, v: 615, a: "clinton" }, { y: 1996, v: 741, a: "clinton" }, { y: 1997, v: 970, a: "clinton" }, { y: 1998, v: 1229, a: "clinton" }, { y: 1999, v: 1469, a: "clinton" }, { y: 2000, v: 1320, a: "clinton" }, { y: 2001, v: 1148, a: "bush" }, { y: 2002, v: 880, a: "bush" }, { y: 2003, v: 1112, a: "bush" }, { y: 2004, v: 1212, a: "bush" }, { y: 2005, v: 1249, a: "bush" }, { y: 2006, v: 1418, a: "bush" }, { y: 2007, v: 1468, a: "bush" }, { y: 2008, v: 903, a: "bush" }, { y: 2009, v: 1115, a: "obama" }, { y: 2010, v: 1258, a: "obama" }, { y: 2011, v: 1258, a: "obama" }, { y: 2012, v: 1426, a: "obama" }, { y: 2013, v: 1848, a: "obama" }, { y: 2014, v: 2059, a: "obama" }, { y: 2015, v: 2044, a: "obama" }, { y: 2016, v: 2239, a: "obama" }, { y: 2017, v: 2674, a: "trump1" }, { y: 2018, v: 2507, a: "trump1" }, { y: 2019, v: 3231, a: "trump1" }, { y: 2020, v: 3756, a: "trump1" }, { y: 2021, v: 4766, a: "biden" }, { y: 2022, v: 3840, a: "biden" }, { y: 2023, v: 4770, a: "biden" }, { y: 2024, v: 5881, a: "biden" }] },
  debt_gdp: { l: "Debt-to-GDP", u: "%", inv: true, cat: "Fiscal",
    d: [{ y: 1993, v: 64.4, a: "clinton" }, { y: 1994, v: 64.0, a: "clinton" }, { y: 1995, v: 64.2, a: "clinton" }, { y: 1996, v: 63.3, a: "clinton" }, { y: 1997, v: 60.3, a: "clinton" }, { y: 1998, v: 57.2, a: "clinton" }, { y: 1999, v: 55.3, a: "clinton" }, { y: 2000, v: 54.7, a: "clinton" }, { y: 2001, v: 54.3, a: "bush" }, { y: 2002, v: 56.8, a: "bush" }, { y: 2003, v: 59.1, a: "bush" }, { y: 2004, v: 61.0, a: "bush" }, { y: 2005, v: 60.9, a: "bush" }, { y: 2006, v: 61.1, a: "bush" }, { y: 2007, v: 62.0, a: "bush" }, { y: 2008, v: 67.7, a: "bush" }, { y: 2009, v: 82.4, a: "obama" }, { y: 2010, v: 91.4, a: "obama" }, { y: 2011, v: 95.6, a: "obama" }, { y: 2012, v: 99.7, a: "obama" }, { y: 2013, v: 100.4, a: "obama" }, { y: 2014, v: 103.4, a: "obama" }, { y: 2015, v: 100.8, a: "obama" }, { y: 2016, v: 105.6, a: "obama" }, { y: 2017, v: 105.0, a: "trump1" }, { y: 2018, v: 106.1, a: "trump1" }, { y: 2019, v: 107.2, a: "trump1" }, { y: 2020, v: 129.2, a: "trump1" }, { y: 2021, v: 126.4, a: "biden" }, { y: 2022, v: 120.6, a: "biden" }, { y: 2023, v: 122.3, a: "biden" }, { y: 2024, v: 124.0, a: "biden" }] },
  median_income: { l: "Median Income", u: "$K", inv: false, cat: "Wages",
    d: [{ y: 1993, v: 52.3, a: "clinton" }, { y: 1994, v: 53.2, a: "clinton" }, { y: 1995, v: 54.5, a: "clinton" }, { y: 1996, v: 55.9, a: "clinton" }, { y: 1997, v: 57.6, a: "clinton" }, { y: 1998, v: 59.5, a: "clinton" }, { y: 1999, v: 60.1, a: "clinton" }, { y: 2000, v: 59.5, a: "clinton" }, { y: 2001, v: 58.1, a: "bush" }, { y: 2002, v: 57.4, a: "bush" }, { y: 2003, v: 56.5, a: "bush" }, { y: 2004, v: 56.1, a: "bush" }, { y: 2005, v: 56.2, a: "bush" }, { y: 2006, v: 56.4, a: "bush" }, { y: 2007, v: 57.4, a: "bush" }, { y: 2008, v: 55.3, a: "bush" }, { y: 2009, v: 55.7, a: "obama" }, { y: 2010, v: 54.2, a: "obama" }, { y: 2011, v: 53.4, a: "obama" }, { y: 2012, v: 53.6, a: "obama" }, { y: 2013, v: 54.5, a: "obama" }, { y: 2014, v: 55.6, a: "obama" }, { y: 2015, v: 58.5, a: "obama" }, { y: 2016, v: 60.3, a: "obama" }, { y: 2017, v: 61.4, a: "trump1" }, { y: 2018, v: 63.2, a: "trump1" }, { y: 2019, v: 68.7, a: "trump1" }, { y: 2020, v: 67.5, a: "trump1" }, { y: 2021, v: 70.8, a: "biden" }, { y: 2022, v: 74.6, a: "biden" }, { y: 2023, v: 80.6, a: "biden" }, { y: 2024, v: 81.5, a: "biden" }] },
};

const METRIC_ORDER = ["gdp", "unemployment", "inflation", "sp500", "debt_gdp", "median_income"];

/* ─────────────────────────────────────────────
   HEATMAP HELPERS
───────────────────────────────────────────── */
function computeHeatmap() {
  const out: Record<string, Record<string, { start: number; end: number; pctChange: number; improved: boolean }>> = {};
  for (const [mk, m] of Object.entries(METRICS)) {
    out[mk] = {};
    for (const id of AID) {
      const pts = m.d.filter(d => d.a === id);
      if (pts.length < 2) continue;
      const start = pts[0].v;
      const end = pts[pts.length - 1].v;
      const pctChange = ((end - start) / Math.abs(start || 1)) * 100;
      const improved = m.inv ? end < start : end > start;
      out[mk][id] = { start, end, pctChange, improved };
    }
  }
  return out;
}

function cellColor(c: { improved: boolean; pctChange: number } | undefined) {
  if (!c) return { bg: C.paper, text: C.mute };
  const mag = Math.min(Math.abs(c.pctChange) / 50, 1);
  if (c.improved) {
    const alpha = 0.15 + mag * 0.65;
    return { bg: `rgba(13,115,119,${alpha})`, text: alpha > 0.45 ? "#fff" : C.ink };
  } else {
    const alpha = 0.15 + mag * 0.65;
    return { bg: `rgba(194,65,12,${alpha})`, text: alpha > 0.45 ? "#fff" : C.ink };
  }
}

function fmt(v: number, u: string) {
  if (u === "%") return v.toFixed(1) + "%";
  if (u === "$K") return "$" + v.toFixed(1) + "K";
  if (u === "idx") return v.toLocaleString();
  return String(v);
}

/* ─────────────────────────────────────────────
   MOBILE HOOK
───────────────────────────────────────────── */
function useIsMobile() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 768;
}

function useMedium() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w < 980;
}

/* ═══════════════════════════════════════════════
   COMPONENTS
═══════════════════════════════════════════════ */

/* ── Nav ── */
function Nav({ mob }: { mob: boolean }) {
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "color-mix(in oklab, #f8f5f0 92%, transparent)",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      borderBottom: `1px solid ${C.rule}`,
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "12px 20px" : "14px 32px", display: "flex", alignItems: "center", gap: mob ? 16 : 40 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SERIF, flexShrink: 0, whiteSpace: "nowrap", fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: C.ink, color: C.bg,
            display: "grid", placeItems: "center", fontFamily: SERIF, fontWeight: 700, fontSize: 15,
            position: "relative",
          }}>
            V
          </div>
          <span>Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
        </div>

        {/* Links — desktop only */}
        {!mob && (
          <div style={{ display: "flex", gap: 24, fontSize: 13, color: C.sub, fontWeight: 500 }}>
            <a href="#scorecard" style={{ padding: "4px 0", color: C.sub, transition: "color 0.15s" }}>Scorecard</a>
            <a href="#data" style={{ padding: "4px 0", color: C.sub }}>Deep Dive</a>
            <a href="#method" style={{ padding: "4px 0", color: C.sub }}>Methodology</a>
            <a href="#sources" style={{ padding: "4px 0", color: C.sub }}>Sources</a>
          </div>
        )}

        {/* CTA */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/dashboard" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: mob ? "8px 14px" : "10px 16px",
            borderRadius: 4, fontSize: 13, fontWeight: 500,
            background: C.ink, color: C.bg, border: `1px solid ${C.ink}`,
            textDecoration: "none", transition: "all 0.15s",
          }}>
            {mob ? "Data" : "Open the ledger"} <span>→</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero Chart Visualization ── */
function HeroViz({ mob }: { mob: boolean }) {
  const data = METRICS.gdp.d;
  if (mob) return null; // skip viz on mobile — hero stacks vertically

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4,
      padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 12px 32px -12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 14, marginBottom: 6, borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ fontWeight: 600, fontSize: 13, fontFamily: SANS }}>The economy, by administration</span>
        <span style={{ fontSize: 11, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase" }}>31 yrs · BEA</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.rule} vertical={false} />
          <XAxis dataKey="y" fontSize={10} fontFamily={SANS} stroke={C.mute} tick={{ fill: C.sub }} interval={3} />
          <YAxis fontSize={10} fontFamily={SANS} stroke={C.rule} tick={{ fill: C.sub }} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SANS, fontSize: 12 }}
            formatter={(v: number) => [`${v.toFixed(1)}%`, "GDP Growth"]}
            labelStyle={{ fontWeight: 700, color: C.ink }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={1200}>
            {data.map((d, i) => (
              <Cell key={i} fill={ADMINS[d.a]?.color || C.sub} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.sub }}>
          {AID.map(id => (
            <span key={id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 10, height: 10, borderRadius: 2, display: "inline-block", background: ADMINS[id].color }} />
              {ADMINS[id].name}
            </span>
          ))}
        </div>
        <span>Source: BEA</span>
      </div>
    </div>
  );
}

/* ── Hero ── */
function Hero({ mob, med }: { mob: boolean; med: boolean }) {
  return (
    <header style={{
      padding: mob ? "40px 0" : "56px 0 48px",
      borderBottom: `1px solid ${C.rule}`,
      background: "linear-gradient(180deg, #fbfaf6 0%, #f8f5f0 100%)",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px", display: "grid", gridTemplateColumns: med ? "1fr" : "1.15fr 1fr", gap: med ? 40 : 72, alignItems: "end" }}>
        <div>
          {/* Kicker */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: mob ? 8 : 12,
            padding: mob ? "6px 10px" : "6px 12px", border: `1px solid ${C.rule}`, borderRadius: 999,
            background: C.card, fontSize: mob ? 10 : 11, color: C.sub, letterSpacing: "0.08em",
            textTransform: "uppercase", fontWeight: 500, marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, boxShadow: `0 0 0 3px rgba(184,55,45,0.2)`, flexShrink: 0 }} />
            No spin · No editorial · You interpret
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: SERIF, fontSize: mob ? 44 : (med ? 56 : 96),
            lineHeight: 0.98, letterSpacing: "-0.032em", fontWeight: 400,
          }}>
            The economy<br />under every<br />president,<br />
            <em style={{ fontStyle: "italic", color: C.accent }}>in data.</em>
          </h1>

          {/* Sub */}
          <p style={{
            marginTop: 28, fontSize: mob ? 16 : 19, color: C.sub,
            maxWidth: "50ch", lineHeight: 1.5, fontFamily: SANS,
          }}>
            Nineteen economic metrics across five administrations, plus live military
            spend tracking across four active conflicts &mdash; 32 years of data from BEA, BLS,
            Treasury, the Fed, CSIS, Brown University, and more. We don&rsquo;t tell you who
            did better. We show you what the numbers did.
          </p>

          {/* CTA */}
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/dashboard" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px",
              borderRadius: 4, fontSize: 13, fontWeight: 500, textDecoration: "none",
              background: C.ink, color: C.bg, border: `1px solid ${C.ink}`, transition: "all 0.15s",
            }}>
              Open the ledger <span>→</span>
            </Link>
            <a href="#method" style={{
              display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 16px",
              borderRadius: 4, fontSize: 13, fontWeight: 500, textDecoration: "none",
              border: `1px solid ${C.rule}`, background: C.card, color: C.ink, transition: "all 0.15s",
            }}>
              See methodology
            </a>
            <span style={{ fontSize: 11, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase", marginLeft: 8 }}>Updated Apr 2026</span>
          </div>

          {/* Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: mob ? "1fr 1fr" : "repeat(4, 1fr)",
            marginTop: 48, paddingTop: 28, borderTop: `1px solid ${C.rule}`, gap: mob ? 16 : 24,
          }}>
            {[{ n: "19", l: "Economic metrics" }, { n: "4", l: "Active conflicts tracked" }, { n: "5", l: "Administrations" }, { n: "32", l: "Years of data", suffix: "yrs" }].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: SERIF, fontSize: mob ? 28 : 40, lineHeight: 1, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>
                  {s.suffix ? <>{s.n}<span style={{ color: C.mute }}>{s.suffix}</span></> : s.n}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.sub, letterSpacing: "0.09em", textTransform: "uppercase", fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <HeroViz mob={mob} />
      </div>
    </header>
  );
}

/* ── Scorecard Heatmap ── */
function ScorecardSection({ mob, med }: { mob: boolean; med: boolean }) {
  const heat = useMemo(() => computeHeatmap(), []);

  return (
    <section id="scorecard" style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        {/* Section head */}
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 01 · The Ledger</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              Every metric,<br />every president, <em style={{ fontStyle: "italic", color: C.accent }}>at a glance.</em>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 17, color: C.sub, maxWidth: "56ch", lineHeight: 1.5 }}>
              Each cell shows the percent change in that metric across the administration&rsquo;s tenure.
              Greens mean the number moved in the conventionally-preferred direction;
              oranges mean it moved away. <strong style={{ color: C.ink }}>We make no claim that the president
              caused the change</strong> — that&rsquo;s your job.
            </p>
            <Link href="/dashboard" style={{
              marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 13, color: C.accent, fontWeight: 500, textDecoration: "none",
              borderBottom: "1px solid currentColor", paddingBottom: 1,
            }}>
              Open full scorecard ↗
            </Link>
          </div>
        </div>

        {/* Heatmap */}
        {mob && (
          <div style={{ fontSize: 11, color: C.mute, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span>←</span> Scroll to see all presidents <span>→</span>
          </div>
        )}
        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: mob ? "130px repeat(5, 1fr)" : "200px repeat(5, 1fr)",
            alignItems: "center", background: C.paper, borderBottom: `1px solid ${C.rule}`,
            padding: "10px 0", fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
            color: C.sub, fontWeight: 500, minWidth: mob ? 700 : undefined,
          }}>
            <div style={{ paddingLeft: 20 }}>Metric</div>
            {AID.map(id => {
              const a = ADMINS[id];
              return (
                <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", fontSize: 10 }}>
                  <div style={{ width: 28, height: 3, borderRadius: 2, background: a.color }} />
                  <div style={{ color: C.ink, fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", textTransform: "none", fontFamily: SERIF }}>{a.name}</div>
                  {!mob && <div style={{ color: C.mute, letterSpacing: "0.04em", fontFamily: SANS }}>{a.full}</div>}
                </div>
              );
            })}
          </div>

          {/* Data rows */}
          {METRIC_ORDER.map(mk => {
            const m = METRICS[mk];
            return (
              <div key={mk} style={{
                display: "grid",
                gridTemplateColumns: mob ? "130px repeat(5, 1fr)" : "200px repeat(5, 1fr)",
                alignItems: "center", borderTop: `1px solid ${C.rule}`, fontSize: 13,
                transition: "background 0.15s", minWidth: mob ? 700 : undefined,
              }}>
                <div style={{ padding: mob ? "12px" : "14px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 10, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.cat}</span>
                  <span style={{ fontWeight: 600, color: C.ink, fontSize: 13 }}>{m.l}</span>
                </div>
                {AID.map(id => {
                  const c = heat[mk]?.[id];
                  const st = cellColor(c);
                  const pct = c ? `${c.pctChange >= 0 ? "+" : ""}${c.pctChange.toFixed(1)}%` : "—";
                  return (
                    <Link key={id} href={`/dashboard?metric=${mk}`} style={{
                      margin: mob ? 3 : 5, height: mob ? 44 : 52, borderRadius: 3,
                      display: "grid", placeItems: "center", padding: "4px 6px",
                      background: st.bg, color: st.text, cursor: "pointer",
                      transition: "transform 0.15s, box-shadow 0.15s",
                      textDecoration: "none",
                    }}>
                      <span style={{ fontFamily: SERIF, fontSize: mob ? 13 : 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}</span>
                      {!mob && c && (
                        <span style={{ fontSize: 9, letterSpacing: "0.04em", opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(c.start, m.u)} → {fmt(c.end, m.u)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {/* Legend strip */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", background: C.paper, borderTop: `1px solid ${C.rule}`,
            fontSize: 11, color: C.sub, letterSpacing: "0.04em", flexWrap: "wrap", gap: 12,
          }}>
            <span>Each cell = percent change from first to last year of administration.</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Worsened</span>
              <div style={{ display: "flex", border: `1px solid ${C.rule}`, borderRadius: 3, overflow: "hidden" }}>
                {[0.8, 0.45, 0.2].map((a, i) => <i key={i} style={{ width: 22, height: 14, display: "inline-block", background: `rgba(194,65,12,${a})` }} />)}
                <i style={{ width: 22, height: 14, display: "inline-block", background: C.paper }} />
                {[0.2, 0.45, 0.8].map((a, i) => <i key={i} style={{ width: 22, height: 14, display: "inline-block", background: `rgba(13,115,119,${a})` }} />)}
              </div>
              <span>Improved</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Deep Dive ── */
function DeepDiveSection({ mob, med }: { mob: boolean; med: boolean }) {
  const [mk, setMk] = useState("gdp");
  const m = METRICS[mk];
  const heat = useMemo(() => computeHeatmap(), []);

  return (
    <section id="data" style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 02 · Deep Dive</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              The long view,<br />color-coded by <em style={{ fontStyle: "italic", color: C.accent }}>who held office.</em>
            </h2>
          </div>
          <p style={{ fontSize: 17, color: C.sub, maxWidth: "56ch", lineHeight: 1.5 }}>
            Pick a metric and see the full 31-year timeline. Each president&rsquo;s segment is
            color-coded so you can compare spans at a glance — or zoom into the full dashboard
            for all 19 metrics side by side.
          </p>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden", display: "grid", gridTemplateColumns: med ? "1fr" : "1.2fr 1fr" }}>
          {/* Chart side */}
          <div style={{ padding: mob ? 20 : "28px 32px", borderRight: med ? "none" : `1px solid ${C.rule}`, borderBottom: med ? `1px solid ${C.rule}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
              <h3 style={{ fontFamily: SERIF, fontSize: mob ? 22 : 30, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1.15, margin: 0 }}>
                {m.l} <em style={{ fontStyle: "italic", color: C.sub }}>({m.u})</em>
              </h3>
            </div>

            {/* Metric switch */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 4, padding: 6,
              background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6,
              width: "fit-content", marginTop: 16, marginBottom: 20,
            }}>
              {METRIC_ORDER.map(k => (
                <button key={k} onClick={() => setMk(k)} style={{
                  padding: "6px 12px", fontSize: 11, letterSpacing: "0.04em", fontWeight: 500,
                  color: mk === k ? C.ink : C.sub, borderRadius: 3, border: mk === k ? `1px solid ${C.rule}` : "1px solid transparent",
                  background: mk === k ? C.card : "transparent", cursor: "pointer",
                  boxShadow: mk === k ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                  transition: "all 0.15s",
                }}>
                  {METRICS[k].l}
                </button>
              ))}
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={mob ? 260 : 360}>
              <BarChart data={m.d} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.rule} vertical={false} />
                <XAxis dataKey="y" fontSize={10} fontFamily={SANS} stroke={C.mute} tick={{ fill: C.sub }} interval={3} />
                <YAxis fontSize={10} fontFamily={SANS} stroke={C.rule} tick={{ fill: C.sub }} tickFormatter={v => fmt(v, m.u)} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SANS, fontSize: 12 }}
                  formatter={(v: number) => [fmt(v, m.u), m.l]}
                  labelStyle={{ fontWeight: 700, color: C.ink }}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar dataKey="v" radius={[2, 2, 0, 0]} animationDuration={800}>
                  {m.d.map((d, i) => (
                    <Cell key={i} fill={ADMINS[d.a]?.color || C.sub} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Side panel */}
          <div style={{ padding: mob ? 20 : "28px 32px", background: C.paper, display: "flex", flexDirection: "column", gap: 18 }}>
            <h4 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, letterSpacing: "-0.01em", lineHeight: 1.2, margin: 0 }}>
              By administration
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {AID.map(id => {
                const a = ADMINS[id];
                const c = heat[mk]?.[id];
                if (!c) return null;
                const up = METRICS[mk].inv ? c.end < c.start : c.end > c.start;
                return (
                  <div key={id} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12,
                    alignItems: "center", padding: "10px 12px", background: C.card,
                    border: `1px solid ${C.rule}`, borderRadius: 3, fontSize: 13,
                  }}>
                    <div style={{ width: 6, height: 32, borderRadius: 2, background: a.color }} />
                    <div>
                      <div style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 15, letterSpacing: "-0.01em" }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase" }}>{a.full}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{
                        fontFamily: SERIF, fontSize: 17, fontVariantNumeric: "tabular-nums", fontWeight: 500,
                        color: up ? C.improveStrong : C.declineStrong,
                      }}>
                        {c.pctChange >= 0 ? "+" : ""}{c.pctChange.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 10, color: C.mute, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(c.start, m.u)} → {fmt(c.end, m.u)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: "auto", padding: "14px 16px", background: C.card,
              borderLeft: `3px solid ${C.accent}`, fontSize: 11, color: C.sub, lineHeight: 1.55,
            }}>
              <strong style={{ color: C.ink, display: "block", marginBottom: 4, fontFamily: SERIF, fontWeight: 600, fontSize: 13 }}>Context matters</strong>
              Presidents inherit economic conditions and share influence with Congress, the Fed,
              and global events. Correlation ≠ causation. Use this data to inform, not to conclude.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Principles ── */
function PrinciplesSection({ mob, med }: { mob: boolean; med: boolean }) {
  const items = [
    { n: "01", t: "Raw numbers only", p: "Every value on this site comes straight from the source agency — BEA, BLS, Treasury, Census, Fed. No modeling, no seasonal adjustments of our own, no averaging across administrations.", r: "Methodology" },
    { n: "02", t: "No verdicts, no rankings.", p: "We don't pick winners. A chart shows what happened; the scorecard shows which direction the needle moved. Whether that was good or the president's doing is for you to decide.", r: "Editorial policy" },
    { n: "03", t: "Context, not commentary.", p: "Each metric comes with a definition, a benchmark from historical averages, and notes on what presidents actually influence. No op-eds, no hot takes, no guest columnists.", r: "How we write" },
  ];

  return (
    <section id="method" style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 03 · Principles</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              How we stay <em style={{ fontStyle: "italic", color: C.accent }}>out of the way.</em>
            </h2>
          </div>
          <p style={{ fontSize: 17, color: C.sub, maxWidth: "56ch", lineHeight: 1.5 }}>
            An unbiased source is a design problem before it is an editorial one.
            These three rules govern what gets published and what doesn&rsquo;t.
          </p>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: med ? "1fr" : "repeat(3, 1fr)",
          background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 4, overflow: "hidden", gap: 1,
        }}>
          {items.map(it => (
            <div key={it.n} style={{ background: C.card, padding: mob ? "24px 20px" : "32px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 400, color: C.accent, letterSpacing: "-0.02em", lineHeight: 1, fontStyle: "italic" }}>{it.n}</div>
              <h3 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, lineHeight: 1.2, letterSpacing: "-0.01em", margin: 0 }}>{it.t}</h3>
              <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: 0 }}>{it.p}</p>
              <div style={{ marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${C.rule}`, fontSize: 11, color: C.mute, letterSpacing: "0.08em", textTransform: "uppercase" }}>{it.r} ↗</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Sources ── */
function SourcesSection({ mob, med }: { mob: boolean; med: boolean }) {
  const sources = [
    { src: "BEA", d: "Bureau of Economic Analysis — GDP, trade balance, national accounts." },
    { src: "BLS", d: "Bureau of Labor Statistics — unemployment, wages, jobs, CPI." },
    { src: "Census", d: "U.S. Census Bureau — median income, poverty, demographics." },
    { src: "Treasury", d: "U.S. Treasury — federal debt, deficit, budget." },
    { src: "Federal Reserve", d: "Fed funds rate, money supply, balance sheet." },
    { src: "EIA", d: "Energy Information Administration — gasoline, energy prices." },
    { src: "CSIS", d: "Center for Strategic & International Studies — military cost estimates, defense analysis." },
    { src: "Brown Univ.", d: "Costs of War Project — total war expenditures, veteran care, conflict budgets." },
    { src: "Kiel Institute", d: "Ukraine Support Tracker — bilateral aid commitments by country." },
    { src: "CBO", d: "Congressional Budget Office — deficit projections, spending analysis." },
    { src: "S&P Global", d: "S&P 500 index, credit ratings, financial indicators." },
    { src: "CRS", d: "Congressional Research Service — supplemental appropriations, military aid reports." },
  ];

  return (
    <section id="sources" style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1.4fr", gap: med ? 16 : 64, marginBottom: 40, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Section 04 · Sources</div>
            <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400 }}>
              Where the <em style={{ fontStyle: "italic", color: C.accent }}>numbers come from.</em>
            </h2>
          </div>
          <p style={{ fontSize: 17, color: C.sub, maxWidth: "56ch", lineHeight: 1.5 }}>
            Every data point on Vote Unbiased is traceable to a single federal statistical
            agency or official market index. Click any chart cell to follow the citation trail.
          </p>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: mob ? "1fr" : (med ? "repeat(2, 1fr)" : "repeat(3, 1fr)"), gap: 12,
        }}>
          {sources.map(s => (
            <div key={s.src} style={{
              padding: "14px 16px", background: C.card, border: `1px solid ${C.rule}`,
              borderRadius: 4, display: "flex", flexDirection: "column", gap: 4,
              transition: "border-color 0.15s", cursor: "pointer",
            }}>
              <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>{s.src}</span>
              <span style={{ fontSize: 11, color: C.mute, lineHeight: 1.4 }}>{s.d}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── State Atlas Teaser ── */
function AtlasTeaser({ mob }: { mob: boolean }) {
  return (
    <section style={{ padding: mob ? "48px 0" : "72px 0", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px", textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 12 }}>Coming Soon</div>
        <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400, margin: "0 auto", maxWidth: 600 }}>
          Fifty states.<br />One square <em style={{ fontStyle: "italic", color: C.accent }}>each.</em>
        </h2>
        <p style={{ fontSize: 17, color: C.sub, maxWidth: "56ch", lineHeight: 1.5, margin: "20px auto 0" }}>
          National averages hide everything interesting. The State Atlas will let you explore
          every state, every year since 2015, on the metrics that actually move families —
          sorted so the outliers are visible at a glance.
        </p>
        <div style={{
          margin: "32px auto 0", padding: "40px 32px", background: C.paper,
          border: `1px solid ${C.rule}`, borderRadius: 4, maxWidth: 600,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3 }}>
            {Array.from({ length: 50 }).map((_, i) => (
              <div key={i} style={{
                width: mob ? 16 : 20, height: mob ? 16 : 20, borderRadius: 2,
                background: `rgba(13,115,119,${0.1 + Math.random() * 0.6})`,
              }} />
            ))}
          </div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 8 }}>Interactive cartogram — coming soon</div>
        </div>
      </div>
    </section>
  );
}

/* ── Newsletter CTA ── */
function CTASection({ mob, med }: { mob: boolean; med: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "landing-page" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setMsg("You're in. First update drops next month.");
        setEmail("");
      } else {
        setStatus("error");
        setMsg(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMsg("Network error. Try again.");
    }
  };

  return (
    <section style={{
      padding: mob ? "48px 0" : "72px 0",
      background: `linear-gradient(180deg, ${C.bg} 0%, ${C.paper} 100%)`,
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px",
        display: "grid", gridTemplateColumns: med ? "1fr" : "1fr 1fr", gap: med ? 28 : 72, alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.sub, fontWeight: 500, marginBottom: 16 }}>Monthly dispatch</div>
          <h2 style={{ fontFamily: SERIF, fontSize: mob ? 32 : 44, lineHeight: 1.05, letterSpacing: "-0.022em", fontWeight: 400, margin: 0 }}>
            One email a month.<br />The ledger, <em style={{ fontStyle: "italic", color: C.accent }}>updated.</em>
          </h2>
          <p style={{ marginTop: 16, color: C.sub, fontSize: 16, maxWidth: "44ch", lineHeight: 1.5 }}>
            New data lands, old data gets revised, and we flag the ones that changed most.
            No campaign coverage. No horse race. Just the numbers.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
          {status === "success" ? (
            <div style={{
              padding: "20px 24px", background: C.card, border: `1px solid ${C.improveStrong}`,
              borderRadius: 4, fontFamily: SANS, fontSize: 15, color: C.improveStrong, fontWeight: 600,
            }}>
              {msg}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexDirection: mob ? "column" : "row" }}>
                <input
                  type="email" placeholder="name@domain.com" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    flex: 1, padding: "14px 18px", font: "inherit", fontSize: mob ? 16 : 17,
                    border: `1px solid ${C.rule}`, borderRadius: 4, background: C.card, color: C.ink,
                  }}
                />
                <button type="submit" disabled={status === "loading"} style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "14px 20px", borderRadius: 4, fontSize: 13, fontWeight: 500,
                  background: C.ink, color: C.bg, border: `1px solid ${C.ink}`,
                  cursor: status === "loading" ? "wait" : "pointer", opacity: status === "loading" ? 0.7 : 1,
                }}>
                  {status === "loading" ? "..." : <>Subscribe <span>→</span></>}
                </button>
              </div>
              {status === "error" && <div style={{ fontSize: 13, color: C.declineStrong }}>{msg}</div>}
              <div style={{ fontSize: 11, color: C.mute, letterSpacing: "0.04em" }}>
                No tracking beyond open rate · Unsubscribe anywhere · Archives public
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

/* ── Footer ── */
function Footer({ mob, med }: { mob: boolean; med: boolean }) {
  return (
    <footer>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: mob ? "0 20px" : "0 32px" }}>
        <div style={{
          padding: "48px 0 24px",
          display: "grid", gridTemplateColumns: mob ? "1fr" : (med ? "1fr 1fr" : "1.5fr 1fr 1fr 1fr"),
          gap: mob ? 28 : 48, fontSize: 13,
        }}>
          {/* Brand col */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: SERIF, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.ink, color: C.bg, display: "grid", placeItems: "center", fontFamily: SERIF, fontWeight: 700, fontSize: 13 }}>V</div>
              <span>Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
            </div>
            <p style={{ color: C.sub, marginTop: 12, maxWidth: "38ch", fontSize: 13, lineHeight: 1.55 }}>
              An independent, non-partisan data project. No advertisers, no political action
              committee, no affiliation with any campaign or party.
            </p>
          </div>

          {/* Link cols */}
          {[
            { h: "Data", links: [{ l: "Dashboard", href: "/dashboard" }, { l: "Live benchmark", href: "/live-benchmark" }, { l: "Scorecard", href: "/dashboard" }] },
            { h: "About", links: [{ l: "Methodology", href: "#method" }, { l: "Sources", href: "#sources" }] },
            { h: "Stay in touch", links: [{ l: "Newsletter", href: "#" }, { l: "GitHub", href: "https://github.com/iblari/open-ledger" }] },
          ].map(col => (
            <div key={col.h}>
              <h4 style={{ fontSize: 11, color: C.mute, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500, marginBottom: 14 }}>{col.h}</h4>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, color: C.sub, padding: 0, margin: 0 }}>
                {col.links.map(l => <li key={l.l}><a href={l.href} style={{ color: "inherit", textDecoration: "none", transition: "color 0.15s" }}>{l.l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          borderTop: `1px solid ${C.rule}`, marginTop: 48, padding: "20px 0",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          fontSize: 11, color: C.mute, letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          <span>© 2026 Vote Unbiased · voteunbiased.org</span>
          <span>No spin · No editorial · You interpret</span>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════
   APP
═══════════════════════════════════════════════ */
export default function LandingPage() {
  const mob = useIsMobile();
  const med = useMedium();

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, minHeight: "100vh" }}>
      <Nav mob={mob} />
      <Hero mob={mob} med={med} />
      <ScorecardSection mob={mob} med={med} />
      <DeepDiveSection mob={mob} med={med} />
      <AtlasTeaser mob={mob} />
      <PrinciplesSection mob={mob} med={med} />
      <SourcesSection mob={mob} med={med} />
      <CTASection mob={mob} med={med} />
      <Footer mob={mob} med={med} />
    </div>
  );
}
