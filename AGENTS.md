# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

**Open Ledger** (voteunbiased.org) — a Next.js 16 + React 19 + TypeScript data dashboard that visualizes U.S. economic performance across presidential administrations using FRED API data. The production code is on the `abroad-tab-prototype` branch (not `main`).

### Routes

| Route | Description |
|---|---|
| `/` | Landing page — sectioned editorial design with heatmap scorecard, deep dive charts, coming-soon previews |
| `/dashboard` | Full 19-metric scorecard with interactive charts |
| `/live-benchmark` | Interactive spaghetti-line chart comparing presidents (requires `FRED_API_KEY`) |
| `/live` | Live Broadcast — political speech fact-checking demos |

### Environment

- **Node.js**: v22 via nvm. Activate with: `export NVM_DIR="/home/ubuntu/.nvm" && source "$NVM_DIR/nvm.sh"`
- **Package manager**: npm (no lockfile committed to repo)
- Standard scripts in `package.json`: `dev`, `build`, `start`, `lint`

### API keys

| Variable | Required | Notes |
|---|---|---|
| `FRED_API_KEY` | Yes (for live data) | Free at https://fred.stlouisfed.org/docs/api/api_key.html. Without it, `/api/benchmark-data` returns an error; main landing page and dashboard still render. |
| `ANTHROPIC_API_KEY` | Yes (for live fact-check) | Powers `/api/live-fact-check` — the AI claim verification on the `/live` page. Without it, URL-paste and live-mic modes cannot analyze claims. |
| `BASE44_API_KEY` | No | Subscriber storage. Falls back to console logging if absent. |

Set in `.env.local`:
```
FRED_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

### Known issues

- `npm run lint` (`eslint .`) fails because `eslint` is not listed in `package.json` dependencies.
- TypeScript build errors are intentionally ignored via `ignoreBuildErrors: true` in `next.config.mjs`.
- On clean `npm install`, native bindings for `lightningcss` and `@tailwindcss/oxide` may not install correctly (npm optional-dependency bug). If build fails with "Cannot find native binding", delete `node_modules` and `package-lock.json` and run `npm install` again.
- **YouTube embeds are blocked in Cloud Agent VMs** — YouTube detects bot/datacenter IPs and blocks video playback. This means the `/live` demo mode (which relies on `YT.Player.getCurrentTime()` to time claim cards) cannot be fully tested visually. The backend `/api/live-fact-check` endpoint works and can be verified via curl. The `/api/fetch-transcript` endpoint may also fail due to YouTube IP blocking.
