// Sources:
// - BASES: DoD FY2024 Base Structure Report + CRS R48123 (July 2024)
// - CSGS: USNI Fleet and Marine Tracker, April 13, 2026 snapshot
// - BTF_EVENTS: DoD / USAF press releases (cited inline)
// - PERSONNEL_BY_COUNTRY: DMDC, March 2024

export type Base = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  personnel: number;
  type: "persistent" | "other_site";
  region: "indopac" | "europe" | "mideast" | "atlantic";
  note: string;
};

export const BASES: Base[] = [
  // Indo-Pacific
  { id:"humphreys", name:"Camp Humphreys", country:"South Korea", lat:36.97, lon:127.03, personnel:21000, type:"persistent", region:"indopac", note:"Largest US base overseas; HQ USFK." },
  { id:"yokosuka", name:"Yokosuka Naval Base", country:"Japan", lat:35.29, lon:139.66, personnel:10000, type:"persistent", region:"indopac", note:"Homeport USS George Washington (CVN-73); HQ US 7th Fleet." },
  { id:"kadena", name:"Kadena Air Base", country:"Japan", lat:26.36, lon:127.77, personnel:7500, type:"persistent", region:"indopac", note:"Largest USAF base in Pacific." },
  { id:"misawa", name:"Misawa Air Base", country:"Japan", lat:40.70, lon:141.37, personnel:5000, type:"persistent", region:"indopac", note:"Host to B-1B BTF deployments." },
  { id:"andersen", name:"Andersen AFB", country:"Guam (US)", lat:13.58, lon:144.92, personnel:6000, type:"persistent", region:"indopac", note:"Forward bomber operating base; B-52 BTF 25-2." },
  { id:"diego_garcia", name:"Diego Garcia", country:"BIOT (UK)", lat:-7.31, lon:72.41, personnel:1500, type:"persistent", region:"indopac", note:"Naval Support Facility; Indian Ocean strategic hub." },
  { id:"jbphh", name:"Joint Base Pearl Harbor-Hickam", country:"Hawaii (US)", lat:21.35, lon:-157.97, personnel:20000, type:"persistent", region:"indopac", note:"HQ INDOPACOM." },
  { id:"naval_base_guam", name:"Naval Base Guam", country:"Guam (US)", lat:13.48, lon:144.78, personnel:4000, type:"persistent", region:"indopac", note:"Joint Region Marianas." },
  // Europe
  { id:"ramstein", name:"Ramstein Air Base", country:"Germany", lat:49.44, lon:7.60, personnel:9000, type:"persistent", region:"europe", note:"HQ USAFE; largest USAF base in Europe." },
  { id:"wiesbaden", name:"US Army Garrison Wiesbaden", country:"Germany", lat:50.05, lon:8.33, personnel:3000, type:"persistent", region:"europe", note:"HQ US Army Europe." },
  { id:"aviano", name:"Aviano Air Base", country:"Italy", lat:46.03, lon:12.60, personnel:4000, type:"persistent", region:"europe", note:"31st Fighter Wing; F-16C." },
  { id:"sigonella", name:"Naval Air Station Sigonella", country:"Italy", lat:37.40, lon:14.92, personnel:3500, type:"persistent", region:"europe", note:"Mediterranean ISR hub." },
  { id:"rota", name:"Naval Station Rota", country:"Spain", lat:36.64, lon:-6.35, personnel:3500, type:"persistent", region:"europe", note:"Forward-deployed destroyers (DDG-80, 79, 84)." },
  { id:"lakenheath", name:"RAF Lakenheath", country:"UK", lat:52.41, lon:0.56, personnel:5000, type:"persistent", region:"europe", note:"48th Fighter Wing; F-35A, F-15E." },
  { id:"fairford", name:"RAF Fairford", country:"UK", lat:51.68, lon:-1.79, personnel:500, type:"persistent", region:"europe", note:"Bomber Task Force forward operating location." },
  { id:"darby", name:"Camp Darby", country:"Italy", lat:43.61, lon:10.41, personnel:1000, type:"persistent", region:"europe", note:"US Army logistics hub." },
  { id:"thule", name:"Pituffik Space Base (Thule AB)", country:"Greenland", lat:76.53, lon:-68.70, personnel:135, type:"persistent", region:"europe", note:"Arctic missile warning. CRS 2024: ~135 active-duty." },
  { id:"keflavik", name:"Keflavik Air Base", country:"Iceland", lat:63.99, lon:-22.60, personnel:50, type:"other_site", region:"europe", note:"P-8 maritime patrol rotational base." },
  { id:"souda", name:"Souda Bay NSA", country:"Greece", lat:35.54, lon:24.15, personnel:350, type:"other_site", region:"europe", note:"Mediterranean support." },
  // Middle East
  { id:"bahrain", name:"NSA Bahrain", country:"Bahrain", lat:26.20, lon:50.61, personnel:3479, type:"persistent", region:"mideast", note:"HQ US 5th Fleet / NAVCENT. DMDC March 2024." },
  { id:"al_udeid", name:"Al Udeid Air Base", country:"Qatar", lat:25.12, lon:51.32, personnel:8000, type:"persistent", region:"mideast", note:"HQ CENTCOM forward; USAF CAOC." },
  { id:"ali_al_salem", name:"Ali Al Salem Air Base", country:"Kuwait", lat:29.35, lon:47.52, personnel:2000, type:"persistent", region:"mideast", note:"386th Air Expeditionary Wing." },
  { id:"prince_sultan", name:"Prince Sultan Air Base", country:"Saudi Arabia", lat:24.06, lon:47.58, personnel:2321, type:"other_site", region:"mideast", note:"Surged since 2019. DMDC March 2024." },
  { id:"muwaffaq_salti", name:"Muwaffaq Salti Air Base", country:"Jordan", lat:32.36, lon:36.25, personnel:3813, type:"other_site", region:"mideast", note:"Expanded operations. DMDC March 2024." },
  // Atlantic
  { id:"gtmo", name:"Naval Station Guantanamo Bay", country:"Cuba", lat:19.90, lon:-75.13, personnel:6000, type:"persistent", region:"atlantic", note:"Oldest overseas US base; established 1903." },
];

