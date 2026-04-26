"use client";
import { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import FeedbackBanner from "./FeedbackBanner";
import GlobeView from "@/components/GlobeView";
import { HEADER_METRICS, THEATERS, PERSONNEL_BY_COUNTRY, POSTURE_ASSETS, ASSET_TYPES, ALERT_COLORS, THEATER_COLORS, POSTURE_FEED, type PostureAsset, type AssetType, type FeedItem } from "@/lib/abroad-data";
import { CONFLICT_STREAMS, estimateTotal, estimateGrandTotal, formatUSD, formatUSDFull, MONTHLY_SPEND, computeDeltas, type ConflictStream, type SpendRow, type DeltaRow } from "@/lib/war-costs";
import { SCENARIOS, SCENARIO_ORDER, applyScenario, type ScenarioId, type DataPoint } from "@/lib/scenarios";
import { SCENARIO_DETAILS, METHODOLOGY_TEXT } from "@/lib/scenario-descriptions";

function useIsMobile() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return w < 768;
}

/* ─────────────────────────────────────────────
   DESIGN SYSTEM v2.0
   Refined editorial aesthetic with sophisticated 
   color palette - FT × Bloomberg × The Economist
───────────────────────────────────────────── */
const T = {
  bg: "#f8f5f0",        // warm cream (slightly warmer)
  card: "#ffffff",
  ink: "#1a1a1a",       // rich black
  sub: "#5c5856",       // warm gray
  mute: "#9a9490",      // lighter warm gray
  rule: "#e2ded6",      // divider lines
  accent: "#b8372d",    // refined editorial red
  gold: "#a67c00",      // darker gold for better contrast
  blue: "#1d4ed8",      // deeper blue
  red: "#be123c",       // rose red
  highlight: "#fef9e7", // softer callout bg
  paper: "#f3ede5",     // secondary bg
  // New sophisticated heatmap colors (teal-coral diverging)
  improve: {
    strong: "#0d7377",  // deep teal
    medium: "#14a3a8",  // teal
    light: "#8ee3e6",   // light teal
  },
  decline: {
    strong: "#c2410c",  // burnt orange
    medium: "#ea580c",  // orange
    light: "#fed7aa",   // light peach
  },
  neutral: "#d4cfc5",
};

// Mini sparkline component for heatmap cells
function Sparkline({ data, color, width = 60, height = 20 }: { data: number[], color: string, width?: number, height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', margin: '4px auto 0' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        style={{ opacity: 0.7 }}
      />
    </svg>
  );
}

const ADMINS = {
  clinton: { name:"Clinton", party:"D", years:"'93–'01", color:"#1e6b9e", full:"1993–2001" },
  bush:    { name:"Bush W.", party:"R", years:"'01–'09", color:"#8b4c70", full:"2001–2009" },
  obama:   { name:"Obama",   party:"D", years:"'09–'17", color:"#2d6a4f", full:"2009–2017" },
  trump1:  { name:"Trump",   party:"R", years:"'17–'21", color:"#c1272d", full:"2017–2021" },
  biden:   { name:"Biden",   party:"D", years:"'21–'25", color:"#4361a6", full:"2021–2025" },
};
const AID=["clinton","bush","obama","trump1","biden"];

const COUNTRIES={
  us:{name:"United States",color:"#2563eb",flag:"🇺🇸"},china:{name:"China",color:"#dc2626",flag:"🇨🇳"},
  uk:{name:"United Kingdom",color:"#7c3aed",flag:"🇬🇧"},india:{name:"India",color:"#ea580c",flag:"🇮🇳"},
  germany:{name:"Germany",color:"#b8860b",flag:"🇩🇪"},japan:{name:"Japan",color:"#db2777",flag:"🇯🇵"},
  skorea:{name:"South Korea",color:"#059669",flag:"🇰🇷"},
};

