import { getLedger, getReplayableOne, kvGet, kvSetMany } from "./live-kv";
import { getStocks, type Stock14 } from "./stocks";
import { getTones, type Tone } from "./entity-tone";

/**
 * Agenda radar — what officials are talking about MORE, measured.
 *
 * Reads the full transcript of every covered broadcast (not just the checked
 * claims) and counts three kinds of thing:
 *   - themes   (energy, shipbuilding, chips, tariffs…) mapped to the sectors
 *              they touch
 *   - companies (a curated list with tickers — precision over recall: a
 *              generic name-finder counts "Ford, Ohio" as the carmaker)
 *   - countries
 *
 * Everything is a RATE per 10,000 words, because airtime varies by two orders
 * of magnitude (a convention day is 200k words, a bill signing 5k). "Rising"
 * is a statistical call, not a raw count: a Poisson rate-ratio z-score of the
 * last 14 days against everything before, AND the subject must appear in at
 * least two separate recent broadcasts — one long speech about shipyards is
 * an event, not a shift in the agenda.
 *
 * Descriptive, not advice: it reports what was said and which sectors those
 * subjects touch.
 */

export interface ThemeDef { key: string; label: string; rx: RegExp; sectors: string[]; market: boolean }
export const THEMES: ThemeDef[] = [
  { key: "oil_gas", label: "Oil, gas & LNG", rx: /\bLNG\b|natural gas|pipelines?\b|\boil\b|drill(?:ing)?\b|frack\w*|refiner(?:y|ies)/gi, sectors: ["Oil & gas producers", "Pipelines"], market: true },
  { key: "power", label: "Power & nuclear", rx: /\bnuclear (?:power|plants?|reactors?|energy)|\breactors?\b|gigawatts?|electricity|power plants?|the grid\b|\butilit(?:y|ies)\b/gi, sectors: ["Utilities", "Nuclear & uranium"], market: true },
  { key: "ships_defense", label: "Shipbuilding & defense", rx: /shipyards?|shipbuild\w*|warships?|\bnavy\b|submarines?|munitions|missiles?|defense (?:contractors?|industr\w*|spending)/gi, sectors: ["Defense contractors", "Shipbuilders"], market: true },
  { key: "chips_ai", label: "Chips & AI", rx: /\bchips?\b|semiconductors?|\bAI\b|artificial intelligence|data cent(?:er|re)s?|super ?intelligence/g, sectors: ["Semiconductors", "Cloud & big tech"], market: true },
  { key: "tariffs", label: "Tariffs & trade deals", rx: /tariffs?|trade (?:deals?|agreements?|war)|\bduties\b/gi, sectors: ["Importers & retail", "Automakers"], market: true },
  { key: "investment", label: "Foreign investment pledges", rx: /\binvest(?:ing|ment|ments|ed|s)?\b/gi, sectors: ["Industrials", "Construction & materials"], market: true },
  { key: "factories", label: "Factories & manufacturing", rx: /factor(?:y|ies)|manufactur\w*|car plants?|auto plants?/gi, sectors: ["Industrials", "Automakers"], market: true },
  { key: "metals", label: "Steel, metals & minerals", rx: /\bsteel\b|aluminum|aluminium|copper|iron ore|critical minerals|rare earths?/gi, sectors: ["Steel & mining"], market: true },
  { key: "pharma", label: "Drug prices & pharma", rx: /pharma\w*|drug prices?|prescription|medicines?\b/gi, sectors: ["Pharmaceuticals"], market: true },
  { key: "housing", label: "Housing & mortgages", rx: /\bhousing\b|mortgages?|home prices|homebuild\w*|\brents?\b/gi, sectors: ["Homebuilders", "Banks & lenders"], market: true },
  { key: "rates", label: "The Fed & interest rates", rx: /\bthe fed\b|federal reserve|interest rates?|\bpowell\b|rate cuts?/gi, sectors: ["Banks & lenders", "Homebuilders"], market: true },
  { key: "fuel", label: "Gas & fuel prices", rx: /gasoline|gas prices?|price of gas|\bdiesel\b|at the pump/gi, sectors: ["Refiners", "Consumers"], market: true },
  { key: "prices", label: "Inflation & cost of living", rx: /inflation|grocer\w*|affordab\w*|cost of living|\bprices\b/gi, sectors: ["Consumer staples", "Retail"], market: true },
  { key: "crypto", label: "Crypto", rx: /crypto\w*|bitcoin|stablecoins?|blockchain/gi, sectors: ["Crypto"], market: true },
  { key: "taxes", label: "Taxes", rx: /tax cuts?|no tax on|\btaxes\b/gi, sectors: ["Consumers"], market: true },
  { key: "jobs", label: "Jobs", rx: /\bjobs\b|employment|hiring/gi, sectors: [], market: false },
  { key: "immigration", label: "Immigration & border", rx: /\bborder\b|illegal aliens?|immigra\w*|migrants?|deport\w*/gi, sectors: [], market: false },
  { key: "crime", label: "Crime", rx: /\bcrime\b|murder\w*|\bviolent\b|police/gi, sectors: [], market: false },
];

