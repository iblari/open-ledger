import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";
import { C, SERIF } from "@/lib/design-tokens";
import type { Lean } from "@/lib/news/outlets";
import { leanShares } from "@/lib/news/share";
export { leanShares };

/** Site header + Data / News / Live tabs (News replaces Trending). */
const tab = (active: boolean): React.CSSProperties => ({
  padding: "13px 18px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  color: active ? C.ink : C.mute, textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
  borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
});
/** Days until election day (Nov 3, 2026, polls close ET); null once it has passed. */
function daysToVote(): number | null {
  const d = Math.ceil((Date.parse("2026-11-04T05:00:00Z") - Date.now()) / 864e5);
  return d > 0 ? d - 1 : null;
}
export function NewsChrome({ active = "news" }: { active?: "news" | "data" | "live" | "vote" }) {
  const days = daysToVote();
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
          <Link href="/vote" aria-current={active === "vote" ? "page" : undefined} style={tab(active === "vote")}>
            Vote
            {days != null && <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: C.accent, color: "#fff", lineHeight: 1.2 }}>{days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`}</span>}
          </Link>
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

/* Lean colours: blue / white / red, as on the coverage bar. */
export const LEAN_COLOR: Record<Lean, string> = { left: "#2C4A86", center: "#D9D5CE", right: "#7B2D26", unrated: "#E2DED6" };
export const LEAN_TEXT: Record<Lean, string> = { left: "#2C4A86", center: "#6b655c", right: "#7B2D26", unrated: "#8a8378" };
export const LEAN_LABEL: Record<Lean, string> = { left: "Left", center: "Center", right: "Right", unrated: "Not rated" };

/** Width a segment needs to fit "Center 100%" at this font size. */
const k_full = (f: number) => Math.round(f * 6.3);
const BAR_SIZE = { lg: { h: 30, f: 14, full: 16 }, md: { h: 24, f: 12.5, full: 22 }, sm: { h: 20, f: 11.5, full: 30 } } as const;

/**
 * Coverage bar: the share of the rated outlets covering a story that lean
 * left, center and right. Labels always shown; short segments show just the %.
 */
export function CoverageBar({ coverage, size = "md" }: { coverage: Record<Lean, number>; size?: keyof typeof BAR_SIZE; height?: number; labels?: boolean }) {
  const sh = leanShares(coverage);
  if (!sh) return null;
  const z = BAR_SIZE[size];
  const parts = (["left", "center", "right"] as const).filter(k => coverage[k] > 0);
  return (
    <div role="img" aria-label={`Of the outlets covering it: ${sh.left}% lean left (${coverage.left}), ${sh.center}% center (${coverage.center}), ${sh.right}% lean right (${coverage.right})`}
      title={`${coverage.left} left-leaning · ${coverage.center} center · ${coverage.right} right-leaning outlets`}
      style={{ display: "flex", height: z.h, borderRadius: 4, overflow: "hidden", width: "100%", border: "1px solid #CFC9BF", background: "#fff", boxSizing: "border-box" }}>
      {parts.map(k => (
        <div key={k} className="lb-seg" style={{ flex: `${sh[k]} 1 0`, minWidth: size === "lg" ? 46 : 38, background: k === "center" ? "#fff" : LEAN_COLOR[k], color: k === "center" ? "#14110E" : "#fff",
          fontSize: z.f, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", overflow: "hidden", padding: "0 4px" }}>
          <span className="lb-full">{`${LEAN_LABEL[k]} ${sh[k]}%`}</span><span className="lb-short">{`${sh[k]}%`}</span>
        </div>
      ))}
      <style>{`.lb-seg{container-type:inline-size}.lb-seg .lb-short{display:none}.lb-seg .lb-full{display:inline}@container (max-width:${k_full(14)}px){.lb-seg .lb-full{display:none}.lb-seg .lb-short{display:inline}}`}</style>
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
