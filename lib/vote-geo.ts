import { cookies, headers } from "next/headers";
import { stateByCode } from "./midterms";
import { parseLoc, LOC_COOKIE } from "./local-shared";

/**
 * The visitor's state for /vote and the homepage ballot bar: the state they
 * chose (the same cookie as the Data tab's location picker) wins; otherwise
 * Vercel's IP lookup. Returns the ballot state, or null when they're outside
 * the US or the state has no Senate or governor race.
 */
export async function voterState() {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const chosen = parseLoc(c.get(LOC_COOKIE)?.value ?? null);
  if (chosen) return { ballot: stateByCode(chosen.state.code), name: chosen.state.name, how: "chosen" as const };
  if ((h.get("x-vercel-ip-country") || "US") !== "US") return null;
  const code = h.get("x-vercel-ip-country-region") || "";
  const ballot = stateByCode(code);
  return code ? { ballot, name: ballot?.name ?? code, how: "ip" as const } : null;
}
