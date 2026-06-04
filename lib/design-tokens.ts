// Shared design tokens. Single source of truth for the editorial palette
// and typography used across the landing page and dashboard.
//
// These were originally inlined in app/page.tsx; extracted here so the
// dashboard can adopt the same visual language.

export const C = {
  bg: "#f8f5f0",
  paper: "#f3ede5",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#5c5856",
  mute: "#9a9490",
  rule: "#e2ded6",
  accent: "#b8372d",
  gold: "#a67c00",
  blue: "#1d4ed8",
  highlight: "#fef9e7",
  improveStrong: "#0d7377",
  improveMed: "#14a3a8",
  improveLight: "#8ee3e6",
  declineStrong: "#c2410c",
  declineMed: "#ea580c",
  declineLight: "#fed7aa",
  neutral: "#d4cfc5",
} as const;

export const SERIF = "'Source Serif 4', Georgia, serif";
export const SANS = "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
