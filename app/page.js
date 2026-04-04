"use client";
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function useIsMobile() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return w < 768;
}

/* ─────────────────────────────────────────────
   DESIGN SYSTEM
   Editorial / data-journalism aesthetic
   Think: FT × The Pudding × The Economist
───────────────────────────────────────────── */
const T = {
  bg: "#faf6f1",        // warm cream
  card: "#ffffff",
  ink: "#1d1d1f",       // near-black
  sub: "#6b6561",       // warm gray
  mute: "#b5aea6",      // lighter warm gray
  rule: "#e0dbd4",      // divider lines
  accent: "#c1272d",    // editorial red
  gold: "#b8860b",      // gold
  blue: "#2563eb",      // dem
  red: "#dc2626",       // rep
  highlight: "#fef3c7", // callout bg
  paper: "#f5f0ea",     // secondary bg
};

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
      if(pts.length<2)continue;
      const start=pts[0].v;const end=pts[pts.length-1].v;
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
  if(!active||!payload?.length)return null;const d=payload[0]?.payload;const admin=d?.a;
  return <div style={{background:T.card,border:`1px solid ${T.rule}`,borderRadius:6,padding:"8px 12px",fontSize:12,boxShadow:"0 4px 12px rgba(0,0,0,0.08)",color:T.ink}}>
    <div style={{fontWeight:700}}>{label||d?.y}</div>
    {admin&&ADMINS[admin]&&<div style={{color:ADMINS[admin].color,fontSize:11,fontWeight:600}}>{ADMINS[admin].name}</div>}
    {payload.map((p,i)=><div key={i} style={{fontWeight:600,color:p.color||T.ink,fontFamily:"'Tabular Nums','DM Mono',monospace",marginTop:2}}>{p.name}: {typeof p.value==='number'?(unit?fmt(p.value,unit):p.value.toLocaleString()):p.value}</div>)}
  </div>;
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

const TABS=[["dashboard","Data"],["scorecard","Scorecard"],["headtohead","Compare"],["global","Global"]];

