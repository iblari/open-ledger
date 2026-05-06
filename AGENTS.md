# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is **Open Ledger** (voteunbiased.org) — a Next.js 16 + React 19 + TypeScript data dashboard that visualizes U.S. economic performance across presidential administrations using FRED API data. See `package.json` scripts for standard dev/build/lint commands.

### Environment

- **Node.js**: v22 via nvm. Activate with: `export NVM_DIR="/home/ubuntu/.nvm" && source "$NVM_DIR/nvm.sh"`
- **Package manager**: npm (no lockfile in repo)

### Running the dev server

```
npm run dev
```

Server starts on `http://localhost:3000`. Two routes:
- `/` — Main dashboard with heatmap scorecards (renders with hardcoded data even without API keys)
- `/live-benchmark` — Interactive chart tool (requires `FRED_API_KEY` to load data)

### API keys

- `FRED_API_KEY` — Required for `/api/benchmark-data` and the live benchmark page. Without it, the endpoint returns `{ error: "FRED_API_KEY not configured" }` and the page shows "Unable to load benchmark data." The main dashboard (`/`) still renders.
- `BASE44_API_KEY` — Optional. Used for subscriber storage. Falls back to console logging if absent.

Set keys in `.env.local`:
```
FRED_API_KEY=your_key_here
```

### Known issues

- `npm run lint` (`eslint .`) fails because `eslint` is not listed as a project dependency. The lint script exists in `package.json` but won't work without adding eslint.
- TypeScript build errors are intentionally ignored via `ignoreBuildErrors: true` in `next.config.mjs`.
