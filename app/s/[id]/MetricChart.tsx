"use client";
import ProChart from "@/components/trending/ProChart";
import type { SeriesData } from "@/lib/series";

/** The Trending chart, anchored at today, with no claim on it. */
export default function MetricChart({ data }: { data: SeriesData }) {
  return <ProChart data={data} said={null} claimDate={new Date().toISOString()} tone="#0E7477" noClaim />;
}
