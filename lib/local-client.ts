"use client";
import { useEffect, useState } from "react";
import { LOC_COOKIE, parseLoc, locValue, type Housing, type Loc, type LocalSnapshot } from "./local-shared";

/**
 * The reader's location, shared by every component on the page.
 * Stored in a first-party cookie (a year), never inferred from IP.
 * Changing it notifies every mounted component at once.
 */
const EVT = "vu-loc-change";
export function readLoc(): Loc | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOC_COOKIE}=([^;]*)`));
  return parseLoc(m ? decodeURIComponent(m[1]) : null);
}
export function writeLoc(code: string | null, housing: Housing = "renter") {
  document.cookie = code
    ? `${LOC_COOKIE}=${locValue(code, housing)}; Path=/; Max-Age=31536000; SameSite=Lax`
    : `${LOC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new Event(EVT));
}
export function useLoc(): Loc | null {
  const [loc, setLoc] = useState<Loc | null>(null);
  useEffect(() => {
    const f = () => setLoc(readLoc());
    f();
    window.addEventListener(EVT, f);
    return () => window.removeEventListener(EVT, f);
  }, []);
  return loc;
}

const cache = new Map<string, Promise<LocalSnapshot | null>>();
export function fetchSnapshot(code: string, housing: Housing): Promise<LocalSnapshot | null> {
  const k = `${code}:${housing}`;
  if (!cache.has(k)) cache.set(k, fetch(`/api/local?state=${code}&housing=${housing}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(k)!;
}
/** The snapshot for the saved location, or null when none is set. */
export function useLocalSnapshot(): { loc: Loc | null; snap: LocalSnapshot | null } {
  const loc = useLoc();
  const [snap, setSnap] = useState<LocalSnapshot | null>(null);
  useEffect(() => {
    if (!loc) { setSnap(null); return; }
    let on = true;
    fetchSnapshot(loc.state.code, loc.housing).then(s => { if (on) setSnap(s); });
    return () => { on = false; };
  }, [loc?.state.code, loc?.housing]);
  return { loc, snap };
}

/** Regional annual series for a Data-tab metric (gas, inflation), or null. */
export function useLocalAnnual(metric: string): import("./local").LocalAnnual | null {
  const loc = useLoc();
  const [d, setD] = useState<import("./local").LocalAnnual | null>(null);
  useEffect(() => {
    if (!loc || (metric !== "gas" && metric !== "inflation")) { setD(null); return; }
    let on = true;
    fetch(`/api/local/annual?metric=${metric}&state=${loc.state.code}`).then(r => (r.ok ? r.json() : null)).then(j => { if (on) setD(j?.ok ? j : null); }).catch(() => {});
    return () => { on = false; };
  }, [loc?.state.code, metric]);
  return d;
}

/** Your region across the current term (same point in office view), or null. */
export function useLocalTerm(metric: string): import("./local").LocalTerm | null {
  const loc = useLoc();
  const [d, setD] = useState<import("./local").LocalTerm | null>(null);
  useEffect(() => {
    if (!loc || (metric !== "gas" && metric !== "inflation")) { setD(null); return; }
    let on = true;
    fetch(`/api/local/term?metric=${metric}&state=${loc.state.code}`).then(r => (r.ok ? r.json() : null)).then(j => { if (on) setD(j?.ok ? j : null); }).catch(() => {});
    return () => { on = false; };
  }, [loc?.state.code, metric]);
  return d;
}