const M = {
  real_gdp:{l:"Real GDP",s:"$T (2017$)",src:"BEA",u:"rT",inv:false,cat:"growth",
    def:"Nominal GDP / GDP Deflator × 100. Strips out price changes to measure actual output growth in constant 2017 dollars.",
    bench:{good:"Steady upward trend",target:"~2-3% annual growth in real terms",warn:"Flat or declining = recession",why:"Real GDP should always grow over time in a healthy economy. The question is how fast — and whether growth is broadly shared."},
    ctx:"Total output adjusted for inflation. Shows absolute size, not speed.",
    facts:[{t:"Why 'real'?",x:"Adjusted for inflation — comparing actual output, not price increases."},{t:"Bigger base = slower rate",x:"$20T at 2% adds $400B. $5T at 8% adds $400B. Same absolute gain."}],
    d:[{y:1993,v:10.2,a:"clinton"},{y:1994,v:10.6,a:"clinton"},{y:1995,v:10.9,a:"clinton"},{y:1996,v:11.3,a:"clinton"},{y:1997,v:11.8,a:"clinton"},{y:1998,v:12.4,a:"clinton"},{y:1999,v:13.0,a:"clinton"},{y:2000,v:13.5,a:"clinton"},{y:2001,v:13.6,a:"bush"},{y:2002,v:13.8,a:"bush"},{y:2003,v:14.2,a:"bush"},{y:2004,v:14.7,a:"bush"},{y:2005,v:15.2,a:"bush"},{y:2006,v:15.6,a:"bush"},{y:2007,v:15.9,a:"bush"},{y:2008,v:15.9,a:"bush"},{y:2009,v:15.5,a:"obama"},{y:2010,v:15.9,a:"obama"},{y:2011,v:16.2,a:"obama"},{y:2012,v:16.6,a:"obama"},{y:2013,v:16.9,a:"obama"},{y:2014,v:17.3,a:"obama"},{y:2015,v:17.8,a:"obama"},{y:2016,v:18.1,a:"obama"},{y:2017,v:18.5,a:"trump1"},{y:2018,v:19.0,a:"trump1"},{y:2019,v:19.4,a:"trump1"},{y:2020,v:18.9,a:"trump1"},{y:2021,v:20.0,a:"biden"},{y:2022,v:20.4,a:"biden"},{y:2023,v:20.9,a:"biden"},{y:2024,v:21.5,a:"biden"}]},
  gdp:{l:"GDP Growth",s:"Annual %",src:"BEA",u:"%",inv:false,cat:"growth",
    def:"(GDP this year − GDP last year) / GDP last year × 100. Measures how fast the economy expanded or contracted year-over-year.",
    bench:{good:"2–3%",target:"Sustained 2-3% is healthy for a mature economy",warn:"Below 0% = contraction. Above 5% often = rebound, not trend",why:"The U.S. economy averaged 3.2% from 1947-2000 and 2.1% from 2000-2024. Lower trend reflects a larger, more mature economy."},
    ctx:"Post-recession years show rebound effects, not necessarily good policy.",facts:[{t:"Presidents influence ~10-30%",x:"Fed rates, global conditions, and business cycles often matter more."}],
    d:[{y:1993,v:2.7,a:"clinton"},{y:1994,v:4.0,a:"clinton"},{y:1995,v:2.7,a:"clinton"},{y:1996,v:3.8,a:"clinton"},{y:1997,v:4.5,a:"clinton"},{y:1998,v:4.5,a:"clinton"},{y:1999,v:4.7,a:"clinton"},{y:2000,v:4.1,a:"clinton"},{y:2001,v:1.0,a:"bush"},{y:2002,v:1.7,a:"bush"},{y:2003,v:2.8,a:"bush"},{y:2004,v:3.8,a:"bush"},{y:2005,v:3.5,a:"bush"},{y:2006,v:2.8,a:"bush"},{y:2007,v:2.0,a:"bush"},{y:2008,v:-0.1,a:"bush"},{y:2009,v:-2.6,a:"obama"},{y:2010,v:2.7,a:"obama"},{y:2011,v:1.5,a:"obama"},{y:2012,v:2.3,a:"obama"},{y:2013,v:1.8,a:"obama"},{y:2014,v:2.3,a:"obama"},{y:2015,v:2.7,a:"obama"},{y:2016,v:1.7,a:"obama"},{y:2017,v:2.2,a:"trump1"},{y:2018,v:2.9,a:"trump1"},{y:2019,v:2.3,a:"trump1"},{y:2020,v:-2.8,a:"trump1"},{y:2021,v:5.9,a:"biden"},{y:2022,v:1.9,a:"biden"},{y:2023,v:2.5,a:"biden"},{y:2024,v:2.8,a:"biden"}]},
  unemployment:{l:"Unemployment",s:"Rate %",src:"BLS U-3",u:"%",inv:true,cat:"labor",
    def:"(People actively looking for work / Total labor force) × 100. Does NOT count people who stopped looking or are underemployed (that's U-6).",
    bench:{good:"3.5–4.5%",target:"Below 4% = tight labor market (good for workers)",warn:"Above 6% = significant slack. Above 8% = crisis-level",why:"'Full employment' is ~3.5-4.5%. Below 3.5% risks inflation as employers compete for scarce workers. The 'natural rate' shifts over time."},
    ctx:"Obama inherited 9%+. Trump's 2020 spike = COVID lockdowns.",facts:[{t:"U-3 misses discouraged workers",x:"U-6 adds underemployed + discouraged — typically 3-5 points higher."}],
    d:[{y:1993,v:6.9,a:"clinton"},{y:1994,v:6.1,a:"clinton"},{y:1995,v:5.6,a:"clinton"},{y:1996,v:5.4,a:"clinton"},{y:1997,v:4.9,a:"clinton"},{y:1998,v:4.5,a:"clinton"},{y:1999,v:4.2,a:"clinton"},{y:2000,v:4.0,a:"clinton"},{y:2001,v:4.7,a:"bush"},{y:2002,v:5.8,a:"bush"},{y:2003,v:6.0,a:"bush"},{y:2004,v:5.5,a:"bush"},{y:2005,v:5.1,a:"bush"},{y:2006,v:4.6,a:"bush"},{y:2007,v:4.6,a:"bush"},{y:2008,v:5.8,a:"bush"},{y:2009,v:9.3,a:"obama"},{y:2010,v:9.6,a:"obama"},{y:2011,v:8.9,a:"obama"},{y:2012,v:8.1,a:"obama"},{y:2013,v:7.4,a:"obama"},{y:2014,v:6.2,a:"obama"},{y:2015,v:5.3,a:"obama"},{y:2016,v:4.9,a:"obama"},{y:2017,v:4.4,a:"trump1"},{y:2018,v:3.9,a:"trump1"},{y:2019,v:3.7,a:"trump1"},{y:2020,v:8.1,a:"trump1"},{y:2021,v:5.4,a:"biden"},{y:2022,v:3.6,a:"biden"},{y:2023,v:3.6,a:"biden"},{y:2024,v:4.0,a:"biden"}]},
  lfpr:{l:"Labor Participation",s:"Rate %",src:"BLS",u:"%",inv:false,cat:"labor",
    def:"(Employed + Unemployed seeking work) / Civilian population age 16+ × 100. Measures what share of working-age adults are in the labor force.",
    bench:{good:"62–67%",target:"Higher = more people working or seeking work",warn:"Below 62% signals structural disengagement from workforce",why:"Peaked at 67.3% in 2000. Structural decline from aging boomers is ~0.2%/yr — this trend is demographic, not policy failure."},
    ctx:"Long-term decline from aging boomers retiring. Peaked at 67.3% in 2000.",facts:[{t:"Catches what unemployment misses",x:"If someone stops looking, they leave the labor force entirely — LFPR captures this."}],
    d:[{y:1993,v:66.3,a:"clinton"},{y:1994,v:66.6,a:"clinton"},{y:1995,v:66.6,a:"clinton"},{y:1996,v:66.8,a:"clinton"},{y:1997,v:67.1,a:"clinton"},{y:1998,v:67.1,a:"clinton"},{y:1999,v:67.1,a:"clinton"},{y:2000,v:67.1,a:"clinton"},{y:2001,v:66.8,a:"bush"},{y:2002,v:66.6,a:"bush"},{y:2003,v:66.2,a:"bush"},{y:2004,v:66.0,a:"bush"},{y:2005,v:66.0,a:"bush"},{y:2006,v:66.2,a:"bush"},{y:2007,v:66.0,a:"bush"},{y:2008,v:66.0,a:"bush"},{y:2009,v:65.4,a:"obama"},{y:2010,v:64.7,a:"obama"},{y:2011,v:64.1,a:"obama"},{y:2012,v:63.7,a:"obama"},{y:2013,v:63.2,a:"obama"},{y:2014,v:62.9,a:"obama"},{y:2015,v:62.7,a:"obama"},{y:2016,v:62.8,a:"obama"},{y:2017,v:62.9,a:"trump1"},{y:2018,v:62.9,a:"trump1"},{y:2019,v:63.1,a:"trump1"},{y:2020,v:61.7,a:"trump1"},{y:2021,v:61.7,a:"biden"},{y:2022,v:62.2,a:"biden"},{y:2023,v:62.6,a:"biden"},{y:2024,v:62.5,a:"biden"}]},
  jobs:{l:"Jobs Added",s:"Millions/yr",src:"BLS",u:"M",inv:false,cat:"labor",
    def:"Nonfarm payrolls this December − nonfarm payrolls last December. Net new jobs created (or lost) in one year. Counts jobs, not people.",
    bench:{good:"+1.5 to +3M/yr",target:"Consistent monthly gains of 150K-250K = healthy expansion",warn:"Negative = net job losses, signaling recession",why:"The economy needs ~100-150K new jobs/month just to keep up with population growth. Anything above 200K is strong."},
    ctx:"Reopenings ≠ creation. Policy lags 12-18 months.",facts:[{t:"Biden's 2021 +6.7M",x:"Largely positions COVID eliminated being refilled, not new structural jobs."}],
    d:[{y:1993,v:2.8,a:"clinton"},{y:1994,v:3.9,a:"clinton"},{y:1995,v:2.2,a:"clinton"},{y:1996,v:2.8,a:"clinton"},{y:1997,v:3.4,a:"clinton"},{y:1998,v:3.0,a:"clinton"},{y:1999,v:3.2,a:"clinton"},{y:2000,v:1.9,a:"clinton"},{y:2001,v:-1.7,a:"bush"},{y:2002,v:-0.5,a:"bush"},{y:2003,v:0.1,a:"bush"},{y:2004,v:2.0,a:"bush"},{y:2005,v:2.5,a:"bush"},{y:2006,v:2.1,a:"bush"},{y:2007,v:1.1,a:"bush"},{y:2008,v:-3.6,a:"bush"},{y:2009,v:-5.1,a:"obama"},{y:2010,v:1.0,a:"obama"},{y:2011,v:2.1,a:"obama"},{y:2012,v:2.2,a:"obama"},{y:2013,v:2.3,a:"obama"},{y:2014,v:3.0,a:"obama"},{y:2015,v:2.7,a:"obama"},{y:2016,v:2.3,a:"obama"},{y:2017,v:2.1,a:"trump1"},{y:2018,v:2.3,a:"trump1"},{y:2019,v:2.0,a:"trump1"},{y:2020,v:-9.3,a:"trump1"},{y:2021,v:6.7,a:"biden"},{y:2022,v:4.8,a:"biden"},{y:2023,v:2.7,a:"biden"},{y:2024,v:2.2,a:"biden"}]},
  mfg:{l:"Manufacturing",s:"Jobs (M)",src:"BLS",u:"mfg",inv:false,cat:"labor",
    def:"Total employees in manufacturing sector from BLS Current Employment Statistics survey. Counts all manufacturing payroll jobs nationwide.",
    bench:{good:"Stabilization at 12-13M",target:"Halting decline is realistic; returning to 17M+ is not",warn:"Sharp drops signal recession or trade disruption",why:"Manufacturing output keeps rising while jobs decline — automation replaces workers. This trend is global and irreversible. Policy focus should be on job quality, not quantity."},
    ctx:"Peaked at 19.6M in 1979. ~85% of losses from automation, not offshoring.",facts:[{t:"Output still rising",x:"U.S. manufactures more by value than ever — with fewer workers."}],
    d:[{y:1993,v:16.8,a:"clinton"},{y:1994,v:17.0,a:"clinton"},{y:1995,v:17.1,a:"clinton"},{y:1996,v:17.2,a:"clinton"},{y:1997,v:17.4,a:"clinton"},{y:1998,v:17.5,a:"clinton"},{y:1999,v:17.3,a:"clinton"},{y:2000,v:17.3,a:"clinton"},{y:2001,v:16.4,a:"bush"},{y:2002,v:15.3,a:"bush"},{y:2003,v:14.5,a:"bush"},{y:2004,v:14.3,a:"bush"},{y:2005,v:14.2,a:"bush"},{y:2006,v:14.2,a:"bush"},{y:2007,v:13.9,a:"bush"},{y:2008,v:13.4,a:"bush"},{y:2009,v:11.8,a:"obama"},{y:2010,v:11.5,a:"obama"},{y:2011,v:11.7,a:"obama"},{y:2012,v:12.0,a:"obama"},{y:2013,v:12.1,a:"obama"},{y:2014,v:12.2,a:"obama"},{y:2015,v:12.3,a:"obama"},{y:2016,v:12.3,a:"obama"},{y:2017,v:12.4,a:"trump1"},{y:2018,v:12.7,a:"trump1"},{y:2019,v:12.8,a:"trump1"},{y:2020,v:12.2,a:"trump1"},{y:2021,v:12.3,a:"biden"},{y:2022,v:12.8,a:"biden"},{y:2023,v:12.9,a:"biden"},{y:2024,v:12.8,a:"biden"}]},
  inflation:{l:"Inflation",s:"CPI %",src:"BLS",u:"%",inv:true,cat:"prices",
    def:"(CPI this month − CPI same month last year) / CPI last year × 100. Tracks price changes across ~80,000 goods and services (CPI-U).",
    bench:{good:"1.5–2.5%",target:"The Fed targets exactly 2% — the 'Goldilocks' rate",warn:"Above 4% = eroding paychecks. Below 0% = deflation spiral risk",why:"2% encourages spending without destroying savings. At 8% (2022), a $50K salary loses $4,000 in purchasing power in one year."},
    ctx:"Fed targets 2%. 2022's 8% = post-COVID supply + stimulus.",facts:[{t:"The Fed controls inflation",x:"Interest rates are the primary tool. Presidents contribute via spending but can't set prices."}],
    d:[{y:1993,v:3.0,a:"clinton"},{y:1994,v:2.6,a:"clinton"},{y:1995,v:2.8,a:"clinton"},{y:1996,v:3.0,a:"clinton"},{y:1997,v:2.3,a:"clinton"},{y:1998,v:1.6,a:"clinton"},{y:1999,v:2.2,a:"clinton"},{y:2000,v:3.4,a:"clinton"},{y:2001,v:2.8,a:"bush"},{y:2002,v:1.6,a:"bush"},{y:2003,v:2.3,a:"bush"},{y:2004,v:2.7,a:"bush"},{y:2005,v:3.4,a:"bush"},{y:2006,v:3.2,a:"bush"},{y:2007,v:2.8,a:"bush"},{y:2008,v:3.8,a:"bush"},{y:2009,v:-0.4,a:"obama"},{y:2010,v:1.6,a:"obama"},{y:2011,v:3.2,a:"obama"},{y:2012,v:2.1,a:"obama"},{y:2013,v:1.5,a:"obama"},{y:2014,v:1.6,a:"obama"},{y:2015,v:0.1,a:"obama"},{y:2016,v:1.3,a:"obama"},{y:2017,v:2.1,a:"trump1"},{y:2018,v:2.4,a:"trump1"},{y:2019,v:1.8,a:"trump1"},{y:2020,v:1.2,a:"trump1"},{y:2021,v:4.7,a:"biden"},{y:2022,v:8.0,a:"biden"},{y:2023,v:4.1,a:"biden"},{y:2024,v:2.9,a:"biden"}]},
  gas:{l:"Gas Prices",s:"$/gal",src:"EIA",u:"$",inv:true,cat:"prices",
    def:"National average retail price for regular unleaded gasoline, all formulations. EIA weekly survey of ~900 retail outlets averaged annually.",
    bench:{good:"$2.50–$3.50",target:"Stable prices matter more than low prices",warn:"Above $4 = consumer pain. Below $2 often = demand collapse (bad sign)",why:"Americans spend ~3-5% of income on gas. At $4/gal, a 30-gallon-per-week family pays $6,240/yr vs $3,900 at $2.50. The $2,340 difference hits lower-income families hardest."},
    ctx:"~60% = global crude. OPEC > White House.",facts:[{t:"COVID made gas cheap",x:"2020's $2.17 was demand collapse, not a policy win."}],
    d:[{y:1993,v:1.07,a:"clinton"},{y:1994,v:1.08,a:"clinton"},{y:1995,v:1.10,a:"clinton"},{y:1996,v:1.22,a:"clinton"},{y:1997,v:1.20,a:"clinton"},{y:1998,v:1.03,a:"clinton"},{y:1999,v:1.14,a:"clinton"},{y:2000,v:1.49,a:"clinton"},{y:2001,v:1.42,a:"bush"},{y:2002,v:1.35,a:"bush"},{y:2003,v:1.56,a:"bush"},{y:2004,v:1.85,a:"bush"},{y:2005,v:2.27,a:"bush"},{y:2006,v:2.57,a:"bush"},{y:2007,v:2.80,a:"bush"},{y:2008,v:3.25,a:"bush"},{y:2009,v:2.35,a:"obama"},{y:2010,v:2.78,a:"obama"},{y:2011,v:3.53,a:"obama"},{y:2012,v:3.64,a:"obama"},{y:2013,v:3.53,a:"obama"},{y:2014,v:3.37,a:"obama"},{y:2015,v:2.43,a:"obama"},{y:2016,v:2.14,a:"obama"},{y:2017,v:2.41,a:"trump1"},{y:2018,v:2.72,a:"trump1"},{y:2019,v:2.60,a:"trump1"},{y:2020,v:2.17,a:"trump1"},{y:2021,v:3.01,a:"biden"},{y:2022,v:3.97,a:"biden"},{y:2023,v:3.52,a:"biden"},{y:2024,v:3.31,a:"biden"}]},
  wages:{l:"Real Wages",s:"YoY %",src:"BLS",u:"%",inv:false,cat:"prices",
    def:"Nominal wage growth − CPI inflation = Real wage growth. If your raise was 4% but inflation was 5%, real wages fell 1%. Measures actual purchasing power change.",
    bench:{good:"+0.5 to +2.0%",target:"Positive real wage growth = workers gaining purchasing power",warn:"Negative = paychecks shrinking in real terms despite nominal raises",why:"If real wages are negative, your raise didn't keep up with prices. Americans experienced 25 consecutive months of negative real wages from mid-2021 to mid-2023."},
    ctx:"Nominal raise minus inflation. 2020 spike = composition effect.",facts:[{t:"Nominal vs Real",x:"A 4% raise with 5% inflation = -1% real decline."}],
    d:[{y:1993,v:0.2,a:"clinton"},{y:1994,v:0.3,a:"clinton"},{y:1995,v:0.6,a:"clinton"},{y:1996,v:0.8,a:"clinton"},{y:1997,v:1.6,a:"clinton"},{y:1998,v:2.4,a:"clinton"},{y:1999,v:1.5,a:"clinton"},{y:2000,v:0.6,a:"clinton"},{y:2001,v:0.8,a:"bush"},{y:2002,v:1.4,a:"bush"},{y:2003,v:0.0,a:"bush"},{y:2004,v:-0.5,a:"bush"},{y:2005,v:-0.8,a:"bush"},{y:2006,v:0.2,a:"bush"},{y:2007,v:0.5,a:"bush"},{y:2008,v:-1.0,a:"bush"},{y:2009,v:1.5,a:"obama"},{y:2010,v:-0.2,a:"obama"},{y:2011,v:-1.2,a:"obama"},{y:2012,v:0.3,a:"obama"},{y:2013,v:0.5,a:"obama"},{y:2014,v:0.8,a:"obama"},{y:2015,v:2.1,a:"obama"},{y:2016,v:1.1,a:"obama"},{y:2017,v:0.4,a:"trump1"},{y:2018,v:0.8,a:"trump1"},{y:2019,v:1.2,a:"trump1"},{y:2020,v:4.0,a:"trump1"},{y:2021,v:-2.2,a:"biden"},{y:2022,v:-1.7,a:"biden"},{y:2023,v:0.8,a:"biden"},{y:2024,v:1.1,a:"biden"}]},
  median_income:{l:"Median Income",s:"Household (2023$)",src:"Census",u:"inc",inv:false,cat:"people",
    def:"50th percentile of all household incomes, adjusted to 2023 dollars using CPI-U-RS. Half of households earn more, half earn less. Not skewed by billionaires like averages.",
    bench:{good:"Sustained upward trend",target:"Growth that outpaces inflation = real improvement",warn:"Stagnation for 15 years (1999-2014) despite GDP growth = gains going to top earners",why:"If GDP grows but median income doesn't, the economy is growing for corporations and the wealthy — not for typical families. This gap is the core inequality story."},
    ctx:"Inflation-adjusted. Stagnated from 1999-2014.",facts:[{t:"Median, not average",x:"Average is skewed by billionaires. Median = the middle family."}],
    d:[{y:1993,v:55600,a:"clinton"},{y:1994,v:55500,a:"clinton"},{y:1995,v:57200,a:"clinton"},{y:1996,v:57900,a:"clinton"},{y:1997,v:58900,a:"clinton"},{y:1998,v:60600,a:"clinton"},{y:1999,v:61500,a:"clinton"},{y:2000,v:61400,a:"clinton"},{y:2001,v:60200,a:"bush"},{y:2002,v:59500,a:"bush"},{y:2003,v:59300,a:"bush"},{y:2004,v:59200,a:"bush"},{y:2005,v:59700,a:"bush"},{y:2006,v:59900,a:"bush"},{y:2007,v:60400,a:"bush"},{y:2008,v:58600,a:"bush"},{y:2009,v:57600,a:"obama"},{y:2010,v:56800,a:"obama"},{y:2011,v:56500,a:"obama"},{y:2012,v:56700,a:"obama"},{y:2013,v:57600,a:"obama"},{y:2014,v:57900,a:"obama"},{y:2015,v:60500,a:"obama"},{y:2016,v:62900,a:"obama"},{y:2017,v:64000,a:"trump1"},{y:2018,v:65000,a:"trump1"},{y:2019,v:69600,a:"trump1"},{y:2020,v:68000,a:"trump1"},{y:2021,v:71100,a:"biden"},{y:2022,v:74600,a:"biden"},{y:2023,v:80600,a:"biden"},{y:2024,v:80600,a:"biden"}]},
  poverty:{l:"Poverty Rate",s:"%",src:"Census",u:"%",inv:true,cat:"people",
    def:"(People with income below federal poverty threshold / Total population) × 100. Threshold = ~$31K for family of 4 in 2024. Set in 1960s, adjusted only for inflation.",
    bench:{good:"Below 11%",target:"Single digits would match peer nations (UK ~10%, Germany ~8%)",warn:"Above 13% = crisis-era levels. Above 15% = deep structural failure",why:"The U.S. poverty rate has bounced between 11-15% for 30 years while peer nations trend lower. The official threshold (~$31K for family of 4) is itself considered too low by most economists."},
    ctx:"Official line ~$31K for family of 4. Many economists consider it too low.",facts:[{t:"Near-poverty matters",x:"Millions hover just above the line. One medical bill pushes them under."}],
    d:[{y:1993,v:15.1,a:"clinton"},{y:1994,v:14.5,a:"clinton"},{y:1995,v:13.8,a:"clinton"},{y:1996,v:13.7,a:"clinton"},{y:1997,v:13.3,a:"clinton"},{y:1998,v:12.7,a:"clinton"},{y:1999,v:11.9,a:"clinton"},{y:2000,v:11.3,a:"clinton"},{y:2001,v:11.7,a:"bush"},{y:2002,v:12.1,a:"bush"},{y:2003,v:12.5,a:"bush"},{y:2004,v:12.7,a:"bush"},{y:2005,v:12.6,a:"bush"},{y:2006,v:12.3,a:"bush"},{y:2007,v:12.5,a:"bush"},{y:2008,v:13.2,a:"bush"},{y:2009,v:14.3,a:"obama"},{y:2010,v:15.1,a:"obama"},{y:2011,v:15.0,a:"obama"},{y:2012,v:15.0,a:"obama"},{y:2013,v:14.5,a:"obama"},{y:2014,v:14.8,a:"obama"},{y:2015,v:13.5,a:"obama"},{y:2016,v:12.7,a:"obama"},{y:2017,v:12.3,a:"trump1"},{y:2018,v:11.8,a:"trump1"},{y:2019,v:10.5,a:"trump1"},{y:2020,v:11.4,a:"trump1"},{y:2021,v:11.6,a:"biden"},{y:2022,v:11.5,a:"biden"},{y:2023,v:12.4,a:"biden"},{y:2024,v:12.2,a:"biden"}]},
  inequality:{l:"Inequality",s:"Top 10% Share %",src:"WID",u:"%",inv:true,cat:"people",
    def:"(Total pre-tax income earned by top 10% of earners / Total national income) × 100. Higher = more concentrated wealth. Pre-tax, pre-transfer.",
    bench:{good:"Below 40%",target:"Peer nations: Germany ~37%, Japan ~35%, UK ~39%",warn:"Above 45% = approaching Gilded Age levels (1920s were ~46%)",why:"When the top 10% captures 47%+ of income, economic mobility declines, social cohesion weakens, and political polarization intensifies. The U.S. is now above 1920s-era inequality."},
    ctx:"40-year bipartisan trend. No administration has reversed it.",facts:[{t:"Tax + globalization + tech",x:"All contribute. Pre-tax income keeps concentrating regardless of party."}],
    d:[{y:1993,v:40.5,a:"clinton"},{y:1994,v:40.8,a:"clinton"},{y:1995,v:41.4,a:"clinton"},{y:1996,v:42.0,a:"clinton"},{y:1997,v:42.8,a:"clinton"},{y:1998,v:43.2,a:"clinton"},{y:1999,v:43.8,a:"clinton"},{y:2000,v:43.5,a:"clinton"},{y:2001,v:42.5,a:"bush"},{y:2002,v:42.0,a:"bush"},{y:2003,v:42.4,a:"bush"},{y:2004,v:43.2,a:"bush"},{y:2005,v:44.0,a:"bush"},{y:2006,v:44.7,a:"bush"},{y:2007,v:45.2,a:"bush"},{y:2008,v:43.4,a:"bush"},{y:2009,v:43.2,a:"obama"},{y:2010,v:44.5,a:"obama"},{y:2011,v:44.3,a:"obama"},{y:2012,v:46.3,a:"obama"},{y:2013,v:45.0,a:"obama"},{y:2014,v:45.5,a:"obama"},{y:2015,v:45.6,a:"obama"},{y:2016,v:45.8,a:"obama"},{y:2017,v:46.1,a:"trump1"},{y:2018,v:46.5,a:"trump1"},{y:2019,v:46.8,a:"trump1"},{y:2020,v:46.0,a:"trump1"},{y:2021,v:46.5,a:"biden"},{y:2022,v:46.8,a:"biden"},{y:2023,v:47.0,a:"biden"},{y:2024,v:47.2,a:"biden"}]},
  consumer_conf:{l:"Confidence",s:"Index (1985=100)",src:"Conference Board",u:"cc",inv:false,cat:"sentiment",
    def:"Survey of 5,000 households rating current business conditions and 6-month expectations. Indexed to 1985 baseline = 100. Above 100 = more optimistic than 1985.",
    bench:{good:"Above 100",target:"100 = baseline optimism. 120+ = strong confidence",warn:"Below 60 = recession-level pessimism",why:"Above 100 means consumers feel better than the 1985 baseline. High confidence drives spending (70% of GDP). But since 2016, partisan identity has become the biggest predictor — not actual conditions."},
    ctx:"How people FEEL — not how the economy performs. Partisan since 2016.",facts:[{t:"Vibes ≠ reality",x:"Confidence dropped in 2022 despite strong jobs. People feel inflation more than employment."}],
    d:[{y:1993,v:68,a:"clinton"},{y:1994,v:91,a:"clinton"},{y:1995,v:100,a:"clinton"},{y:1996,v:107,a:"clinton"},{y:1997,v:127,a:"clinton"},{y:1998,v:133,a:"clinton"},{y:1999,v:139,a:"clinton"},{y:2000,v:143,a:"clinton"},{y:2001,v:106,a:"bush"},{y:2002,v:97,a:"bush"},{y:2003,v:82,a:"bush"},{y:2004,v:96,a:"bush"},{y:2005,v:100,a:"bush"},{y:2006,v:105,a:"bush"},{y:2007,v:99,a:"bush"},{y:2008,v:58,a:"bush"},{y:2009,v:45,a:"obama"},{y:2010,v:55,a:"obama"},{y:2011,v:58,a:"obama"},{y:2012,v:67,a:"obama"},{y:2013,v:73,a:"obama"},{y:2014,v:87,a:"obama"},{y:2015,v:98,a:"obama"},{y:2016,v:100,a:"obama"},{y:2017,v:120,a:"trump1"},{y:2018,v:130,a:"trump1"},{y:2019,v:128,a:"trump1"},{y:2020,v:101,a:"trump1"},{y:2021,v:113,a:"biden"},{y:2022,v:104,a:"biden"},{y:2023,v:101,a:"biden"},{y:2024,v:100,a:"biden"}]},
  debt_gdp:{l:"Debt-to-GDP",s:"Ratio %",src:"Treasury/BEA",u:"%",inv:true,cat:"fiscal",
    def:"(Total federal public debt outstanding / Annual GDP) × 100. Measures debt burden relative to the economy's ability to service it. More meaningful than raw dollar debt.",
    bench:{good:"Below 60%",target:"60% was the pre-2008 norm. 90%+ is elevated by historical standards",warn:"Above 120% = uncharted territory for the U.S. (Japan at ~260% still functions, but pays the price in growth)",why:"The real risk isn't a magic threshold — it's when interest payments crowd out other spending. The U.S. now spends more on interest ($882B in 2024) than on defense."},
    ctx:"The proper debt measure. Japan is ~260%, UK ~100%.",facts:[{t:"Crossed 100% in 2013",x:"Economists debate whether this threshold matters. Several healthy economies exceed it."}],
    d:[{y:1993,v:63.8,a:"clinton"},{y:1994,v:63.4,a:"clinton"},{y:1995,v:63.1,a:"clinton"},{y:1996,v:62.2,a:"clinton"},{y:1997,v:60.2,a:"clinton"},{y:1998,v:57.5,a:"clinton"},{y:1999,v:55.5,a:"clinton"},{y:2000,v:53.7,a:"clinton"},{y:2001,v:54.7,a:"bush"},{y:2002,v:57.1,a:"bush"},{y:2003,v:59.7,a:"bush"},{y:2004,v:61.3,a:"bush"},{y:2005,v:61.7,a:"bush"},{y:2006,v:61.9,a:"bush"},{y:2007,v:62.5,a:"bush"},{y:2008,v:68.2,a:"bush"},{y:2009,v:82.4,a:"obama"},{y:2010,v:91.4,a:"obama"},{y:2011,v:95.6,a:"obama"},{y:2012,v:99.7,a:"obama"},{y:2013,v:100.4,a:"obama"},{y:2014,v:101.2,a:"obama"},{y:2015,v:100.1,a:"obama"},{y:2016,v:104.8,a:"obama"},{y:2017,v:103.6,a:"trump1"},{y:2018,v:104.3,a:"trump1"},{y:2019,v:106.8,a:"trump1"},{y:2020,v:127.0,a:"trump1"},{y:2021,v:121.7,a:"biden"},{y:2022,v:120.0,a:"biden"},{y:2023,v:122.3,a:"biden"},{y:2024,v:124.0,a:"biden"}]},
  deficit:{l:"Budget Deficit",s:"$Billions",src:"CBO / Treasury",u:"B",inv:false,cat:"fiscal",
    def:"Federal Revenue − Federal Outlays. Negative = deficit (spending exceeds revenue). Positive = surplus. This is the FEDERAL BUDGET deficit — not the trade deficit.",
    bench:{good:"Below 3% of GDP (~$800B)",target:"Balanced budget or small surplus is ideal but rare",warn:"Above 5% of GDP in non-crisis years = fiscally unsustainable trajectory",why:"Running deficits during recessions is standard Keynesian economics. Running $1.8T deficits during economic expansion (2024) is unusual and concerning — it leaves no fiscal room for the next crisis."},
    ctx:"Clinton achieved surpluses. COVID spending dwarfed all prior deficits.",facts:[{t:"70% of spending is autopilot",x:"Social Security, Medicare, Medicaid, interest run regardless of president."}],
    d:[{y:1993,v:-255,a:"clinton"},{y:1994,v:-203,a:"clinton"},{y:1995,v:-164,a:"clinton"},{y:1996,v:-107,a:"clinton"},{y:1997,v:-22,a:"clinton"},{y:1998,v:69,a:"clinton"},{y:1999,v:126,a:"clinton"},{y:2000,v:236,a:"clinton"},{y:2001,v:128,a:"bush"},{y:2002,v:-158,a:"bush"},{y:2003,v:-378,a:"bush"},{y:2004,v:-413,a:"bush"},{y:2005,v:-318,a:"bush"},{y:2006,v:-248,a:"bush"},{y:2007,v:-161,a:"bush"},{y:2008,v:-459,a:"bush"},{y:2009,v:-1413,a:"obama"},{y:2010,v:-1294,a:"obama"},{y:2011,v:-1300,a:"obama"},{y:2012,v:-1087,a:"obama"},{y:2013,v:-680,a:"obama"},{y:2014,v:-485,a:"obama"},{y:2015,v:-438,a:"obama"},{y:2016,v:-585,a:"obama"},{y:2017,v:-665,a:"trump1"},{y:2018,v:-779,a:"trump1"},{y:2019,v:-984,a:"trump1"},{y:2020,v:-3132,a:"trump1"},{y:2021,v:-2772,a:"biden"},{y:2022,v:-1375,a:"biden"},{y:2023,v:-1695,a:"biden"},{y:2024,v:-1833,a:"biden"}]},
  sp500:{l:"S&P 500",s:"Year-End",src:"S&P Global",u:"",inv:false,cat:"markets",
    def:"Market-cap weighted index of 500 largest U.S. public companies. Value = sum of each company's share price × shares outstanding, scaled to index. Not a direct measure of economic health.",
    bench:{good:"7-10% annual return (long-term avg)",target:"Historical average = ~10% nominal, ~7% real annual return",warn:"A single-year decline doesn't mean crisis — markets drop 20%+ roughly once per decade",why:"The S&P 500's long-term return is ~10%/yr. But the top 10% own 93% of stocks, so market gains disproportionately benefit the wealthy. For most Americans, home equity matters more than stock prices."},
    ctx:"Top 10% own 93% of stocks. Fed rates matter more than the president.",facts:[{t:"Rose under both parties",x:"Obama +166%, Trump I +67%. Markets respond to earnings, not ideology."}],
    d:[{y:1993,v:466,a:"clinton"},{y:1994,v:459,a:"clinton"},{y:1995,v:616,a:"clinton"},{y:1996,v:741,a:"clinton"},{y:1997,v:970,a:"clinton"},{y:1998,v:1229,a:"clinton"},{y:1999,v:1469,a:"clinton"},{y:2000,v:1320,a:"clinton"},{y:2001,v:1148,a:"bush"},{y:2002,v:880,a:"bush"},{y:2003,v:1112,a:"bush"},{y:2004,v:1212,a:"bush"},{y:2005,v:1248,a:"bush"},{y:2006,v:1418,a:"bush"},{y:2007,v:1468,a:"bush"},{y:2008,v:903,a:"bush"},{y:2009,v:1115,a:"obama"},{y:2010,v:1258,a:"obama"},{y:2011,v:1258,a:"obama"},{y:2012,v:1426,a:"obama"},{y:2013,v:1848,a:"obama"},{y:2014,v:2059,a:"obama"},{y:2015,v:2044,a:"obama"},{y:2016,v:2239,a:"obama"},{y:2017,v:2674,a:"trump1"},{y:2018,v:2507,a:"trump1"},{y:2019,v:3231,a:"trump1"},{y:2020,v:3756,a:"trump1"},{y:2021,v:4766,a:"biden"},{y:2022,v:3840,a:"biden"},{y:2023,v:4770,a:"biden"},{y:2024,v:5881,a:"biden"}]},
  trade:{l:"Trade Balance",s:"$Billions",src:"Census / BEA",u:"B",inv:false,cat:"fiscal",
    def:"Exports − Imports (goods and services). Negative = trade deficit (U.S. buys more than it sells). This is the TRADE deficit — completely separate from the budget deficit. Tariffs are meant to shrink this number.",
    bench:{good:"Shrinking deficit trend",target:"A small deficit is normal for a wealthy consumer economy",warn:"Rapid growth in deficit may signal competitiveness problems or unsustainable consumption",why:"The U.S. has run a trade deficit since 1975. It often reflects strong consumer demand — Americans buying goods. A deficit isn't inherently bad, but rapid growth can indicate structural issues. Tariffs have historically NOT reduced it."},
    ctx:"U.S. has run a trade deficit since 1975. Tariffs raised under Trump but deficit grew anyway.",facts:[{t:"Tariffs did not shrink the deficit",x:"Trade deficit grew from $552B to $679B during Trump I despite tariff increases. Consumer demand and currency strength matter more."},{t:"Not the same as budget deficit",x:"Trade deficit = buying more imports than we export. Budget deficit = government spending more than it collects in taxes. Completely different."}],
    d:[{y:1993,v:-70,a:"clinton"},{y:1994,v:-98,a:"clinton"},{y:1995,v:-97,a:"clinton"},{y:1996,v:-104,a:"clinton"},{y:1997,v:-108,a:"clinton"},{y:1998,v:-167,a:"clinton"},{y:1999,v:-265,a:"clinton"},{y:2000,v:-381,a:"clinton"},{y:2001,v:-365,a:"bush"},{y:2002,v:-423,a:"bush"},{y:2003,v:-496,a:"bush"},{y:2004,v:-609,a:"bush"},{y:2005,v:-714,a:"bush"},{y:2006,v:-762,a:"bush"},{y:2007,v:-705,a:"bush"},{y:2008,v:-709,a:"bush"},{y:2009,v:-384,a:"obama"},{y:2010,v:-500,a:"obama"},{y:2011,v:-560,a:"obama"},{y:2012,v:-537,a:"obama"},{y:2013,v:-478,a:"obama"},{y:2014,v:-508,a:"obama"},{y:2015,v:-500,a:"obama"},{y:2016,v:-504,a:"obama"},{y:2017,v:-552,a:"trump1"},{y:2018,v:-628,a:"trump1"},{y:2019,v:-617,a:"trump1"},{y:2020,v:-679,a:"trump1"},{y:2021,v:-862,a:"biden"},{y:2022,v:-948,a:"biden"},{y:2023,v:-773,a:"biden"},{y:2024,v:-795,a:"biden"}]},
  fed_rate:{l:"Interest Rate",s:"Fed Funds %",src:"Federal Reserve",u:"%",inv:true,cat:"fiscal",
    def:"Federal Funds Rate — the overnight rate banks charge each other, set by the FOMC. Every other rate in the economy (mortgages, car loans, credit cards) keys off this.",
    bench:{good:"2–3% (neutral)",target:"Low enough to encourage borrowing, high enough to prevent bubbles",warn:"Near 0% = emergency mode. Above 5% = restrictive, slows economy"},why:"The Fed is independent — presidents appoint the chair but can't set rates. Trump pressured Powell publicly. Biden reappointed him for stability.",
    ctx:"Near-zero for 9 of the last 16 years. Biden's era saw the fastest hike cycle in 40 years.",facts:[{t:"Presidents appoint, Fed decides",x:"The appointment power is enormous indirect influence — but once seated, the chair acts independently."},{t:"Rate affects everything",x:"A 1% rate increase on a $400K mortgage = ~$240/month more. Multiply by millions of homeowners."}],
    d:[{y:1993,v:3.0,a:"clinton"},{y:1994,v:4.2,a:"clinton"},{y:1995,v:5.8,a:"clinton"},{y:1996,v:5.3,a:"clinton"},{y:1997,v:5.5,a:"clinton"},{y:1998,v:5.4,a:"clinton"},{y:1999,v:5.0,a:"clinton"},{y:2000,v:6.5,a:"clinton"},{y:2001,v:3.9,a:"bush"},{y:2002,v:1.7,a:"bush"},{y:2003,v:1.1,a:"bush"},{y:2004,v:1.4,a:"bush"},{y:2005,v:3.2,a:"bush"},{y:2006,v:5.0,a:"bush"},{y:2007,v:5.0,a:"bush"},{y:2008,v:1.9,a:"bush"},{y:2009,v:0.2,a:"obama"},{y:2010,v:0.2,a:"obama"},{y:2011,v:0.1,a:"obama"},{y:2012,v:0.1,a:"obama"},{y:2013,v:0.1,a:"obama"},{y:2014,v:0.1,a:"obama"},{y:2015,v:0.1,a:"obama"},{y:2016,v:0.4,a:"obama"},{y:2017,v:1.0,a:"trump1"},{y:2018,v:1.8,a:"trump1"},{y:2019,v:2.2,a:"trump1"},{y:2020,v:0.4,a:"trump1"},{y:2021,v:0.1,a:"biden"},{y:2022,v:1.7,a:"biden"},{y:2023,v:5.3,a:"biden"},{y:2024,v:4.6,a:"biden"}]},
  purchasing:{l:"Purchasing Power",s:"Value of $1 (1993$)",src:"BLS CPI",u:"pp",inv:false,cat:"prices",
    def:"$1 / (CPI current / CPI 1993). Shows how much a 1993 dollar buys today. Lower = your money buys less. Every president's bar shows how much value the dollar lost on their watch.",
    bench:{good:"Losing under 2¢/yr",target:"Some decline is normal with 2% inflation target",warn:"Losing over 4¢/yr = rapid erosion of savings"},why:"$1 in 1993 buys only ~47¢ worth of goods in 2024. This is the cumulative cost of inflation that people feel but rarely see quantified.",
    ctx:"Steady erosion is expected with 2% inflation target. The 2021-2023 spike was the sharpest decline in decades.",facts:[{t:"Inflation is a hidden tax",x:"You don't see it deducted from your paycheck, but $100 of groceries in 2020 costs $122 in 2024."},{t:"Savers are punished",x:"If your savings account pays 1% but inflation is 3%, you lose 2% of purchasing power every year."}],
    d:[{y:1993,v:1.00,a:"clinton"},{y:1994,v:0.97,a:"clinton"},{y:1995,v:0.95,a:"clinton"},{y:1996,v:0.92,a:"clinton"},{y:1997,v:0.90,a:"clinton"},{y:1998,v:0.88,a:"clinton"},{y:1999,v:0.87,a:"clinton"},{y:2000,v:0.84,a:"clinton"},{y:2001,v:0.81,a:"bush"},{y:2002,v:0.80,a:"bush"},{y:2003,v:0.78,a:"bush"},{y:2004,v:0.76,a:"bush"},{y:2005,v:0.74,a:"bush"},{y:2006,v:0.71,a:"bush"},{y:2007,v:0.69,a:"bush"},{y:2008,v:0.67,a:"bush"},{y:2009,v:0.67,a:"obama"},{y:2010,v:0.66,a:"obama"},{y:2011,v:0.64,a:"obama"},{y:2012,v:0.63,a:"obama"},{y:2013,v:0.62,a:"obama"},{y:2014,v:0.61,a:"obama"},{y:2015,v:0.61,a:"obama"},{y:2016,v:0.60,a:"obama"},{y:2017,v:0.59,a:"trump1"},{y:2018,v:0.57,a:"trump1"},{y:2019,v:0.56,a:"trump1"},{y:2020,v:0.56,a:"trump1"},{y:2021,v:0.53,a:"biden"},{y:2022,v:0.49,a:"biden"},{y:2023,v:0.47,a:"biden"},{y:2024,v:0.46,a:"biden"}]},
};

