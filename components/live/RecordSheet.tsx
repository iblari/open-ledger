"use client";

/**
 * The record — export sheet (spec 2a).
 * Format + three include toggles, then a client-side download. No server
 * round-trip: everything needed is already on the page.
 */

import { useState } from "react";
import { L, F } from "@/lib/live-design";
import { buildMarkdown, buildCsv, buildText, type RecordClaim, type RecordMeta } from "@/lib/live-record";

type Fmt = "md" | "csv" | "txt";

export default function RecordSheet({
  open, onClose, meta, claims, transcript,
}: { open: boolean; onClose: () => void; meta: RecordMeta; claims: RecordClaim[]; transcript?: string }) {
  const [fmt, setFmt] = useState<Fmt>("md");
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [contradictedOnly, setContradictedOnly] = useState(false);
  if (!open) return null;

  const download = () => {
    const o = { transcript, includeTranscript, includeSources, contradictedOnly };
    const body = fmt === "csv" ? buildCsv(claims, o) : fmt === "txt" ? buildText(meta, claims, o) : buildMarkdown(meta, claims, o);
    const mime = fmt === "csv" ? "text/csv" : "text/plain";
    const slug = meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50).replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
    a.download = `${slug || "fact-check-record"}-${meta.date}.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);
    onClose();
  };

  const Toggle = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) => (
    <button onClick={() => set(!on)} style={{
      display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left",
      background: "none", border: "none", padding: "9px 0", cursor: "pointer",
    }}>
      <span style={{
        width: 17, height: 17, borderRadius: 4, flexShrink: 0, marginTop: 1,
        border: `1px solid ${on ? L.true : L.cardBorder}`, background: on ? L.true : "transparent",
        color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
      }}>{on ? "✓" : ""}</span>
      <span>
        <span style={{ display: "block", fontFamily: F.ui, fontSize: 12.5, fontWeight: 600, color: "#F2EEE9" }}>{label}</span>
        <span style={{ display: "block", fontFamily: F.ui, fontSize: 10.5, color: L.mutedDark, lineHeight: 1.45 }}>{hint}</span>
      </span>
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.55)" }} />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88vh", overflowY: "auto",
        background: L.stage, borderTop: `1px solid ${L.cardBorder}`, borderRadius: "16px 16px 0 0",
        padding: "10px 18px calc(20px + env(safe-area-inset-bottom))",
        maxWidth: 560, margin: "0 auto",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: L.cardBorder, margin: "4px auto 14px" }} />
        <h2 style={{ fontFamily: F.display, fontSize: 21, fontWeight: 600, color: "#F2EEE9", margin: "0 0 4px" }}>
          Download the record
        </h2>
        <p style={{ fontFamily: F.ui, fontSize: 11.5, color: L.mutedDark, lineHeight: 1.55, margin: "0 0 14px" }}>
          {claims.length} claims with verbatim quotes, both figures, and the source series — a document you can cite or check against the tape.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {(["md", "csv", "txt"] as Fmt[]).map(f => (
            <button key={f} onClick={() => setFmt(f)} style={{
              flex: 1, padding: "9px 0", borderRadius: 6, cursor: "pointer",
              fontFamily: F.mono, fontSize: 12,
              background: fmt === f ? L.true : "transparent",
              color: fmt === f ? "#fff" : L.mutedDark2,
              border: `1px solid ${fmt === f ? L.true : L.cardBorder}`,
            }}>.{f}</button>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${L.cardBorder}`, marginTop: 10, paddingTop: 4 }}>
          <Toggle on={includeTranscript} set={setIncludeTranscript} label="Full transcript with timestamps" hint="Everything the pipeline heard, not just the checked claims." />
          <Toggle on={includeSources} set={setIncludeSources} label="Source series and release dates" hint="Agency, dataset and period behind each official figure." />
          <Toggle on={contradictedOnly} set={setContradictedOnly} label="Contradicted claims only" hint="Just the misleading and false entries." />
        </div>

        <button onClick={download} style={{
          width: "100%", marginTop: 14, padding: "13px 0", borderRadius: 8, border: "none",
          background: L.true, color: "#fff", fontFamily: F.ui, fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Download .{fmt}</button>
        <button onClick={onClose} style={{
          width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 8,
          background: "none", border: `1px solid ${L.cardBorder}`, color: L.mutedDark2,
          fontFamily: F.ui, fontSize: 12.5, cursor: "pointer",
        }}>Cancel</button>
        <p style={{ fontFamily: F.ui, fontSize: 9.5, color: L.mutedDark, lineHeight: 1.5, margin: "12px 0 0" }}>
          AI-assisted fact-check. Verify against the linked series before publication.
        </p>
      </div>
    </div>
  );
}
