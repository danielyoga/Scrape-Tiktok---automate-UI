# PRD: TikTok UI Automation with Session Persistence

> **Note:** this doc predates the pivot away from account login (see
> [02-scrape-rnd.md](02-scrape-rnd.md) findings — profile-grid Views require
> auth, but we scrape logged-out + solve TikTok's CAPTCHA on demand instead
> of logging into an account). Architecture/file paths below are outdated;
> the real implementation lives in `src/pages`, `src/steps`, `src/scenarios`.
> See [01-auth-script.md](01-auth-script.md) (superseded), 
> [02-scrape-rnd.md](02-scrape-rnd.md), and
> [03-optimization.md](03-optimization.md) for current-state docs.

## Overview

A local automation script that logs into TikTok by reusing a saved browser
session (cookies) instead of re-entering credentials, then drives the TikTok
web UI to scrape data (videos / profile / comments) and writes results to a
Google Sheet.

## Goals

- Log in once manually, persist the session (cookies), and reuse it on every
run without re-authenticating.
- Automate TikTok's UI (not the private API) to scrape:
  - Video metadata (views, likes, comments, shares, reposts, saves)
  - Profile info (username)
- Push scraped results into the target Google Sheet:
[https://docs.google.com/spreadsheets/d/1StWP79jPAC-69NsB8W7CN_wu2B8sJPqzf8Yfqd5ijRE](https://docs.google.com/spreadsheets/d/1StWP79jPAC-69NsB8W7CN_wu2B8sJPqzf8Yfqd5ijRE)
- Run entirely on the local machine. GCP is used only as the backend for the
Google Sheets API (no Cloud Run / scheduler / Compute Engine needed).

## Non-Goals

- No headless cloud deployment (Cloud Run, Scheduler, Secret Manager) for v1.
- No TikTok private/internal API reverse engineering — UI automation only.
- No multi-account management in v1 (single TikTok session).

## Tech Stack

- **Automation:** Playwright (Node.js), using a persistent browser context
(`storageState`) to save/reuse cookies + localStorage.
- **Output:** Google Sheets API v4, authenticated via a GCP service account.
- **Language:** Node.js (TypeScript or JS).

## Architecture

1. **One-time login script** (`login.ts`)
  - Launches a real (non-headless) Chromium window via Playwright.
  - User manually logs into TikTok (handles captcha/2FA).
  - On success, saves `context.storageState()` to `session/tiktok-state.json`.
2. **Scraper script** (`scrape.ts`)
  - Launches Playwright with `storageState: 'session/tiktok-state.json'`.
  - Verifies session is still valid (checks for logged-in UI element);
  if expired, prompts to re-run `login.ts`.
  - Reads each row's video URL from the sheet and navigates to it.
  - Extracts view/like/comment/share/repost/save counts from the DOM.
3. **Sheets writer** (`sheets.ts`)
  - Authenticates with a GCP service account JSON key.
  - Reads column C (video URLs) and writes columns D–I back per row.
4. **Orchestrator** (`index.ts`)
  - Runs scrape → transform → write-to-sheet as one CLI command.
  - Triggered manually (no cron/scheduler in v1).

## Session/Cookie Handling

- Cookies + localStorage stored locally in `session/tiktok-state.json`
(gitignored — contains live auth, treat as a secret).
- No cookie encryption in v1 (local-only, single-user machine). Revisit if
this ever runs on a shared or cloud machine.
- Session refresh: if TikTok invalidates the session (logout detected),
re-run `login.ts` manually.

## GCP Setup (Google Sheets API access only)

1. Go to console.cloud.google.com → create or select a project.
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → Credentials → Create Credentials → **Service Account**.
  - Give it a name (e.g. `tiktok-scraper-writer`), no special IAM roles needed
   project-wide.
4. Open the created service account → Keys → Add Key → JSON. Download it as
  `credentials.json`, place it in the project root (gitignored).
5. Copy the service account's email (looks like
  `tiktok-scraper-writer@<project-id>.iam.gserviceaccount.com`).
6. Open the target Google Sheet → Share → add that service account email as
  an **Editor**. (Service accounts only see sheets explicitly shared with
   them.)
