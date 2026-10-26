import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { STATES, stateByCode, daysToElection, raceTitle } from "@/lib/midterms";
import { C, SERIF, SANS } from "@/lib/design-tokens";
import VoteHeader from "./VoteHeader";

export const metadata: Metadata = {
  title: "Compare the candidates on your 2026 ballot · Vote Unbiased",
  description: "Senate and governor candidates side by side: money, voting record and positions in their own words. Facts only, every number sourced.",
  alternates: { canonical: "https://voteunbiased.org/vote" },
  openGraph: { title: "Compare the candidates on your 2026 ballot", description: "Money, voting record and positions in their own words, side by side. Facts only.", url: "https://voteunbiased.org/vote", siteName: "Vote Unbiased", type: "website" },
};

export default async function VoteIndex() {
  const h = await headers();
  const guess = stateByCode(h.get("x-vercel-ip-country-region") || "");
  const days = daysToElection();
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: SANS }}>
      <VoteHeader />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 20px 70px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: C.accent }}>Election day · Tuesday, Nov 3{days > 0 ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</div>
        <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(30px, 5vw, 46px)", lineHeight: 1.1, margin: "8px 0 10px" }}>Compare the candidates on your ballot.</h1>
        <p style={{ fontSize: 16, color: C.sub, lineHeight: 1.6, maxWidth: 680, margin: 0 }}>
          Every Senate and governor race, side by side: where their money comes from, how they've voted, and what they say they'll do, in their own words. Facts only. We don't endorse anyone, and every number links to its source.
        </p>
        {guess && (
          <Link href={`/vote/${guess.st.toLowerCase()}`} style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 22, padding: "13px 20px", borderRadius: 10, background: C.ink, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
            See the {guess.name} ballot →
          </Link>
        )}
        <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: 22, margin: "34px 0 12px" }}>{guess ? "Or pick another state" : "Pick your state"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {STATES.map(s => (
            <Link key={s.st} href={`/vote/${s.st.toLowerCase()}`} style={{ display: "block", background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: C.ink }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: C.sub, marginTop: 3 }}>{s.races.map(r => raceTitle(r).replace(" (special election)", " (special)")).join(" · ")}</div>
            </Link>
          ))}
        </div>
        <p style={{ fontSize: 13, color: C.mute, marginTop: 26, lineHeight: 1.6 }}>
          States not listed have no Senate or governor race this year. Check your registration and find your polling place at <a href="https://vote.gov" style={{ color: C.sub }}>vote.gov</a>.
        </p>
      </div>
    </div>
  );
}
