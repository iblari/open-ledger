"use client";
import { useState, useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

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
    bench:{good:"Steady upward trend",target:"~2-3% annual growth in real terms",warn:"Flat or declining = recession",why:"Real GDP should always grow over time in a healthy economy. The question is how fast — and whether growth is broadly shared."},
    ctx:"Total output adjusted for inflation. Shows absolute size, not speed.",
    facts:[{t:"Why 'real'?",x:"Adjusted for inflation — comparing actual output, not price increases."},{t:"Bigger base = slower rate",x:"$20T at 2% adds $400B. $5T at 8% adds $400B. Same absolute gain."}],
    d:[{y:1993,v:10.2,a:"clinton"},{y:1994,v:10.6,a:"clinton"},{y:1995,v:10.9,a:"clinton"},{y:1996,v:11.3,a:"clinton"},{y:1997,v:11.8,a:"clinton"},{y:1998,v:12.4,a:"clinton"},{y:1999,v:13.0,a:"clinton"},{y:2000,v:13.5,a:"clinton"},{y:2001,v:13.6,a:"bush"},{y:2002,v:13.8,a:"bush"},{y:2003,v:14.2,a:"bush"},{y:2004,v:14.7,a:"bush"},{y:2005,v:15.2,a:"bush"},{y:2006,v:15.6,a:"bush"},{y:2007,v:15.9,a:"bush"},{y:2008,v:15.9,a:"bush"},{y:2009,v:15.5,a:"obama"},{y:2010,v:15.9,a:"obama"},{y:2011,v:16.2,a:"obama"},{y:2012,v:16.6,a:"obama"},{y:2013,v:16.9,a:"obama"},{y:2014,v:17.3,a:"obama"},{y:2015,v:17.8,a:"obama"},{y:2016,v:18.1,a:"obama"},{y:2017,v:18.5,a:"trump1"},{y:2018,v:19.0,a:"trump1"},{y:2019,v:19.4,a:"trump1"},{y:2020,v:18.9,a:"trump1"},{y:2021,v:20.0,a:"biden"},{y:2022,v:20.4,a:"biden"},{y:2023,v:20.9,a:"biden"},{y:2024,v:21.5,a:"biden"}]},
  gdp:{l:"GDP Growth",s:"Annual %",src:"BEA",u:"%",inv:false,cat:"growth",
    bench:{good:"2–3%",target:"Sustained 2-3% is healthy for a mature economy",warn:"Below 0% = contraction. Above 5% often = rebound, not trend",why:"The U.S. economy averaged 3.2% from 1947-2000 and 2.1% from 2000-2024. Lower trend reflects a larger, more mature economy."},
    ctx:"Post-recession years show rebound effects, not necessarily good policy.",facts:[{t:"Presidents influence ~10-30%",x:"Fed rates, global conditions, and business cycles often matter more."}],
    d:[{y:1993,v:2.7,a:"clinton"},{y:1994,v:4.0,a:"clinton"},{y:1995,v:2.7,a:"clinton"},{y:1996,v:3.8,a:"clinton"},{y:1997,v:4.5,a:"clinton"},{y:1998,v:4.5,a:"clinton"},{y:1999,v:4.7,a:"clinton"},{y:2000,v:4.1,a:"clinton"},{y:2001,v:1.0,a:"bush"},{y:2002,v:1.7,a:"bush"},{y:2003,v:2.8,a:"bush"},{y:2004,v:3.8,a:"bush"},{y:2005,v:3.5,a:"bush"},{y:2006,v:2.8,a:"bush"},{y:2007,v:2.0,a:"bush"},{y:2008,v:-0.1,a:"bush"},{y:2009,v:-2.6,a:"obama"},{y:2010,v:2.7,a:"obama"},{y:2011,v:1.5,a:"obama"},{y:2012,v:2.3,a:"obama"},{y:2013,v:1.8,a:"obama"},{y:2014,v:2.3,a:"obama"},{y:2015,v:2.7,a:"obama"},{y:2016,v:1.7,a:"obama"},{y:2017,v:2.2,a:"trump1"},{y:2018,v:2.9,a:"trump1"},{y:2019,v:2.3,a:"trump1"},{y:2020,v:-2.8,a:"trump1"},{y:2021,v:5.9,a:"biden"},{y:2022,v:1.9,a:"biden"},{y:2023,v:2.5,a:"biden"},{y:2024,v:2.8,a:"biden"}]},
  unemployment:{l:"Unemployment",s:"Rate %",src:"BLS U-3",u:"%",inv:true,cat:"labor",
    bench:{good:"3.5–4.5%",target:"Below 4% = tight labor market (good for workers)",warn:"Above 6% = significant slack. Above 8% = crisis-level",why:"'Full employment' is ~3.5-4.5%. Below 3.5% risks inflation as employers compete for scarce workers. The 'natural rate' shifts over time."},
    ctx:"Obama inherited 9%+. Trump's 2020 spike = COVID lockdowns.",facts:[{t:"U-3 misses discouraged workers",x:"U-6 adds underemployed + discouraged — typically 3-5 points higher."}],
    d:[{y:1993,v:6.9,a:"clinton"},{y:1994,v:6.1,a:"clinton"},{y:1995,v:5.6,a:"clinton"},{y:1996,v:5.4,a:"clinton"},{y:1997,v:4.9,a:"clinton"},{y:1998,v:4.5,a:"clinton"},{y:1999,v:4.2,a:"clinton"},{y:2000,v:4.0,a:"clinton"},{y:2001,v:4.7,a:"bush"},{y:2002,v:5.8,a:"bush"},{y:2003,v:6.0,a:"bush"},{y:2004,v:5.5,a:"bush"},{y:2005,v:5.1,a:"bush"},{y:2006,v:4.6,a:"bush"},{y:2007,v:4.6,a:"bush"},{y:2008,v:5.8,a:"bush"},{y:2009,v:9.3,a:"obama"},{y:2010,v:9.6,a:"obama"},{y:2011,v:8.9,a:"obama"},{y:2012,v:8.1,a:"obama"},{y:2013,v:7.4,a:"obama"},{y:2014,v:6.2,a:"obama"},{y:2015,v:5.3,a:"obama"},{y:2016,v:4.9,a:"obama"},{y:2017,v:4.4,a:"trump1"},{y:2018,v:3.9,a:"trump1"},{y:2019,v:3.7,a:"trump1"},{y:2020,v:8.1,a:"trump1"},{y:2021,v:5.4,a:"biden"},{y:2022,v:3.6,a:"biden"},{y:2023,v:3.6,a:"biden"},{y:2024,v:4.0,a:"biden"}]},
  lfpr:{l:"Labor Participation",s:"Rate %",src:"BLS",u:"%",inv:false,cat:"labor",
    bench:{good:"62–67%",target:"Higher = more people working or seeking work",warn:"Below 62% signals structural disengagement from workforce",why:"Peaked at 67.3% in 2000. Structural decline from aging boomers is ~0.2%/yr — this trend is demographic, not policy failure."},
    ctx:"Long-term decline from aging boomers retiring. Peaked at 67.3% in 2000.",facts:[{t:"Catches what unemployment misses",x:"If someone stops looking, they leave the labor force entirely — LFPR captures this."}],
    d:[{y:1993,v:66.3,a:"clinton"},{y:1994,v:66.6,a:"clinton"},{y:1995,v:66.6,a:"clinton"},{y:1996,v:66.8,a:"clinton"},{y:1997,v:67.1,a:"clinton"},{y:1998,v:67.1,a:"clinton"},{y:1999,v:67.1,a:"clinton"},{y:2000,v:67.1,a:"clinton"},{y:2001,v:66.8,a:"bush"},{y:2002,v:66.6,a:"bush"},{y:2003,v:66.2,a:"bush"},{y:2004,v:66.0,a:"bush"},{y:2005,v:66.0,a:"bush"},{y:2006,v:66.2,a:"bush"},{y:2007,v:66.0,a:"bush"},{y:2008,v:66.0,a:"bush"},{y:2009,v:65.4,a:"obama"},{y:2010,v:64.7,a:"obama"},{y:2011,v:64.1,a:"obama"},{y:2012,v:63.7,a:"obama"},{y:2013,v:63.2,a:"obama"},{y:2014,v:62.9,a:"obama"},{y:2015,v:62.7,a:"obama"},{y:2016,v:62.8,a:"obama"},{y:2017,v:62.9,a:"trump1"},{y:2018,v:62.9,a:"trump1"},{y:2019,v:63.1,a:"trump1"},{y:2020,v:61.7,a:"trump1"},{y:2021,v:61.7,a:"biden"},{y:2022,v:62.2,a:"biden"},{y:2023,v:62.6,a:"biden"},{y:2024,v:62.5,a:"biden"}]},
  jobs:{l:"Jobs Added",s:"Millions/yr",src:"BLS",u:"M",inv:false,cat:"labor",
    bench:{good:"+1.5 to +3M/yr",target:"Consistent monthly gains of 150K-250K = healthy expansion",warn:"Negative = net job losses, signaling recession",why:"The economy needs ~100-150K new jobs/month just to keep up with population growth. Anything above 200K is strong."},
    ctx:"Reopenings ≠ creation. Policy lags 12-18 months.",facts:[{t:"Biden's 2021 +6.7M",x:"Largely positions COVID eliminated being refilled, not new structural jobs."}],
    d:[{y:1993,v:2.8,a:"clinton"},{y:1994,v:3.9,a:"clinton"},{y:1995,v:2.2,a:"clinton"},{y:1996,v:2.8,a:"clinton"},{y:1997,v:3.4,a:"clinton"},{y:1998,v:3.0,a:"clinton"},{y:1999,v:3.2,a:"clinton"},{y:2000,v:1.9,a:"clinton"},{y:2001,v:-1.7,a:"bush"},{y:2002,v:-0.5,a:"bush"},{y:2003,v:0.1,a:"bush"},{y:2004,v:2.0,a:"bush"},{y:2005,v:2.5,a:"bush"},{y:2006,v:2.1,a:"bush"},{y:2007,v:1.1,a:"bush"},{y:2008,v:-3.6,a:"bush"},{y:2009,v:-5.1,a:"obama"},{y:2010,v:1.0,a:"obama"},{y:2011,v:2.1,a:"obama"},{y:2012,v:2.2,a:"obama"},{y:2013,v:2.3,a:"obama"},{y:2014,v:3.0,a:"obama"},{y:2015,v:2.7,a:"obama"},{y:2016,v:2.3,a:"obama"},{y:2017,v:2.1,a:"trump1"},{y:2018,v:2.3,a:"trump1"},{y:2019,v:2.0,a:"trump1"},{y:2020,v:-9.3,a:"trump1"},{y:2021,v:6.7,a:"biden"},{y:2022,v:4.8,a:"biden"},{y:2023,v:2.7,a:"biden"},{y:2024,v:2.2,a:"biden"}]},
  mfg:{l:"Manufacturing",s:"Jobs (M)",src:"BLS",u:"mfg",inv:false,cat:"labor",
    bench:{good:"Stabilization at 12-13M",target:"Halting decline is realistic; returning to 17M+ is not",warn:"Sharp drops signal recession or trade disruption",why:"Manufacturing output keeps rising while jobs decline — automation replaces workers. This trend is global and irreversible. Policy focus should be on job quality, not quantity."},
    ctx:"Peaked at 19.6M in 1979. ~85% of losses from automation, not offshoring.",facts:[{t:"Output still rising",x:"U.S. manufactures more by value than ever — with fewer workers."}],
    d:[{y:1993,v:16.8,a:"clinton"},{y:1994,v:17.0,a:"clinton"},{y:1995,v:17.1,a:"clinton"},{y:1996,v:17.2,a:"clinton"},{y:1997,v:17.4,a:"clinton"},{y:1998,v:17.5,a:"clinton"},{y:1999,v:17.3,a:"clinton"},{y:2000,v:17.3,a:"clinton"},{y:2001,v:16.4,a:"bush"},{y:2002,v:15.3,a:"bush"},{y:2003,v:14.5,a:"bush"},{y:2004,v:14.3,a:"bush"},{y:2005,v:14.2,a:"bush"},{y:2006,v:14.2,a:"bush"},{y:2007,v:13.9,a:"bush"},{y:2008,v:13.4,a:"bush"},{y:2009,v:11.8,a:"obama"},{y:2010,v:11.5,a:"obama"},{y:2011,v:11.7,a:"obama"},{y:2012,v:12.0,a:"obama"},{y:2013,v:12.1,a:"obama"},{y:2014,v:12.2,a:"obama"},{y:2015,v:12.3,a:"obama"},{y:2016,v:12.3,a:"obama"},{y:2017,v:12.4,a:"trump1"},{y:2018,v:12.7,a:"trump1"},{y:2019,v:12.8,a:"trump1"},{y:2020,v:12.2,a:"trump1"},{y:2021,v:12.3,a:"biden"},{y:2022,v:12.8,a:"biden"},{y:2023,v:12.9,a:"biden"},{y:2024,v:12.8,a:"biden"}]},
  inflation:{l:"Inflation",s:"CPI %",src:"BLS",u:"%",inv:true,cat:"prices",
    bench:{good:"1.5–2.5%",target:"The Fed targets exactly 2% — the 'Goldilocks' rate",warn:"Above 4% = eroding paychecks. Below 0% = deflation spiral risk",why:"2% encourages spending without destroying savings. At 8% (2022), a $50K salary loses $4,000 in purchasing power in one year."},
    ctx:"Fed targets 2%. 2022's 8% = post-COVID supply + stimulus.",facts:[{t:"The Fed controls inflation",x:"Interest rates are the primary tool. Presidents contribute via spending but can't set prices."}],
    d:[{y:1993,v:3.0,a:"clinton"},{y:1994,v:2.6,a:"clinton"},{y:1995,v:2.8,a:"clinton"},{y:1996,v:3.0,a:"clinton"},{y:1997,v:2.3,a:"clinton"},{y:1998,v:1.6,a:"clinton"},{y:1999,v:2.2,a:"clinton"},{y:2000,v:3.4,a:"clinton"},{y:2001,v:2.8,a:"bush"},{y:2002,v:1.6,a:"bush"},{y:2003,v:2.3,a:"bush"},{y:2004,v:2.7,a:"bush"},{y:2005,v:3.4,a:"bush"},{y:2006,v:3.2,a:"bush"},{y:2007,v:2.8,a:"bush"},{y:2008,v:3.8,a:"bush"},{y:2009,v:-0.4,a:"obama"},{y:2010,v:1.6,a:"obama"},{y:2011,v:3.2,a:"obama"},{y:2012,v:2.1,a:"obama"},{y:2013,v:1.5,a:"obama"},{y:2014,v:1.6,a:"obama"},{y:2015,v:0.1,a:"obama"},{y:2016,v:1.3,a:"obama"},{y:2017,v:2.1,a:"trump1"},{y:2018,v:2.4,a:"trump1"},{y:2019,v:1.8,a:"trump1"},{y:2020,v:1.2,a:"trump1"},{y:2021,v:4.7,a:"biden"},{y:2022,v:8.0,a:"biden"},{y:2023,v:4.1,a:"biden"},{y:2024,v:2.9,a:"biden"}]},
  gas:{l:"Gas Prices",s:"$/gal",src:"EIA",u:"$",inv:true,cat:"prices",
    bench:{good:"$2.50–$3.50",target:"Stable prices matter more than low prices",warn:"Above $4 = consumer pain. Below $2 often = demand collapse (bad sign)",why:"Americans spend ~3-5% of income on gas. At $4/gal, a 30-gallon-per-week family pays $6,240/yr vs $3,900 at $2.50. The $2,340 difference hits lower-income families hardest."},
    ctx:"~60% = global crude. OPEC > White House.",facts:[{t:"COVID made gas cheap",x:"2020's $2.17 was demand collapse, not a policy win."}],
    d:[{y:1993,v:1.07,a:"clinton"},{y:1994,v:1.08,a:"clinton"},{y:1995,v:1.10,a:"clinton"},{y:1996,v:1.22,a:"clinton"},{y:1997,v:1.20,a:"clinton"},{y:1998,v:1.03,a:"clinton"},{y:1999,v:1.14,a:"clinton"},{y:2000,v:1.49,a:"clinton"},{y:2001,v:1.42,a:"bush"},{y:2002,v:1.35,a:"bush"},{y:2003,v:1.56,a:"bush"},{y:2004,v:1.85,a:"bush"},{y:2005,v:2.27,a:"bush"},{y:2006,v:2.57,a:"bush"},{y:2007,v:2.80,a:"bush"},{y:2008,v:3.25,a:"bush"},{y:2009,v:2.35,a:"obama"},{y:2010,v:2.78,a:"obama"},{y:2011,v:3.53,a:"obama"},{y:2012,v:3.64,a:"obama"},{y:2013,v:3.53,a:"obama"},{y:2014,v:3.37,a:"obama"},{y:2015,v:2.43,a:"obama"},{y:2016,v:2.14,a:"obama"},{y:2017,v:2.41,a:"trump1"},{y:2018,v:2.72,a:"trump1"},{y:2019,v:2.60,a:"trump1"},{y:2020,v:2.17,a:"trump1"},{y:2021,v:3.01,a:"biden"},{y:2022,v:3.97,a:"biden"},{y:2023,v:3.52,a:"biden"},{y:2024,v:3.31,a:"biden"}]},
  wages:{l:"Real Wages",s:"YoY %",src:"BLS",u:"%",inv:false,cat:"prices",
    bench:{good:"+0.5 to +2.0%",target:"Positive real wage growth = workers gaining purchasing power",warn:"Negative = paychecks shrinking in real terms despite nominal raises",why:"If real wages are negative, your raise didn't keep up with prices. Americans experienced 25 consecutive months of negative real wages from mid-2021 to mid-2023."},
    ctx:"Nominal raise minus inflation. 2020 spike = composition effect.",facts:[{t:"Nominal vs Real",x:"A 4% raise with 5% inflation = -1% real decline."}],
    d:[{y:1993,v:0.2,a:"clinton"},{y:1994,v:0.3,a:"clinton"},{y:1995,v:0.6,a:"clinton"},{y:1996,v:0.8,a:"clinton"},{y:1997,v:1.6,a:"clinton"},{y:1998,v:2.4,a:"clinton"},{y:1999,v:1.5,a:"clinton"},{y:2000,v:0.6,a:"clinton"},{y:2001,v:0.8,a:"bush"},{y:2002,v:1.4,a:"bush"},{y:2003,v:0.0,a:"bush"},{y:2004,v:-0.5,a:"bush"},{y:2005,v:-0.8,a:"bush"},{y:2006,v:0.2,a:"bush"},{y:2007,v:0.5,a:"bush"},{y:2008,v:-1.0,a:"bush"},{y:2009,v:1.5,a:"obama"},{y:2010,v:-0.2,a:"obama"},{y:2011,v:-1.2,a:"obama"},{y:2012,v:0.3,a:"obama"},{y:2013,v:0.5,a:"obama"},{y:2014,v:0.8,a:"obama"},{y:2015,v:2.1,a:"obama"},{y:2016,v:1.1,a:"obama"},{y:2017,v:0.4,a:"trump1"},{y:2018,v:0.8,a:"trump1"},{y:2019,v:1.2,a:"trump1"},{y:2020,v:4.0,a:"trump1"},{y:2021,v:-2.2,a:"biden"},{y:2022,v:-1.7,a:"biden"},{y:2023,v:0.8,a:"biden"},{y:2024,v:1.1,a:"biden"}]},
  median_income:{l:"Median Income",s:"Household (2023$)",src:"Census",u:"inc",inv:false,cat:"people",
    bench:{good:"Sustained upward trend",target:"Growth that outpaces inflation = real improvement",warn:"Stagnation for 15 years (1999-2014) despite GDP growth = gains going to top earners",why:"If GDP grows but median income doesn't, the economy is growing for corporations and the wealthy — not for typical families. This gap is the core inequality story."},
    ctx:"Inflation-adjusted. Stagnated from 1999-2014.",facts:[{t:"Median, not average",x:"Average is skewed by billionaires. Median = the middle family."}],
    d:[{y:1993,v:55600,a:"clinton"},{y:1994,v:55500,a:"clinton"},{y:1995,v:57200,a:"clinton"},{y:1996,v:57900,a:"clinton"},{y:1997,v:58900,a:"clinton"},{y:1998,v:60600,a:"clinton"},{y:1999,v:61500,a:"clinton"},{y:2000,v:61400,a:"clinton"},{y:2001,v:60200,a:"bush"},{y:2002,v:59500,a:"bush"},{y:2003,v:59300,a:"bush"},{y:2004,v:59200,a:"bush"},{y:2005,v:59700,a:"bush"},{y:2006,v:59900,a:"bush"},{y:2007,v:60400,a:"bush"},{y:2008,v:58600,a:"bush"},{y:2009,v:57600,a:"obama"},{y:2010,v:56800,a:"obama"},{y:2011,v:56500,a:"obama"},{y:2012,v:56700,a:"obama"},{y:2013,v:57600,a:"obama"},{y:2014,v:57900,a:"obama"},{y:2015,v:60500,a:"obama"},{y:2016,v:62900,a:"obama"},{y:2017,v:64000,a:"trump1"},{y:2018,v:65000,a:"trump1"},{y:2019,v:69600,a:"trump1"},{y:2020,v:68000,a:"trump1"},{y:2021,v:71100,a:"biden"},{y:2022,v:74600,a:"biden"},{y:2023,v:80600,a:"biden"},{y:2024,v:80600,a:"biden"}]},
  poverty:{l:"Poverty Rate",s:"%",src:"Census",u:"%",inv:true,cat:"people",
    bench:{good:"Below 11%",target:"Single digits would match peer nations (UK ~10%, Germany ~8%)",warn:"Above 13% = crisis-era levels. Above 15% = deep structural failure",why:"The U.S. poverty rate has bounced between 11-15% for 30 years while peer nations trend lower. The official threshold (~$31K for family of 4) is itself considered too low by most economists."},
    ctx:"Official line ~$31K for family of 4. Many economists consider it too low.",facts:[{t:"Near-poverty matters",x:"Millions hover just above the line. One medical bill pushes them under."}],
    d:[{y:1993,v:15.1,a:"clinton"},{y:1994,v:14.5,a:"clinton"},{y:1995,v:13.8,a:"clinton"},{y:1996,v:13.7,a:"clinton"},{y:1997,v:13.3,a:"clinton"},{y:1998,v:12.7,a:"clinton"},{y:1999,v:11.9,a:"clinton"},{y:2000,v:11.3,a:"clinton"},{y:2001,v:11.7,a:"bush"},{y:2002,v:12.1,a:"bush"},{y:2003,v:12.5,a:"bush"},{y:2004,v:12.7,a:"bush"},{y:2005,v:12.6,a:"bush"},{y:2006,v:12.3,a:"bush"},{y:2007,v:12.5,a:"bush"},{y:2008,v:13.2,a:"bush"},{y:2009,v:14.3,a:"obama"},{y:2010,v:15.1,a:"obama"},{y:2011,v:15.0,a:"obama"},{y:2012,v:15.0,a:"obama"},{y:2013,v:14.5,a:"obama"},{y:2014,v:14.8,a:"obama"},{y:2015,v:13.5,a:"obama"},{y:2016,v:12.7,a:"obama"},{y:2017,v:12.3,a:"trump1"},{y:2018,v:11.8,a:"trump1"},{y:2019,v:10.5,a:"trump1"},{y:2020,v:11.4,a:"trump1"},{y:2021,v:11.6,a:"biden"},{y:2022,v:11.5,a:"biden"},{y:2023,v:12.4,a:"biden"},{y:2024,v:12.2,a:"biden"}]},
  inequality:{l:"Inequality",s:"Top 10% Share %",src:"WID",u:"%",inv:true,cat:"people",
    bench:{good:"Below 40%",target:"Peer nations: Germany ~37%, Japan ~35%, UK ~39%",warn:"Above 45% = approaching Gilded Age levels (1920s were ~46%)",why:"When the top 10% captures 47%+ of income, economic mobility declines, social cohesion weakens, and political polarization intensifies. The U.S. is now above 1920s-era inequality."},
    ctx:"40-year bipartisan trend. No administration has reversed it.",facts:[{t:"Tax + globalization + tech",x:"All contribute. Pre-tax income keeps concentrating regardless of party."}],
    d:[{y:1993,v:40.5,a:"clinton"},{y:1994,v:40.8,a:"clinton"},{y:1995,v:41.4,a:"clinton"},{y:1996,v:42.0,a:"clinton"},{y:1997,v:42.8,a:"clinton"},{y:1998,v:43.2,a:"clinton"},{y:1999,v:43.8,a:"clinton"},{y:2000,v:43.5,a:"clinton"},{y:2001,v:42.5,a:"bush"},{y:2002,v:42.0,a:"bush"},{y:2003,v:42.4,a:"bush"},{y:2004,v:43.2,a:"bush"},{y:2005,v:44.0,a:"bush"},{y:2006,v:44.7,a:"bush"},{y:2007,v:45.2,a:"bush"},{y:2008,v:43.4,a:"bush"},{y:2009,v:43.2,a:"obama"},{y:2010,v:44.5,a:"obama"},{y:2011,v:44.3,a:"obama"},{y:2012,v:46.3,a:"obama"},{y:2013,v:45.0,a:"obama"},{y:2014,v:45.5,a:"obama"},{y:2015,v:45.6,a:"obama"},{y:2016,v:45.8,a:"obama"},{y:2017,v:46.1,a:"trump1"},{y:2018,v:46.5,a:"trump1"},{y:2019,v:46.8,a:"trump1"},{y:2020,v:46.0,a:"trump1"},{y:2021,v:46.5,a:"biden"},{y:2022,v:46.8,a:"biden"},{y:2023,v:47.0,a:"biden"},{y:2024,v:47.2,a:"biden"}]},
  consumer_conf:{l:"Confidence",s:"Index (1985=100)",src:"Conference Board",u:"cc",inv:false,cat:"sentiment",
    bench:{good:"Above 100",target:"100 = baseline optimism. 120+ = strong confidence",warn:"Below 60 = recession-level pessimism",why:"Above 100 means consumers feel better than the 1985 baseline. High confidence drives spending (70% of GDP). But since 2016, partisan identity has become the biggest predictor — not actual conditions."},
    ctx:"How people FEEL — not how the economy performs. Partisan since 2016.",facts:[{t:"Vibes ≠ reality",x:"Confidence dropped in 2022 despite strong jobs. People feel inflation more than employment."}],
    d:[{y:1993,v:68,a:"clinton"},{y:1994,v:91,a:"clinton"},{y:1995,v:100,a:"clinton"},{y:1996,v:107,a:"clinton"},{y:1997,v:127,a:"clinton"},{y:1998,v:133,a:"clinton"},{y:1999,v:139,a:"clinton"},{y:2000,v:143,a:"clinton"},{y:2001,v:106,a:"bush"},{y:2002,v:97,a:"bush"},{y:2003,v:82,a:"bush"},{y:2004,v:96,a:"bush"},{y:2005,v:100,a:"bush"},{y:2006,v:105,a:"bush"},{y:2007,v:99,a:"bush"},{y:2008,v:58,a:"bush"},{y:2009,v:45,a:"obama"},{y:2010,v:55,a:"obama"},{y:2011,v:58,a:"obama"},{y:2012,v:67,a:"obama"},{y:2013,v:73,a:"obama"},{y:2014,v:87,a:"obama"},{y:2015,v:98,a:"obama"},{y:2016,v:100,a:"obama"},{y:2017,v:120,a:"trump1"},{y:2018,v:130,a:"trump1"},{y:2019,v:128,a:"trump1"},{y:2020,v:101,a:"trump1"},{y:2021,v:113,a:"biden"},{y:2022,v:104,a:"biden"},{y:2023,v:101,a:"biden"},{y:2024,v:100,a:"biden"}]},
  debt_gdp:{l:"Debt-to-GDP",s:"Ratio %",src:"Treasury/BEA",u:"%",inv:true,cat:"fiscal",
    bench:{good:"Below 60%",target:"60% was the pre-2008 norm. 90%+ is elevated by historical standards",warn:"Above 120% = uncharted territory for the U.S. (Japan at ~260% still functions, but pays the price in growth)",why:"The real risk isn't a magic threshold — it's when interest payments crowd out other spending. The U.S. now spends more on interest ($882B in 2024) than on defense."},
    ctx:"The proper debt measure. Japan is ~260%, UK ~100%.",facts:[{t:"Crossed 100% in 2013",x:"Economists debate whether this threshold matters. Several healthy economies exceed it."}],
    d:[{y:1993,v:63.8,a:"clinton"},{y:1994,v:63.4,a:"clinton"},{y:1995,v:63.1,a:"clinton"},{y:1996,v:62.2,a:"clinton"},{y:1997,v:60.2,a:"clinton"},{y:1998,v:57.5,a:"clinton"},{y:1999,v:55.5,a:"clinton"},{y:2000,v:53.7,a:"clinton"},{y:2001,v:54.7,a:"bush"},{y:2002,v:57.1,a:"bush"},{y:2003,v:59.7,a:"bush"},{y:2004,v:61.3,a:"bush"},{y:2005,v:61.7,a:"bush"},{y:2006,v:61.9,a:"bush"},{y:2007,v:62.5,a:"bush"},{y:2008,v:68.2,a:"bush"},{y:2009,v:82.4,a:"obama"},{y:2010,v:91.4,a:"obama"},{y:2011,v:95.6,a:"obama"},{y:2012,v:99.7,a:"obama"},{y:2013,v:100.4,a:"obama"},{y:2014,v:101.2,a:"obama"},{y:2015,v:100.1,a:"obama"},{y:2016,v:104.8,a:"obama"},{y:2017,v:103.6,a:"trump1"},{y:2018,v:104.3,a:"trump1"},{y:2019,v:106.8,a:"trump1"},{y:2020,v:127.0,a:"trump1"},{y:2021,v:121.7,a:"biden"},{y:2022,v:120.0,a:"biden"},{y:2023,v:122.3,a:"biden"},{y:2024,v:124.0,a:"biden"}]},
  deficit:{l:"Deficit",s:"$Billions",src:"CBO",u:"B",inv:true,cat:"fiscal",
    bench:{good:"Below 3% of GDP (~$800B)",target:"Balanced budget or small surplus is ideal but rare",warn:"Above 5% of GDP in non-crisis years = fiscally unsustainable trajectory",why:"Running deficits during recessions is standard Keynesian economics. Running $1.8T deficits during economic expansion (2024) is unusual and concerning — it leaves no fiscal room for the next crisis."},
    ctx:"Clinton achieved surpluses. COVID spending dwarfed all prior deficits.",facts:[{t:"70% of spending is autopilot",x:"Social Security, Medicare, Medicaid, interest run regardless of president."}],
    d:[{y:1993,v:-255,a:"clinton"},{y:1994,v:-203,a:"clinton"},{y:1995,v:-164,a:"clinton"},{y:1996,v:-107,a:"clinton"},{y:1997,v:-22,a:"clinton"},{y:1998,v:69,a:"clinton"},{y:1999,v:126,a:"clinton"},{y:2000,v:236,a:"clinton"},{y:2001,v:128,a:"bush"},{y:2002,v:-158,a:"bush"},{y:2003,v:-378,a:"bush"},{y:2004,v:-413,a:"bush"},{y:2005,v:-318,a:"bush"},{y:2006,v:-248,a:"bush"},{y:2007,v:-161,a:"bush"},{y:2008,v:-459,a:"bush"},{y:2009,v:-1413,a:"obama"},{y:2010,v:-1294,a:"obama"},{y:2011,v:-1300,a:"obama"},{y:2012,v:-1087,a:"obama"},{y:2013,v:-680,a:"obama"},{y:2014,v:-485,a:"obama"},{y:2015,v:-438,a:"obama"},{y:2016,v:-585,a:"obama"},{y:2017,v:-665,a:"trump1"},{y:2018,v:-779,a:"trump1"},{y:2019,v:-984,a:"trump1"},{y:2020,v:-3132,a:"trump1"},{y:2021,v:-2772,a:"biden"},{y:2022,v:-1375,a:"biden"},{y:2023,v:-1695,a:"biden"},{y:2024,v:-1833,a:"biden"}]},
  sp500:{l:"S&P 500",s:"Year-End",src:"S&P Global",u:"",inv:false,cat:"markets",
    bench:{good:"7-10% annual return (long-term avg)",target:"Historical average = ~10% nominal, ~7% real annual return",warn:"A single-year decline doesn't mean crisis — markets drop 20%+ roughly once per decade",why:"The S&P 500's long-term return is ~10%/yr. But the top 10% own 93% of stocks, so market gains disproportionately benefit the wealthy. For most Americans, home equity matters more than stock prices."},
    ctx:"Top 10% own 93% of stocks. Fed rates matter more than the president.",facts:[{t:"Rose under both parties",x:"Obama +166%, Trump I +67%. Markets respond to earnings, not ideology."}],
    d:[{y:1993,v:466,a:"clinton"},{y:1994,v:459,a:"clinton"},{y:1995,v:616,a:"clinton"},{y:1996,v:741,a:"clinton"},{y:1997,v:970,a:"clinton"},{y:1998,v:1229,a:"clinton"},{y:1999,v:1469,a:"clinton"},{y:2000,v:1320,a:"clinton"},{y:2001,v:1148,a:"bush"},{y:2002,v:880,a:"bush"},{y:2003,v:1112,a:"bush"},{y:2004,v:1212,a:"bush"},{y:2005,v:1248,a:"bush"},{y:2006,v:1418,a:"bush"},{y:2007,v:1468,a:"bush"},{y:2008,v:903,a:"bush"},{y:2009,v:1115,a:"obama"},{y:2010,v:1258,a:"obama"},{y:2011,v:1258,a:"obama"},{y:2012,v:1426,a:"obama"},{y:2013,v:1848,a:"obama"},{y:2014,v:2059,a:"obama"},{y:2015,v:2044,a:"obama"},{y:2016,v:2239,a:"obama"},{y:2017,v:2674,a:"trump1"},{y:2018,v:2507,a:"trump1"},{y:2019,v:3231,a:"trump1"},{y:2020,v:3756,a:"trump1"},{y:2021,v:4766,a:"biden"},{y:2022,v:3840,a:"biden"},{y:2023,v:4770,a:"biden"},{y:2024,v:5881,a:"biden"}]},
};

