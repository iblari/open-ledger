// Sources:
// - BASES: DoD FY2024 Base Structure Report + CRS R48123 (July 2024)
// - CSGS: USNI Fleet and Marine Tracker, April 13, 2026 snapshot
// - BTF_EVENTS: DoD / USAF press releases (cited inline)
// - PERSONNEL_BY_COUNTRY: DMDC, March 2024

export type AssetType = "carrier" | "arg" | "base" | "bomber" | "drone" | "sub";
export type AlertLevel = "normal" | "elevated" | "high" | "critical";
export type Theater = "ME" | "IP" | "EU" | "AT";

export type PostureAsset = {
  id: string;
  type: AssetType;
  name: string;
  short: string;
  lat: number;
  lon: number;
  theater: Theater;
  alert: AlertLevel;
  mission: string;
  assets: string;
  updated: string;
};

export const ASSET_TYPES: Record<AssetType, { label: string; glyph: string }> = {
  carrier: { label: "Carrier", glyph: "\u25C6" },
  arg: { label: "ARG / MEU", glyph: "\u25C7" },
  base: { label: "Base", glyph: "\u25A0" },
  bomber: { label: "Bomber", glyph: "\u25B2" },
  drone: { label: "ISR", glyph: "\u2715" },
  sub: { label: "Submarine", glyph: "\u25CF" },
};

export const ALERT_COLORS: Record<AlertLevel, string> = {
  normal: "#0d7377",
  elevated: "#a67c00",
  high: "#c2410c",
  critical: "#b8372d",
};

export const THEATER_COLORS: Record<string, string> = {
  ALL: "#00ff88",
  ME: "#ff4444",
  IP: "#ffcc33",
  EU: "#66ccff",
  AT: "#aaaaaa",
};

