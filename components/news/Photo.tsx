"use client";
import { useState } from "react";

/**
 * A story photo from an outlet's own feed. Loaded straight from the outlet
 * (no referrer), credited, and replaced by a plain topic tile if it fails.
 */
export default function Photo({ src, alt, topic, credit, ratio = "16 / 9", radius = 0, priority = false }: {
  src?: string | null; alt: string; topic: string; credit?: string | null; ratio?: string; radius?: number; priority?: boolean;
}) {
  const [bad, setBad] = useState(!src);
  return (
    <span style={{ display: "block", position: "relative", aspectRatio: ratio, overflow: "hidden", borderRadius: radius, background: "#1d1a17" }}>
      {!bad && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} decoding="async"
          onError={() => setBad(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: "10%", background: "linear-gradient(135deg,#2a2622,#14110e)", color: "#d8d2c8", fontSize: "clamp(11px,1.4vw,15px)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{topic}</span>
      )}
      {credit && !bad && (
        <span style={{ position: "absolute", right: 0, bottom: 0, background: "rgba(0,0,0,.55)", color: "#eee", fontSize: 10, padding: "2px 6px", borderTopLeftRadius: 4 }}>Photo: {credit}</span>
      )}
    </span>
  );
}
