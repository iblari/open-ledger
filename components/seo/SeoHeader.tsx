import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";
import { C, SERIF } from "@/lib/design-tokens";
import LocationPicker from "@/components/local/LocationPicker";

/** Shared header for the indexable data and fact-check pages. */
export default function SeoHeader() {
  const l = { color: C.sub, textDecoration: "none" } as const;
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}`, padding: "12px 0", background: "#fff" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/" aria-label="Vote Unbiased home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink, fontFamily: SERIF, fontSize: 19, fontWeight: 600, flex: "none" }}>
          <CheetahMark height={22} ink={C.ink} accent={C.accent} />
          <span className="vu-wordmark">Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
        </Link>
        <nav data-nosnippet style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflowX: "auto" }}>
          <Link href="/benchmark" style={l}>Benchmarks</Link>
          <Link href="/broadcasts" style={l}>Fact-checks</Link>
          <Link href="/vote" style={l}>Ballot</Link>
          <Link href="/live" style={{ ...l, color: C.accent }}>Live</Link>
        </nav>
        <LocationPicker />
      </div>
    </div>
  );
}
