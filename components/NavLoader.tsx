"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BODY, FAR_LEGS, HEAD, markBars } from "@/lib/cheetah-mark";

/**
 * Page-change loader. When someone taps a link to another page, the tapped
 * tab gets its red underline straight away, repeat taps are ignored, and if
 * the page takes more than a moment the cheetah draws itself in stripe by
 * stripe in the middle of the screen until the new page arrives.
 */
const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 15_000;

function target(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  let u: URL;
  try { u = new URL(a.href, location.href); } catch { return null; }
  if (u.origin !== location.origin) return null;
  if (/^\/(api|og)\//.test(u.pathname) || /\.[a-z0-9]{2,5}$/i.test(u.pathname)) return null;
  if (u.pathname === location.pathname && u.search === location.search) return null; // same page or #hash
  return a;
}

export default function NavLoader() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [top, setTop] = useState(0);
  const pending = useRef<{ a: HTMLAnchorElement; nav: Element | null; t1: number; t2: number; t3: number } | null>(null);

  const clear = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.t1); clearTimeout(p.t2); clearInterval(p.t3);
    p.a.removeAttribute("data-vu-pending");
    p.nav?.removeAttribute("data-vu-pending");
    pending.current = null;
    setShow(false);
  };

  useEffect(() => {
    // Capture phase: while a page is on its way, swallow repeat taps on links.
    const onCapture = (e: MouseEvent) => {
      if (pending.current && (e.target as Element | null)?.closest?.("a[href]")) { e.preventDefault(); e.stopPropagation(); }
    };
    // Bubble phase (after the page's own click handlers): only real navigations.
    const onClick = (e: MouseEvent) => {
      if (pending.current) return;
      const a = target(e);
      if (!a) return;
      const nav = a.parentElement?.matches(".vuc-nav, .ol-nav-wrap") ? a.parentElement : null;
      a.setAttribute("data-vu-pending", "");
      nav?.setAttribute("data-vu-pending", "");
      const chrome = document.querySelector(".vu-chrome");
      setTop(chrome ? Math.max(0, chrome.getBoundingClientRect().bottom) : 0);
      const from = location.href;
      pending.current = {
        a, nav,
        t1: window.setTimeout(() => setShow(true), SHOW_AFTER_MS),
        t2: window.setTimeout(clear, GIVE_UP_MS),
        // Same-path links (?metric=…) don't change the pathname; watch the URL instead.
        t3: window.setInterval(() => { if (location.href !== from) setTimeout(clear, 50); }, 100),
      };
    };
    document.addEventListener("click", onCapture, true);
    document.addEventListener("click", onClick);
    // Back/forward cache: a restored page must not keep a stale loader.
    const onShow = () => clear();
    window.addEventListener("pageshow", onShow);
    return () => { document.removeEventListener("click", onCapture, true); document.removeEventListener("click", onClick); window.removeEventListener("pageshow", onShow); };
  }, []);

  // New route rendered: done.
  useEffect(() => { clear(); }, [pathname]);

  return (
    <>
      <style>{`
        [data-vu-pending]>a:not([data-vu-pending]),[data-vu-pending]>button{border-bottom-color:transparent!important;color:#9a9288!important}
        [data-vu-pending]>a[data-vu-pending]{border-bottom-color:#C1272D!important;color:#1d1a17!important}
        .vu-ld{position:fixed;left:0;right:0;bottom:0;z-index:45;display:grid;place-items:center;background:rgba(247,244,239,.82);animation:vuLdIn .2s ease}
        @keyframes vuLdIn{from{opacity:0}to{opacity:1}}
        .vu-ld rect{transform-box:fill-box;transform-origin:left;transform:scaleX(0);animation:vuWipe 1.6s cubic-bezier(.6,0,.3,1) infinite}
        @keyframes vuWipe{0%{transform:scaleX(0);opacity:1}45%,70%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}
        @media (prefers-reduced-motion:reduce){.vu-ld rect{animation:none;transform:none}}
      `}</style>
      {show && (
        <div className="vu-ld" style={{ top }} role="status" aria-live="polite">
          <svg width={132} height={44} viewBox="0 20 240 80" aria-label="Loading">
            <defs>
              <clipPath id="vu-ld-c">
                {markBars(7).map((b, i) => <rect key={b.y} x={0} y={b.y} width={240} height={b.h} style={{ animationDelay: `${i * 0.07}s` }} />)}
              </clipPath>
            </defs>
            <g clipPath="url(#vu-ld-c)">
              <path d={`${FAR_LEGS} ${BODY}`} fill="#1d1a17" />
              <path d={HEAD} fill="#E0493A" />
            </g>
          </svg>
        </div>
      )}
    </>
  );
}
