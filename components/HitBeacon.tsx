"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Counts one visit per page per tab session (see lib/traffic). */
export default function HitBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    try {
      const k = `vu-hit:${path}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    const sp = new URLSearchParams(window.location.search);
    const body = JSON.stringify({ path, utm_source: sp.get("utm_source"), utm_content: sp.get("utm_content"), utm_campaign: sp.get("utm_campaign") });
    try {
      if (!navigator.sendBeacon?.("/api/hit", new Blob([body], { type: "application/json" }))) {
        fetch("/api/hit", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch {}
  }, [path]);
  return null;
}
