# Portfolio Control

A static dashboard that tracks progress across all repositories under a GitHub account, updated automatically once a day.

## How it works

- `index.html` — the dashboard itself. Plain HTML/CSS/JS, no build step. Fetches `data.json`, `market.json`, and `conferences.json` on load.
- `data.json` — repo status, commit activity, a 2-line auto-generated update per project. Seeded with a manual audit; overwritten daily.
- `market.json` — US market snapshot (S&P 500, Nasdaq, key AI stocks), BTC/ETH price + 7-day trend, and 3 AI/tech headlines. Overwritten daily.
- `conferences.json` — curated list of upcoming industrial-AI / AI conferences. **Not** auto-refreshed (see "What's not automated" below).
- `scripts/update-data.mjs` — regenerates `data.json` from the live GitHub API (repo list, latest commit, 12-week commit activity, language breakdown).
- `scripts/market-data.mjs` — regenerates `market.json` from three free, keyless public APIs: Stooq (stock closes), CoinGecko (crypto price/sparkline), Hacker News Algolia API (front-page tech news, filtered for AI-related keywords).
- `.github/workflows/update-dashboard.yml` — runs both scripts daily (and on manual trigger) and commits whatever changed.

**On purpose, this dashboard contains nothing private.** Calendar, family plans, call scheduling, and language/ML learning progress are deliberately left out — this repo is meant to be public (or at least widely viewable), and none of that belongs in a public place. Handle that side of daily planning in a private tool instead (chat, or a private planning app with personal-only storage).

## Setup (one-time)

1. Create a new repository, e.g. `github.com/JamshidiML/dashboard`, and push everything in this folder to it (including the hidden `.github/` folder).
2. In the repo settings → **Pages**, set source to "Deploy from a branch", branch `main`, folder `/ (root)`. The dashboard will be live at `https://jamshidiml.github.io/dashboard/` within a minute or two.
3. No secrets to add — the Action uses the automatically-provided `GITHUB_TOKEN`, which has read access to your own public repos.
4. Trigger the first sync manually: repo → **Actions** tab → "Update dashboard data" → **Run workflow**. This replaces the seed `data.json` with live numbers.
5. After that, it refreshes on its own every day at the time set in the workflow's cron line (edit that line if you want a different time).

## Status categories

- **active** — pushed to in the last 21 days
- **dormant** — pushed to in the last 4 months, but not recently
- **planning** — no code, documentation only
- **stale** — no activity in over 4 months
- **empty** — no commits at all

## What's not automated yet

- `has_tests` / `has_ci` are left as `null` by the API script — detecting these cheaply from the API alone isn't reliable (would need to fetch each repo's file tree). They're currently set from a one-time manual audit in the seed data; re-run a manual pass periodically, or extend `update-data.mjs` to check for `.github/workflows/` and common test-folder names via the contents API.
- The 2-line update is currently just the repo description + latest commit message. If you want a richer, AI-written summary instead, add an `ANTHROPIC_API_KEY` repo secret and extend the script to call the Claude API with each repo's recent commit messages.
- `conferences.json` is curated by hand, not pulled from a live source — there's no good free, structured API for conference listings. Refresh it every few weeks (ask Claude to search and hand you an updated list, then paste it in).
- No "buy signal" or social-media-sourced trading tips are included, and won't be added — that category of content tends to encourage impulsive, hype-driven decisions rather than informed ones. The market/crypto sections here are factual snapshots only, not recommendations.
