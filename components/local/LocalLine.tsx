"use client";
import { localLine, type LocalTopic } from "@/lib/local-shared";
import { useLocalSnapshot } from "@/lib/local-client";
import { LOCAL_INK } from "./LocationPicker";

/** One line of local context under a national figure. Renders nothing until
 *  the reader has picked a location. Context only — never part of a verdict. */
export default function LocalLine({ topic, tone = "light", size = "md" }: { topic: LocalTopic | null; tone?: "light" | "dark"; size?: "sm" | "md" }) {
  const { snap } = useLocalSnapshot();
  if (!topic || !snap) return null;
  const l = localLine(snap, topic);
  if (!l) return null;
  const dark = tone === "dark";
  const ink = dark ? "#B9A6F0" : LOCAL_INK;
  const fs = size === "sm" ? 12 : 13.5;
  return (
    <div data-nosnippet onClick={e => e.stopPropagation()} style={{ borderLeft: `2px solid ${ink}`, padding: "3px 0 3px 10px", marginTop: size === "sm" ? 8 : 12, fontSize: fs, lineHeight: 1.45 }}>
      <span style={{ fontWeight: 700, color: ink }}>{l.head}</span>
      <span style={{ color: dark ? "rgba(244,240,234,.7)" : "#5c5856" }}> · {l.tail}</span>
      <div style={{ fontSize: fs - 2, color: dark ? "rgba(244,240,234,.5)" : "#8c8479", marginTop: 1 }}>
        Your area, for context. The verdict uses the national figure. <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{l.source}</a>
      </div>
    </div>
  );
}
