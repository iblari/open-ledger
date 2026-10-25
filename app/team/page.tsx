import type { Metadata } from "next";
import TeamChat from "./TeamChat";

export const metadata: Metadata = { title: "Team · Vote Unbiased", robots: { index: false, follow: false } };

export default function TeamPage() {
  return <TeamChat />;
}
