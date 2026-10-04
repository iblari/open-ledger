"use client";

/**
 * Server-informed viewport width.
 *
 * Every page that has a phone layout used to start from a guess: the server
 * has no window, so it rendered the DESKTOP layout, and phones swapped to the
 * mobile one after loading — the flash of desktop UI on every visit. Worse,
 * some hooks read window.innerWidth during the first client render, so the
 * client disagreed with the server's HTML (React error #418) and React threw
 * the server markup away.
 *
 * The root layout reads the request's User-Agent / Client Hints and passes
 * "this is probably a phone" down here. Server and first client render both
 * start from that same guess (so they match), phones get phone HTML in the
 * first byte, and the real width takes over right after mount.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const MobileHint = createContext(false);

export function ViewportProvider({ mobile, children }: { mobile: boolean; children: ReactNode }) {
  return <MobileHint.Provider value={mobile}>{children}</MobileHint.Provider>;
}

/** Window width; before mount, a representative width for the device class. */
export function useViewportWidth(): number {
  const mobile = useContext(MobileHint);
  const [w, setW] = useState(mobile ? 390 : 1280);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

export function useIsMobileViewport(breakpoint = 768): boolean {
  return useViewportWidth() < breakpoint;
}
