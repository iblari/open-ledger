import Link from "next/link";
import { C, SANS } from "@/lib/design-tokens";
import { raceTitle } from "@/lib/midterms";
import { voterState } from "@/lib/vote-geo";

/** Homepage strip before election day: the visitor's own races, one tap to compare. */
export default async function YourBallotBar() {
  if (Date.now() > Date.parse("2026-11-04T06:00:00Z")) return null;
  const v = await voterState().catch(() => null);
  const s = v?.ballot;
  const href = s ? `/vote/${s.st.toLowerCase()}` : "/vote";
  const races = s ? s.races.map(r => `${raceTitle(r).replace(" (special election)", " (special)")}: ${r.candidates.filter(c => c.main).map(c => c.name.split(" ").slice(-1)[0]).join(" vs ")}`).join(" · ") : null;
  return (
    <Link href={href} style={{ display: "block", background: C.bg, borderBottom: `1px solid ${C.rule}`, textDecoration: "none", color: C.ink, fontFamily: SANS }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "9px 20px", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", fontSize: 13.5 }}>
        <b style={{ color: C.accent, fontWeight: 700, letterSpacing: ".04em", fontSize: 12, textTransform: "uppercase" }}>Election day Tuesday</b>
        <span>{s ? <>Your {s.name} ballot · <span style={{ color: C.sub }}>{races}</span></> : "Compare the candidates on your ballot"}</span>
        <span style={{ marginLeft: "auto", fontWeight: 600, whiteSpace: "nowrap" }}>Compare side by side →</span>
      </div>
    </Link>
  );
}
