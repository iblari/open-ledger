import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";
import { C, SERIF } from "@/lib/design-tokens";
import type { Lean } from "@/lib/news/outlets";

/** Site header + Data / News / Live tabs (News replaces Trending). */
const tab = (active: boolean): React.CSSProperties => ({
  padding: "13px 18px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  color: active ? C.ink : C.mute, textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
  borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
});
export function NewsChrome({ active = "news" }: { active?: "news" | "data" | "live" }) {
  return (
    <>
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: "12px 0", background: "linear-gradient(180deg,#fff 0%," + C.bg + " 100%)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px" }}>
          <Link href="/" aria-label="Back to Vote Unbiased home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: C.ink }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.rule}`, background: "#fff", display: "grid", placeItems: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 500 }}>←</span>
            <CheetahMark height={22} ink={C.ink} accent={C.accent} />
            <span className="vu-wordmark" style={{ whiteSpace: "nowrap" }}>Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
          </Link>
        </div>
      </div>
      <nav data-nosnippet style={{ borderBottom: `1px solid ${C.rule}`, background: C.card }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 6px", display: "flex", overflowX: "auto" }}>
          <Link href="/dashboard" style={tab(active === "data")}>Data</Link>
          <Link href="/news" aria-current={active === "news" ? "page" : undefined} style={tab(active === "news")}>News</Link>
          <Link href="/live" style={tab(active === "live")}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", border: `1.5px solid ${C.mute}` }} />
            Live Broadcast
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", padding: "2px 5px", borderRadius: 3, marginLeft: 2, background: "#a67c0014", color: "#a67c00", border: "1px solid #a67c0040", lineHeight: 1 }}>Beta</span>
          </Link>
        </div>
      </nav>
    </>
  );
}

/* Lean colours: neutral tones, not party red/blue. */
export const LEAN_COLOR: Record<Lean, string> = { left: "#5B6C8F", center: "#B9B3AA", right: "#A0785A", unrated: "#E2DED6" };
export const LEAN_LABEL: Record<Lean, string> = { left: "Left", center: "Center", right: "Right", unrated: "Not rated" };

export function CoverageBar({ coverage, height = 8, labels = false }: { coverage: Record<Lean, number>; height?: number; labels?: boolean }) {
  const rated = coverage.left + coverage.center + coverage.right;
  if (!rated) return null;
  const parts = (["left", "center", "right"] as const).filter(k => coverage[k] > 0);
  return (
    <div role="img" aria-label={`Covered by ${coverage.left} left-leaning, ${coverage.center} center and ${coverage.right} right-leaning outlets`}
      style={{ display: "flex", height, borderRadius: height / 2, overflow: "hidden", width: "100%", background: "#EFEBE4" }}>
      {parts.map(k => (
        <div key={k} style={{ width: `${(coverage[k] / rated) * 100}%`, background: LEAN_COLOR[k], color: k === "center" ? "#3d3833" : "#fff",
          fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", overflow: "hidden" }}>
          {labels ? `${LEAN_LABEL[k]} ${Math.round((coverage[k] / rated) * 100)}%` : null}
        </div>
      ))}
    </div>
  );
}

export function LeanPill({ lean }: { lean: Lean }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: LEAN_COLOR[lean], color: lean === "center" || lean === "unrated" ? "#3d3833" : "#fff", whiteSpace: "nowrap" }}>{LEAN_LABEL[lean]}</span>;
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
