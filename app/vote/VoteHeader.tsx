import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";
import { C, SERIF } from "@/lib/design-tokens";

export default function VoteHeader() {
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}`, padding: "12px 0", background: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/" aria-label="Vote Unbiased home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.ink, fontFamily: SERIF, fontSize: 19, fontWeight: 600 }}>
          <CheetahMark height={22} ink={C.ink} accent={C.accent} />
          <span className="vu-wordmark">Vote <em style={{ fontStyle: "italic", color: C.accent, fontWeight: 500 }}>Unbiased</em></span>
        </Link>
        <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 600 }}>
          <Link href="/vote" style={{ color: C.ink, textDecoration: "none" }}>2026 ballot</Link>
          <Link href="/trending" style={{ color: C.sub, textDecoration: "none" }}>Trending</Link>
          <Link href="/live" style={{ color: C.accent, textDecoration: "none" }}>Live</Link>
        </div>
      </div>
    </div>
  );
}
