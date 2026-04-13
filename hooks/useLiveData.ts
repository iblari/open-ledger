"use client";
import { useState, useEffect, useRef } from "react";

interface DataPoint {
  y: number;
  v: number;
  a: string;
}

interface Metric {
  l: string;
  s: string;
  src: string;
  u: string;
  inv: boolean;
  cat: string;
  d: DataPoint[];
  [key: string]: unknown; // preserves def, bench, ctx, facts, etc.
}

type MetricsMap = Record<string, Metric>;

interface FREDResponse {
  lastUpdated?: string;
  metrics?: Record<string, DataPoint[]>;
  source?: string;
  error?: string;
  usingFallback?: boolean;
}

interface UseLiveDataReturn {
  data: MetricsMap;
  lastUpdated: string | null;
  isLive: boolean;
  loading: boolean;
}

export function useLiveData(fallback: MetricsMap): UseLiveDataReturn {
  const [data, setData] = useState<MetricsMap>(fallback);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    fetch("/api/economic-data")
      .then((res) => res.json())
      .then((json: FREDResponse) => {
        if (json.error || json.usingFallback || !json.metrics) {
          console.log("[Open Ledger] Using fallback (hardcoded) data:", json.error || "no metrics returned");
          setLoading(false);
          return;
        }

        // Merge live data into fallback: keep all metadata, only replace d[]
        const merged: MetricsMap = { ...fallback };
        for (const key of Object.keys(fallback)) {
          if (json.metrics[key] && json.metrics[key].length > 0) {
            merged[key] = { ...fallback[key], d: json.metrics[key] };
          }
          // If no live data for this key (e.g. poverty, inequality), keep fallback
        }

        setData(merged);
        setLastUpdated(json.lastUpdated || null);
        setIsLive(true);
        setLoading(false);
        console.log(
          `[Open Ledger] Live FRED data loaded — ${Object.keys(json.metrics).length} metrics updated · ${json.lastUpdated}`
        );
      })
      .catch((err) => {
        console.log("[Open Ledger] Using fallback (hardcoded) data — fetch error:", err.message);
        setLoading(false);
      });
  }, [fallback]);

  return { data, lastUpdated, isLive, loading };
}
