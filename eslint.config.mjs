import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * The one rule that matters here is react-hooks/exhaustive-deps.
 *
 * Four separate bugs in components/live/LiveExperience.tsx have been stale
 * closures: a useCallback listing some of its dependencies, capturing the
 * initial value of the rest, and then quietly using stale data forever. Each
 * one shipped, reached a user, and was found by reading code after someone
 * reported odd behaviour:
 *
 *   - "Fact Check This" did nothing
 *   - the manual check read the wrong clock
 *   - the manual check failed to attach its claim to the broadcast
 *   - clicking a fact seeked to the wrong place (timeShift missing)
 *
 * All four were mechanically detectable at commit time. It is a warning
 * rather than an error so it can't block a deploy during a live broadcast,
 * but it will be visible in `npm run lint`.
 */
export default [
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: {
      // The TS parser is required or every typed signature is a parse error
      // and the rule silently checks nothing.
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    // Registered only so the existing inline eslint-disable directives for
    // its rules resolve; we are not turning on the TS ruleset here.
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tsPlugin, "@next/next": nextPlugin },
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  { ignores: ["node_modules/**", ".next/**", "public/**", "out/**"] },
];
