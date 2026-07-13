import type { Metadata } from "next";
import Link from "next/link";
import WhatsChanging from "@/components/WhatsChanging";
import { C, SERIF, SANS } from "@/lib/design-tokens";

export const metadata: Metadata = {
  title: "What's Changing in America — Vote Unbiased",
  description:
    "Trends detected across 3,100+ US counties from Census data — housing affordability, migration, real incomes, poverty. No spin. You interpret.",
};

export default function TrendsPage() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
      {/* Slim nav — mirrors the site chrome without importing the landing page */}
      <nav style={{
        borderBottom: `1px solid ${C.rule}`, background: "#fff",
        padding: "12px 0", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "0 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Link href="/" style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 900, color: C.ink, textDecoration: "none" }}>
            Vote Unbiased
          </Link>
          <div style={{ display: "flex", gap: 16, alignItems: "center", fontFamily: SANS, fontSize: 13 }}>
            <Link href="/dashboard" style={{ color: C.sub, textDecoration: "none", fontWeight: 500 }}>Data</Link>
            <Link href="/live" style={{ color: C.accent, textDecoration: "none", fontWeight: 700 }}>Live</Link>
          </div>
        </div>
      </nav>
      <WhatsChanging variant="full" />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 20px 40px", fontFamily: SANS, fontSize: 11, color: C.mute }}>
        <Link href="/" style={{ color: C.sub, textDecoration: "none" }}>← Back to the ledger</Link>
      </div>
    </div>
  );
}