// [display, ticker, pattern]. Case-sensitive on purpose: "Meta", "Apple".
// Left out on purpose: names that are mostly something else on air —
// Mercedes (a person), Carrier (aircraft carriers), NBC (the network), Lilly.
const COMPANY_DEFS: [string, string, string][] = [
  ["Apple", "AAPL", "Apple"], ["Microsoft", "MSFT", "Microsoft"], ["Alphabet", "GOOGL", "Google|Alphabet"], ["Amazon", "AMZN", "Amazon"],
  ["Meta", "META", "Meta"], ["Nvidia", "NVDA", "Nvidia|NVIDIA"], ["Intel", "INTC", "Intel"], ["AMD", "AMD", "AMD"],
  ["Micron", "MU", "Micron"], ["Qualcomm", "QCOM", "Qualcomm"], ["TSMC", "TSM", "TSMC|Taiwan Semiconductor"], ["Samsung", "005930.KS", "Samsung"],
  ["Oracle", "ORCL", "Oracle"], ["IBM", "IBM", "IBM"], ["Palantir", "PLTR", "Palantir"], ["OpenAI", "private", "OpenAI|Open AI"],
  ["Tesla", "TSLA", "Tesla"], ["SpaceX", "SPCX", "SpaceX|Space X"], ["xAI", "private", "xAI"], ["SoftBank", "SFTBY", "SoftBank|Softbank"],
  ["General Motors", "GM", "General Motors|\\bGM\\b"], ["Ford", "F", "Ford(?!,? Ohio)"], ["Stellantis", "STLA", "Stellantis|Chrysler|Jeep"],
  ["Toyota", "TM", "Toyota"], ["Honda", "HMC", "Honda"], ["Hyundai", "HYMTF", "Hyundai"], ["Nissan", "NSANY", "Nissan"], ["BMW", "BMWYY", "BMW"],
  ["Boeing", "BA", "Boeing"], ["Lockheed Martin", "LMT", "Lockheed"], ["RTX", "RTX", "Raytheon|\\bRTX\\b"], ["Northrop Grumman", "NOC", "Northrop"],
  ["General Dynamics", "GD", "General Dynamics"], ["Huntington Ingalls", "HII", "Huntington Ingalls"], ["Anduril", "private", "Anduril|Anderrill"],
  ["Saronic", "private", "Saronic"], ["Hadrian", "private", "Hadrian"], ["Hanwha", "042660.KS", "Hanwha"], ["Austal", "ASB.AX", "Austal"],
  ["Eli Lilly", "LLY", "Eli Lilly"], ["Pfizer", "PFE", "Pfizer"], ["Merck", "MRK", "Merck"], ["Johnson & Johnson", "JNJ", "Johnson (?:&|and) Johnson"],
  ["AstraZeneca", "AZN", "AstraZeneca|Astra Zeneca"], ["Novartis", "NVS", "Novartis"], ["Novo Nordisk", "NVO", "Novo Nordisk"], ["Abbott", "ABT", "Abbott"],
  ["Regeneron", "REGN", "Regeneron"], ["Bristol Myers", "BMY", "Bristol[- ]Myers"], ["Amgen", "AMGN", "Amgen"],
  ["ExxonMobil", "XOM", "Exxon"], ["Chevron", "CVX", "Chevron"], ["ConocoPhillips", "COP", "Conoco"], ["Glenfarne", "private", "Glenfarne"],
  ["Westinghouse", "private", "Westinghouse"], ["GE Vernova", "GEV", "GE Vernova|General Electric"], ["Caterpillar", "CAT", "Caterpillar"],
  ["U.S. Steel", "NPSCY", "U\\.?S\\.? Steel|United States Steel"], ["Nippon Steel", "NPSCY", "Nippon Steel"], ["Nucor", "NUE", "Nucor"], ["Cleveland-Cliffs", "CLF", "Cleveland[- ]Cliffs"],
  ["Mesabi Metallics", "private", "Mesabi"], ["MP Materials", "MP", "MP Materials"], ["Peterbilt", "PCAR", "Peterbilt|Paccar|PACCAR"],
  ["Walmart", "WMT", "Walmart|Wal-Mart"], ["Costco", "COST", "Costco"], ["Coca-Cola", "KO", "Coca[- ]Cola|Coke"], ["McDonald's", "MCD", "McDonald's"],
  ["JPMorgan", "JPM", "JPMorgan|JP Morgan|J\\.P\\. Morgan"], ["Goldman Sachs", "GS", "Goldman"], ["BlackRock", "BLK", "BlackRock|Blackrock"], ["Bank of America", "BAC", "Bank of America"],
  ["TikTok", "private", "TikTok|Tik Tok"], ["Disney", "DIS", "Disney"], ["Netflix", "NFLX", "Netflix"], ["Comcast", "CMCSA", "Comcast"],
  ["Whirlpool", "WHR", "Whirlpool"], ["Harley-Davidson", "HOG", "Harley"], ["UPS", "UPS", "\\bUPS\\b"], ["FedEx", "FDX", "FedEx"],
];
const COUNTRY_DEFS: [string, string][] = [
  ["China", "China|Chinese|Beijing"], ["Japan", "Japan|Japanese|Tokyo"], ["South Korea", "South Korea|Korea\\b|Korean"], ["Taiwan", "Taiwan"],
  ["India", "India\\b|Indian"], ["Mexico", "Mexico|Mexican"], ["Canada", "Canada|Canadian"], ["United Kingdom", "United Kingdom|Britain|British|\\bUK\\b"],
  ["Germany", "Germany|German"], ["France", "France|French"], ["Italy", "Italy|Italian"], ["Ireland", "Ireland|Irish"], ["European Union", "European Union|\\bEU\\b|Europe\\b"],
  ["Russia", "Russia|Russian"], ["Ukraine", "Ukrain\\w*"], ["Israel", "Israel\\w*"], ["Iran", "Iran\\b|Iranian"], ["Saudi Arabia", "Saudi"],
  ["Qatar", "Qatar"], ["UAE", "UAE|United Arab Emirates|Emirat\\w*"], ["Venezuela", "Venezuela\\w*"], ["Brazil", "Brazil\\w*"], ["Argentina", "Argentin\\w*"],
  ["Vietnam", "Vietnam\\w*"], ["Cuba", "Cuba\\b|Cuban"], ["Panama", "Panama"], ["Greenland", "Greenland"], ["Egypt", "Egypt\\w*"], ["Turkey", "Turkey\\b|Turkish"],
];

