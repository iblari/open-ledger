import type { Metadata } from "next";
import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";
import ClaimsFeed from "@/components/trending/ClaimsFeed";
import { C, SERIF } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "Trending — every checked claim, charted · Vote Unbiased",
  description: "True and false statements from live broadcasts, newest first, each with an interactive chart of the data behind the verdict.",
};

const tab = (active: boolean): React.CSSProperties => ({
  padding: "13px 18px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  color: active ? C.ink : C.mute, textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
  borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
});

export default function TrendingPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      <div style={{ borderBottom: `1px solid ${C.rule}`, padding: "12px 0", background: "linear-gradient(180deg,#fff 0%," + C.bg + " 100%)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px" }}>
          <Link href="/" aria-label="Back to Vote Unbiased home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: C.ink }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", border: `1px solid ${C.rule}`, background: "#fff", display: "grid", placeItems: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 16, fontWeight: 500 }}>←</span>
            <CheetahMark height={22} ink={C.ink} accent={C.accent} />
            <span style={{ whiteSpace: "nowrap" }}>Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
          </Link>
        </div>
      </div>
      <nav style={{ borderBottom: `1px solid ${C.rule}`, background: C.card }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 6px", display: "flex", overflowX: "auto" }}>
          <Link href="/dashboard" style={tab(false)}>Data</Link>
          <Link href="/trending" aria-current="page" style={tab(true)}>Trending</Link>
          <Link href="/live" style={tab(false)}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", border: `1.5px solid ${C.mute}` }} />
            Live Broadcast
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", padding: "2px 5px", borderRadius: 3, marginLeft: 2, background: "#a67c0014", color: "#a67c00", border: "1px solid #a67c0040", lineHeight: 1 }}>Beta</span>
          </Link>
        </div>
      </nav>
      <ClaimsFeed />
    </div>
  );
}