const MK=Object.keys(M);
const CATS={growth:"Growth",labor:"Labor Market",prices:"Prices & Wages",people:"Living Standards",fiscal:"Fiscal Health",markets:"Markets",sentiment:"Sentiment"};
const ML={real_gdp:"GDP",gdp:"GDP%",unemployment:"Unemp",lfpr:"LFPR",jobs:"Jobs",mfg:"Mfg",inflation:"CPI",gas:"Gas",wages:"Wages",median_income:"Inc",poverty:"Pov",inequality:"Ineq",consumer_conf:"Conf",debt_gdp:"D/GDP",deficit:"Def",sp500:"S&P"};

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
  if(u==="inc")return`$${(v/1000).toFixed(1)}K`;if(u==="cc")return v.toFixed(0);if(u==="mfg")return`${v.toFixed(1)}M`;return v.toLocaleString();
}

function scores(){
  const sc={};for(const id of AID)sc[id]={r:{},p:0};
  for(const mk of MK){const m=M[mk];const av={};
    for(const id of AID){const pts=m.d.filter(d=>d.a===id);if(pts.length)av[id]=pts.reduce((s,p)=>s+p.v,0)/pts.length;}
    Object.entries(av).sort((a,b)=>m.inv?a[1]-b[1]:b[1]-a[1]).forEach(([id],i)=>{sc[id].r[mk]=i+1;sc[id].p+=AID.length-i;});}
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

const TABS=[["dashboard","Data"],["scorecard","Scorecard"],["headtohead","Compare"],["global","Global"]];

export default function App(){
  const [tab,setTab]=useState("dashboard");
  const [am,setAm]=useState("gdp");
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
      <style>{`* { box-sizing: border-box; } button { cursor: pointer; } @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* ── HEADER ── */}
      <div style={sty.header}>
        <div style={{maxWidth:1080,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <div style={{width:28,height:4,background:T.accent,borderRadius:1}}/>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700,letterSpacing:3,textTransform:"uppercase",color:T.mute}}>Open Ledger</span>
          </div>
          <h1 style={{fontSize:38,fontWeight:900,margin:0,lineHeight:1.1,letterSpacing:-1,maxWidth:600}}>
            The economy under<br/>every president, in data.
          </h1>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,color:T.sub,margin:"10px 0 0",maxWidth:480,lineHeight:1.5}}>
            16 indicators across 5 administrations. No editorial. No spin. Context where it matters. You interpret.
          </p>
        </div>
      </div>

      {/* ── NAV ── */}
      <div style={sty.nav}>
        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 24px",display:"flex",gap:0}}>
          {TABS.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{
            padding:"13px 20px",border:"none",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,
            background:"transparent",color:tab===k?T.ink:T.mute,
            borderBottom:tab===k?`2px solid ${T.accent}`:"2px solid transparent",transition:"all 0.2s"
          }}>{l}</button>)}
        </div>
      </div>

      <div style={{maxWidth:1080,margin:"0 auto",padding:"28px 24px 64px"}}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          {/* Presidents */}
          <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:20,justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:T.mute,marginBottom:6}}>Administrations</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {AID.map(id=>{const a=ADMINS[id];return(
                  <button key={id} onClick={()=>tog(id)} style={{
                    display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:3,
                    background:sel.includes(id)?a.color+"12":"transparent",
                    border:`1.5px solid ${sel.includes(id)?a.color:T.rule}`,
                    color:sel.includes(id)?a.color:T.mute,fontSize:12,fontWeight:600,fontFamily:"'DM Sans',sans-serif"
                  }}><span style={{width:8,height:8,borderRadius:2,background:sel.includes(id)?a.color:T.rule}}/>{a.name}<span style={{fontSize:10,opacity:0.5}}>{a.years}</span></button>
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}>
            <div>
              <h2 style={{fontSize:24,fontWeight:700,margin:0}}>{m.l}</h2>
              <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.mute}}>{m.s} · {m.src}</span>
            </div>
          </div>

          {/* Benchmark */}
          {m.bench&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:3,padding:"8px 12px"}}>
              <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#16a34a",marginBottom:2}}>Good</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:700,color:"#15803d"}}>{m.bench.good}</div>
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
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(sel.length,5)},1fr)`,gap:8,marginBottom:16}}>
            {sel.map(id=>{const s=sums[id];if(!s)return null;const a=ADMINS[id];const good=m.inv?s.chg<=0:s.chg>=0;
              return <div key={id} style={{...sty.card,padding:"12px 14px",borderTop:`3px solid ${a.color}`}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,color:T.mute,marginBottom:2}}>{a.name}</div>
                <div style={{fontSize:22,fontWeight:700,color:a.color,fontFamily:"'DM Mono',monospace"}}>{fmt(s.avg,m.u)}</div>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:600,color:good?"#16a34a":"#dc2626",marginTop:2}}>{s.chg>=0?"▲":"▼"} {fmt(Math.abs(s.chg),m.u)}<span style={{color:T.mute,fontWeight:400}}> over term</span></div>
              </div>;
            })}
          </div>

          {/* Chart */}
          <div style={{...sty.card,padding:"20px 16px 10px",marginBottom:12}}>
            <ResponsiveContainer width="100%" height={340}>
              {ct==="bar"?(<BarChart data={fd}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/><XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/><YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)}/><Tooltip content={<Tip unit={m.u}/>}/><Bar dataKey="v" radius={[2,2,0,0]} maxBarSize={22}>{fd.map((e,i)=><Cell key={i} fill={ADMINS[e.a]?.color} fillOpacity={0.85}/>)}</Bar></BarChart>
              ):(<LineChart data={fd}><CartesianGrid strokeDasharray="3 3" stroke={T.rule}/><XAxis dataKey="y" stroke={T.mute} fontSize={11} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}}/><YAxis stroke={T.rule} fontSize={10} fontFamily="'DM Mono',monospace" tick={{fill:T.sub}} tickFormatter={v=>fmt(v,m.u)}/><Tooltip content={<Tip unit={m.u}/>}/><Line type="monotone" dataKey="v" stroke={T.sub} strokeWidth={1.5} dot={p=><circle cx={p.cx} cy={p.cy} r={4} fill={ADMINS[p.payload?.a]?.color||T.sub} stroke={T.card} strokeWidth={2}/>}/></LineChart>)}
            </ResponsiveContainer>
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

        {/* ═══ SCORECARD ═══ */}
        {tab==="scorecard"&&(<div style={{animation:"fadeUp 0.4s ease"}}>
          <h2 style={{fontSize:28,fontWeight:900,margin:"0 0 4px"}}>Who performed best?</h2>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.sub,margin:"0 0 10px"}}>Ranked across all 16 metrics by term average. 5 pts for #1, 4 for #2, etc.</p>
          <div style={{background:T.highlight,border:"1px solid #f5deb3",borderRadius:3,padding:"10px 14px",marginBottom:22}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.6,color:"#78716c"}}><strong style={{color:T.ink}}>↳ Caveat: </strong>Raw averages don't account for inherited crises, Congress, or the Fed. A president who navigated a crisis will rank lower than one who governed in calm waters. Scroll down for context.</div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
            {ss.map((id,i)=>{const a=ADMINS[id];const s=sc[id];const medals=["1st","2nd","3rd","4th","5th"];
              const pct=(s.p/maxP)*100;
              return <div key={id} style={{...sty.card,padding:"16px 20px",borderLeft:`4px solid ${a.color}`,display:"flex",alignItems:"center",gap:16}}>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:700,color:i===0?T.accent:i<3?T.gold:T.mute,width:44,textAlign:"center"}}>{medals[i]}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:18,fontWeight:700,color:a.color}}>{a.name}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:T.mute}}>{a.full}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,padding:"2px 6px",borderRadius:2,background:a.party==="D"?"#dbeafe":"#fee2e2",color:a.party==="D"?"#2563eb":"#dc2626",fontWeight:700}}>{a.party}</span>
                  </div>
                  <div style={{width:"100%",height:6,borderRadius:3,background:T.paper,overflow:"hidden",marginBottom:5}}>
                    <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:a.color,transition:"width 0.6s ease"}}/>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {MK.map(mk=>{const r=s.r[mk];if(!r)return null;
                      return <span key={mk} style={{fontFamily:"'DM Sans',sans-serif",fontSize:9,fontWeight:r<=2?700:400,color:r===1?"#16a34a":r===2?T.gold:T.mute}}>{ML[mk]}:#{r}</span>;
                    })}
                  </div>
                </div>
                <div style={{textAlign:"right"}}><div style={{fontSize:30,fontWeight:900,fontFamily:"'DM Mono',monospace",color:a.color}}>{s.p}</div><div style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,color:T.mute}}>of {maxP}</div></div>
              </div>;
            })}
          </div>

          {/* Metric grid */}
          <h3 style={{fontSize:18,fontWeight:700,margin:"0 0 12px",borderBottom:`1px solid ${T.rule}`,paddingBottom:8}}>By Metric</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:28}}>
            {MK.map(mk=>{const mx=M[mk];
              const sorted=AID.slice().sort((a,b)=>{const aA=mx.d.filter(d=>d.a===a);const bA=mx.d.filter(d=>d.a===b);
                return mx.inv?(aA.reduce((s,p)=>s+p.v,0)/aA.length)-(bA.reduce((s,p)=>s+p.v,0)/bA.length):(bA.reduce((s,p)=>s+p.v,0)/bA.length)-(aA.reduce((s,p)=>s+p.v,0)/aA.length);});
              return <div key={mk} style={{...sty.card,padding:"10px 12px"}}>
                <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,marginBottom:6,color:T.ink}}>{mx.l}</div>
                {sorted.map((id,i)=>{const a=ADMINS[id];const pts=mx.d.filter(d=>d.a===id);const avg=pts.reduce((s,p)=>s+p.v,0)/pts.length;
                  return <div key={id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,width:18,color:i===0?"#16a34a":i===1?T.gold:T.mute,fontWeight:i<=1?700:400}}>#{i+1}</span>
                    <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,color:a.color,fontWeight:600,width:52}}>{a.name}</span>
                    <div style={{flex:1,height:3,borderRadius:2,background:T.paper}}>
                      <div style={{width:`${Math.min(100,Math.abs(avg)/Math.max(...AID.map(s=>{const p=mx.d.filter(d=>d.a===s);return Math.abs(p.reduce((s,p)=>s+p.v,0)/p.length);}))*100)}%`,height:"100%",borderRadius:2,background:a.color+"44"}}/>
                    </div>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:600,width:52,textAlign:"right",color:T.sub}}>{fmt(avg,mx.u)}</span>
                  </div>;
                })}
              </div>;
            })}
          </div>

          {/* Inherited */}
          <h3 style={{fontSize:18,fontWeight:700,margin:"0 0 12px",borderBottom:`1px solid ${T.rule}`,paddingBottom:8}}>What They Inherited</h3>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {AID.map(id=>{const a=ADMINS[id];const c=INH[id];
              return <div key={id} style={{...sty.card,padding:"10px 14px",borderLeft:`3px solid ${a.color}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><span style={{fontWeight:700,color:a.color}}>{a.name}</span><span style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:T.mute,marginLeft:8}}>{c.c}</span></div>
                <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:10,padding:"3px 8px",borderRadius:2,background:T.paper,fontWeight:600,color:T.sub,whiteSpace:"nowrap"}}>{c.g}</span>
              </div>;
            })}
          </div>
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
