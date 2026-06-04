// Live Benchmark moved into the dashboard as a 5th tab so it inherits the
// shared header, navigation, and editorial design language. This page is a
// thin client-side redirect kept around so any inbound links / bookmarks
// (e.g. shared X posts) still land on the right place.
//
// The original implementation lived inline in this file (~915 lines) — its
// content is now in components/LiveBenchmark.tsx, rendered when
// dashboard's `tab === "live_benchmark"`.

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LiveBenchmarkRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard?tab=live_benchmark");
  }, [router]);

  // Brief visible state while the redirect runs — avoids a flash of blank.
  return (
    <div style={{
      minHeight: "100vh", background: "#f8f5f0",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', system-ui, sans-serif", color: "#5c5856",
      fontSize: 13,
    }}>
      Redirecting to the dashboard&hellip;
    </div>
  );
}