export const POSTURE_ASSETS: PostureAsset[] = [
  // Carrier Strike Groups
  { id:"csg-gerald-ford", type:"carrier", name:"USS Gerald R. Ford (CVN-78)", short:"CSG-12", lat:34.8, lon:33.6, theater:"ME", alert:"high", mission:"Eastern Mediterranean deterrence patrol; air wing CVW-8 aboard.", assets:"90+ aircraft \u00b7 4 escorts \u00b7 nuclear propulsion", updated:"6 min ago" },
  { id:"csg-truman", type:"carrier", name:"USS Harry S. Truman (CVN-75)", short:"CSG-8", lat:15.4, lon:61.2, theater:"ME", alert:"critical", mission:"Red Sea / Arabian Sea operations; strike ops against Houthi targets reported.", assets:"74 aircraft \u00b7 5 escorts", updated:"2 min ago" },
  { id:"csg-reagan", type:"carrier", name:"USS Ronald Reagan (CVN-76)", short:"CSG-5", lat:33.6, lon:135.0, theater:"IP", alert:"elevated", mission:"Forward-deployed from Yokosuka; Western Pacific patrol.", assets:"70 aircraft \u00b7 6 escorts", updated:"14 min ago" },
  { id:"csg-roosevelt", type:"carrier", name:"USS Theodore Roosevelt (CVN-71)", short:"CSG-9", lat:22.0, lon:118.5, theater:"IP", alert:"elevated", mission:"South China Sea FONOP; dual-carrier ops with Reagan.", assets:"72 aircraft \u00b7 5 escorts", updated:"22 min ago" },
  { id:"csg-washington", type:"carrier", name:"USS George Washington (CVN-73)", short:"CSG-11", lat:36.0, lon:-76.0, theater:"AT", alert:"normal", mission:"Post-RCOH workups off Virginia Capes.", assets:"Air wing integration", updated:"1 hr ago" },
  // ARGs
  { id:"arg-bataan", type:"arg", name:"USS Bataan ARG", short:"ARG", lat:26.5, lon:52.0, theater:"ME", alert:"high", mission:"Persian Gulf; 26th MEU embarked.", assets:"3 ships \u00b7 2,200 Marines", updated:"11 min ago" },
  // Major Bases
  { id:"base-ramstein", type:"base", name:"Ramstein Air Base", short:"RAM", lat:49.44, lon:7.60, theater:"EU", alert:"elevated", mission:"USAFE HQ. Logistics hub for Ukraine & Middle East ops.", assets:"C-17, C-130J, KC-46 \u00b7 8,500 personnel", updated:"live" },
  { id:"base-aviano", type:"base", name:"Aviano Air Base", short:"AVI", lat:46.03, lon:12.60, theater:"EU", alert:"normal", mission:"31st FW; F-16C Fighting Falcons.", assets:"2 F-16 squadrons", updated:"live" },
  { id:"base-incirlik", type:"base", name:"Incirlik Air Base", short:"INC", lat:37.00, lon:35.42, theater:"ME", alert:"elevated", mission:"CENTCOM support hub, Turkey.", assets:"KC-135 tankers \u00b7 nuclear storage (public reporting)", updated:"live" },
  { id:"base-aludeid", type:"base", name:"Al Udeid Air Base", short:"AUD", lat:25.12, lon:51.32, theater:"ME", alert:"high", mission:"CENTCOM forward HQ, Qatar. CAOC for regional air ops.", assets:"KC-135, E-3, B-1B rotational", updated:"live" },
  { id:"base-diegogarcia", type:"base", name:"Diego Garcia NSF", short:"DGA", lat:-7.31, lon:72.41, theater:"ME", alert:"critical", mission:"Strategic bomber hub; 6x B-2 deployed per public imagery.", assets:"B-2 Spirit \u00b7 B-52H \u00b7 KC-135", updated:"live" },
  { id:"base-guam", type:"base", name:"Andersen AFB / Naval Base Guam", short:"GUA", lat:13.58, lon:144.92, theater:"IP", alert:"high", mission:"Pacific power projection. Bomber task force rotations.", assets:"B-1B \u00b7 B-52H \u00b7 submarine tender", updated:"live" },
  { id:"base-kadena", type:"base", name:"Kadena Air Base", short:"KAD", lat:26.36, lon:127.77, theater:"IP", alert:"elevated", mission:"18th Wing; F-15C retired, F-22 and F-35A rotational.", assets:"F-22 Raptor \u00b7 F-35A \u00b7 KC-135", updated:"live" },
  { id:"base-yokosuka", type:"base", name:"CFAY Yokosuka", short:"YOK", lat:35.29, lon:139.66, theater:"IP", alert:"elevated", mission:"7th Fleet HQ; Reagan's home port.", assets:"AEGIS destroyers \u00b7 cruiser", updated:"live" },
  { id:"base-osan", type:"base", name:"Osan Air Base", short:"OSN", lat:37.09, lon:127.03, theater:"IP", alert:"normal", mission:"7th AF HQ; F-16 and A-10.", assets:"F-16 \u00b7 A-10 \u00b7 U-2 recon", updated:"live" },
  { id:"base-powidz", type:"base", name:"Powidz Air Base (APS-2)", short:"POW", lat:52.38, lon:17.85, theater:"EU", alert:"high", mission:"US Army prepositioned stocks; Poland.", assets:"Armored brigade set \u00b7 tanks \u00b7 Bradleys", updated:"live" },
  { id:"base-mihail", type:"base", name:"Mihail Kogalniceanu AB", short:"MK", lat:44.36, lon:28.49, theater:"EU", alert:"elevated", mission:"Black Sea rotational base; expanding to NATO's largest.", assets:"MQ-9 \u00b7 rotational infantry", updated:"live" },
  { id:"base-rota", type:"base", name:"Naval Station Rota", short:"ROT", lat:36.64, lon:-6.35, theater:"EU", alert:"normal", mission:"4 AEGIS destroyers forward deployed; Spain.", assets:"DDG-51 class x 4", updated:"live" },
  // Bombers in-flight
  { id:"b2-flight-1", type:"bomber", name:"B-2 Spirit (GHOST-11)", short:"B-2", lat:5.2, lon:68.5, theater:"ME", alert:"high", mission:"Long-range strike patrol from Diego Garcia.", assets:"2-ship element \u00b7 ~6,000 nmi range", updated:"3 min ago" },
  { id:"b52-flight-1", type:"bomber", name:"B-52H (BUFF-21)", short:"B-52", lat:53.0, lon:20.0, theater:"EU", alert:"elevated", mission:"NATO Baltic air policing sortie; escorted by F-35s.", assets:"2-ship element", updated:"8 min ago" },
  { id:"b1-flight-1", type:"bomber", name:"B-1B Lancer (LANCER-05)", short:"B-1", lat:28.0, lon:138.0, theater:"IP", alert:"elevated", mission:"Bomber Task Force from Guam; Japan interop sortie.", assets:"4-ship element", updated:"17 min ago" },
  // ISR / Drones
  { id:"mq9-1", type:"drone", name:"MQ-9 Reaper", short:"MQ-9", lat:32.8, lon:44.2, theater:"ME", alert:"high", mission:"ISR orbit over Iraq; CENTCOM tasking.", assets:"24+ hr loiter", updated:"live" },
  { id:"rc135-1", type:"drone", name:"RC-135 Rivet Joint", short:"RC-135", lat:44.8, lon:32.5, theater:"EU", alert:"elevated", mission:"SIGINT orbit near Ukraine airspace from UK.", assets:"Tail: 64-14841", updated:"live" },
  { id:"p8-1", type:"drone", name:"P-8A Poseidon", short:"P-8", lat:21.5, lon:119.5, theater:"IP", alert:"elevated", mission:"ASW patrol, Taiwan Strait approaches.", assets:"VP-26 Tridents", updated:"live" },
  // Submarines
  { id:"ssgn-florida", type:"sub", name:"USS Florida (SSGN-728)", short:"SSGN", lat:25.5, lon:50.8, theater:"ME", alert:"critical", mission:"Guided-missile submarine; public port call confirmed.", assets:"154 Tomahawk capacity", updated:"4 days ago" },
  { id:"ssn-seawolf", type:"sub", name:"USS Seawolf (SSN-21)", short:"SSN", lat:58.9, lon:5.7, theater:"EU", alert:"elevated", mission:"Norway port visit confirmed; under-ice trained.", assets:"Fast-attack", updated:"12 days ago" },
];

