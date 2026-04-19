"use client";
import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";

const LIGHT = {
  bg: "#f8f5f0",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  gold: "#a67c00",
  blue: "#1d4ed8",
  red: "#be123c",
  highlight: "#fef9e7",
  paper: "#f3ede5",
  improve: { strong: "#0d7377", medium: "#14a3a8", light: "#8ee3e6" },
  decline: { strong: "#c2410c", medium: "#ea580c", light: "#fed7aa" },
  neutral: "#d4cfc5",
  globe: {
    ocean: "#dce8f0",
    land: "#e8e2d8",
    landStroke: "#c4bfb4",
    graticule: "#c4bfb4",
    gradCenter: "#f5f0e8",
    gradEdge: "#b8ccd6",
    labelHalo: "#f5f0e8",
    markerStroke: "#fff",
    containerBg: "#fff",
    zoomBtnBg: "#fff",
    zoomBtnBorder: "#e2ded6",
    zoomBtnColor: "#1a1a1a",
  },
};

const DARK = {
  bg: "#111111",
  card: "#1a1a1a",
  ink: "#e8e4df",
  sub: "#a09a94",
  mute: "#6b6560",
  rule: "#2a2725",
  accent: "#e05a50",
  gold: "#d4a740",
  blue: "#6b9cfa",
  red: "#f06080",
  highlight: "#2a2520",
  paper: "#1e1c1a",
  improve: { strong: "#15b8bd", medium: "#1cd4d9", light: "#0a5c5e" },
  decline: { strong: "#f07030", medium: "#f08040", light: "#5c2a0a" },
  neutral: "#3a3630",
  globe: {
    ocean: "#1a2a35",
    land: "#2a2620",
    landStroke: "#3a3630",
    graticule: "#3a3630",
    gradCenter: "#1e2a30",
    gradEdge: "#0e1820",
    labelHalo: "#1a2a35",
    markerStroke: "#111",
    containerBg: "#1a1a1a",
    zoomBtnBg: "#2a2725",
    zoomBtnBorder: "#3a3630",
    zoomBtnColor: "#e8e4df",
  },
};

export type Theme = typeof LIGHT;

export function getTheme(dark: boolean): Theme {
  return dark ? DARK : LIGHT;
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ol-theme") as ThemeMode | null;
    if (saved && (saved === "light" || saved === "dark" || saved === "system")) {
      setModeState(saved);
    }
    setSystemDark(getSystemDark());
  }, []);

  // Listen for system changes
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const isDark = mode === "dark" || (mode === "system" && systemDark);

  // Apply .dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem("ol-theme", m);
  }, []);

  const toggle = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  return { mode, isDark, setMode, toggle, theme: getTheme(isDark) };
}