const MK=Object.keys(M);
const CATS={growth:"Growth",labor:"Labor Market",prices:"Prices & Wages",people:"Living Standards",fiscal:"Fiscal Health",markets:"Markets",sentiment:"Sentiment"};
const ML={real_gdp:"GDP",gdp:"GDP%",unemployment:"Unemp",lfpr:"LFPR",jobs:"Jobs",mfg:"Mfg",inflation:"CPI",gas:"Gas",wages:"Wages",median_income:"Inc",poverty:"Pov",inequality:"Ineq",consumer_conf:"Conf",debt_gdp:"D/GDP",deficit:"Budget",sp500:"S&P",trade:"Trade",fed_rate:"Rate",purchasing:"$PWR"};

// Inherited baseline: each president starts from the previous president's last value
function inheritedStart(mk: string, id: string): number {
  const m = M[mk];
  const ai = AID.indexOf(id);
  const pts = m.d.filter((d: {a:string}) => d.a === id);
  if (ai > 0) {
    const prevPts = m.d.filter((d: {a:string}) => d.a === AID[ai - 1]);
    if (prevPts.length > 0) return prevPts[prevPts.length - 1].v;
  }
  return pts.length > 0 ? pts[0].v : 0;
}

const GLOBAL_METRICS={
  gdp_g:{l:"GDP Growth",u:"%",src:"World Bank/IMF",facts:[{t:"China slowing",x:"10%+ in 2000s → ~5% now."},{t:"India rising",x:"Fastest-growing major economy."}],
    d:[{y:2000,us:4.1,china:8.5,uk:3.4,india:3.8,germany:3.0,japan:2.8,skorea:9.1},{y:2004,us:3.8,china:10.1,uk:2.4,india:7.9,germany:1.2,japan:2.2,skorea:5.2},{y:2008,us:-0.1,china:9.7,uk:-0.3,india:3.1,germany:0.8,japan:-1.2,skorea:3.0},{y:2012,us:2.3,china:7.9,uk:1.4,india:5.5,germany:0.4,japan:1.4,skorea:2.4},{y:2016,us:1.7,china:6.8,uk:2.3,india:8.3,germany:2.2,japan:0.5,skorea:2.9},{y:2020,us:-2.8,china:2.2,uk:-10.4,india:-5.8,germany:-3.8,japan:-4.1,skorea:-0.7},{y:2024,us:2.8,china:4.9,uk:1.1,india:6.8,germany:0.0,japan:0.3,skorea:2.2}]},
  inf_g:{l:"Inflation",u:"%",src:"World Bank/IMF",facts:[{t:"2022 was global",x:"UK 9.1%, Germany 8.7%. Supply-chain + energy, not just U.S. stimulus."}],
    d:[{y:2000,us:3.4,china:0.4,uk:0.8,india:4.0,germany:1.4,japan:-0.7,skorea:2.3},{y:2004,us:2.7,china:3.9,uk:1.3,india:3.8,germany:1.8,japan:0.0,skorea:3.6},{y:2008,us:3.8,china:5.9,uk:3.6,india:8.4,germany:2.8,japan:1.4,skorea:4.7},{y:2012,us:2.1,china:2.6,uk:2.8,india:9.3,germany:2.1,japan:0.0,skorea:2.2},{y:2016,us:1.3,china:2.0,uk:0.7,india:4.9,germany:0.4,japan:-0.1,skorea:1.0},{y:2020,us:1.2,china:2.5,uk:0.9,india:6.6,germany:0.4,japan:0.0,skorea:0.5},{y:2024,us:2.9,china:0.2,uk:2.5,india:4.6,germany:2.2,japan:2.7,skorea:2.4}]},
};

const INH={
  clinton:{c:"Mild recession ending, 7.5% unemployment, $4.2T debt.",g:"Moderate"},
  bush:{c:"Dot-com bursting, Clinton surplus. 9/11 hit 8 months in.",g:"Mixed → crisis"},
  obama:{c:"Worst crisis since 1930s, 10% unemployment, banking collapse.",g:"Severe crisis"},
  trump1:{c:"Mature expansion, 4.7% unemployment. COVID hit Year 4.",g:"Strong → crisis"},
  biden:{c:"COVID recovery, 6.7% unemployment, supply chains broken.",g:"Recovery + inflation"},
};

function fmt(v,u){
  if(u==="rT"||u==="T")return`$${v.toFixed(1)}T`;if(u==="B")return`$${Math.abs(v).toLocaleString()}B`;
  if(u==="%")return`${v.toFixed(1)}%`;if(u==="$")return`$${v.toFixed(2)}`;if(u==="M")return`${v>0?"+":""}${v.toFixed(1)}M`;
  if(u==="inc")return`$${(v/1000).toFixed(1)}K`;if(u==="cc")return v.toFixed(0);if(u==="mfg")return`${v.toFixed(1)}M`;if(u==="pp")return`$${v.toFixed(2)}`;return v.toLocaleString();
}

function scores(){
  const sc={};for(const id of AID)sc[id]={r:{},p:0,details:{}};
  for(const mk of MK){const m=M[mk];
    const changes={};
    for(const id of AID){
      const pts=m.d.filter(d=>d.a===id);
      if(pts.length<1)continue;
      const start=inheritedStart(mk,id);const end=pts[pts.length-1].v;
      const abs=end-start;
      const pct=start!==0?((end-start)/Math.abs(start))*100:0;
      // For inverse metrics (lower=better), improvement is negative change
      const improved=m.inv?abs<0:abs>0;
      const maintained=Math.abs(pct)<5; // <5% change = maintained
      changes[id]={start,end,abs,pct,improved,maintained};
    }
    // Rank by % change - for inverse metrics, most negative = best; for normal, most positive = best
    const sorted=Object.entries(changes).sort((a,b)=>{
      return m.inv?(a[1].pct-b[1].pct):(b[1].pct-a[1].pct);
    });
    sorted.forEach(([id,data],i)=>{
      const pts=AID.length-i;
      sc[id].r[mk]={rank:i+1,p:pts,...data};
      sc[id].p+=pts;
      sc[id].details[mk]=data;
    });
  }
  return sc;
}

