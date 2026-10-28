"use client";
import type { LocalTopic } from "@/lib/local-shared";
import { useLoc } from "@/lib/local-client";
import LocalLine from "./LocalLine";
import LocationPicker from "./LocationPicker";

/** Local context for one figure: the local line once a location is set,
 *  otherwise a small prompt. Only rendered where a local figure exists. */
export default function LocalSlot({ topic }: { topic: LocalTopic | null }) {
  const loc = useLoc();
  if (!topic) return null;
  return (
    <div data-nosnippet style={{ marginTop: 12, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>{loc ? <LocalLine topic={topic} /> : <span style={{ fontSize: 13, color: "#8C8479" }}>This figure differs by region.</span>}</div>
      <LocationPicker compact={!!loc} cta="See your area" />
    </div>
  );
}