7. Note the spreadsheet ID from the URL:
  `1StWP79jPAC-69NsB8W7CN_wu2B8sJPqzf8Yfqd5ijRE` — store in `.env` as
   `SPREADSHEET_ID`.

## Sheet Schema (confirmed)

Single tab, columns A–I, one row per video:


| Col | Field     | Source                                      |
| --- | --------- | ------------------------------------------- |
| A   | No        | row index                                   |
| B   | Username  | parsed from video URL / profile link        |
| C   | Link Post | input — the TikTok video URL to scrape      |
| D   | Views     | scraped                                     |
| E   | Likes     | scraped                                     |
| F   | Comments  | scraped                                     |
| G   | Shared    | scraped                                     |
| H   | Reposted  | always blank/0 — not exposed by TikTok's UI |
| I   | Saved     | scraped                                     |


Example existing rows:

```
No  Username        Link Post  Views    Likes  Comments  Shared  Reposted  Saved
1   @eonni.elma      link       18.800   2.334  58        68      0         133
2   @ekypriyagung    link       4.409    121    4         3       0         5
```

- **Input:** column C (`Link Post`) drives the script — it reads each row's
video URL and writes the rest of that row.
- **Run mode:** manual trigger only (no cron/scheduler).

## Data Extraction Mapping (from TikTok video page DOM)

Selectors observed on `tiktok.com/@user/video/<id>`. Prefer `data-e2e`
attributes over generated CSS classes (e.g. `css-13onzkq-...`), since the
latter changes across TikTok deploys and is not stable to build selectors on.


| Field    | Selector                                                                              | Notes                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Views    | `[data-e2e="video-views"]`                                                            | `<strong>` text content, e.g. `688`                                                                                                                      |
| Likes    | `[data-e2e="like-count"]`                                                             | inside the action-bar `<section>`                                                                                                                        |
| Comments | `[data-e2e="comment-count"]`                                                          |                                                                                                                                                          |
| Shared   | `[data-e2e="share-count"]`                                                            |                                                                                                                                                          |
| Saved    | `[data-e2e="favorite-count"]`                                                         | TikTok's "Favorites" maps to sheet's "Saved"                                                                                                             |
| Reposted | none                                                                                   | confirmed not exposed anywhere in the video-page UI — always write blank/0 |
| Username | parsed from the profile link `href="/@<username>"`, or from the video URL path itself |                                                                                                                                                          |


All count fields are `<strong>` elements holding a display-formatted number
(e.g. `18.800`, `4.4K`) — parsing must handle locale thousands separators and
K/M suffixes correctly.

Per-row extraction flow:

1. Read `Link Post` (col C) from the sheet.
2. Navigate Playwright to that URL (session already authenticated).
3. Wait for the action bar to render, then read views/likes/comments/
  shared/saved via the selectors above.
4. Write Views/Likes/Comments/Shared/Reposted/Saved back to columns D–I.

## Project Structure (proposed)

```
/session/tiktok-state.json     # saved cookies (gitignored)
/credentials.json              # GCP service account key (gitignored)
/.env                          # SPREADSHEET_ID, SHEET_TAB_NAME
/src/login.ts
/src/scrape.ts
/src/sheets.ts
/src/index.ts
```

## Open Questions

None currently — Reposted and number-parsing (below) are resolved decisions,
not open questions.

## Resolved Decisions

- **Reposted (column H):** TikTok's video-page UI does not expose a repost  
count at all. Column H will always be written blank/0.
- **Number parsing:** counts under ~100K use `.` as a thousands separator
(e.g. `18.800` = 18,800), confirmed from real sheet data. Above ~100K,
TikTok abbreviates (`1.2K`, `3.4M`) — the parser handles both formats even
though current sample videos don't hit that range.

## Risks

- TikTok frequently changes DOM structure/selectors — expect ongoing
selector maintenance.
- TikTok may detect and block automated browsing (rate limits, bot
detection) — mitigate with human-like delays, non-headless mode.
- Cookie/session expiry requires manual re-login; no auto-refresh in v1.