function Tip({active,payload,label,unit}){
  if(!active||!payload?.length)return null;
  const d=payload[0]?.payload;
  const admin=d?.a;
  const adminData=admin?ADMINS[admin]:null;
  
  return (
    <div style={{
      background:"rgba(255,255,255,0.97)",
      backdropFilter:"blur(8px)",
      border:`1px solid ${T.rule}`,
      borderRadius:10,
      padding:"14px 16px",
      fontSize:12,
      boxShadow:"0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      color:T.ink,
      minWidth:140,
      animation:"scaleIn 0.15s ease"
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${T.rule}`}}>
        {adminData && <span style={{width:10,height:10,borderRadius:3,background:adminData.color,flexShrink:0}}/>}
        <div>
          <div style={{fontWeight:800,fontSize:13,letterSpacing:-0.3}}>{label||d?.y}</div>
          {adminData && <div style={{color:adminData.color,fontSize:11,fontWeight:600}}>{adminData.name} ({adminData.years})</div>}
        </div>
      </div>
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:i>0?4:0}}>
          <span style={{color:T.sub,fontSize:11}}>{p.name || "Value"}</span>
          <span style={{fontWeight:700,color:p.color||T.ink,fontFamily:"'DM Sans',sans-serif",fontSize:14,fontVariantNumeric:"tabular-nums"}}>
            {typeof p.value==='number'?(unit?fmt(p.value,unit):p.value.toLocaleString()):p.value}
          </span>
        </div>
      ))}
    </div>
  );
}
function Pill({active,onClick,children}){
  return <button onClick={onClick} style={{padding:"5px 10px",borderRadius:6,border:"none",cursor:"pointer",background:active?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.02)",color:active?"#fff":"rgba(255,255,255,0.3)",fontSize:11,fontWeight:active?600:400,fontFamily:"'IBM Plex Sans',sans-serif",borderBottom:active?"2px solid rgba(255,255,255,0.2)":"2px solid transparent"}}>{children}</button>;
}
function FactsPanel({facts,label}){
  const [open,setOpen]=useState(false);if(!facts?.length)return null;
  return <div style={{marginTop:14,background:"rgba(193,39,45,0.03)",border:`1px solid ${T.rule}`,borderRadius:4,overflow:"hidden"}}>
    <button onClick={()=>setOpen(!open)} style={{width:"100%",padding:"10px 14px",border:"none",cursor:"pointer",background:"transparent",display:"flex",justifyContent:"space-between",alignItems:"center",color:T.accent,fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}>
      <span>How to read: {label}</span><span style={{transform:open?"rotate(180deg)":"rotate(0)",transition:"transform 0.2s"}}>▾</span>
    </button>
    {open&&<div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:12}}>
      {facts.map((f,i)=><div key={i} style={{borderLeft:`2px solid ${T.accent}33`,paddingLeft:12}}>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:T.ink,marginBottom:3}}>{f.t}</div>
        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.7,color:T.sub}}>{f.x}</div>
      </div>)}
    </div>}
  </div>;
}

/* ── Live Feed Component ── */
function LiveFeed({feed,theater}:{feed:FeedItem[];theater:string}){
  const [idx,setIdx]=useState(0);
  const filtered=useMemo(()=>theater==="ALL"?feed:feed.filter(f=>f.cat===theater),[feed,theater]);
  useEffect(()=>{
    if(!filtered.length)return;
    const t=setInterval(()=>setIdx(i=>(i+1)%filtered.length),2800);
    return ()=>clearInterval(t);
  },[filtered.length]);
  const windowSize=5;
  const items:FeedItem[]=[];
  for(let i=0;i<windowSize;i++){
    const it=filtered[(idx+i)%Math.max(filtered.length,1)];
    if(it)items.push(it);
  }
  const theaterLabels:Record<string,string>={ME:"Middle East",IP:"Indo-Pacific",EU:"Europe / NATO",AT:"Atlantic"};
  return(
    <div style={{background:"#1a1a1a",color:"#f8f5f0",borderRadius:4,padding:"14px 20px",marginBottom:24}}>
      <div style={{display:"flex",alignItems:"center",gap:10,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.12)",marginBottom:10}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:"#b8372d",boxShadow:"0 0 0 3px rgba(184,55,45,0.3)",animation:"pulse-dot 1.2s ease-in-out infinite",flexShrink:0}}/>
        <span style={{fontFamily:"'Source Serif 4', serif",fontSize:15,fontWeight:500}}>Open-source activity feed</span>
        <span style={{marginLeft:"auto",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:"rgba(255,255,255,0.5)"}}>Aggregated public reporting · simulated playback</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3,minHeight:120}}>
        {items.map((it,i)=>{
          const opacity=[1,0.72,0.52,0.32,0.18][i]||0.18;
          const theaterColor:Record<string,string>={ME:"#ff4444",IP:"#ffcc33",EU:"#66ccff",AT:"#aaaaaa"};
          return(
            <div key={idx*100+i} style={{display:"grid",gridTemplateColumns:"54px 100px 1fr",gap:14,padding:"5px 0",alignItems:"baseline",opacity}}>
              <span style={{fontVariantNumeric:"tabular-nums",color:"rgba(255,255,255,0.45)",fontSize:11,letterSpacing:"0.08em"}}>{it.t}</span>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:theaterColor[it.cat]||"#aaa"}}>{(theaterLabels[it.cat]||it.cat).toUpperCase()}</span>
              <span style={{color:"rgba(255,255,255,0.9)",lineHeight:1.5,fontFamily:"'Source Serif 4', serif",fontSize:13}}>{it.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── War Cost Ticker Component ── */
const THEATER_DOT: Record<string, string> = { ME: "#ff4444", EU: "#66ccff", IP: "#ffcc33" };
const dkLink = { color: "rgba(255,255,255,0.55)", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.2)" } as const;
const dkLabel = { fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700 as const, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.35)", marginBottom: 5 };
const dkBody = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.65 };

function WarCostTicker({ mob }: { mob?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, []);

  const grand = estimateGrandTotal(CONFLICT_STREAMS, now);
  const perSec = CONFLICT_STREAMS.reduce((s, c) => s + c.perSecond, 0);
  const fullStr = formatUSDFull(grand);

  return (
    <div style={{
      background: "#0c0c0c", color: "#f8f5f0", borderRadius: 4,
      padding: mob ? "20px 16px" : "24px 28px", marginBottom: 24,
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: mob ? "flex-start" : "center", gap: mob ? 8 : 10,
        paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 16,
        flexWrap: mob ? "wrap" : "nowrap",
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: "#b8372d",
          boxShadow: "0 0 0 3px rgba(184,55,45,0.3)",
          animation: "pulse-dot 1.2s ease-in-out infinite", flexShrink: 0,
          marginTop: mob ? 4 : 0,
        }} />
        <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: mob ? 14 : 15, fontWeight: 500 }}>
          US Military Spend — Active Conflicts
        </span>
        <span style={{
          marginLeft: mob ? 0 : "auto", fontSize: 9, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.4)",
          width: mob ? "100%" : "auto", paddingLeft: mob ? 16 : 0,
        }}>{mob ? "Tap any stream to verify" : "Estimated from public data \u00b7 click any stream to verify"}</span>
      </div>

      {/* Big counter */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{
          fontFamily: "'DM Sans', monospace", fontSize: mob ? 32 : 48,
          fontWeight: 900, letterSpacing: -1, color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}>{fullStr}</div>
        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4,
        }}>combined US military expenditure across {CONFLICT_STREAMS.length} active conflict streams</div>
        <div style={{
          fontFamily: "'DM Sans', monospace", fontSize: mob ? 11 : 13, color: "#e05a50",
          marginTop: 6, fontVariantNumeric: "tabular-nums",
          display: mob ? "flex" : "block",
          flexDirection: mob ? "column" : undefined,
          gap: mob ? 2 : undefined,
          alignItems: mob ? "center" : undefined,
        }}>
          {mob ? (
            <>
              <span>{formatUSD(perSec)}/sec &middot; {formatUSD(perSec * 60)}/min</span>
              <span>{formatUSD(perSec * 3600)}/hr</span>
            </>
          ) : (
            <>{formatUSD(perSec)}/sec &middot; {formatUSD(perSec * 60)}/min &middot; {formatUSD(perSec * 3600)}/hr</>
          )}
        </div>
      </div>

      {/* Per-conflict breakdown — clickable cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: mob ? "1fr" : `repeat(${CONFLICT_STREAMS.length}, 1fr)`,
        gap: 1, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden",
      }}>
        {CONFLICT_STREAMS.map((s) => {
          const total = estimateTotal(s, now);
          const pct = (total / grand) * 100;
          const isOpen = expanded === s.id;
          return (
            <div key={s.id} style={{ background: "#141414" }}>
              {/* Summary — always visible, clickable */}
              <button onClick={() => setExpanded(isOpen ? null : s.id)} style={{
                display: "block", width: "100%", padding: "14px 16px", border: "none",
                background: isOpen ? "#1c1c1c" : "transparent", cursor: "pointer",
                textAlign: "left", color: "#f8f5f0", transition: "background 0.15s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: THEATER_DOT[s.theater] || "#aaa", flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "rgba(255,255,255,0.6)",
                  }}>{s.shortName}</span>
                  <span style={{
                    marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.3)",
                    fontFamily: "'DM Sans', sans-serif",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
                  }}>&#9662;</span>
                </div>
                <div style={{
                  fontFamily: "'DM Sans', monospace", fontSize: 20, fontWeight: 800,
                  color: "#fff", fontVariantNumeric: "tabular-nums", marginBottom: 4,
                }}>{formatUSD(total)}</div>
                <div style={{
                  height: 3, background: "rgba(255,255,255,0.08)",
                  borderRadius: 2, marginBottom: 6, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: THEATER_DOT[s.theater] || "#aaa",
                    borderRadius: 2, transition: "width 0.3s ease",
                  }} />
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                  color: "rgba(255,255,255,0.4)", lineHeight: 1.5,
                }}>
                  {formatUSD(s.dailyRate)}/day &middot; since {new Date(s.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </div>
              </button>

              {/* Expanded methodology panel */}
              {isOpen && (
                <div style={{
                  padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)",
                  background: "#1c1c1c",
                }}>
                  {/* Anchor data */}
                  <div style={{ marginTop: 12, marginBottom: 14, padding: "10px 12px", background: "#232323", borderRadius: 4 }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 10 : 8,
                      fontFamily: "'DM Sans', monospace", fontSize: 12, color: "#fff",
                    }}>
                      <div>
                        <div style={dkLabel}>Anchor total</div>
                        <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatUSD(s.anchorTotal)}</div>
                      </div>
                      <div>
                        <div style={dkLabel}>As of</div>
                        <div>{new Date(s.anchorDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                      </div>
                      <div>
                        <div style={dkLabel}>Daily rate</div>
                        <div style={{ fontVariantNumeric: "tabular-nums" }}>{formatUSD(s.dailyRate)}/day</div>
                      </div>
                      <div>
                        <div style={dkLabel}>Per second</div>
                        <div style={{ fontVariantNumeric: "tabular-nums" }}>{formatUSD(s.perSecond)}/sec</div>
                      </div>
                    </div>
                  </div>

                  {/* How we got the anchor */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={dkLabel}>Where the total comes from</div>
                    <div style={dkBody}>{s.methodology.anchorExplainer}</div>
                  </div>

                  {/* How we got the rate */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={dkLabel}>How we estimated the daily rate</div>
                    <div style={dkBody}>{s.methodology.rateExplainer}</div>
                  </div>

                  {/* Caveats */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={dkLabel}>Caveats</div>
                    <div style={dkBody}>{s.methodology.caveats}</div>
                  </div>

                  {/* Source links */}
                  <div>
                    <div style={dkLabel}>Verify it yourself</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
                        ...dkLink, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                      }}>{s.source} (primary) &#8599;</a>
                      {s.methodology.additionalSources.map((src, i) => (
                        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" style={{
                          ...dkLink, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                        }}>{src.label} &#8599;</a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer sources */}
      <div style={{
        marginTop: 14, paddingTop: 10,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontFamily: "'DM Sans', sans-serif", fontSize: mob ? 9 : 10,
        color: "rgba(255,255,255,0.25)", lineHeight: 1.5,
      }}>
        Figures are estimates extrapolated from anchored institutional totals using publicly-reported daily burn rates.
        Not real-time. Does not include indirect economic costs, veteran care, or classified programs.
        <strong style={{ color: "rgba(255,255,255,0.4)" }}> {mob ? "Tap" : "Click"} any stream above to see exactly where every number comes from.</strong>
      </div>
    </div>
  );
}

/* ── Spend Trend Chart ── */
const STREAM_COLORS = { ukraine: "#66ccff", israel: "#ff4444", houthis: "#ffcc33", iran: "#e05a50" };
const STREAM_LABELS = { ukraine: "Ukraine", israel: "Israel", houthis: "Houthis", iran: "Iran" };
const PERIOD_OPTIONS = [
  { key: "mom", label: "MoM", step: 1, labelFn: "month" as const },
  { key: "qoq", label: "QoQ", step: 3, labelFn: "quarter" as const },
  { key: "hoh", label: "Half-year", step: 6, labelFn: "quarter" as const },
  { key: "yoy", label: "YoY", step: 12, labelFn: "quarter" as const },
];

function SpendTrendChart({ mob }: { mob?: boolean }) {
  const [view, setView] = useState<"cumulative" | "velocity">("velocity");
  const [period, setPeriod] = useState("qoq");

  const periodCfg = PERIOD_OPTIONS.find(p => p.key === period) || PERIOD_OPTIONS[1];
  const deltas = useMemo(() => computeDeltas(MONTHLY_SPEND, periodCfg.step, periodCfg.labelFn), [periodCfg.step, periodCfg.labelFn]);

  // For cumulative view, generate labels from month strings
  const cumulativeData = useMemo(() => {
    // For cumulative, show quarterly labels to avoid overcrowding
    return MONTHLY_SPEND
      .filter(r => { const mo = parseInt(r.month.split("-")[1]); return mo % 3 === 0; })
      .map(r => {
        const [y, mo] = r.month.split("-");
        const q = Math.ceil(parseInt(mo) / 3);
        return {
          ...r,
          label: `Q${q} '${y.slice(2)}`,
          israel: r.israel ?? 0,
          houthis: r.houthis ?? 0,
          iran: r.iran ?? 0,
          total: r.ukraine + (r.israel ?? 0) + (r.houthis ?? 0) + (r.iran ?? 0),
        };
      });
  }, []);

  const streams = ["iran", "israel", "houthis", "ukraine"] as const; // stack order: largest on bottom

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.rule}`, borderRadius: 4,
      padding: mob ? "16px 14px" : "20px 24px", marginBottom: 24,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: mob ? "flex-start" : "center", gap: mob ? 4 : 10, marginBottom: 4, flexDirection: mob ? "column" : "row" }}>
        <h3 style={{
          fontFamily: "'Source Serif 4', serif", fontSize: mob ? 16 : 18, fontWeight: 700,
          color: T.ink, margin: 0,
        }}>Spend Trends</h3>
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: mob ? 11 : 11, color: T.mute,
        }}>Who is getting the money — and is it accelerating?</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, marginTop: 10, flexDirection: mob ? "column" : "row" }}>
        {/* View toggle */}
        <div style={{ display: "flex", border: `1px solid ${T.rule}`, borderRadius: 4, overflow: "hidden", alignSelf: mob ? "stretch" : "flex-start" }}>
          {(["velocity", "cumulative"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 14px", fontFamily: "'DM Sans', sans-serif", fontSize: mob ? 12 : 11,
              fontWeight: view === v ? 700 : 500, border: "none", cursor: "pointer",
              background: view === v ? T.ink : "transparent",
              color: view === v ? T.bg : T.sub, transition: "all 0.15s ease",
              flex: mob ? 1 : undefined,
            }}>{v === "velocity" ? "Spend velocity" : "Cumulative"}</button>
          ))}
        </div>
        {/* Period selector — only for velocity view */}
        {view === "velocity" && (
          <div style={{ display: "flex", border: `1px solid ${T.rule}`, borderRadius: 4, overflow: "hidden", alignSelf: mob ? "stretch" : "flex-start" }}>
            {PERIOD_OPTIONS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: "6px 12px", fontFamily: "'DM Sans', sans-serif", fontSize: mob ? 12 : 11,
                fontWeight: period === p.key ? 700 : 500, border: "none", cursor: "pointer",
                background: period === p.key ? T.ink : "transparent",
                color: period === p.key ? T.bg : T.sub, transition: "all 0.15s ease",
                flex: mob ? 1 : undefined,
              }}>{p.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height={mob ? 280 : 360}>
          {view === "cumulative" ? (
            <AreaChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.rule} />
              <XAxis dataKey="label" stroke={T.mute} fontSize={mob ? 9 : 10} fontFamily="'DM Sans',sans-serif" tick={{ fill: T.sub }} interval={mob ? 3 : 1} />
              <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Sans',sans-serif" tick={{ fill: T.sub }} tickFormatter={v => `$${v}B`} />
              <Tooltip
                contentStyle={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 4, fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}
                formatter={(v: number, name: string) => [`$${v.toFixed(1)}B`, STREAM_LABELS[name as keyof typeof STREAM_LABELS] || name]}
                labelStyle={{ fontWeight: 700, color: T.ink }}
              />
              {streams.map(s => (
                <Area key={s} type="monotone" dataKey={s} stackId="1"
                  fill={STREAM_COLORS[s]} stroke={STREAM_COLORS[s]}
                  fillOpacity={0.6} strokeWidth={1.5} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={deltas}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.rule} />
              <XAxis dataKey="label" stroke={T.mute} fontSize={mob ? 9 : 10} fontFamily="'DM Sans',sans-serif" tick={{ fill: T.sub }} interval={period === "mom" ? (mob ? 7 : 2) : (mob ? 1 : 0)} angle={period === "mom" ? -45 : 0} textAnchor={period === "mom" ? "end" : "middle"} height={period === "mom" ? (mob ? 55 : 50) : 30} />
              <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Sans',sans-serif" tick={{ fill: T.sub }} tickFormatter={v => `$${v}B`} />
              <Tooltip
                contentStyle={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 4, fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}
                formatter={(v: number, name: string) => [`$${v.toFixed(1)}B`, STREAM_LABELS[name as keyof typeof STREAM_LABELS] || name]}
                labelStyle={{ fontWeight: 700, color: T.ink }}
              />
              {streams.map(s => (
                <Bar key={s} dataKey={s} stackId="1" fill={STREAM_COLORS[s]} radius={s === "ukraine" ? [2, 2, 0, 0] : 0} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10 }}>
        {streams.map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans',sans-serif", fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: STREAM_COLORS[s], flexShrink: 0 }} />
            <span style={{ color: T.ink, fontWeight: 600 }}>{STREAM_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {/* Insight callout */}
      <div style={{
        background: T.highlight, borderLeft: `3px solid ${T.accent}`, borderRadius: "0 4px 4px 0",
        padding: mob ? "10px 12px" : "10px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: mob ? 11 : 12,
        color: T.sub, lineHeight: 1.6,
      }}>
        <strong style={{ color: T.ink }}>What the data shows:</strong> Ukraine dominated US military spend from 2022–2024 ($67B), but aid has flatlined since Jan 2025.
        Iran has overtaken all other streams in daily burn rate since Operation Epic Fury began on Feb 28, 2026 — spending more in one month ($27.5B)
        than the entire 2-year Israel aid total ($21.7B). The Middle East now accounts for {">"}90% of active US military expenditure.
      </div>

      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: T.mute, marginTop: 8 }}>
        Sources: CSIS, Brown Univ. Costs of War, Kiel Institute, State Dept, CFR, CRS &middot; Quarterly data reconstructed from supplemental appropriations timelines
      </div>
    </div>
  );
}

const TABS_DESKTOP=[["dashboard","Data"],["scorecard","Scorecard"],["scenarios","Scenarios"],["abroad","Abroad"],["global","Global"]];
const TABS_MOBILE=[["dashboard","Data"],["scenarios","Scenarios"],["abroad","Abroad"],["global","Global"]];

export default function DashboardPage() {
  return <Suspense><App /></Suspense>;
}

function App(){
  const mob = useIsMobile();
  const [tab,setTab]=useState("dashboard");
  const searchParams = useSearchParams();
  const [am,setAm]=useState("gdp");
  const [detail,setDetail]=useState(null);
  const [sel,setSel]=useState(["clinton","bush","obama","trump1","biden"]);
  const [ct,setCt]=useState("bar");
  const [gm,setGm]=useState("gdp_g");
  const [gc,setGc]=useState(["us","china","india","uk"]);
  const [cf,setCf]=useState("all");
  const [openFacts,setOpenFacts]=useState(false);
  const [mobileView,setMobileView]=useState<"table"|"cards">("cards");
  const [selectedPres,setSelectedPres]=useState("clinton");
  const [scenarioMetric,setScenarioMetric]=useState("gdp");
  const [activeScenario,setActiveScenario]=useState<ScenarioId>("no_covid");
  const [showMethodology,setShowMethodology]=useState(false);

  // Read metric from URL query param (e.g. /dashboard?metric=unemployment)
  useEffect(() => {
    const m = searchParams.get("metric");
    if (m && M[m]) { setAm(m); setDetail(m); }
    const t = searchParams.get("tab");
    if (t && TABS.some(([k]) => k === t)) setTab(t);
  }, [searchParams]);

  // Scroll to top when entering or leaving detail view
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [detail]);

  const [sheetOpen,setSheetOpen]=useState(false);
  const [filterOpen,setFilterOpen]=useState(false);
  const [fxOpen,setFxOpen]=useState(false);
  const [whyOpen,setWhyOpen]=useState(false);

  // Abroad tab state
  const [theater,setTheater]=useState("ALL");
  const [abroadAssetTypes,setAbroadAssetTypes]=useState<Record<string,boolean>>({carrier:true,arg:true,base:true,bomber:true,drone:true,sub:true});
  const [abroadSelection,setAbroadSelection]=useState<PostureAsset|null>(null);
  const [abroadAutoRotate,setAbroadAutoRotate]=useState(false);
  const [showRanges,setShowRanges]=useState(false);

  // Reset abroad selection on tab change
  useEffect(()=>{if(tab!=="abroad")setAbroadSelection(null);},[tab]);

  // Nudge mobile cards as they scroll into view (each card nudges once per session)
  useEffect(() => {
    if (!mob || mobileView !== "cards") return;
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    let visibleBatch: HTMLElement[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      visibleBatch.forEach((el, i) => {
        setTimeout(() => {
          el.classList.add("scroll-nudge");
          // Remove the class after the animation finishes so it doesn't keep firing on re-render
          setTimeout(() => el.classList.remove("scroll-nudge"), 3200);
        }, i * 220);
      });
      visibleBatch = [];
      flushTimer = null;
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        if (el.dataset.nudged === "1") return;
        el.dataset.nudged = "1";
        visibleBatch.push(el);
        io.unobserve(el);
      });
      if (visibleBatch.length && !flushTimer) flushTimer = setTimeout(flush, 60);
    }, { threshold: 0.5, rootMargin: "0px 0px -10% 0px" });
    // Wait a tick so cards have rendered
    const t = setTimeout(() => {
      document.querySelectorAll<HTMLElement>('[data-nudge="1"]').forEach((el) => io.observe(el));
    }, 50);
    return () => { clearTimeout(t); if (flushTimer) clearTimeout(flushTimer); io.disconnect(); };
  }, [mob, mobileView, selectedPres]);

  const tog=id=>setSel(p=>p.includes(id)?p.filter(a=>a!==id):[...p,id]);
  const togC=id=>setGc(p=>p.includes(id)?p.filter(c=>c!==id):[...p,id]);
  const m=M[am];const fd=m.d.filter(d=>sel.includes(d.a));
  const vis=cf==="all"?MK:MK.filter(k=>M[k].cat===cf);

  const sums=useMemo(()=>{const o={};for(const id of sel){const p=m.d.filter(d=>d.a===id);if(!p.length)continue;
    o[id]={avg:p.reduce((s,x)=>s+x.v,0)/p.length,chg:p[p.length-1].v-p[0].v};}return o;},[am,sel]);


  const sc=useMemo(()=>scores(),[]);
  const ss=useMemo(()=>AID.slice().sort((a,b)=>sc[b].p-sc[a].p),[sc]);
  const maxP=MK.length*AID.length;
  const gmd=GLOBAL_METRICS[gm];

  const sty={
    page:{minHeight:"100vh",background:T.bg,color:T.ink,fontFamily:"'Source Serif 4','Georgia',serif"},
    header:{borderBottom:`1px solid ${T.rule}`,padding:"28px 24px 22px",background:"linear-gradient(180deg,#fff 0%,"+T.bg+" 100%)"},
    nav:{borderBottom:`1px solid ${T.rule}`,background:T.card},
    card:{background:T.card,border:`1px solid ${T.rule}`,borderRadius:4,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"},
  };

  return (
    <div style={sty.page}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        button { cursor: pointer; transition: all 0.15s ease; }
        button:active { transform: scale(0.98); }
        
        /* Staggered entry animation */
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        
        .stagger-1 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.03s; opacity: 0; }
        .stagger-2 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.06s; opacity: 0; }
        .stagger-3 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.09s; opacity: 0; }
        .stagger-4 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.12s; opacity: 0; }
        .stagger-5 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.15s; opacity: 0; }
        .stagger-6 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.18s; opacity: 0; }
        .stagger-7 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.21s; opacity: 0; }
        .stagger-8 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.24s; opacity: 0; }
        .stagger-9 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.27s; opacity: 0; }
        .stagger-10 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.30s; opacity: 0; }
        .stagger-11 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.33s; opacity: 0; }
        .stagger-12 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.36s; opacity: 0; }
        .stagger-13 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.39s; opacity: 0; }
        .stagger-14 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.42s; opacity: 0; }
        .stagger-15 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.45s; opacity: 0; }
        .stagger-16 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.48s; opacity: 0; }
        .stagger-17 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.51s; opacity: 0; }
        .stagger-18 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.54s; opacity: 0; }
        .stagger-19 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.57s; opacity: 0; }
        .stagger-20 { animation: fadeUp 0.5s ease forwards; animation-delay: 0.60s; opacity: 0; }
        
        /* Heatmap cell hover animations */
        .heatmap-cell {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }
        .heatmap-cell:hover {
          transform: scale(1.05) translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.18);
          z-index: 10;
          position: relative;
        }
        .heatmap-row {
          transition: background 0.2s ease;
        }
        .heatmap-row:hover {
          background: ${T.paper} !important;
        }
        .heatmap-row:hover .heatmap-metric-cell {
          background: ${T.paper} !important;
        }
        .heatmap-row:hover .heatmap-cell {
          opacity: 0.7;
        }
        .heatmap-row:hover .heatmap-cell:hover {
          opacity: 1;
        }
        
        /* Card hover effects */
        .hover-lift {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hover-lift:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.08);
        }
        
        /* Insight callout pulse */
        .insight-pulse {
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(184, 55, 45, 0.2); }
          50% { box-shadow: 0 0 0 8px rgba(184, 55, 45, 0); }
        }

        /* Tap nudge — first card pulses briefly to signal tappability on mobile */
        @keyframes tapNudge {
          0%, 100% { box-shadow: 0 1px 2px rgba(0,0,0,0.04); transform: translateX(0); }
          25% { box-shadow: 0 4px 14px rgba(184, 55, 45, 0.18); transform: translateX(0); }
          50% { box-shadow: 0 4px 14px rgba(184, 55, 45, 0.18); transform: translateX(3px); }
          75% { box-shadow: 0 4px 14px rgba(184, 55, 45, 0.18); transform: translateX(0); }
        }
        @keyframes chevronSlide {
          0%, 100% { transform: translateX(0); color: #9a9490; }
          50% { transform: translateX(4px); color: #b8372d; }
        }
        /* Combine fadeUp (so it actually appears) with the nudge */
        .tap-nudge {
          animation: fadeUp 0.5s ease 0.03s forwards, tapNudge 1.6s ease-in-out 1.8s 3 !important;
        }
        .tap-nudge .tap-chevron {
          animation: chevronSlide 1.6s ease-in-out 1.8s 3;
        }
        /* Scroll-triggered nudge — added by IntersectionObserver as cards enter view.
           opacity:1 !important is required because the animation shorthand below
           replaces the stagger fadeUp forwards fill, which would otherwise let
           opacity snap back to the stagger initial 0. */
        .scroll-nudge {
          opacity: 1 !important;
          animation: tapNudge 1.4s ease-in-out 0s 2 !important;
        }
        .scroll-nudge .tap-chevron {
          animation: chevronSlide 1.4s ease-in-out 0s 2;
        }
        
        /* Enhanced tooltips */
        .tooltip-enhanced {
          backdrop-filter: blur(8px);
          background: rgba(255,255,255,0.95) !important;
        }
        
        /* Mobile heatmap improvements */
        @media (max-width: 768px) {
          .ol-header h1 { font-size: 24px !important; }
          .ol-header p { font-size: 12px !important; }
          .ol-wrap { padding: 16px 14px 48px !important; }
          .ol-header-wrap { padding: 20px 14px 16px !important; }
          .ol-nav-wrap { padding: 0 14px !important; }
          .ol-nav-btn { padding: 10px 12px !important; font-size: 12px !important; }
          .ol-grid-summary { grid-template-columns: repeat(2, 1fr) !important; }
          .ol-grid-metrics { grid-template-columns: 1fr !important; }
          .ol-bench-grid { grid-template-columns: 1fr !important; }
          .ol-score-card { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .ol-score-medal { font-size: 20px !important; width: auto !important; }
          .ol-score-pts { text-align: left !important; display: flex; gap: 4px; align-items: baseline; }
          .ol-score-pts > div:first-child { font-size: 22px !important; }
          .ol-inherited { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; }
          .ol-chart-wrap { padding: 12px 6px 4px !important; }
          .ol-president-toggle { font-size: 11px !important; padding: 5px 8px !important; }
          .ol-president-toggle span.ol-years { display: none !important; }
          .ol-controls { flex-direction: column !important; gap: 8px !important; }
          
          /* Mobile heatmap - larger touch targets */
          .ol-heatmap-table th { padding: 12px 8px !important; min-width: 72px !important; }
          .ol-heatmap-table th > div:first-child { font-size: 12px !important; }
          .ol-heatmap-table td { padding: 8px 5px !important; }
          .heatmap-cell { padding: 12px 8px !important; min-height: 56px !important; font-size: 14px !important; border-radius: 8px !important; }
          .ol-heatmap-table .heatmap-metric-cell { min-width: 120px !important; padding: 12px 12px !important; }
          .heatmap-metric-cell > div:first-child { font-size: 13px !important; }
          .heatmap-cell-value { font-size: 9px !important; margin-top: 3px !important; }
          .ol-heatmap-legend { gap: 10px !important; }
          .ol-heatmap-legend > span { font-size: 11px !important; gap: 4px !important; }
          .ol-heatmap-legend > span > span:first-child { width: 14px !important; height: 14px !important; }
        }
        
        /* Large screens - even bigger cells */
        @media (min-width: 1024px) {
          .heatmap-cell { padding: 12px 8px !important; min-height: 56px !important; }
          .ol-heatmap-table th { min-width: 110px !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={sty.header} className="ol-header-wrap">
        <div className="ol-header" style={{maxWidth:1080,margin:"0 auto"}}>
          <Link href="/" style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,textDecoration:"none",cursor:"pointer"}}>
            <div style={{display:"flex",gap:3}}>
              <div style={{width:4,height:20,background:T.accent,borderRadius:1}}/>
              <div style={{width:4,height:20,background:T.accent,borderRadius:1,opacity:0.6}}/>
              <div style={{width:4,height:20,background:T.accent,borderRadius:1,opacity:0.3}}/>
            </div>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,letterSpacing:4,textTransform:"uppercase",color:T.mute}}>Open Ledger</span>
          </Link>
          <h1 style={{fontSize:mob?32:48,fontWeight:900,margin:0,lineHeight:1.05,letterSpacing:-2,maxWidth:700,color:T.ink}}>
            The economy under<br/>every president, <span style={{color:T.accent}}>in data.</span>
          </h1>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,color:T.sub,margin:"14px 0 0",maxWidth:520,lineHeight:1.6}}>
            19 economic indicators. 4 active conflicts. 5 administrations. 32 years. No editorial. No spin. <strong style={{color:T.ink}}>You interpret.</strong>
          </p>
        </div>
      </div>

      {/* ── NAV ── */}
      <div style={sty.nav}>
        <div className="ol-nav-wrap" style={{maxWidth:1080,margin:"0 auto",padding:"0 24px",display:"flex",gap:0,overflowX:"auto"}}>
          {(mob?TABS_MOBILE:TABS_DESKTOP).map(([k,l])=><button key={k} className="ol-nav-btn" onClick={()=>setTab(k)} style={{
            padding:"13px 20px",border:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            background:"transparent",color:tab===k?T.ink:T.mute,
            borderBottom:tab===k?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.2s"
          }}>{l}</button>)}
          <a href="/live-benchmark" className="ol-nav-btn" style={{
            padding:"13px 20px",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            background:"transparent",color:T.accent,textDecoration:"none",display:"flex",alignItems:"center",gap:6,
            borderBottom:"2px solid transparent",transition:"all 0.2s"
          }}><span style={{width:6,height:6,borderRadius:"50%",background:T.accent,animation:"pulse 2s infinite"}}/>Live Benchmark</a>
        </div>
      </div>

      <div className="ol-wrap" style={{maxWidth:1080,margin:"0 auto",padding:"28px 24px 64px"}}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard"&&(<div style={{animation:"fadeUp 0.4s ease"}}>

          {/* ── OVERVIEW MODE ── */}
          {!detail&&(<div>
            {/* Key Insights Callout — desktop only */}
            {!mob && (
            <div className="insight-pulse" style={{...sty.card,padding:"18px 20px",marginBottom:24,borderLeft:`4px solid ${T.accent}`,background:`linear-gradient(135deg, ${T.highlight} 0%, #fff 100%)`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:18}}>&#9733;</span>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:800,letterSpacing:2,textTransform:"uppercase",color:T.accent}}>Key Insights</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,lineHeight:1.5}}>
                  <strong style={{color:T.ink}}>Clinton achieved budget surpluses</strong>
                  <span style={{color:T.sub}}> — the only president in this dataset to do so, with 4 consecutive surplus years.</span>
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,lineHeight:1.5}}>
                  <strong style={{color:T.ink}}>Inequality rose under every president</strong>
                  <span style={{color:T.sub}}> — from 40.5% to 47.2% over 32 years, regardless of party.</span>
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,lineHeight:1.5}}>
                  <strong style={{color:T.ink}}>Obama inherited the worst economy</strong>
                  <span style={{color:T.sub}}> — 9.3% unemployment, yet improved it by 47% during his tenure.</span>
                </div>
              </div>
            </div>
            )}
            
            <div style={{marginBottom:24}}>
              <h2 style={{fontSize:28,fontWeight:900,margin:"0 0 6px",letterSpacing:-0.5}}>All Metrics at a Glance</h2>
              <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 16px",lineHeight:1.5}}>19 metrics across 5 presidents. Each cell shows % change from start to end of term. <strong style={{color:T.ink}}>Hover to see trend.</strong> Click any row to explore.</p>
              <div className="ol-heatmap-legend" style={{display:"flex",gap:20,fontFamily:"'DM Sans',sans-serif",fontSize:12,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-block",width:18,height:18,borderRadius:4,background:T.improve.strong}}/>Strong improvement</span>
                <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-block",width:18,height:18,borderRadius:4,background:T.improve.light}}/>Modest improvement</span>
                <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-block",width:18,height:18,borderRadius:4,background:T.neutral,border:`1px solid ${T.rule}`}}/>Maintained</span>
                <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-block",width:18,height:18,borderRadius:4,background:T.decline.light}}/>Modest decline</span>
                <span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-block",width:18,height:18,borderRadius:4,background:T.decline.strong}}/>Strong decline</span>
              </div>
            </div>

            {/* Mobile view toggle */}
            {mob && (
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div style={{display:"flex",border:`1px solid ${T.rule}`,borderRadius:6,overflow:"hidden"}}>
                  {[["cards","Cards"],["table","Table"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setMobileView(v as "table"|"cards")} style={{
                      padding:"8px 14px",border:"none",background:mobileView===v?T.accent:T.card,
                      color:mobileView===v?"#fff":T.sub,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif"
                    }}>{l}</button>
                  ))}
                </div>
                {mobileView==="cards" && (
                  <select 
                    value={selectedPres} 
                    onChange={e=>setSelectedPres(e.target.value)}
                    style={{padding:"8px 12px",border:`1px solid ${T.rule}`,borderRadius:6,background:T.card,fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:ADMINS[selectedPres]?.color||T.ink}}
                  >
                    {AID.map(id=><option key={id} value={id}>{ADMINS[id].name} ({ADMINS[id].years})</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Mobile Card View */}
            {mob && mobileView==="cards" && (
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                {Object.entries(CATS).map(([catKey,catLabel])=>{
                  const catMetrics=MK.filter(k=>M[k].cat===catKey);
                  if(!catMetrics.length)return null;
                  return (
                    <div key={catKey}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:T.mute,marginBottom:8,paddingLeft:4}}>{catLabel}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {catMetrics.map((k,idx)=>{
                          const mx=M[k];
                          const pts=mx.d.filter(d=>d.a===selectedPres);
                          if(pts.length<1)return null;
                          const s=inheritedStart(k,selectedPres),e=pts[pts.length-1].v;
                          const pc=s!==0?((e-s)/Math.abs(s))*100:0;
                          const absPc=Math.abs(pc);
                          const imp=mx.inv?pc<0:pc>0;
                          const mnt=absPc<5;
                          const sparkData=pts.map(p=>p.v);

                          let bg,fg;
                          if(mnt){bg=T.neutral;fg=T.gold;}
                          else if(imp){bg=absPc>30?T.improve.strong:absPc>10?T.improve.medium:T.improve.light;fg=absPc>10?"#fff":T.improve.strong;}
                          else{bg=absPc>30?T.decline.strong:absPc>10?T.decline.medium:T.decline.light;fg=absPc>10?"#fff":T.decline.strong;}
                          
                          return (
                            <div
                              key={k}
                              data-nudge="1"
                              className={`hover-lift stagger-${Math.min(idx+1,20)}`}
                              onClick={()=>{setAm(k);setDetail(k);setOpenFacts(false);}}
                              style={{...sty.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",borderLeft:`4px solid ${ADMINS[selectedPres]?.color||T.accent}`,position:"relative"}}
                            >
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:700,color:T.ink,marginBottom:2}}>{mx.l}</div>
                                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute}}>{fmt(s,mx.u)} → {fmt(e,mx.u)}</div>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <Sparkline data={sparkData} color={ADMINS[selectedPres]?.color||T.sub} width={50} height={22} />
                                <div style={{background:bg,borderRadius:6,padding:"8px 10px",color:fg,fontWeight:700,fontSize:14,minWidth:54,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>
                                  {mnt?"—":imp?"▲":"▼"}{absPc.toFixed(0)}%
                                </div>
                                <span className="tap-chevron" style={{fontSize:18,color:T.mute,fontWeight:300,marginLeft:2,lineHeight:1}}>›</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Desktop Table View (or mobile table view when toggled) */}
            {(!mob || mobileView==="table") && (
            <div style={{...sty.card,overflow:"auto",marginBottom:16,WebkitOverflowScrolling:"touch"}}>
              <table className="ol-heatmap-table" style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif",fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${T.rule}`}}>
                    <th style={{textAlign:"left",padding:"14px 16px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:T.mute,position:"sticky",left:0,background:T.card,zIndex:2,minWidth:150}}>Metric</th>
                    {AID.map(id=>{const a=ADMINS[id];return(
                      <th key={id} style={{textAlign:"center",padding:"14px 10px",minWidth:100}}>
                        <div style={{fontWeight:700,color:a.color,fontSize:13}}>{a.name}</div>
                        <div style={{fontSize:10,color:T.mute,fontWeight:400}}>{a.years}</div>
                      </th>
                    );})}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CATS).map(([catKey,catLabel])=>{
                    const catMetrics=MK.filter(k=>M[k].cat===catKey);
                    if(!catMetrics.length)return null;
                    return [
                      <tr key={"cat-"+catKey}><td colSpan={6} style={{padding:"12px 16px 6px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:T.mute,background:T.bg,borderBottom:`1px solid ${T.rule}`}}>{catLabel}</td></tr>,
                      ...catMetrics.map((k,rowIdx)=>{
                        const mx=M[k];
                        const perPres=AID.map(id=>{
                          const pts=mx.d.filter(d=>d.a===id);if(pts.length<1)return null;
                          const s=inheritedStart(k,id),e=pts[pts.length-1].v;
                          const pc=s!==0?((e-s)/Math.abs(s))*100:0;
                          const imp=mx.inv?pc<0:pc>0;const mnt=Math.abs(pc)<5;
                          const sparkData=pts.map(p=>p.v);
                          return{id,s,e,pc,imp,mnt,sparkData};
                        }).filter(Boolean);

                        return <tr key={k} className={`heatmap-row stagger-${Math.min(rowIdx+1,20)}`} onClick={()=>{setAm(k);setDetail(k);setOpenFacts(false);}}
                          style={{borderBottom:`1px solid ${T.rule}22`,cursor:"pointer"}}>
                          <td className="heatmap-metric-cell" style={{padding:"16px 18px",fontWeight:600,color:T.ink,position:"sticky",left:0,background:T.card,zIndex:1,transition:"background 0.2s"}}>
                            <div style={{fontSize:15,fontWeight:700}}>{mx.l}</div>
                            <div style={{fontSize:10,color:T.mute,fontWeight:500,marginTop:3,letterSpacing:0.3}}>{mx.s}</div>
                          </td>
                          {perPres.map(p=>{
                            const absPc=Math.abs(p.pc);
                            let bg,fg,sparkColor;
                            if(p.mnt){
                              bg=T.neutral;fg=T.gold;sparkColor=T.gold;
                            } else if(p.imp){
                              bg=absPc>30?T.improve.strong:absPc>10?T.improve.medium:T.improve.light;
                              fg=absPc>10?"#fff":T.improve.strong;
                              sparkColor=T.improve.strong;
                            }else{
                              bg=absPc>30?T.decline.strong:absPc>10?T.decline.medium:T.decline.light;
                              fg=absPc>10?"#fff":T.decline.strong;
                              sparkColor=T.decline.strong;
                            }
                            return <td key={p.id} style={{textAlign:"center",padding:"10px 8px",verticalAlign:"middle"}}>
                              <div className="heatmap-cell hover-lift" style={{background:bg,borderRadius:8,padding:"12px 10px 8px",color:fg,fontWeight:700,fontSize:15,lineHeight:1.2,minHeight:mob?60:72,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}>
                                <span style={{fontVariantNumeric:"tabular-nums"}}>{p.mnt?"—":p.imp?"▲":"▼"}{absPc.toFixed(0)}%</span>
                                {!mob && <Sparkline data={p.sparkData} color={fg} width={50} height={16} />}
                              </div>
                              <div className="heatmap-cell-value" style={{fontSize:10,color:T.mute,marginTop:5,fontVariantNumeric:"tabular-nums"}}>{fmt(p.s,mx.u)} → {fmt(p.e,mx.u)}</div>
                            </td>;
                          })}
                        </tr>;
                      })
                    ];
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* Totals row */}
            <div style={{...sty.card,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:10}}>Summary — Metrics Improved vs Declined</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {AID.map(id=>{
                  const a=ADMINS[id];
                  let imp=0,dec=0;
                  MK.forEach(k=>{
                    const mx=M[k];const pts=mx.d.filter(d=>d.a===id);if(pts.length<1)return;
                    const s=inheritedStart(k,id),e=pts[pts.length-1].v;
                    const pc=s!==0?((e-s)/Math.abs(s))*100:0;
                    const improved=mx.inv?pc<0:pc>0;const mnt=Math.abs(pc)<5;
                    if(mnt)return;if(improved)imp++;else dec++;
                  });
                  return <div key={id} style={{flex:1,minWidth:100,borderLeft:`3px solid ${a.color}`,padding:"8px 12px",background:T.paper,borderRadius:3}}>
                    <div style={{fontWeight:700,color:a.color,fontSize:13,marginBottom:4}}>{a.name}</div>
                    <div style={{display:"flex",gap:8,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>
                      <span style={{color:"#16a34a",fontWeight:700}}>▲{imp}</span>
                      <span style={{color:"#dc2626",fontWeight:700}}>▼{dec}</span>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>)}

          {/* ── DETAIL MODE ── */}
          {detail&&(<div>

          {/* ─── MOBILE: compact nav row ─── */}
          {mob && (<>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <button onClick={()=>setDetail(null)} style={{
                border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",
                fontSize:12,fontWeight:600,color:T.accent,padding:0,cursor:"pointer",whiteSpace:"nowrap"
              }}>← All</button>
              <button onClick={()=>setSheetOpen(true)} style={{
                flex:1,display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"8px 12px",borderRadius:6,border:`1.5px solid ${T.rule}`,background:T.paper,
                fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:T.ink,cursor:"pointer",
                minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
              }}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{m.l}</span>
                <span style={{fontSize:10,color:T.mute,marginLeft:6,flexShrink:0}}>▾</span>
              </button>
              <button onClick={()=>setFilterOpen(!filterOpen)} style={{
                width:28,height:28,borderRadius:6,border:`1.5px solid ${T.rule}`,background:T.paper,
                display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,
                position:"relative"
              }}>
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                  <line x1="0" y1="1" x2="14" y2="1" stroke={T.sub} strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="2" y1="5" x2="12" y2="5" stroke={T.sub} strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="4" y1="9" x2="10" y2="9" stroke={T.sub} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {sel.length<AID.length&&<span style={{
                  position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",
                  background:T.accent,color:"#fff",fontSize:8,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center"
                }}>{sel.length}</span>}
              </button>
            </div>

            {/* Admin filter popover */}
            {filterOpen&&(
              <div style={{
                background:T.card,border:`1px solid ${T.rule}`,borderRadius:8,
                padding:"12px 14px",marginBottom:12,boxShadow:"0 4px 16px rgba(0,0,0,0.08)"
              }}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:8}}>Filter Presidents</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {AID.map(id=>{const a=ADMINS[id];return(
                    <button key={id} onClick={()=>tog(id)} style={{
                      display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:3,
                      background:sel.includes(id)?a.color+"12":"transparent",
                      border:`1.5px solid ${sel.includes(id)?a.color:T.rule}`,
                      color:sel.includes(id)?a.color:T.mute,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif"
                    }}><span style={{width:8,height:8,borderRadius:2,background:sel.includes(id)?a.color:T.rule}}/>{a.name}</button>
                  );})}
                </div>
              </div>
            )}

            {/* Full-screen metric sheet */}
            {sheetOpen&&(
              <div onClick={()=>setSheetOpen(false)} style={{
                position:"fixed",inset:0,zIndex:1000,background:"rgba(26,26,26,0.5)",
                display:"flex",flexDirection:"column",justifyContent:"flex-end"
              }}>
                <div onClick={e=>e.stopPropagation()} style={{
                  background:T.bg,borderRadius:"16px 16px 0 0",maxHeight:"75vh",
                  overflowY:"auto",WebkitOverflowScrolling:"touch",
                  animation:"fadeUp 0.3s ease"
                }}>
                  <div style={{padding:"16px 18px 12px",borderBottom:`1px solid ${T.rule}`,position:"sticky",top:0,background:T.bg,zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Source Serif 4',Georgia,serif",fontSize:16,fontWeight:700,color:T.ink}}>Select Metric</span>
                    <button onClick={()=>setSheetOpen(false)} style={{width:28,height:28,borderRadius:"50%",background:T.paper,border:`1px solid ${T.rule}`,color:T.sub,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                  </div>
                  <div style={{padding:"8px 0 20px"}}>
                    {Object.entries(CATS).map(([catKey,catLabel])=>{
                      const catMetrics=MK.filter(k=>M[k].cat===catKey);
                      if(!catMetrics.length)return null;
                      return <div key={catKey}>
                        <div style={{padding:"12px 18px 4px",fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:T.mute}}>{catLabel}</div>
                        {catMetrics.map(k=>(
                          <button key={k} onClick={()=>{setAm(k);setSheetOpen(false);}} style={{
                            display:"block",width:"100%",textAlign:"left",padding:"12px 18px",border:"none",
                            background:am===k?T.accent+"0A":"transparent",cursor:"pointer",
                            fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:am===k?700:500,
                            color:am===k?T.accent:T.ink,borderLeft:am===k?`3px solid ${T.accent}`:"3px solid transparent"
                          }}>{M[k].l}</button>
                        ))}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            )}
          </>)}

          {/* ─── DESKTOP: original nav rows ─── */}
          {!mob&&(<>
          <button onClick={()=>setDetail(null)} style={{
            display:"flex",alignItems:"center",gap:6,border:"none",background:"transparent",
            fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:T.accent,padding:"0 0 16px",cursor:"pointer"
          }}>← All Metrics</button>

          <div className="ol-controls" style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:6}}>Administrations</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {AID.map(id=>{const a=ADMINS[id];return(
                  <button key={id} className="ol-president-toggle" onClick={()=>tog(id)} style={{
                    display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:3,
                    background:sel.includes(id)?a.color+"12":"transparent",
                    border:`1.5px solid ${sel.includes(id)?a.color:T.rule}`,
                    color:sel.includes(id)?a.color:T.mute,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif"
                  }}><span style={{width:8,height:8,borderRadius:2,background:sel.includes(id)?a.color:T.rule}}/>{a.name}<span className="ol-years" style={{fontSize:10,opacity:0.5}}>{a.years}</span></button>
                );})}
              </div>
            </div>
            <div style={{display:"flex",border:`1px solid ${T.rule}`,borderRadius:3,overflow:"hidden"}}>
              {[["bar","Bar"],["line","Line"]].map(([t,l])=>(
                <button key={t} onClick={()=>setCt(t)} style={{padding:"5px 12px",border:"none",background:ct===t?T.paper:"transparent",color:ct===t?T.ink:T.mute,fontSize:11,fontWeight:600,fontFamily:"'DM Sans',sans-serif",borderRight:`1px solid ${T.rule}`}}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.rule}`,marginBottom:14,overflowX:"auto"}}>
            <button onClick={()=>setCf("all")} style={{padding:"8px 14px",border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:cf==="all"?T.accent:T.mute,borderBottom:cf==="all"?`2px solid ${T.accent}`:"2px solid transparent"}}>All</button>
            {Object.entries(CATS).map(([k,l])=><button key={k} onClick={()=>setCf(k)} style={{padding:"8px 14px",border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:cf===k?T.accent:T.mute,borderBottom:cf===k?`2px solid ${T.accent}`:"2px solid transparent",whiteSpace:"nowrap"}}>{l}</button>)}
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:18}}>
            {vis.map(k=><button key={k} onClick={()=>setAm(k)} style={{padding:"5px 12px",borderRadius:3,border:`1px solid ${am===k?T.accent+"55":T.rule}`,background:am===k?T.accent+"0A":"transparent",color:am===k?T.accent:T.sub,fontSize:12,fontWeight:am===k?700:500,fontFamily:"'DM Sans',sans-serif"}}>{M[k].l}</button>)}
          </div>
          </>)}

          {/* Title bar — desktop only (mobile uses the dropdown) */}
          {!mob&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
            <div>
              <h2 style={{fontSize:24,fontWeight:700,margin:0}}>{m.l}</h2>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.mute}}>{m.s} · {m.src}</span>
            </div>
          </div>}

          {/* ─── DESKTOP: Formula + Benchmark + Why ─── */}
          {!mob&&(<>
          {m.def&&<div style={{background:T.paper,border:`1px solid ${T.rule}`,borderRadius:3,padding:"8px 12px",marginBottom:14,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:T.accent,flexShrink:0}}>f(x)</span>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,lineHeight:1.5,color:T.sub}}>{m.def}</span>
          </div>}
          {m.bench&&<div className="ol-bench-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:3,padding:"8px 12px"}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#16a34a",marginBottom:2}}>Good</div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:600,color:"#15803d"}}>{m.bench.good}</div>
            </div>
            <div style={{background:T.highlight,border:"1px solid #f5deb3",borderRadius:3,padding:"8px 12px"}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:T.gold,marginBottom:2}}>Target</div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:"#92400e",lineHeight:1.4}}>{m.bench.target}</div>
            </div>
            <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:3,padding:"8px 12px"}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#dc2626",marginBottom:2}}>Warning</div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:"#991b1b",lineHeight:1.4}}>{m.bench.warn}</div>
            </div>
          </div>}
          {m.bench&&<div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.6,marginBottom:16,padding:"0 2px"}}><strong style={{color:T.ink}}>Why this matters: </strong>{m.bench.why}</div>}
          </>)}

          {/* ─── MOBILE: compressed benchmark strip ─── */}
          {mob&&m.bench&&(
            <div style={{marginBottom:12}}>
              <div style={{background:T.card,border:`1px solid ${T.rule}`,borderRadius:fxOpen||whyOpen?"6px 6px 0 0":6,padding:"7px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:11,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",flexShrink:0}}/>
                <span style={{color:"#15803d",fontWeight:600}}>{m.bench.good}</span>
                <span style={{color:T.rule}}>|</span>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#dc2626",flexShrink:0}}/>
                <span style={{color:"#991b1b",fontWeight:600}}>{m.bench.warn.length>20?m.bench.warn.slice(0,20)+"…":m.bench.warn}</span>
                <span style={{flex:1}}/>
                <button onClick={()=>{setFxOpen(!fxOpen);if(whyOpen)setWhyOpen(false);}} style={{
                  border:"none",background:"transparent",fontFamily:"'Source Serif 4',Georgia,serif",
                  fontSize:12,fontStyle:"italic",color:fxOpen?T.accent:T.sub,fontWeight:600,cursor:"pointer",padding:"2px 4px"
                }}>f(x)</button>
                <span style={{color:T.rule,fontSize:9}}>·</span>
                <button onClick={()=>{setWhyOpen(!whyOpen);if(fxOpen)setFxOpen(false);}} style={{
                  border:"none",background:"transparent",fontSize:13,color:whyOpen?T.accent:T.sub,cursor:"pointer",padding:"2px 4px",lineHeight:1
                }}>ⓘ</button>
              </div>
              {fxOpen&&m.def&&(
                <div style={{background:T.paper,border:`1px solid ${T.rule}`,borderTop:"none",borderRadius:"0 0 6px 6px",padding:"8px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:11,lineHeight:1.5,color:T.sub}}>
                  <span style={{fontWeight:600,color:T.accent,marginRight:6}}>f(x)</span>{m.def}
                </div>
              )}
              {whyOpen&&(
                <div style={{background:T.paper,border:`1px solid ${T.rule}`,borderTop:"none",borderRadius:"0 0 6px 6px",padding:"8px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:11,lineHeight:1.5,color:T.sub}}>
                  <div style={{marginBottom:4}}><span style={{fontWeight:600,color:T.gold}}>Target: </span>{m.bench.target}</div>
                  <div><strong style={{color:T.ink}}>Why: </strong>{m.bench.why}</div>
                </div>
              )}
            </div>
          )}

          {/* ─── Reorder wrapper: on mobile chart first, then cards ─── */}
          <div style={{display:"flex",flexDirection:"column"}}>

          {/* Arrow legend */}
          <div style={{order:mob?2:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:mob?10:14,marginBottom:mob?6:8,fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:11,color:T.mute}}>
            <span><span style={{color:"#16a34a",fontWeight:700}}>▲</span> improved</span>
            <span><span style={{color:"#dc2626",fontWeight:700}}>▼</span> worsened</span>
            {m.inv&&<span style={{fontSize:mob?8:9,opacity:0.7}}>(lower = better)</span>}
          </div>

          {/* Summary cards */}
          <div className="ol-grid-summary" style={{display:"grid",gridTemplateColumns:mob?"repeat(2,1fr)":`repeat(${Math.min(sel.length+1,6)},1fr)`,gap:mob?8:10,marginBottom:mob?12:20,order:mob?2:1}}>
            {sel.map((id,idx)=>{const s=sums[id];if(!s)return null;const a=ADMINS[id];
              const pts=m.d.filter(d=>d.a===id);if(pts.length<1)return null;
              const start=inheritedStart(am,id),end=pts[pts.length-1].v;
              const pct=start!==0?((end-start)/Math.abs(start))*100:0;
              const imp=m.inv?pct<0:pct>0;const mnt=Math.abs(pct)<5;
              const col=mnt?T.gold:imp?T.improve.strong:T.decline.strong;
              const sparkData=pts.map(p=>p.v);
              return <div key={id} className={`hover-lift stagger-${idx+1}`} style={{...sty.card,padding:mob?"10px 12px":"16px 18px",borderTop:`${mob?3:4}px solid ${a.color}`,position:"relative",overflow:"hidden"}}>
                {!mob&&<div style={{position:"absolute",top:0,right:0,width:80,height:80,background:`linear-gradient(135deg, ${a.color}08 0%, transparent 70%)`,borderRadius:"0 0 0 80px"}}/>}
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,color:a.color,marginBottom:mob?4:6}}>{a.name}</div>
                <div style={{display:"flex",alignItems:"baseline",gap:mob?4:6,marginBottom:mob?3:4}}>
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:12,color:T.mute,fontVariantNumeric:"tabular-nums"}}>{fmt(start,m.u)}</span>
                  <span style={{fontSize:mob?8:10,color:T.mute}}>→</span>
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:18,fontWeight:700,color:T.ink,fontVariantNumeric:"tabular-nums"}}>{fmt(end,m.u)}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:mob?4:8,marginBottom:mob?4:6}}>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?17:24,fontWeight:900,color:col,fontVariantNumeric:"tabular-nums"}}>{mnt?"—":imp?"▲":"▼"}{Math.abs(pct).toFixed(0)}%</div>
                  {!mob&&<Sparkline data={sparkData} color={a.color} width={50} height={20} />}
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,color:T.mute,display:"flex",justifyContent:"space-between"}}>
                  <span>avg {fmt(s.avg,m.u)}</span>
                  <span style={{color:a.color,fontWeight:600}}>{a.years}</span>
                </div>
              </div>;
            })}
            <a href={`/live-benchmark?metric=${am}`} className={`hover-lift stagger-${sel.length+1}`} style={{
              background:T.accent,border:`1px solid ${T.accent}`,borderRadius:4,
              padding:mob?"10px 12px":"16px 18px",textDecoration:"none",color:"#fff",cursor:"pointer",
              display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:0
            }}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#fff",animation:"pulse 2s ease-in-out infinite"}}/>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2}}>Live · Trump II</span>
              </div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?11:12,fontWeight:500,color:"rgba(255,255,255,0.88)",margin:"6px 0"}}>Current term, updated daily</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:11,fontWeight:700}}>See live data</span>
                <span style={{fontSize:12}}>→</span>
              </div>
            </a>
          </div>

          {/* Chart */}
          <div className="ol-chart-wrap hover-lift" style={{...sty.card,padding:mob?"12px 8px 8px":"24px 20px 14px",marginBottom:mob?12:16,borderRadius:8,order:mob?1:2}}>
            {mob&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,padding:"0 4px"}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:T.mute}}>{m.l}</div>
                <div style={{display:"flex",border:`1px solid ${T.rule}`,borderRadius:3,overflow:"hidden"}}>
                  {[["bar","Bar"],["line","Line"]].map(([t,l])=>(
                    <button key={t} onClick={()=>setCt(t)} style={{padding:"4px 10px",border:"none",background:ct===t?T.paper:"transparent",color:ct===t?T.ink:T.mute,fontSize:10,fontWeight:600,fontFamily:"'DM Sans',sans-serif",borderRight:`1px solid ${T.rule}`}}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height={mob?280:360}>
              {ct==="bar"?(
                <BarChart data={fd} margin={{top:10,right:10,left:0,bottom:10}}>
                  <defs>
                    {AID.map(id=>(
                      <linearGradient key={id} id={`bar-gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ADMINS[id]?.color} stopOpacity={0.9}/>
                        <stop offset="100%" stopColor={ADMINS[id]?.color} stopOpacity={0.6}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.rule} strokeOpacity={0.5}/>
                  <XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} axisLine={{stroke:T.rule}}/>
                  <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)} axisLine={{stroke:T.rule}}/>
                  <Tooltip content={<Tip unit={m.u}/>} cursor={{fill:T.paper,opacity:0.5}}/>
                  <Bar dataKey="v" radius={[4,4,0,0]} maxBarSize={28} animationDuration={600} animationEasing="ease-out">
                    {fd.map((e,i)=><Cell key={i} fill={`url(#bar-gradient-${e.a})`}/>)}
                  </Bar>
                </BarChart>
              ):(
                <LineChart data={fd} margin={{top:10,right:10,left:0,bottom:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.rule} strokeOpacity={0.5}/>
                  <XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} axisLine={{stroke:T.rule}}/>
                  <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)} axisLine={{stroke:T.rule}}/>
                  <Tooltip content={<Tip unit={m.u}/>}/>
                  <Line type="monotone" dataKey="v" stroke={T.sub} strokeWidth={1.5} animationDuration={600} dot={p=><circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={ADMINS[p.payload?.a]?.color||T.sub} stroke={T.card} strokeWidth={2}/>}/>
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          </div>{/* end reorder wrapper */}

          {/* Term Trajectory */}
          <div style={{...sty.card,marginBottom:12,overflow:"hidden"}}>
            <div style={{padding:"10px 14px 6px",borderBottom:`1px solid ${T.rule}`}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute}}>Term Trajectory — Inherited vs Left Behind</div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"'DM Sans',sans-serif",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${T.rule}`}}>
                  <th style={{textAlign:"left",padding:"8px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,color:T.mute}}>President</th>
                  <th style={{textAlign:"center",padding:"8px 10px",fontSize:10,fontWeight:700,color:T.mute}}>Inherited</th>
                  <th style={{textAlign:"center",padding:"8px 4px",fontSize:10,color:T.rule}}></th>
                  <th style={{textAlign:"center",padding:"8px 10px",fontSize:10,fontWeight:700,color:T.mute}}>Left At</th>
                  <th style={{textAlign:"right",padding:"8px 14px",fontSize:10,fontWeight:700,color:T.mute}}>% Change</th>
                </tr>
              </thead>
              <tbody>
                {sel.map(id=>{
                  const pts=m.d.filter(d=>d.a===id);
                  if(pts.length<1)return null;
                  const a=ADMINS[id];
                  const start=inheritedStart(am,id);const end=pts[pts.length-1].v;
                  const pctChg=start!==0?((end-start)/Math.abs(start))*100:0;
                  const improved=m.inv?pctChg<0:pctChg>0;
                  const maintained=Math.abs(pctChg)<5;
                  const verdict=maintained?"Maintained":improved?"Improved":"Declined";
                  const verdictColor=maintained?T.gold:improved?"#16a34a":"#dc2626";
                  return <tr key={id} style={{borderBottom:`1px solid ${T.rule}22`}}>
                    <td style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:8,height:8,borderRadius:2,background:a.color,flexShrink:0}}/>
                      <span style={{fontWeight:700,color:a.color}}>{a.name}</span>
                    </td>
                    <td style={{textAlign:"center",padding:"8px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub}}>{fmt(start,m.u)}</td>
                    <td style={{textAlign:"center",padding:"8px 2px",color:T.rule,fontSize:10}}>→</td>
                    <td style={{textAlign:"center",padding:"8px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:T.ink}}>{fmt(end,m.u)}</td>
                    <td style={{textAlign:"right",padding:"8px 14px"}}>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:verdictColor}}>
                        {maintained?"—":improved?"▲":"▼"}{Math.abs(pctChg).toFixed(1)}%
                      </span>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:verdictColor,marginLeft:5,fontWeight:600}}>{verdict}</span>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          {/* Context */}
          <div style={{background:T.highlight,border:"1px solid #f5deb3",borderRadius:3,padding:"10px 14px",display:"flex",gap:8,marginBottom:6}}>
            <span style={{fontSize:14,lineHeight:1}}>↳</span>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.6,color:"#78716c"}}><strong style={{color:T.ink}}>Context: </strong>{m.ctx}</div>
          </div>

          {/* Facts */}
          {m.facts?.length>0&&<div style={{borderLeft:`2px solid ${T.accent}`,marginTop:10,paddingLeft:16}}>
            <button onClick={()=>setOpenFacts(!openFacts)} style={{border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:T.accent,padding:0,display:"flex",alignItems:"center",gap:4}}>
              {openFacts?"Hide":"Read"}: How to interpret this data <span style={{transform:openFacts?"rotate(90deg)":"rotate(0)",transition:"transform 0.2s"}}>→</span>
            </button>
            {openFacts&&<div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>
              {m.facts.map((f,i)=><div key={i}><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:T.ink,marginBottom:2}}>{f.t}</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.6,color:T.sub}}>{f.x}</div></div>)}
            </div>}
          </div>}
          </div>)}
        </div>)}

        {/* ═══ SCORECARD ═══ */}
        {tab==="scorecard"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          <h2 style={{fontSize:28,fontWeight:900,margin:"0 0 4px"}}>Who improved the most?</h2>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 10px"}}>Ranked by % change from start to end of term — not averages. This measures who moved the needle, not who inherited the best numbers.</p>
          <div style={{background:T.highlight,border:"1px solid #f5deb3",borderRadius:3,padding:"10px 14px",marginBottom:22}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.6,color:"#78716c"}}><strong style={{color:T.ink}}>↳ How scoring works: </strong>For each metric, presidents are ranked by % improvement (start → end of term). #1 gets 5 pts, #2 gets 4, etc. For metrics where lower is better (unemployment, inflation), a bigger decrease = better rank. Maintaining a strong inherited position (under 5% change) is noted but ranked below active improvement.</div>
          </div>

          {/* Composite Rankings */}
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
            {ss.map((id,i)=>{const a=ADMINS[id];const s=sc[id];const medals=["1st","2nd","3rd","4th","5th"];
              const pct=(s.p/maxP)*100;
              // Count improvements, declines, maintained
              const improved=Object.values(s.details).filter(d=>d.improved).length;
              const maintained=Object.values(s.details).filter(d=>d.maintained).length;
              const declined=Object.keys(s.details).length-improved-maintained;
              return <div key={id} className="ol-score-card" style={{...sty.card,padding:"16px 20px",borderLeft:`4px solid ${a.color}`,display:"flex",alignItems:"center",gap:16}}>
                <div className="ol-score-medal" style={{fontFamily:"'DM Sans',sans-serif",fontSize:28,fontWeight:600,color:i===0?T.accent:i<3?T.gold:T.mute,width:44,textAlign:"center"}}>{medals[i]}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontSize:18,fontWeight:700,color:a.color}}>{a.name}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute}}>{a.full}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,padding:"2px 6px",borderRadius:2,background:a.party==="D"?"#dbeafe":"#fee2e2",color:a.party==="D"?"#2563eb":"#dc2626",fontWeight:700}}>{a.party}</span>
                  </div>
                  <div style={{width:"100%",height:6,borderRadius:3,background:T.paper,overflow:"hidden",marginBottom:5}}>
                    <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:a.color,transition:"width 0.6s ease"}}/>
                  </div>
                  <div style={{display:"flex",gap:10,fontFamily:"'DM Sans',sans-serif",fontSize:11,flexWrap:"wrap"}}>
                    <span style={{color:"#16a34a",fontWeight:700}}>▲ {improved} improved</span>
                    <span style={{color:T.gold,fontWeight:600}}>— {maintained} maintained</span>
                    <span style={{color:"#dc2626",fontWeight:600}}>▼ {declined} declined</span>
                  </div>
                </div>
                <div className="ol-score-pts" style={{textAlign:"right"}}><div style={{fontSize:30,fontWeight:900,fontFamily:"'DM Sans',sans-serif",color:a.color}}>{s.p}</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute}}>of {maxP}</div></div>
              </div>;
            })}
          </div>

          {/* Metric-by-metric: Inherited → Exit → % Change */}
          <h3 style={{fontSize:18,fontWeight:700,margin:"0 0 12px",borderBottom:`1px solid ${T.rule}`,paddingBottom:8}}>Metric by Metric: What They Inherited vs What They Left</h3>
          <div className="ol-grid-metrics" style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:28}}>
            {MK.map(mk=>{const mx=M[mk];
              const ranked=AID.filter(id=>sc[id].r[mk]).sort((a,b)=>(sc[a].r[mk]?.rank||99)-(sc[b].r[mk]?.rank||99));
              return <div key={mk} style={{...sty.card,padding:"12px 14px"}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,marginBottom:2,color:T.ink}}>{mx.l}</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:T.mute,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Inherited → Exit → Change</div>
                {ranked.map((id,i)=>{const a=ADMINS[id];const d=sc[id].details[mk];if(!d)return null;
                  const arrow=d.improved?"▲":d.maintained?"—":"▼";
                  const arrowColor=d.improved?"#16a34a":d.maintained?T.gold:"#dc2626";
                  return <div key={id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,padding:"3px 0",borderBottom:i<ranked.length-1?`1px solid ${T.rule}22`:"none"}}>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,width:18,color:i===0?"#16a34a":i===1?T.gold:T.mute,fontWeight:i<=1?700:400}}>#{i+1}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:a.color,fontWeight:600,width:52}}>{a.name}</span>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:4,fontFamily:"'DM Sans',sans-serif",fontSize:10}}>
                      <span style={{color:T.mute}}>{fmt(d.start,mx.u)}</span>
                      <span style={{color:T.mute,fontSize:8}}>→</span>
                      <span style={{color:T.ink,fontWeight:600}}>{fmt(d.end,mx.u)}</span>
                    </div>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:arrowColor,width:56,textAlign:"right"}}>
                      {arrow}{Math.abs(d.pct).toFixed(0)}%
                    </span>
                  </div>;
                })}
              </div>;
            })}
          </div>

          {/* Inherited context */}
          <h3 style={{fontSize:18,fontWeight:700,margin:"0 0 12px",borderBottom:`1px solid ${T.rule}`,paddingBottom:8}}>What They Inherited — Essential Context</h3>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
            {AID.map(id=>{const a=ADMINS[id];const c=INH[id];
              return <div key={id} className="ol-inherited" style={{...sty.card,padding:"10px 14px",borderLeft:`3px solid ${a.color}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><span style={{fontWeight:700,color:a.color}}>{a.name}</span><span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.mute,marginLeft:8}}>{c.c}</span></div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,padding:"3px 8px",borderRadius:2,background:T.paper,fontWeight:600,color:T.sub,whiteSpace:"nowrap"}}>{c.g}</span>
              </div>;
            })}
          </div>

          <FactsPanel facts={[
            {t:"Why % change > averages",x:"Averages punish presidents who inherited crises. Obama's unemployment average was 7.5% but he improved it by 47% — more than Clinton's 42% improvement. % change captures the actual trajectory."},
            {t:"The maintenance problem",x:"Trump inherited 3.7% unemployment (near historic lows). Maintaining that is genuinely hard — there's less room to improve. Under 5% change is scored as 'maintained' and noted, but ranked below active improvement."},
            {t:"COVID distorts everything",x:"Trump's % change on most metrics is dominated by 2020 COVID collapse. Excluding 2020 would change his rankings dramatically. Biden's improvements are partly COVID rebound. Neither fully 'owns' these numbers."},
            {t:"No single number tells the story",x:"% change is fairer than averages but still imperfect. A president who improved GDP from -2% to +2% (huge improvement) ranks the same as one who improved it from 2% to 6% (also huge, but from a stable base). Context always matters."},
          ]} label="How to Read This"/>
        </div>)}

        {/* ═══ ABROAD ═══ */}
        {tab==="abroad"&&(()=>{
          const filteredAssets = POSTURE_ASSETS.filter(a => {
            if (!abroadAssetTypes[a.type]) return false;
            if (theater !== "ALL" && a.theater !== theater) return false;
            return true;
          });
          const countByType = (t: AssetType) => filteredAssets.filter(a => a.type === t).length;
          const highCritCount = filteredAssets.filter(a => a.alert === "high" || a.alert === "critical").length;
          const sel = abroadSelection;

          return <div style={{animation:"fadeUp 0.4s ease"}}>
          {/* Header */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.mute,marginBottom:6}}>Dataset &middot; Defense &amp; foreign policy</div>
            <h2 style={{fontFamily:"'Source Serif 4', serif",fontSize:mob?24:32,fontWeight:900,margin:"0 0 8px",letterSpacing:-0.5,lineHeight:1.15}}>
              Where the <span style={{fontStyle:"italic",color:T.accent}}>US military</span> is, right now — and why it is there.
            </h2>
            <p style={{fontSize:13,color:T.sub,lineHeight:1.6,margin:"0 0 10px",maxWidth:640}}>
              A live-ish map of publicly-reported US military deployments, bases, carrier strike groups, bomber patrols, ISR orbits, and submarine port calls.
              Every marker is sourced from government releases, OSINT imagery, or credible defense journalism.
            </p>
            <div style={{display:"flex",flexWrap:"wrap",gap:12,fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute}}>
              <span>As of April 13, 2026</span>
              <span style={{color:T.rule}}>|</span>
              <span>{POSTURE_ASSETS.length} assets tracked</span>
              <span style={{color:T.rule}}>|</span>
              <span>Sources: DoD, USNI, DMDC, CRS, USAF</span>
            </div>
          </div>

          {/* Controls bar */}
          <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",marginBottom:14}}>
            {/* Theater segmented tabs */}
            <div style={{display:"flex",border:`1px solid ${T.rule}`,borderRadius:4,overflow:"hidden"}}>
              {THEATERS.map(th=>{
                const active = theater===th.id;
                const swatch = THEATER_COLORS[th.id];
                return <button key={th.id} onClick={()=>setTheater(th.id)} style={{
                  padding:"6px 14px",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:active?700:500,
                  color:active?"#fff":T.sub,
                  background:active?T.ink:"transparent",
                  border:"none",borderRight:`1px solid ${T.rule}`,
                  cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,
                  transition:"all 0.15s ease",
                }}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:swatch,flexShrink:0,opacity:active?1:0.6}}/>
                  {th.label}
                </button>;
              })}
            </div>

            {/* Show label + asset type toggles */}
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:T.mute}}>Show</span>
              {(Object.entries(ASSET_TYPES) as [AssetType, {label:string;glyph:string}][]).map(([key,info])=>{
                const on = abroadAssetTypes[key];
                return <button key={key} onClick={()=>setAbroadAssetTypes(prev=>({...prev,[key]:!prev[key]}))} style={{
                  padding:"4px 10px",borderRadius:4,
                  border:`1px solid ${on?T.ink:T.rule}`,
                  background:on?T.ink:"#fff",
                  color:on?"#fff":T.sub,
                  fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:4,transition:"all 0.15s ease",
                }}>
                  <span style={{fontSize:10}}>{info.glyph}</span>
                  {info.label}
                </button>;
              })}
            </div>

            {/* Layers */}
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:T.mute,fontWeight:500}}>Layers</span>
            <button onClick={()=>setShowRanges(!showRanges)} style={{
              padding:"4px 10px",borderRadius:4,
              border:`1px solid ${showRanges?T.ink:T.rule}`,
              background:showRanges?T.ink:"#fff",
              color:showRanges?T.bg:T.sub,
              fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:500,cursor:"pointer",
              display:"flex",alignItems:"center",gap:5,letterSpacing:"0.02em",
            }}>
              <span style={{fontWeight:700,fontSize:11}}>◯</span> Ranges
            </button>
            {/* Auto-rotate */}
            <button onClick={()=>setAbroadAutoRotate(!abroadAutoRotate)} style={{
              padding:"4px 10px",borderRadius:4,
              border:`1px solid ${abroadAutoRotate?T.accent:T.rule}`,
              background:abroadAutoRotate?T.accent+"12":"#fff",
              color:abroadAutoRotate?T.accent:T.sub,
              fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",
              display:"flex",alignItems:"center",gap:5,
            }}>
              <span style={{width:6,height:6,borderRadius:"50%",background:abroadAutoRotate?T.accent:T.mute,flexShrink:0,animation:abroadAutoRotate?"pulse-dot 1.5s ease infinite":undefined}}/>
              Auto-rotate
            </button>
          </div>

          {/* Metrics strip */}
          <div style={{display:"grid",gridTemplateColumns:mob?"repeat(4, 1fr)":`repeat(${Object.keys(ASSET_TYPES).length + 1}, 1fr)`,gap:1,background:T.rule,borderRadius:4,overflow:"hidden",marginBottom:16}}>
            {(Object.entries(ASSET_TYPES) as [AssetType, {label:string;glyph:string}][]).map(([key,info])=>(
              <div key={key} style={{background:T.card,padding:mob?"8px 6px":"8px 10px",textAlign:"center",minWidth:0}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?8:9,fontWeight:700,letterSpacing:mob?0.5:1,textTransform:"uppercase",color:T.mute,marginBottom:2}}>{info.glyph} {info.label}</div>
                <div style={{fontFamily:"'Source Serif 4', serif",fontSize:mob?16:18,fontWeight:700,color:T.ink}}>{countByType(key)}</div>
              </div>
            ))}
            <div style={{background:T.card,padding:mob?"8px 6px":"8px 10px",textAlign:"center",minWidth:0}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?8:9,fontWeight:700,letterSpacing:mob?0.5:1,textTransform:"uppercase",color:T.mute,marginBottom:2}}>High / Crit</div>
              <div style={{fontFamily:"'Source Serif 4', serif",fontSize:mob?16:18,fontWeight:700,color:highCritCount>0?T.accent:T.ink}}>{highCritCount}</div>
            </div>
          </div>

          {/* War cost ticker */}
          <WarCostTicker mob={mob} />

          {/* Spend trend chart */}
          <SpendTrendChart mob={mob} />

          {/* Main panel: globe + detail */}
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 380px",gap:16,marginBottom:24}}>
            {/* Globe */}
            <div>
              <GlobeView
                assets={POSTURE_ASSETS}
                theater={theater}
                assetTypes={abroadAssetTypes}
                selected={abroadSelection}
                onSelect={setAbroadSelection}
                showRanges={showRanges}
                mob={mob}
              />
            </div>
            {/* Detail / legend panel */}
            <div style={{background:T.paper,border:`1px solid ${T.rule}`,borderRadius:4,padding:"16px 20px",alignSelf:"start",position:mob?undefined:"sticky",top:mob?undefined:20}}>
              {sel===null?(
                <>
                  <div style={{fontFamily:"'Source Serif 4', serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:12}}>Legend</div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub,lineHeight:1.5,marginBottom:14}}>
                    Marker color indicates alert level. Shape indicates asset type.
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.mute,marginBottom:6}}>Alert levels</div>
                    {(["normal","elevated","high","critical"] as const).map(level=>(
                      <div key={level} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:ALERT_COLORS[level],flexShrink:0}}/>
                        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.ink,fontWeight:600,textTransform:"capitalize"}}>{level}</span>
                        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute,marginLeft:"auto"}}>
                          {level==="normal"?"Routine posture":level==="elevated"?"Increased readiness":level==="high"?"Active operations":"Combat \u002F strike ops"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.mute,marginBottom:6}}>Asset types</div>
                    {(Object.entries(ASSET_TYPES) as [AssetType, {label:string;glyph:string}][]).map(([key,info])=>(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                        <span style={{width:16,textAlign:"center",fontSize:12,color:T.ink,flexShrink:0}}>{info.glyph}</span>
                        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.ink}}>{info.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ):(()=>{
                const alertColor = ALERT_COLORS[sel.alert];
                return <>
                  <button onClick={()=>setAbroadSelection(null)} style={{background:"none",border:"none",color:T.accent,fontSize:11,fontWeight:600,cursor:"pointer",padding:0,marginBottom:10,fontFamily:"'DM Sans',sans-serif"}}>&larr; Back to legend</button>

                  {/* Badges row */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                    <span style={{display:"inline-block",fontSize:9,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",padding:"3px 8px",borderRadius:3,background:alertColor+"20",color:alertColor}}>{sel.alert}</span>
                    <span style={{display:"inline-block",fontSize:9,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",padding:"3px 8px",borderRadius:3,background:T.ink+"10",color:T.ink,fontFamily:"'DM Sans',monospace"}}>{sel.short}</span>
                    <span style={{display:"inline-block",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:3,background:T.highlight,color:T.gold}}>{sel.updated}</span>
                  </div>

                  <div style={{fontFamily:"'Source Serif 4', serif",fontSize:18,fontWeight:700,color:T.ink,marginBottom:4,lineHeight:1.25}}>{sel.name}</div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute,marginBottom:12}}>
                    {ASSET_TYPES[sel.type].glyph} {ASSET_TYPES[sel.type].label} &middot; {THEATERS.find(t=>t.id===sel.theater)?.label}
                  </div>

                  {/* Mission */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.mute,marginBottom:4}}>Mission</div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.6}}>{sel.mission}</div>
                  </div>

                  {/* Assets on station */}
                  <div style={{background:"#fff",borderRadius:6,padding:"10px 12px",marginBottom:12,border:`1px solid ${T.rule}`}}>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.mute,marginBottom:4}}>Assets on station</div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,color:T.ink}}>{sel.assets}</div>
                  </div>

                  {/* Coordinates grid */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    <div style={{background:"#fff",borderRadius:4,padding:"8px 10px",border:`1px solid ${T.rule}`}}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:T.mute}}>Lat</div>
                      <div style={{fontFamily:"'DM Sans',monospace",fontSize:13,fontWeight:600,color:T.ink}}>{sel.lat.toFixed(2)}&deg;</div>
                    </div>
                    <div style={{background:"#fff",borderRadius:4,padding:"8px 10px",border:`1px solid ${T.rule}`}}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:T.mute}}>Lon</div>
                      <div style={{fontFamily:"'DM Sans',monospace",fontSize:13,fontWeight:600,color:T.ink}}>{sel.lon.toFixed(2)}&deg;</div>
                    </div>
                  </div>

                  <button onClick={()=>{
                    setTheater(sel.theater);
                  }} style={{
                    width:"100%",padding:"8px 0",borderRadius:4,
                    border:`1px solid ${T.rule}`,background:"#fff",
                    fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,
                    color:T.ink,cursor:"pointer",
                  }}>Center on globe &rarr;</button>
                </>;
              })()}
            </div>
          </div>

          {/* Live activity feed */}
          <LiveFeed feed={POSTURE_FEED} theater={theater} />

          {/* Disclaimer */}
          <div style={{...sty.card,padding:"16px 20px",borderLeft:`3px solid ${T.accent}`,marginBottom:24}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:T.accent,marginBottom:6}}>Editorial note</div>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.7}}>
              This page reflects publicly-available data from US government reports, press releases, credible defense journalism (USNI News), and open-source intelligence.
              It is <strong style={{color:T.ink}}>not real-time</strong> and does not track current operations or classified deployments.
              Positions marked &ldquo;live&rdquo; refer to permanent installations whose coordinates are public record.
              Ship and aircraft positions are approximate, based on the most recent public reporting.
              This is a civic transparency tool built for informed democratic participation — not an intelligence product.
              We do not receive, solicit, or publish classified information.
            </div>
          </div>

          {/* Methodology */}
          <div style={{marginBottom:24}}>
            <h3 style={{fontFamily:"'Source Serif 4', serif",fontSize:20,fontWeight:700,color:T.ink,marginBottom:14}}>How we sourced each asset type</h3>
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr":`repeat(auto-fit,minmax(260px,1fr))`,gap:10}}>
              {([
                {type:"carrier" as AssetType, text:"Carrier strike group positions from USNI News Fleet and Marine Tracker, published weekly. Cross-referenced with Navy press releases and AIS data where available. Snapshot: April 13, 2026."},
                {type:"arg" as AssetType, text:"Amphibious ready group positions from the same USNI tracker. MEU assignments confirmed via USMC press releases."},
                {type:"base" as AssetType, text:"Installations from DoD FY2024 Base Structure Report. Context and personnel from CRS Report R48123 (July 2024). Coordinates from public GIS records."},
                {type:"bomber" as AssetType, text:"Bomber Task Force deployments from DoD and USAF press releases. In-flight positions are illustrative of publicly-announced sortie routes, not real-time tracks."},
                {type:"drone" as AssetType, text:"ISR platform orbits inferred from publicly-reported operating areas, ADS-B tracking (where transmitting), and official mission announcements."},
                {type:"sub" as AssetType, text:"Submarine positions only shown when publicly confirmed via port calls, Navy imagery, or official announcements. The vast majority of submarine operations are classified and not tracked here."},
              ]).map((s)=>(
                <div key={s.type} style={{...sty.card,padding:"12px 14px",borderLeft:`3px solid ${ALERT_COLORS[POSTURE_ASSETS.find(a=>a.type===s.type)?.alert||"normal"]}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <span style={{fontSize:12}}>{ASSET_TYPES[s.type].glyph}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:T.ink}}>{ASSET_TYPES[s.type].label}</span>
                  </div>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub,lineHeight:1.5}}>{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>;
        })()}

        {/* ═══ SCENARIOS ═══ */}
        {tab==="scenarios"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          <div style={{marginBottom:24}}>
            <h2 style={{fontSize:mob?24:28,fontWeight:900,margin:"0 0 4px",color:T.ink}}>Scenario Modeling</h2>
            <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 0",lineHeight:1.6,maxWidth:600}}>
              What would the data look like if a major economic shock never happened? Transparent trend extrapolation — not a prediction.
            </p>
          </div>

          {/* Scenario selector pills */}
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:20}}>
            {SCENARIO_ORDER.map(sid=>{
              const s=SCENARIOS[sid];
              const active=activeScenario===sid;
              return <button key={sid} onClick={()=>setActiveScenario(sid)} style={{
                padding:mob?"6px 12px":"8px 16px",borderRadius:20,border:`1.5px solid ${active?T.accent:T.rule}`,
                background:active?T.accent:"transparent",color:active?"#fff":T.sub,
                fontSize:mob?11:12,fontWeight:active?700:500,fontFamily:"'DM Sans',sans-serif",
                cursor:"pointer",transition:"all 0.2s"
              }}>{s.shortLabel}</button>;
            })}
          </div>

          {/* Scenario description card */}
          {activeScenario!=="baseline"&&(
            <div style={{...sty.card,padding:"16px 20px",marginBottom:20,borderLeft:`3px solid ${T.accent}`,background:`linear-gradient(135deg, ${T.highlight} 0%, #fff 100%)`}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:T.ink,marginBottom:6}}>
                {SCENARIO_DETAILS[activeScenario].title}
              </div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.6,marginBottom:SCENARIO_DETAILS[activeScenario].caveat?8:0}}>
                {SCENARIO_DETAILS[activeScenario].methodology}
              </div>
              {SCENARIO_DETAILS[activeScenario].caveat&&(
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute,lineHeight:1.5,fontStyle:"italic"}}>
                  ⚠ {SCENARIO_DETAILS[activeScenario].caveat}
                </div>
              )}
            </div>
          )}

          {/* Metric picker — dropdown on mobile, pills on desktop */}
          {mob?(
            <select value={scenarioMetric} onChange={e=>setScenarioMetric(e.target.value)} style={{
              width:"100%",padding:"10px 14px",border:`1.5px solid ${T.rule}`,borderRadius:6,
              background:T.card,fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:600,
              color:T.accent,marginBottom:16,appearance:"auto"
            }}>
              {Object.entries(CATS).map(([catKey,catLabel])=>(
                <optgroup key={catKey} label={catLabel}>
                  {MK.filter(k=>M[k].cat===catKey).map(mk=>(
                    <option key={mk} value={mk}>{M[mk].l}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          ):(
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
              {MK.map(mk=>{
                const active=scenarioMetric===mk;
                return <button key={mk} onClick={()=>setScenarioMetric(mk)} style={{
                  padding:"5px 12px",borderRadius:3,
                  border:`1px solid ${active?T.accent+"55":T.rule}`,
                  background:active?T.accent+"0A":"transparent",
                  color:active?T.accent:T.sub,fontSize:11,fontWeight:active?700:500,
                  fontFamily:"'DM Sans',sans-serif",cursor:"pointer"
                }}>{M[mk]?.l||mk}</button>;
              })}
            </div>
          )}

          {/* President cards + Chart */}
          {(()=>{
            const metric=M[scenarioMetric];
            if(!metric)return null;
            const scenario=SCENARIOS[activeScenario];
            const baselineData=metric.d as DataPoint[];
            const scenarioData=applyScenario(baselineData,scenario,scenarioMetric);

            // Build chart data: year, baseline value, scenario value
            const chartData=baselineData.map((d,i)=>{
              const sd=scenarioData[i];
              return {
                y:d.y,
                baseline:d.v,
                scenario:sd.estimated?sd.v:null,
                admin:d.a,
                estimated:sd.estimated,
              };
            });

            // Per-president impact cards data
            const presCards=AID.map(id=>{
              const a=ADMINS[id];
              const actualPts=baselineData.filter(d=>d.a===id);
              const scenarioPts=scenarioData.filter(d=>d.a===id);
              if(actualPts.length<1)return null;

              const actualStart=inheritedStart(scenarioMetric,id);
              const actualEnd=actualPts[actualPts.length-1].v;
              const actualPct=actualStart!==0?((actualEnd-actualStart)/Math.abs(actualStart))*100:0;
              const actualImproved=metric.inv?actualEnd<actualStart:actualEnd>actualStart;

              const modeledEnd=scenarioPts[scenarioPts.length-1]?.v??actualEnd;
              const hasModeled=scenarioPts.some(d=>d.estimated);
              // For modeled start, use the last modeled value of the previous president
              const ai=AID.indexOf(id);
              let modeledStart=actualStart;
              if(ai>0&&activeScenario!=="baseline"){
                const prevScenario=scenarioData.filter(d=>d.a===AID[ai-1]);
                if(prevScenario.length>0)modeledStart=prevScenario[prevScenario.length-1].v;
              }
              const modeledPct=modeledStart!==0?((modeledEnd-modeledStart)/Math.abs(modeledStart))*100:0;
              const modeledImproved=metric.inv?modeledEnd<modeledStart:modeledEnd>modeledStart;

              const diff=modeledEnd-actualEnd;

              return {id,a,actualStart,actualEnd,actualPct,actualImproved,modeledStart,modeledEnd,modeledPct,modeledImproved,hasModeled,diff};
            }).filter(Boolean);

            // Compute impact summary
            const lastYear=chartData[chartData.length-1];
            const diff=activeScenario!=="baseline"&&lastYear?.scenario!=null
              ?(lastYear.scenario-lastYear.baseline)
              :null;

            return (
              <div style={{display:"flex",flexDirection:"column"}}>
                {/* Chart — first on mobile, second on desktop (matches Data tab) */}
                <div style={{...sty.card,padding:mob?"12px 8px 8px":"20px 16px 10px",marginBottom:mob?12:12,order:mob?1:2}}>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:T.ink,marginBottom:4}}>
                    {metric.l} <span style={{fontWeight:400,color:T.mute}}>({metric.s})</span>
                  </div>
                  <ResponsiveContainer width="100%" height={mob?300:400}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.rule} />
                      <XAxis dataKey="y" stroke={T.mute} fontSize={mob?9:11} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} interval={mob?3:1} />
                      <YAxis stroke={T.rule} fontSize={mob?9:10} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,metric.u)} width={mob?45:60} />
                      <Tooltip content={({active,payload,label})=>{
                        if(!active||!payload?.length)return null;
                        const d=payload[0]?.payload;
                        const admin=d?.admin?ADMINS[d.admin]:null;
                        return (
                          <div style={{background:"rgba(255,255,255,0.97)",backdropFilter:"blur(8px)",border:`1px solid ${T.rule}`,borderRadius:6,padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}>
                            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:T.ink,marginBottom:4}}>
                              {label} {admin&&<span style={{color:admin.color,fontWeight:600}}>· {admin.name}</span>}
                            </div>
                            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub}}>
                              Actual: <strong style={{color:T.ink}}>{fmt(d.baseline,metric.u)}</strong>
                            </div>
                            {d.scenario!=null&&(
                              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.accent}}>
                                Modeled: <strong>{fmt(d.scenario,metric.u)}</strong>
                                {d.estimated&&<span style={{fontSize:10,marginLeft:4,color:T.mute}}>(estimated)</span>}
                              </div>
                            )}
                          </div>
                        );
                      }}/>

                      {/* Admin background bands */}
                      {AID.map(id=>{
                        const pts=chartData.filter(d=>d.admin===id);
                        if(pts.length<2)return null;
                        const startIdx=chartData.indexOf(pts[0]);
                        const endIdx=chartData.indexOf(pts[pts.length-1]);
                        return null; // bands handled by line colors
                      })}

                      {/* Baseline line — solid, with admin colors */}
                      <Line type="monotone" dataKey="baseline" stroke={T.ink} strokeWidth={mob?2:2.5}
                        dot={mob?false:({cx,cy,payload})=>{
                          if(!cx||!cy)return null;
                          const admin=ADMINS[payload.admin];
                          return <circle cx={cx} cy={cy} r={3.5} fill={admin?.color||T.ink} stroke="#fff" strokeWidth={1.5}/>;
                        }}
                        activeDot={{r:5,stroke:"#fff",strokeWidth:2}}
                        name="Actual" connectNulls />

                      {/* Scenario line — dashed */}
                      {activeScenario!=="baseline"&&(
                        <Line type="monotone" dataKey="scenario" stroke={T.accent} strokeWidth={mob?2:2.5}
                          strokeDasharray="6 3"
                          dot={mob?false:({cx,cy,payload})=>{
                            if(!cx||!cy||payload.scenario==null)return null;
                            return <circle cx={cx} cy={cy} r={3} fill={T.accent} stroke="#fff" strokeWidth={1.5}/>;
                          }}
                          activeDot={{r:5,stroke:"#fff",strokeWidth:2,fill:T.accent}}
                          name="Modeled" connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>

                  {/* Legend */}
                  <div style={{display:"flex",gap:20,justifyContent:"center",marginTop:4,marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub}}>
                      <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke={T.ink} strokeWidth="2.5"/></svg>
                      Actual data
                    </div>
                    {activeScenario!=="baseline"&&(
                      <div style={{display:"flex",alignItems:"center",gap:6,fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub}}>
                        <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke={T.accent} strokeWidth="2.5" strokeDasharray="4 2"/></svg>
                        Modeled (without shock)
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow legend — sits above president cards */}
                <div style={{order:mob?2:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:mob?10:14,marginBottom:mob?6:8,fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:11,color:T.mute}}>
                  <span><span style={{color:"#16a34a",fontWeight:700}}>▲</span> improved</span>
                  <span><span style={{color:"#dc2626",fontWeight:700}}>▼</span> worsened</span>
                  {metric.inv&&<span style={{fontSize:mob?8:9,opacity:0.7}}>(lower = better)</span>}
                </div>

                {/* President impact cards — above chart on desktop, below on mobile */}
                <div style={{display:"grid",gridTemplateColumns:mob?"repeat(2,1fr)":`repeat(${Math.min(presCards.length+1,6)},1fr)`,gap:mob?8:8,marginBottom:mob?12:20,order:mob?2:1}}>
                  {presCards.map((pc,idx)=>{
                    if(!pc)return null;
                    const {id,a,actualStart,actualEnd,actualPct,actualImproved,modeledEnd,modeledPct,modeledImproved,hasModeled,diff:pDiff}=pc;
                    const shockHit=scenario.shockYears.length>0&&baselineData.some(d=>d.a===id&&scenario.shockYears.includes(d.y));
                    const mnt=Math.abs(actualPct)<5;
                    const col=mnt?T.gold:actualImproved?T.improve.strong:T.decline.strong;
                    const showModeled=activeScenario!=="baseline"&&hasModeled&&Math.abs(pDiff)>0.01;
                    // Compute averages
                    const actualPts=baselineData.filter(d=>d.a===id);
                    const actualAvg=actualPts.length>0?actualPts.reduce((s,d)=>s+d.v,0)/actualPts.length:0;
                    const scenPts=scenarioData.filter(d=>d.a===id);
                    const modeledAvg=scenPts.length>0?scenPts.reduce((s,d)=>s+d.v,0)/scenPts.length:0;
                    return (
                      <div key={id} className={`hover-lift stagger-${idx+1}`} style={{
                        ...sty.card,padding:mob?"10px 12px":"14px 14px 12px",borderTop:`${mob?3:4}px solid ${a.color}`,
                        position:"relative",overflow:"hidden"
                      }}>
                        {!mob&&<div style={{position:"absolute",top:0,right:0,width:80,height:80,background:`linear-gradient(135deg, ${a.color}08 0%, transparent 70%)`,borderRadius:"0 0 0 80px"}}/>}
                        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,color:a.color,marginBottom:mob?4:6}}>{a.name}</div>
                        <div style={{display:"flex",alignItems:"baseline",gap:mob?4:6,marginBottom:mob?3:4}}>
                          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:12,color:T.mute,fontVariantNumeric:"tabular-nums"}}>{fmt(actualStart,metric.u)}</span>
                          <span style={{fontSize:mob?8:10,color:T.mute}}>→</span>
                          <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:18,fontWeight:700,color:T.ink,fontVariantNumeric:"tabular-nums"}}>{fmt(actualEnd,metric.u)}</span>
                        </div>
                        {/* Actual % with label */}
                        <div style={{display:"flex",alignItems:"center",gap:mob?4:8,marginBottom:showModeled?(mob?2:4):(mob?4:6)}}>
                          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?17:24,fontWeight:900,color:col,fontVariantNumeric:"tabular-nums"}}>
                            {mnt?"—":actualImproved?"▲":"▼"}{Math.abs(actualPct).toFixed(0)}%
                          </div>
                          {!mob&&<Sparkline data={actualPts.map(d=>d.v)} color={a.color} width={50} height={20} />}
                        </div>
                        {/* Modeled % with label */}
                        {showModeled&&(()=>{
                          const mMnt=Math.abs(modeledPct)<5;
                          const mCol=mMnt?T.gold:modeledImproved?T.improve.strong:T.decline.strong;
                          return <div style={{display:"flex",alignItems:"center",gap:mob?4:8,marginBottom:mob?4:6}}>
                            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?14:18,fontWeight:800,color:mCol,fontVariantNumeric:"tabular-nums"}}>
                              {mMnt?"—":modeledImproved?"▲":"▼"}{Math.abs(modeledPct).toFixed(0)}%
                            </div>
                            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?8:9,color:T.accent,fontWeight:600}}>modeled</span>
                          </div>;
                        })()}
                        {/* Bottom row: avg + years */}
                        <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,color:T.mute,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span>{showModeled?<>avg {fmt(actualAvg,metric.u)} · <span style={{color:T.accent,fontWeight:600}}>{fmt(modeledAvg,metric.u)}</span></>:<>avg {fmt(actualAvg,metric.u)}</>}</span>
                          <span style={{color:a.color,fontWeight:600}}>{a.years}</span>
                        </div>
                        {/* Shock badge */}
                        {shockHit&&activeScenario!=="baseline"&&(
                          <div style={{position:"absolute",top:mob?4:6,right:mob?6:8,fontFamily:"'DM Sans',sans-serif",fontSize:mob?7:8,fontWeight:700,
                            padding:"2px 6px",borderRadius:3,background:T.accent+"15",color:T.accent}}>
                            SHOCK
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <a href={`/live-benchmark?metric=${scenarioMetric}`} className={`hover-lift stagger-${presCards.length+1}`} style={{
                    background:T.accent,border:`1px solid ${T.accent}`,borderRadius:4,
                    padding:mob?"10px 12px":"14px 14px 12px",textDecoration:"none",color:"#fff",cursor:"pointer",
                    display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:0
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:"#fff",animation:"pulse 2s ease-in-out infinite"}}/>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2}}>Live · Trump II</span>
                    </div>
                    <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?10:11,fontWeight:500,color:"rgba(255,255,255,0.88)",margin:"6px 0"}}>Current term, updated daily</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:mob?9:10,fontWeight:700}}>See live data</span>
                      <span style={{fontSize:12}}>→</span>
                    </div>
                  </a>
                </div>

                {/* Shock years highlight */}
                {activeScenario!=="baseline"&&scenario.shockYears.length>0&&(
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute,marginBottom:16,order:3}}>
                    Shock years replaced: {scenario.shockYears.join(", ")} · Trend fitted from: {scenario.trendYears.join(", ")}
                  </div>
                )}

                {/* ── Inherited vs Left Behind (selected metric only, scorecard style) ── */}
                <div style={{...sty.card,padding:"12px 14px",marginBottom:24,order:4}}>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,marginBottom:2,color:T.ink}}>
                    {metric.l} {activeScenario!=="baseline"&&<span style={{fontSize:11,fontWeight:400,color:T.accent}}>— {SCENARIOS[activeScenario].shortLabel}</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:4}}>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:T.mute,textTransform:"uppercase",letterSpacing:0.5}}>
                      Inherited → Exit → {activeScenario!=="baseline"?"Actual · Modeled":"Change"}
                    </span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:T.mute}}>
                      <span style={{color:"#16a34a",fontWeight:700}}>▲</span> improved · <span style={{color:"#dc2626",fontWeight:700}}>▼</span> worsened{metric.inv?" (lower = better)":""}
                    </span>
                  </div>
                  {AID.map((id,i)=>{
                    const a=ADMINS[id];
                    const pts=baselineData.filter(d=>d.a===id);
                    if(pts.length<1)return null;

                    const actualStart=inheritedStart(scenarioMetric,id);
                    const actualEnd=pts[pts.length-1].v;
                    const actualPct=actualStart!==0?((actualEnd-actualStart)/Math.abs(actualStart))*100:0;
                    const actualImproved=metric.inv?actualEnd<actualStart:actualEnd>actualStart;
                    const arrow=actualImproved?"▲":"▼";
                    const arrowColor=actualImproved?"#16a34a":"#dc2626";

                    // Modeled values
                    const scenPts=scenarioData.filter(d=>d.a===id);
                    const hasModeled=activeScenario!=="baseline"&&scenPts.some(d=>d.estimated);
                    const modeledEnd=scenPts.length>0?scenPts[scenPts.length-1].v:actualEnd;
                    const ai=AID.indexOf(id);
                    let modeledStart=actualStart;
                    if(ai>0&&activeScenario!=="baseline"){
                      const prevScen=scenarioData.filter(d=>d.a===AID[ai-1]);
                      if(prevScen.length>0)modeledStart=prevScen[prevScen.length-1].v;
                    }
                    const modeledPct=modeledStart!==0?((modeledEnd-modeledStart)/Math.abs(modeledStart))*100:0;
                    const modeledImproved=metric.inv?modeledEnd<modeledStart:modeledEnd>modeledStart;
                    const mArrow=modeledImproved?"▲":"▼";
                    const mArrowColor=modeledImproved?"#16a34a":"#dc2626";

                    return <div key={id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,padding:"3px 0",borderBottom:i<AID.length-1?`1px solid ${T.rule}22`:"none"}}>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:a.color,fontWeight:600,width:52}}>{a.name}</span>
                      <div style={{flex:1,display:"flex",alignItems:"center",gap:4,fontFamily:"'DM Sans',sans-serif",fontSize:10}}>
                        <span style={{color:T.mute}}>{fmt(actualStart,metric.u)}</span>
                        <span style={{color:T.mute,fontSize:8}}>→</span>
                        <span style={{color:T.ink,fontWeight:600}}>{fmt(actualEnd,metric.u)}</span>
                      </div>
                      <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:arrowColor,width:hasModeled&&Math.abs(modeledEnd-actualEnd)>0.01?80:56,textAlign:"right"}}>
                        {arrow}{Math.abs(actualPct).toFixed(0)}%{hasModeled&&Math.abs(modeledEnd-actualEnd)>0.01&&<span style={{fontSize:8,fontWeight:400,color:T.mute,marginLeft:3}}>actual</span>}
                      </span>
                      {/* Modeled delta inline — proper green/red colors */}
                      {hasModeled&&Math.abs(modeledEnd-actualEnd)>0.01&&(
                        <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:600,color:mArrowColor,width:80,textAlign:"right",borderLeft:`1px dashed ${T.rule}`,paddingLeft:8}}>
                          {mArrow}{Math.abs(modeledPct).toFixed(0)}% <span style={{fontSize:8,fontWeight:400,color:T.mute}}>modeled</span>
                        </span>
                      )}
                    </div>;
                  })}
                </div>
              </div>
            );
          })()}

          {/* Methodology disclosure */}
          <div style={{...sty.card,padding:0,marginBottom:16,overflow:"hidden"}}>
            <button onClick={()=>setShowMethodology(!showMethodology)} style={{
              width:"100%",padding:"14px 20px",border:"none",background:"transparent",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"space-between",
              fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,color:T.ink
            }}>
              <span>📐 {METHODOLOGY_TEXT.title}</span>
              <span style={{fontSize:10,color:T.mute,transform:showMethodology?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▼</span>
            </button>
            {showMethodology&&(
              <div style={{padding:"0 20px 20px",borderTop:`1px solid ${T.rule}`}}>
                {METHODOLOGY_TEXT.paragraphs.map((p,i)=>(
                  <p key={i} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.7,margin:"12px 0 0"}}>{p}</p>
                ))}
                <div style={{marginTop:16}}>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:8}}>Limitations</div>
                  {METHODOLOGY_TEXT.limitations.map((l,i)=>(
                    <div key={i} style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.sub,lineHeight:1.6,marginBottom:6,paddingLeft:12,borderLeft:`2px solid ${T.rule}`}}>{l}</div>
                  ))}
                </div>
                <div style={{marginTop:16,padding:"12px 16px",background:T.highlight,borderRadius:4,borderLeft:`3px solid ${T.gold}`}}>
                  <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.ink,lineHeight:1.6,fontWeight:500}}>{METHODOLOGY_TEXT.disclaimer}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute}}>
            Source: All baseline data from BEA, BLS, Treasury, Census. Scenario values are mechanically derived via OLS trend extrapolation.
          </div>
        </div>)}

        {/* ═══ HEAD TO HEAD ═══ */}
        {/* ═══ GLOBAL ═══ */}
        {tab==="global"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          <h2 style={{fontSize:28,fontWeight:900,margin:"0 0 4px"}}>Global Comparison</h2>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 16px"}}>How does the U.S. stack up?</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
            {Object.entries(GLOBAL_METRICS).map(([k,v])=><button key={k} onClick={()=>setGm(k)} style={{padding:"5px 12px",borderRadius:3,border:`1px solid ${gm===k?T.accent+"55":T.rule}`,background:gm===k?T.accent+"0A":"transparent",color:gm===k?T.accent:T.sub,fontSize:12,fontWeight:gm===k?700:500,fontFamily:"'DM Sans',sans-serif"}}>{v.l}</button>)}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>
            {Object.entries(COUNTRIES).map(([id,c])=>(
              <button key={id} onClick={()=>togC(id)} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:3,background:gc.includes(id)?c.color+"10":"transparent",border:`1.5px solid ${gc.includes(id)?c.color:T.rule}`,color:gc.includes(id)?c.color:T.mute,fontSize:11,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>{c.flag} {c.name}</button>
            ))}
          </div>
          <div style={{...sty.card,padding:"20px 16px 10px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={gmd.d}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/>
                <XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}}/>
                <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Sans',sans-serif" tick={{fill:T.sub}} tickFormatter={v=>`${v}${gmd.u}`}/>
                <Tooltip content={<Tip unit={gmd.u}/>}/>
                {gc.map(id=><Line key={id} type="monotone" dataKey={id} stroke={COUNTRIES[id].color} strokeWidth={2.5} dot={{r:4,fill:COUNTRIES[id].color,stroke:T.card,strokeWidth:2}} name={COUNTRIES[id].name} connectNulls/>)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:8}}>
            {gc.map(id=><div key={id} style={{display:"flex",alignItems:"center",gap:4,fontFamily:"'DM Sans',sans-serif",fontSize:12}}><span style={{width:12,height:3,borderRadius:1,background:COUNTRIES[id].color}}/>{COUNTRIES[id].flag}<span style={{color:COUNTRIES[id].color,fontWeight:700}}>{COUNTRIES[id].name}</span></div>)}
          </div>
          <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute,marginTop:4}}>Source: {gmd.src}</div>
          {gmd.facts?.length>0&&<div style={{borderLeft:`2px solid ${T.accent}`,marginTop:12,paddingLeft:14}}>
            {gmd.facts.map((f,i)=><div key={i} style={{marginBottom:8}}><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,color:T.ink}}>{f.t}</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,lineHeight:1.5}}>{f.x}</div></div>)}
          </div>}
        </div>)}

        {/* ── FOOTER ── */}
        <div style={{borderTop:`2px solid ${T.rule}`,paddingTop:32,marginTop:56,fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:24,marginBottom:24}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{display:"flex",gap:2}}>
                  <div style={{width:3,height:14,background:T.accent,borderRadius:1}}/>
                  <div style={{width:3,height:14,background:T.accent,borderRadius:1,opacity:0.5}}/>
                </div>
                <span style={{fontSize:12,fontWeight:800,letterSpacing:2,textTransform:"uppercase",color:T.sub}}>Open Ledger</span>
              </div>
              <p style={{fontSize:12,color:T.sub,lineHeight:1.7,margin:0}}>
                Built for transparency, not persuasion. Every data point is sourced from official government agencies and can be independently verified.
              </p>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:8}}>Data Sources</div>
              <div style={{fontSize:11,color:T.sub,lineHeight:1.8}}>
                BEA (Bureau of Economic Analysis) · BLS (Bureau of Labor Statistics) · U.S. Treasury · CBO (Congressional Budget Office) · EIA (Energy Information Administration) · Census Bureau · Conference Board · S&P Global · World Bank · IMF · World Inequality Database
              </div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16,borderTop:`1px solid ${T.rule}`,flexWrap:"wrap",gap:12}}>
            <span style={{fontSize:10,color:T.mute}}>v7.0 — Last updated April 2026</span>
            <div style={{display:"flex",gap:16}}>
              <button disabled title="Coming soon" style={{fontSize:10,color:T.accent,background:"none",border:"none",fontWeight:600,padding:0,cursor:"default",opacity:0.5}}>Methodology</button>
              <button disabled title="Coming soon" style={{fontSize:10,color:T.accent,background:"none",border:"none",fontWeight:600,padding:0,cursor:"default",opacity:0.5}}>Download Data</button>
            </div>
          </div>
        </div>
      </div>
      <FeedbackBanner />
    </div>
  );
}