// People. Two sources, merged by display name:
//  1. a curated list (world leaders, officials, CEOs) that also counts the
//     bare surname they are usually called by ("Biden", "Putin", "Powell");
//  2. any "Firstname Lastname" whose first word is a common first name —
//     this is what catches the midterm candidates and guests nobody would
//     think to put on a list. Bare-surname matching is off for these:
//     "Brown" or "White" alone means nothing.
const PEOPLE_DEFS: [string, string, string][] = [
  ["Joe Biden", "Former president", "Joe Biden|Biden"], ["Barack Obama", "Former president", "Barack (?:Hussein )?Obama|Obama"],
  ["Kamala Harris", "Former VP", "Kamala Harris|Kamala"], ["Hillary Clinton", "Former Sec. of State", "Hillary Clinton|Hillary"],
  ["JD Vance", "Vice President", "JD Vance|J\\.D\\. Vance|Vance"], ["Marco Rubio", "Secretary of State", "Marco Rubio|Rubio"],
  ["Pete Hegseth", "Defense Secretary", "Pete Hegseth|Hegseth"], ["Scott Bessent", "Treasury Secretary", "Scott Bessent|Bessent"],
  ["Howard Lutnick", "Commerce Secretary", "Howard Lutnick|Lutnick"], ["Jerome Powell", "Fed chair", "Jerome Powell|Jay Powell|Powell"],
  ["Karoline Leavitt", "Press secretary", "Karoline Leavitt|Caroline Levitt|Carolyn Levitt|Caroline Leavitt|Leavitt"],
  ["Elon Musk", "CEO, Tesla & SpaceX", "Elon Musk|Elon"], ["Jensen Huang", "CEO, Nvidia", "Jensen Huang|Jensen"], ["Tim Cook", "CEO, Apple", "Tim Cook"],
  ["Nancy Pelosi", "Former Speaker", "Nancy Pelosi|Pelosi"], ["Chuck Schumer", "Senate Dem leader", "Chuck Schumer|Schumer"], ["Mike Johnson", "House Speaker", "Mike Johnson"],
  ["Gavin Newsom", "Governor, California", "Gavin Newsom|Newsom"], ["Zohran Mamdani", "NYC mayor", "Zohran Mamdani|Mamdani"], ["Bernie Sanders", "Senator", "Bernie Sanders|Bernie"],
  ["Charlie Kirk", "", "Charlie Kirk"], ["Xi Jinping", "China", "Xi Jinping|President Xi"], ["Vladimir Putin", "Russia", "Vladimir Putin|Putin"],
  ["Volodymyr Zelensky", "Ukraine", "Zelensky\\w*|Zelenskyy"], ["Benjamin Netanyahu", "Israel", "Netanyahu|Bibi"], ["Kim Jong Un", "North Korea", "Kim Jong[- ]Un"],
  ["Narendra Modi", "India", "Narendra Modi|Modi"], ["Mark Carney", "Canada", "Mark Carney|Carney"], ["Claudia Sheinbaum", "Mexico", "Sheinbaum"],
  ["Keir Starmer", "UK", "Keir Starmer|Starmer"], ["Emmanuel Macron", "France", "Emmanuel Macron|Macron"], ["Giorgia Meloni", "Italy", "Giorgia Meloni|Meloni"],
  ["Recep Erdogan", "Turkey", "Erdogan"], ["Sanae Takaichi", "Japan", "Takaichi"], ["Lee Jae-myung", "South Korea", "Lee Jae[- ]myung|President Lee"],
  ["Nicolás Maduro", "Venezuela", "Maduro"],
  ["Chris Wright", "Energy Secretary", "Chris Wright"], ["Sean Duffy", "Transportation Secretary", "Sean Duffy"], ["Doug Burgum", "Interior Secretary", "Doug Burgum|Burgum"],
  ["Brooke Rollins", "Agriculture Secretary", "Brooke Rollins"], ["Robert F. Kennedy Jr.", "HHS Secretary", "Robert F\\.? Kennedy|RFK"], ["Lee Zeldin", "EPA Administrator", "Lee Zeldin|Zeldin"],
  ["Tulsi Gabbard", "Intelligence Director", "Tulsi Gabbard|Tulsi"], ["Kristi Noem", "Homeland Security", "Kristi Noem|Noem"], ["Stephen Miller", "Deputy chief of staff", "Stephen Miller"],
  ["Dan Sullivan", "Senator, Alaska", "Dan Sullivan"], ["Russell Vought", "OMB Director", "Russell Vought|Vought"], ["Susie Wiles", "Chief of staff", "Susie Wiles"], ["Michael Dell", "CEO, Dell", "Michael Dell"], ["Sam Altman", "CEO, OpenAI", "Sam Altman"], ["Larry Ellison", "Oracle", "Larry Ellison"], ["Mohammed bin Salman", "Saudi Arabia", "bin Salman|\\bMBS\\b"],
];
const FIRST_NAMES = new Set(("James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Zachary Peter Kyle Noah Ethan Jeremy Walter Christian Keith Roger Terry Austin Sean Gerald Carl Harold Dylan Arthur Lawrence Jordan Jesse Bryan Billy Bruce Gabriel Joe Logan Alan Juan Albert Willie Elijah Wayne Randy Vincent Mason Roy Ralph Bobby Russell Bradley Philip Eugene Mike Jim Bob Bill Tom Tim Dan Ken Ted Ron Rick Steve Dave Chris Matt Tony Pete Doug Greg Jeff Lindsey Rand Mitch Tucker Sean Rudy Newt Marco Ron Kristi Sarah Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Karen Nancy Lisa Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle Carol Amanda Melissa Deborah Stephanie Rebecca Laura Sharon Cynthia Kathleen Amy Angela Shirley Anna Brenda Pamela Nicole Emma Samantha Katherine Christine Debra Rachel Catherine Carolyn Janet Ruth Maria Heather Diane Virginia Julie Joyce Victoria Kelly Christina Lauren Joan Evelyn Olivia Judith Megan Cheryl Martha Andrea Frances Hannah Jacqueline Ann Gloria Jean Kathryn Alice Teresa Sara Janice Doris Madison Julia Grace Judy Abigail Marie Denise Beverly Amber Theresa Marilyn Danielle Diana Brittany Natalie Sophia Rose Isabella Alexis Kayla Charlotte Tulsi Kristi Marsha Elise Nikki Lara Kari Dana Susie Marcy Toria Hassan Abdul Jamie Kelly Tina Robin Leslie Casey Taylor Morgan Shannon Lee Dean Glenn Wesley Neil Eric Craig Todd Shane Troy Chad Brent Derek Marcus Lance Curtis Clay Cole Ross Grant Brett Jared Jake Luke Drew Josh Max Sam Ben Nick Alex Jon Don Ed Al Hal Les Lou Mel Sal Vic Ivanka Melania Barron Tiffany Lara Kai Eli Ari Omar Ilhan Rashida Alexandria Gretchen Tammy Kyrsten Joni Marsha Lisa Cindy").split(" "));
const NOT_PEOPLE = new Set(["Jesus Christ", "George Washington", "Abraham Lincoln", "John Quincy", "Thomas Edison", "Steve Jobs", "Thomas Jefferson", "Ronald Reagan"]);
const PEOPLE = PEOPLE_DEFS.map(([name, role, pat]) => ({ name, role, rx: new RegExp(`\\b(?:${pat})\\b`, "g") }));
export const PEOPLE_ROLES = new Map(PEOPLE_DEFS.map(([n, r]) => [n, r]));
const COMPANIES = COMPANY_DEFS.map(([name, ticker, pat]) => ({ name, ticker, rx: new RegExp(`\\b(?:${pat})\\b`, "g") }));
const COUNTRIES = COUNTRY_DEFS.map(([name, pat]) => ({ name, rx: new RegExp(`\\b(?:${pat})`, "g") }));