export default function App(){
  const mob = useIsMobile();
  const [tab,setTab]=useState("dashboard");
  const [am,setAm]=useState("gdp");
  const [detail,setDetail]=useState(null);
  const [sel,setSel]=useState(["clinton","bush","obama","trump1","biden"]);
  const [ct,setCt]=useState("bar");
  const [h2h,setH2h]=useState("gdp");
  const [gm,setGm]=useState("gdp_g");
  const [gc,setGc]=useState(["us","china","india","uk"]);
  const [cf,setCf]=useState("all");
  const [openFacts,setOpenFacts]=useState(false);

  const tog=id=>setSel(p=>p.includes(id)?p.filter(a=>a!==id):[...p,id]);
  const togC=id=>setGc(p=>p.includes(id)?p.filter(c=>c!==id):[...p,id]);
  const m=M[am];const fd=m.d.filter(d=>sel.includes(d.a));
  const vis=cf==="all"?MK:MK.filter(k=>M[k].cat===cf);

  const sums=useMemo(()=>{const o={};for(const id of sel){const p=m.d.filter(d=>d.a===id);if(!p.length)continue;
    o[id]={avg:p.reduce((s,x)=>s+x.v,0)/p.length,chg:p[p.length-1].v-p[0].v};}return o;},[am,sel]);

  const h2hD=useMemo(()=>{const mx=M[h2h];const o=[];for(let yr=1;yr<=8;yr++){const r={year:`Yr ${yr}`};
    for(const id of AID){const p=mx.d.filter(d=>d.a===id);if(p[yr-1])r[id]=p[yr-1].v;}if(Object.keys(r).length>1)o.push(r);}return o;},[h2h]);

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
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,600;8..60,700;8..60,900&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        * { box-sizing: border-box; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        button { cursor: pointer; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
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
        }
      `}</style>

      {/* ── HEADER ── */}
      <div style={sty.header} className="ol-header-wrap">
        <div className="ol-header" style={{maxWidth:1080,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{width:28,height:4,background:T.accent,borderRadius:1}}/>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,letterSpacing:3,textTransform:"uppercase",color:T.mute}}>Open Ledger</span>
          </div>
          <h1 style={{fontSize:38,fontWeight:900,margin:0,lineHeight:1.1,letterSpacing:-1,maxWidth:600}}>
            The economy under<br/>every president, in data.
          </h1>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:T.sub,margin:"10px 0 0",maxWidth:480,lineHeight:1.5}}>
            19 indicators across 5 administrations. No editorial. No spin. Context where it matters. You interpret.
          </p>
        </div>
      </div>

      {/* ── NAV ── */}
      <div style={sty.nav}>
        <div className="ol-nav-wrap" style={{maxWidth:1080,margin:"0 auto",padding:"0 24px",display:"flex",gap:0,overflowX:"auto"}}>
          {TABS.map(([k,l])=><button key={k} className="ol-nav-btn" onClick={()=>setTab(k)} style={{
            padding:"13px 20px",border:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            background:"transparent",color:tab===k?T.ink:T.mute,
            borderBottom:tab===k?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.2s"
          }}>{l}</button>)}
        </div>
      </div>

      <div className="ol-wrap" style={{maxWidth:1080,margin:"0 auto",padding:"28px 24px 64px"}}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard"&&(<div style={{animation:"fadeUp 0.4s ease"}}>

          {/* ── OVERVIEW MODE ── */}
          {!detail&&(<div>
            <div style={{marginBottom:20}}>
              <h2 style={{fontSize:24,fontWeight:900,margin:"0 0 4px"}}>All Metrics at a Glance</h2>
              <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.sub,margin:0}}>Click any card to explore the full data. Green = improved under most presidents. Red = declined.</p>
            </div>

            {Object.entries(CATS).map(([catKey,catLabel])=>{
              const catMetrics=MK.filter(k=>M[k].cat===catKey);
              if(!catMetrics.length)return null;
              return <div key={catKey} style={{marginBottom:24}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:2,color:T.mute,marginBottom:8,paddingBottom:6,borderBottom:`1px solid ${T.rule}`}}>{catLabel}</div>
                <div className="ol-grid-metrics" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {catMetrics.map(k=>{const mx=M[k];const pts=mx.d;
                    const latest=pts[pts.length-1];const first=pts[0];
                    const pct=first.v!==0?((latest.v-first.v)/Math.abs(first.v))*100:0;
                    // Per-president mini summary
                    const perPres=AID.map(id=>{
                      const pp=pts.filter(d=>d.a===id);if(pp.length<2)return null;
                      const s=pp[0].v,e=pp[pp.length-1].v;
                      const pc=s!==0?((e-s)/Math.abs(s))*100:0;
                      const imp=mx.inv?pc<0:pc>0;
                      return{id,s,e,pc,imp};
                    }).filter(Boolean);
                    const impCount=perPres.filter(p=>p.imp).length;
                    const decCount=perPres.length-impCount;

                    return <button key={k} onClick={()=>{setAm(k);setDetail(k);setOpenFacts(false);}} style={{
                      ...sty.card,padding:"14px 16px",textAlign:"left",border:`1px solid ${T.rule}`,cursor:"pointer",
                      transition:"all 0.15s",position:"relative",overflow:"hidden"
                    }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent+"55"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=T.rule}>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,color:T.ink,marginBottom:6}}>{mx.l}</div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,fontWeight:800,color:T.ink,marginBottom:2}}>
                        {fmt(latest.v,mx.u)}
                      </div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute,marginBottom:8}}>{first.y} → {latest.y}</div>
                      {/* Mini president dots */}
                      <div style={{display:"flex",gap:3,marginBottom:4}}>
                        {perPres.map(p=>{const a=ADMINS[p.id];
                          return <div key={p.id} style={{
                            width:16,height:16,borderRadius:3,
                            background:p.imp?"#16a34a22":"#dc262622",
                            border:`1.5px solid ${p.imp?"#16a34a":"#dc2626"}`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:7,fontWeight:700,color:p.imp?"#16a34a":"#dc2626"
                          }}>{p.imp?"▲":"▼"}</div>;
                        })}
                      </div>
                      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,color:T.mute}}>
                        <span style={{color:"#16a34a",fontWeight:600}}>{impCount} improved</span>
                        {" · "}
                        <span style={{color:"#dc2626",fontWeight:600}}>{decCount} declined</span>
                      </div>
                    </button>;
                  })}
                </div>
              </div>;
            })}
          </div>)}

          {/* ── DETAIL MODE ── */}
          {detail&&(<div>
          {/* Back button */}
          <button onClick={()=>setDetail(null)} style={{
            display:"flex",alignItems:"center",gap:6,border:"none",background:"transparent",
            fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,color:T.accent,padding:"0 0 16px",cursor:"pointer"
          }}>← All Metrics</button>

          {/* Presidents */}
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

          {/* Category tabs */}
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${T.rule}`,marginBottom:14,overflowX:"auto"}}>
            <button onClick={()=>setCf("all")} style={{padding:"8px 14px",border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:cf==="all"?T.accent:T.mute,borderBottom:cf==="all"?`2px solid ${T.accent}`:"2px solid transparent"}}>All</button>
            {Object.entries(CATS).map(([k,l])=><button key={k} onClick={()=>setCf(k)} style={{padding:"8px 14px",border:"none",background:"transparent",fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:cf===k?T.accent:T.mute,borderBottom:cf===k?`2px solid ${T.accent}`:"2px solid transparent",whiteSpace:"nowrap"}}>{l}</button>)}
          </div>

          {/* Metric pills */}
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:18}}>
            {vis.map(k=><button key={k} onClick={()=>setAm(k)} style={{padding:"5px 12px",borderRadius:3,border:`1px solid ${am===k?T.accent+"55":T.rule}`,background:am===k?T.accent+"0A":"transparent",color:am===k?T.accent:T.sub,fontSize:12,fontWeight:am===k?700:500,fontFamily:"'DM Sans',sans-serif"}}>{M[k].l}</button>)}
          </div>

          {/* Title bar */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
            <div>
              <h2 style={{fontSize:24,fontWeight:700,margin:0}}>{m.l}</h2>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.mute}}>{m.s} · {m.src}</span>
            </div>
          </div>

          {/* Formula */}
          {m.def&&<div style={{background:T.paper,border:`1px solid ${T.rule}`,borderRadius:3,padding:"8px 12px",marginBottom:14,display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,color:T.accent,flexShrink:0}}>f(x)</span>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,lineHeight:1.5,color:T.sub}}>{m.def}</span>
          </div>}

          {/* Benchmark */}
          {m.bench&&<div className="ol-bench-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:3,padding:"8px 12px"}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#16a34a",marginBottom:2}}>Good</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:500,color:"#15803d"}}>{m.bench.good}</div>
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

          {/* Summary cards */}
          <div className="ol-grid-summary" style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(sel.length,5)},1fr)`,gap:8,marginBottom:16}}>
            {sel.map(id=>{const s=sums[id];if(!s)return null;const a=ADMINS[id];
              const pts=m.d.filter(d=>d.a===id);if(pts.length<2)return null;
              const start=pts[0].v,end=pts[pts.length-1].v;
              const pct=start!==0?((end-start)/Math.abs(start))*100:0;
              const imp=m.inv?pct<0:pct>0;const mnt=Math.abs(pct)<5;
              const col=mnt?T.gold:imp?"#16a34a":"#dc2626";
              return <div key={id} style={{...sty.card,padding:"12px 14px",borderTop:`3px solid ${a.color}`}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,color:T.mute,marginBottom:4}}>{a.name}</div>
                <div style={{display:"flex",alignItems:"baseline",gap:5,marginBottom:2}}>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:T.sub}}>{fmt(start,m.u)}</span>
                  <span style={{fontSize:10,color:T.mute}}>→</span>
                  <span style={{fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:500,color:T.ink}}>{fmt(end,m.u)}</span>
                </div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:20,fontWeight:800,color:col,marginBottom:2}}>{mnt?"—":imp?"▲":"▼"}{Math.abs(pct).toFixed(0)}%</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute}}>avg {fmt(s.avg,m.u)}</div>
              </div>;
            })}
          </div>

          {/* Chart */}
          <div className="ol-chart-wrap" style={{...sty.card,padding:"20px 16px 10px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={340}>
              {ct==="bar"?(<BarChart data={fd}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/><XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/><YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)}/><Tooltip content={<Tip unit={m.u}/>}/><Bar dataKey="v" radius={[2,2,0,0]} maxBarSize={22}>{fd.map((e,i)=><Cell key={i} fill={ADMINS[e.a]?.color} fillOpacity={0.85}/>)}</Bar></BarChart>
              ):(<LineChart data={fd}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/><XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/><YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)}/><Tooltip content={<Tip unit={m.u}/>}/><Line type="monotone" dataKey="v" stroke={T.sub} strokeWidth={1.5} dot={p=><circle cx={p.cx} cy={p.cy} r={4} fill={ADMINS[p.payload?.a]?.color||T.sub} stroke={T.card} strokeWidth={2}/>}/></LineChart>)}
            </ResponsiveContainer>
          </div>

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
                  if(pts.length<2)return null;
                  const a=ADMINS[id];
                  const start=pts[0].v;const end=pts[pts.length-1].v;
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
                    <td style={{textAlign:"center",padding:"8px 10px",fontFamily:"'DM Mono',monospace",fontSize:11,color:T.sub}}>{fmt(start,m.u)}</td>
                    <td style={{textAlign:"center",padding:"8px 2px",color:T.rule,fontSize:10}}>→</td>
                    <td style={{textAlign:"center",padding:"8px 10px",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,color:T.ink}}>{fmt(end,m.u)}</td>
                    <td style={{textAlign:"right",padding:"8px 14px"}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:12,fontWeight:500,color:verdictColor}}>
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
                <div className="ol-score-medal" style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:500,color:i===0?T.accent:i<3?T.gold:T.mute,width:44,textAlign:"center"}}>{medals[i]}</div>
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
                <div className="ol-score-pts" style={{textAlign:"right"}}><div style={{fontSize:30,fontWeight:900,fontFamily:"'DM Mono',monospace",color:a.color}}>{s.p}</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute}}>of {maxP}</div></div>
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
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,width:18,color:i===0?"#16a34a":i===1?T.gold:T.mute,fontWeight:i<=1?700:400}}>#{i+1}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:a.color,fontWeight:600,width:52}}>{a.name}</span>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:4,fontFamily:"'DM Mono',monospace",fontSize:10}}>
                      <span style={{color:T.mute}}>{fmt(d.start,mx.u)}</span>
                      <span style={{color:T.mute,fontSize:8}}>→</span>
                      <span style={{color:T.ink,fontWeight:600}}>{fmt(d.end,mx.u)}</span>
                    </div>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:500,color:arrowColor,width:56,textAlign:"right"}}>
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

        {/* ═══ HEAD TO HEAD ═══ */}
        {tab==="headtohead"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          <h2 style={{fontSize:28,fontWeight:900,margin:"0 0 4px"}}>Head to Head</h2>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 16px"}}>Same metric, normalized to term start. Year 1 vs Year 1.</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
            {MK.map(k=><button key={k} onClick={()=>setH2h(k)} style={{padding:"5px 10px",borderRadius:3,border:`1px solid ${h2h===k?T.accent+"55":T.rule}`,background:h2h===k?T.accent+"0A":"transparent",color:h2h===k?T.accent:T.sub,fontSize:11,fontWeight:h2h===k?700:500,fontFamily:"'DM Sans',sans-serif"}}>{M[k].l}</button>)}
          </div>
          <div style={{...sty.card,padding:"20px 16px 10px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={h2hD}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/>
                <XAxis dataKey="year" stroke={T.mute} fontSize={12} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/>
                <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,M[h2h].u)}/>
                <Tooltip content={<Tip unit={M[h2h].u}/>}/>
                {AID.map(id=><Line key={id} type="monotone" dataKey={id} stroke={ADMINS[id].color} strokeWidth={2.5} dot={{r:4,fill:ADMINS[id].color,stroke:T.card,strokeWidth:2}} name={ADMINS[id].name} connectNulls/>)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:8}}>
            {AID.map(id=><div key={id} style={{display:"flex",alignItems:"center",gap:5,fontFamily:"'DM Sans',sans-serif",fontSize:12}}>
              <span style={{width:12,height:3,borderRadius:1,background:ADMINS[id].color}}/><span style={{color:ADMINS[id].color,fontWeight:700}}>{ADMINS[id].name}</span>
            </div>)}
          </div>
          <div style={{background:T.highlight,border:"1px solid #f5deb3",borderRadius:3,padding:"10px 14px"}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.6,color:"#78716c"}}><strong style={{color:T.ink}}>↳ </strong>{M[h2h].ctx} Clinton/Obama served 8 years vs 4 for others.</div>
          </div>
        </div>)}

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
                <XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/>
                <YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>`${v}${gmd.u}`}/>
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
        <div style={{borderTop:`1px solid ${T.rule}`,paddingTop:20,marginTop:40,fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{fontSize:10,color:T.mute,lineHeight:1.6}}>
            <strong style={{color:T.sub}}>Open Ledger v6.1</strong> · Data from BEA, BLS, Treasury, CBO, EIA, Census Bureau, Conference Board, S&P Global, World Bank, IMF, ILO, World Inequality Database. Built for transparency, not persuasion. All data is public and independently verifiable.
          </div>
        </div>
      </div>
    </div>
  );
}
