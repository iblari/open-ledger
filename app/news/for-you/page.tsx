import type { Metadata } from "next";
import Link from "next/link";
import { C, SANS } from "@/lib/design-tokens";
import { NewsChrome } from "@/components/news/NewsChrome";
import { forYouFeed } from "@/lib/for-you";
import { voterState } from "@/lib/vote-geo";
import { toOutcome, VERDICT_COLOR } from "@/lib/live-design";
import FeedClient, { type ViewCard } from "./FeedClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "For you: news, checked claims, data and results in one feed · Vote Unbiased",
  description: "One swipeable feed of today's stories (with who covered them), checked claims, new official data and live results.",
  alternates: { canonical: "https://voteunbiased.org/news/for-you" },
  robots: { index: false, follow: true },
};

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : m < 2880 ? "yesterday" : `${Math.round(m / 1440)} days ago`;
};

export default async function ForYou() {
  const v = await voterState().catch(() => null);
  const st = v?.ballot?.st ?? null;
  const { cards } = await forYouFeed(st);
  const view: ViewCard[] = cards.map(c => ({ ...c, ago: ago(c.at), color: c.kind === "claim" ? VERDICT_COLOR[toOutcome(c.rating)] : null }));
  const tab = (active: boolean): React.CSSProperties => ({ fontSize: 13, textDecoration: "none", color: active ? C.ink : C.sub, fontWeight: active ? 600 : 500, padding: "4px 0", borderBottom: active ? `2px solid ${C.ink}` : "2px solid transparent", whiteSpace: "nowrap" });
  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: SANS, minHeight: "100dvh" }}>
      <NewsChrome active="news" />
      <div className="fy-tabs" data-nosnippet style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 20px 8px", display: "flex", gap: 18, borderBottom: `1px solid ${C.rule}`, overflowX: "auto" }}>
        <Link href="/news/for-you" style={tab(true)}>For you</Link>
        <Link href="/news" style={tab(false)}>Top</Link>
        <Link href="/news?view=blindspots" style={tab(false)}>Blindspots</Link>
        <Link href="/news?view=claims" style={tab(false)}>Claims</Link>
        <Link href="/vote" style={tab(false)}>2026 Results</Link>
      </div>
      <h1 className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>For you</h1>
      <FeedClient cards={view} />
    </div>
  );
}