/* ── Per-broadcast summary ─────────────────────────────────────────── */

interface Snip { t: number | null; text: string }
interface BcSummary {
  v: 3; words: number;
  ppl: Record<string, number>;
  themes: Record<string, number>;
  cos: Record<string, number>;
  ctry: Record<string, number>;
  snip: Record<string, Snip>;   // last mention of each company/country
}

/** Lines are "[m:ss] text" (aligned) or plain text (live era). */
function lines(t: string): { t: number | null; text: string }[] {
  return t.split(/\n+/).map(l => {
    const m = l.match(/^\s*\[(\d+):(\d{2})(?::(\d{2}))?\]\s*(.*)$/);
    if (!m) return { t: null, text: l.trim() };
    const secs = m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
    return { t: secs, text: m[4] };
  }).filter(l => l.text);
}

export function summarize(transcript: string): BcSummary {
  const ls = lines(transcript || "");
  const body = ls.map(l => l.text).join(" ");
  const words = body.split(/\s+/).filter(Boolean).length;
  const count = (rx: RegExp) => (body.match(rx) || []).length;
  const themes: Record<string, number> = {};
  for (const th of THEMES) { const n = count(th.rx); if (n) themes[th.key] = n; }
  const cos: Record<string, number> = {}, ctry: Record<string, number> = {}, snip: Record<string, Snip> = {};
  const lastSnip = (rx: RegExp): Snip | null => {
    for (let i = ls.length - 1; i >= 0; i--) {
      rx.lastIndex = 0;
      if (rx.test(ls[i].text)) {
        const text = [ls[i].text, ls[i + 1]?.text, ls[i + 2]?.text].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 260);
        return { t: ls[i].t, text };
      }
    }
    return null;
  };
  for (const c of COMPANIES) { const n = count(c.rx); if (n) { cos[c.name] = n; const s = lastSnip(c.rx); if (s) snip[c.name] = s; } }
  for (const c of COUNTRIES) { const n = count(c.rx); if (n) { ctry[c.name] = n; const s = lastSnip(c.rx); if (s) snip[c.name] = s; } }
  const ppl: Record<string, number> = {};
  for (const p of PEOPLE) { const n = count(p.rx); if (n) { ppl[p.name] = n; const s = lastSnip(p.rx); if (s) snip[p.name] = s; } }
  // Auto-detected full names, unless a curated entry already covers them.
  const auto: Record<string, number> = {};
  for (const m of body.matchAll(/\b([A-Z][a-z]+) ((?:Mc|Mac|O')?[A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g)) {
    const full = `${m[1]} ${m[2]}`;
    if (!FIRST_NAMES.has(m[1]) || NOT_PEOPLE.has(full) || m[2] === "Trump") continue;
    if (PEOPLE.some(p => { p.rx.lastIndex = 0; return p.rx.test(full); })) continue;
    auto[full] = (auto[full] || 0) + 1;
  }
  for (const [full, n] of Object.entries(auto)) {
    if (n < 2) continue;   // a name said once is usually an aside or a thank-you
    ppl[full] = n;
    const s = lastSnip(new RegExp(`\\b${full}\\b`, "g")); if (s) snip[full] = s;
  }
  return { v: 3, words, themes, cos, ctry, ppl, snip };
}

const SUM_KEY = (id: string) => `radar:bc:v3:${id}`;

/* ── Aggregate ─────────────────────────────────────────────────────── */

export type Status = "rising" | "new" | "watch" | "fading" | "steady";
export interface RadarRow {
  key: string; label: string; sectors: string[]; market: boolean;
  recentRate: number; baseRate: number; recentCount: number; baseCount: number;
  recentBroadcasts: number; z: number; status: Status;
  weekly: number[];      // rate per 10k words, oldest → newest
}
export interface RadarEntity {
  name: string; ticker?: string; role?: string;
  stock?: Stock14;
  tone?: Tone;
  recentCount: number; baseCount: number; recentBroadcasts: number; totalBroadcasts: number;
  status: Status; last: { date: string; videoId: string; title: string; t: number | null; text: string } | null;
  /** First broadcast it was ever named in — set only when that is one of the
   *  last three, i.e. a name that just appeared. */
  firstSeen?: string;
}
export interface Radar {
  generatedAt: string;
  window: { recentFrom: string; to: string; recentBroadcasts: number; recentWords: number; baseBroadcasts: number; baseWords: number };
  coverage: { withTranscript: number; total: number };
  weeks: string[];          // ISO Mondays
  weekWords: number[];
  themes: RadarRow[];
  companies: RadarEntity[];
  countries: RadarEntity[];
  people: RadarEntity[];
}

const RECENT_DAYS = 14;
const WEEKS = 8;
const monday = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Poisson log rate-ratio z, with a half-count so zeros don't explode. */
function rateZ(r: number, wr: number, b: number, wb: number): number {
  if (!wr || !wb) return 0;
  const lr = Math.log((r + 0.5) / wr) - Math.log((b + 0.5) / wb);
  return lr / Math.sqrt(1 / (r + 0.5) + 1 / (b + 0.5));
}
/**
 * The early tier. "Rising" waits for a 14-day window to be convincing; WATCH
 * looks only at the last three broadcasts: at least 3 mentions, spread over
 * at least 2 of them, at twice the rate (or more) of everything before them.
 * Looser on purpose — it is labelled an early signal, and things graduate to
 * Rising when the full test agrees.
 */
const WATCH_N = 3;
function isWatch(cL: number, wL: number, breadthL: number, cPrior: number, wPrior: number): boolean {
  if (cL < 3 || breadthL < 2 || !wL) return false;
  const rL = cL / wL;
  const rP = wPrior ? cPrior / wPrior : 0;
  return rP === 0 || rL >= 2 * rP;
}

function statusOf(z: number, r: number, b: number, breadth: number): Status {
  if (b === 0 && r >= 4 && breadth >= 2) return "new";
  if (z >= 2 && r >= 5 && breadth >= 2) return "rising";
  if (z <= -2 && b >= 5) return "fading";
  return "steady";
}

async function compute(): Promise<Radar> {
  const ledger = (await getLedger()).filter(e => e.videoId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const ids = ledger.map(e => e.videoId);
  const cached = await kvGet(ids.map(SUM_KEY));
  const sums: (BcSummary | null)[] = cached.map(r => { try { return r ? JSON.parse(r) as BcSummary : null; } catch { return null; } });

  // Fill gaps from the transcripts. Bounded per run; results persist, so the
  // radar converges after a run or two and stays cheap afterwards.
  const toSave: [string, string, number][] = [];
  let budget = 40;
  for (let i = 0; i < ids.length && budget > 0; i++) {
    if (sums[i]) continue;
    budget--;
    const b = await getReplayableOne(ids[i]).catch(() => null);
    const s = summarize(b?.transcript || "");
    sums[i] = s;
    // No transcript yet (backfill pending): remember that briefly, not forever.
    toSave.push([SUM_KEY(ids[i]), JSON.stringify(s), s.words > 500 ? 0 : 6 * 3600]);
  }
  if (toSave.length) await kvSetMany(toSave).catch(() => {});
  return aggregate(ledger, sums);
}

type Entry = { videoId: string; title: string; startedAt: string };
/** Pure: summaries in, radar out (kept separate so it can be tested offline). */
export function aggregate(ledger: Entry[], sums: (BcSummary | null)[]): Radar {
  const items = ledger.map((e, i) => ({ e, s: sums[i] })).filter(x => x.s && x.s.v === 3 && x.s.words > 500) as { e: Entry; s: BcSummary }[];
  const lastDate = items.length ? items[items.length - 1].e.startedAt : new Date().toISOString();
  const cutoff = new Date(Date.parse(lastDate) - RECENT_DAYS * 864e5).toISOString();
  const recent = items.filter(x => x.e.startedAt >= cutoff), base = items.filter(x => x.e.startedAt < cutoff);
  const W = (xs: typeof items) => xs.reduce((n, x) => n + x.s.words, 0);
  const wr = W(recent), wb = W(base);
  const lastN = items.slice(-WATCH_N), priorN = items.slice(0, -WATCH_N);
  const wL = W(lastN), wP = W(priorN);

  // Weekly axis: the last WEEKS Mondays up to the latest broadcast.
  const lastMon = monday(lastDate);
  const weeks: string[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    const d = new Date(lastMon + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 7 * k); weeks.push(d.toISOString().slice(0, 10));
  }
  const weekWords = weeks.map(w => W(items.filter(x => monday(x.e.startedAt) === w)));

  const themes: RadarRow[] = THEMES.map(th => {
    const r = recent.reduce((n, x) => n + (x.s.themes[th.key] || 0), 0);
    const b = base.reduce((n, x) => n + (x.s.themes[th.key] || 0), 0);
    const breadth = recent.filter(x => (x.s.themes[th.key] || 0) > 0).length;
    const z = rateZ(r, wr, b, wb);
    const weekly = weeks.map((w, k) => {
      const n = items.filter(x => monday(x.e.startedAt) === w).reduce((m, x) => m + (x.s.themes[th.key] || 0), 0);
      return weekWords[k] ? Math.round((n / weekWords[k]) * 1e5) / 10 : 0;
    });
    const cL = lastN.reduce((n, x) => n + (x.s.themes[th.key] || 0), 0);
    const bL = lastN.filter(x => (x.s.themes[th.key] || 0) > 0).length;
    const cP = priorN.reduce((n, x) => n + (x.s.themes[th.key] || 0), 0);
    let st = statusOf(z, r, b, breadth);
    if (st === "steady" && isWatch(cL, wL, bL, cP, wP)) st = "watch";
    return {
      key: th.key, label: th.label, sectors: th.sectors, market: th.market,
      recentRate: wr ? Math.round((r / wr) * 1e5) / 10 : 0, baseRate: wb ? Math.round((b / wb) * 1e5) / 10 : 0,
      recentCount: r, baseCount: b, recentBroadcasts: breadth, z: Math.round(z * 10) / 10,
      status: st, weekly,
    };
  });

  const entities = (field: "cos" | "ctry" | "ppl", tick?: Map<string, string>): RadarEntity[] => {
    const names = new Set<string>(); items.forEach(x => Object.keys(x.s[field]).forEach(n => names.add(n)));
    return [...names].map(name => {
      const r = recent.reduce((n, x) => n + (x.s[field][name] || 0), 0);
      const b = base.reduce((n, x) => n + (x.s[field][name] || 0), 0);
      const breadth = recent.filter(x => x.s[field][name]).length;
      const total = items.filter(x => x.s[field][name]).length;
      const lastIt = [...items].reverse().find(x => x.s[field][name]);
      const firstIt = items.find(x => x.s[field][name]);
      const sn = lastIt?.s.snip[name];
      const cL = lastN.reduce((n, x) => n + (x.s[field][name] || 0), 0);
      const bL = lastN.filter(x => x.s[field][name]).length;
      const cP = priorN.reduce((n, x) => n + (x.s[field][name] || 0), 0);
      let st = statusOf(rateZ(r, wr, b, wb), r, b, breadth);
      if (st === "steady" && isWatch(cL, wL, bL, cP, wP)) st = "watch";
      const fresh = firstIt && lastN.includes(firstIt) && items.length > WATCH_N;
      return {
        name, ticker: field === "cos" ? tick?.get(name) : undefined, role: field === "ppl" ? (PEOPLE_ROLES.get(name) || undefined) : undefined,
        recentCount: r, baseCount: b, recentBroadcasts: breadth, totalBroadcasts: total,
        firstSeen: fresh ? firstIt!.e.startedAt : undefined,
        status: st,
        last: lastIt && sn ? { date: lastIt.e.startedAt, videoId: lastIt.e.videoId, title: lastIt.e.title, t: sn.t, text: sn.text } : null,
      };
    }).sort((a, b) => (b.recentCount - a.recentCount) || (b.totalBroadcasts - a.totalBroadcasts));
  };

  return {
    generatedAt: new Date().toISOString(),
    window: { recentFrom: cutoff, to: lastDate, recentBroadcasts: recent.length, recentWords: wr, baseBroadcasts: base.length, baseWords: wb },
    coverage: { withTranscript: items.length, total: ledger.length },
    weeks, weekWords,
    themes: themes.sort((a, b) => (Number(b.market) - Number(a.market)) || (b.recentRate - a.recentRate)),
    companies: entities("cos", new Map(COMPANIES.map(c => [c.name, c.ticker]))).slice(0, 40),
    countries: entities("ctry").slice(0, 20),
    people: entities("ppl").filter(p => p.recentCount + p.baseCount >= 3).slice(0, 40),
  };
}

/** The radar plus the two slower enrichments: prices for listed companies
 *  and the tone each name was spoken about in. Either can fail on its own
 *  without taking the radar down. */
async function computeEnriched(): Promise<Radar> {
  const r = await compute();
  const [stocks, tones] = await Promise.all([
    getStocks(r.companies.slice(0, 30).map(c => c.ticker || "")).catch(() => ({} as Record<string, Stock14>)),
    getTones(r).catch(() => ({} as Record<string, Tone>)),
  ]);
  for (const c of r.companies) { if (c.ticker && stocks[c.ticker]) c.stock = stocks[c.ticker]; }
  for (const list of [r.companies, r.people, r.countries]) for (const e of list) { if (tones[e.name]) e.tone = tones[e.name]; }
  return r;
}

/**
 * Cached in KV for 15 minutes. (unstable_cache was serving a stale copy for
 * hours: its background refresh can fail silently, and the stale value is
 * kept forever.) Stale → recompute in the request; summaries and prices are
 * themselves cached, so a refresh is a few reads and one model-free pass.
 */
const RADAR_KEY = "radar:cache:v7";
const RADAR_TTL_MS = 15 * 60_000;
export async function getRadar(): Promise<Radar> {
  try {
    const [raw] = await kvGet([RADAR_KEY]);
    if (raw) {
      const hit = JSON.parse(raw) as Radar;
      if (Date.now() - Date.parse(hit.generatedAt) < RADAR_TTL_MS) return hit;
    }
  } catch { /* fall through and rebuild */ }
  const fresh = await computeEnriched();
  await kvSetMany([[RADAR_KEY, JSON.stringify(fresh), 24 * 3600]]).catch(() => {});
  return fresh;
}

/** The pattern a name is counted by, for finding the sentences that mention it. */
export function entityPattern(name: string): RegExp {
  const hit = [...COMPANIES, ...COUNTRIES, ...PEOPLE].find(e => e.name === name);
  if (hit) return new RegExp(hit.rx.source, "g");
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
}
