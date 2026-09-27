import Link from "next/link";
import CheetahMark from "@/components/CheetahMark";

/**
 * The Vote Unbiased lockup: the data-bar cheetah (lib/cheetah-mark.ts), then "Vote" with "Unbiased" set in
 * red italic.
 *
 * It existed only inside app/dashboard/page.tsx, so /live, /promises,
 * /trends and the teaser each rendered a plain serif "Vote Unbiased" with no
 * mark — the brand changed depending on which page you landed on. One
 * component now, so it can't drift again.
 *
 * `tone="dark"` is for the near-black surfaces (/live's stage). The mark
 * inverts rather than disappearing, which is the same trap the invisible
 * email field fell into: a colour that only works on one background.
 */
export default function Brand({
  mob = false,
  tone = "light",
  href = "/",
}: { mob?: boolean; tone?: "light" | "dark"; href?: string }) {
  const SERIF = "'Newsreader',Georgia,serif";
  const ink = tone === "dark" ? "#F2EEE9" : "#1a1a1a";
  const disc = tone === "dark" ? "#F2EEE9" : "#1a1a1a";
  // Slightly lighter red on dark so it clears contrast against near-black.
  const accent = tone === "dark" ? "#E06B5E" : "#b8372d";

  return (
    <Link href={href} aria-label="Vote Unbiased home" style={{
      display: "flex", alignItems: "center", gap: mob ? 8 : 10,
      textDecoration: "none", cursor: "pointer", flexShrink: 0,
      fontFamily: SERIF, fontSize: mob ? 16 : 20, fontWeight: 600,
      letterSpacing: "-0.015em", color: ink,
    }}>
      <CheetahMark height={mob ? 22 : 26} ink={disc} accent={tone === "dark" ? "#E0493A" : "#b8372d"} />
      <span style={{ whiteSpace: "nowrap" }}>
        Vote <em style={{ fontStyle: "italic", color: accent, fontWeight: 500 }}>Unbiased</em>
      </span>
    </Link>
  );
}