export type CSG = {
  id: string;
  name: string;
  type: "CSG" | "ARG";
  lat: number;
  lon: number;
  location: string;
  mission: string;
};

export const CSGS: CSG[] = [
  { id:"ford", name:"USS Gerald R. Ford (CVN-78)", type:"CSG", lat:35.2, lon:19.5, location:"Eastern Mediterranean", mission:"Departed Split, Croatia Apr 2, 2026." },
  { id:"lincoln", name:"USS Abraham Lincoln (CVN-72)", type:"CSG", lat:20.0, lon:64.0, location:"Arabian Sea", mission:"Operation Epic Fury (CENTCOM)." },
  { id:"ghwbush", name:"USS George H.W. Bush (CVN-77)", type:"CSG", lat:15.5, lon:-15.0, location:"Off West Africa coast", mission:"En route to join 5th Fleet buildup." },
  { id:"gw", name:"USS George Washington (CVN-73)", type:"CSG", lat:35.29, lon:139.66, location:"Yokosuka, Japan (in port)", mission:"Forward-deployed 7th Fleet." },
  { id:"nimitz", name:"USS Nimitz (CVN-68)", type:"CSG", lat:5.0, lon:-85.0, location:"Eastern Pacific", mission:"Transiting for decommissioning." },
  { id:"iwo_jima", name:"USS Iwo Jima ARG", type:"ARG", lat:28.0, lon:-76.0, location:"Caribbean", mission:"22nd MEU embarked." },
  { id:"tripoli", name:"USS Tripoli ARG", type:"ARG", lat:-7.31, lon:72.41, location:"Diego Garcia (in port)", mission:"En route to Middle East, 31st MEU." },
  { id:"boxer", name:"USS Boxer ARG", type:"ARG", lat:20.0, lon:-135.0, location:"Eastern Pacific", mission:"11th MEU embarked." },
];

export type BtfEvent = {
  id: string;
  name: string;
  airframe: string;
  origin: string;
  dest: string;
  lat: number;
  lon: number;
  date: string;
  detail: string;
};

export const BTF_EVENTS: BtfEvent[] = [
  { id:"btf243", name:"BTF 24-3", airframe:"B-52H", origin:"Barksdale AFB", dest:"RAF Fairford, UK", lat:51.68, lon:-1.79, date:"May 2024", detail:"Four B-52s from 2nd Bomb Wing; NATO deterrence mission." },
  { id:"btf251eu", name:"BTF 25-1 (Europe)", airframe:"B-52H", origin:"Barksdale AFB", dest:"RAF Fairford, UK", lat:51.68, lon:-1.79, date:"Nov 2024", detail:"20th Expeditionary Bomb Squadron; NATO allies integration." },
  { id:"btf251pac", name:"BTF 25-1 (Pacific)", airframe:"B-1B", origin:"Ellsworth AFB", dest:"Andersen AFB, Guam", lat:13.58, lon:144.92, date:"Jan 2025", detail:"First over-Korean-peninsula drills of Trump II term; ROK F-35/F-15." },
  { id:"btf252", name:"BTF 25-2", airframe:"B-52H", origin:"Minot AFB", dest:"RAF Fairford, UK", lat:51.68, lon:-1.79, date:"Feb 2025", detail:"69th Expeditionary Bomb Squadron; 13 missions over Europe/N Africa/Middle East." },
  { id:"btf253", name:"BTF 25-3", airframe:"B-52H", origin:"Barksdale AFB", dest:"Andersen AFB, Guam", lat:13.58, lon:144.92, date:"May 2025", detail:"Indo-Pacific deployment; first Guam B-52 deployment of 2025." },
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
  { id:"global",   label:"Global",        center:[0, 20]    as [number, number] },
  { id:"indopac",  label:"Indo-Pacific",  center:[130, 15]  as [number, number] },
  { id:"europe",   label:"Europe",        center:[10, 50]   as [number, number] },
  { id:"mideast",  label:"Middle East",   center:[50, 30]   as [number, number] },
  { id:"atlantic", label:"Atlantic",      center:[-40, 25]  as [number, number] },
];

export const HEADER_METRICS = [
  { label:"Overseas bases",     value:"128",     sub:"68 persistent + 60 other", src:"CRS R48123" },
  { label:"CSGs deployed",      value:"5",       sub:"of 11 total carriers",     src:"USNI Apr 13 2026" },
  { label:"ARGs deployed",      value:"3",       sub:"22nd, 11th, 31st MEU",     src:"USNI" },
  { label:"Battle Force total", value:"291",     sub:"108 deployed",             src:"USNI" },
  { label:"Personnel Germany",  value:"35,068",  sub:"largest overseas",         src:"DMDC Mar 2024" },
  { label:"Personnel Japan",    value:"~55,000", sub:"incl. FDNF",               src:"DoD" },
];