export type PersonnelCountry = {
  country: string;
  count: number;
  lat: number;
  lon: number;
};

export const PERSONNEL_BY_COUNTRY: PersonnelCountry[] = [
  { country:"Japan", count:55000, lat:36, lon:138 },
  { country:"Germany", count:35068, lat:51, lon:10 },
  { country:"South Korea", count:25000, lat:37, lon:128 },
  { country:"Italy", count:12375, lat:42, lon:13 },
  { country:"United Kingdom", count:10058, lat:54, lon:-2 },
  { country:"Spain", count:3500, lat:40, lon:-4 },
  { country:"Jordan", count:3813, lat:31, lon:36 },
  { country:"Bahrain", count:3479, lat:26, lon:50 },
  { country:"Saudi Arabia", count:2321, lat:24, lon:45 },
  { country:"Turkey", count:1700, lat:39, lon:35 },
];

export const THEATERS = [
  { id:"ALL",      label:"All theaters",   center:[0, 20]    as [number, number] },
  { id:"ME",       label:"Middle East",    center:[50, 30]   as [number, number] },
  { id:"IP",       label:"Indo-Pacific",   center:[130, 15]  as [number, number] },
  { id:"EU",       label:"Europe",         center:[10, 50]   as [number, number] },
  { id:"AT",       label:"Atlantic",       center:[-40, 25]  as [number, number] },
];

export const HEADER_METRICS = [
  { label:"Overseas bases",     value:"128",     sub:"68 persistent + 60 other", src:"CRS R48123" },
  { label:"CSGs deployed",      value:"5",       sub:"of 11 total carriers",     src:"USNI Apr 13 2026" },
  { label:"ARGs deployed",      value:"3",       sub:"22nd, 11th, 31st MEU",     src:"USNI" },
  { label:"Battle Force total", value:"291",     sub:"108 deployed",             src:"USNI" },
  { label:"Personnel Germany",  value:"35,068",  sub:"largest overseas",         src:"DMDC Mar 2024" },
  { label:"Personnel Japan",    value:"~55,000", sub:"incl. FDNF",               src:"DoD" },
];
