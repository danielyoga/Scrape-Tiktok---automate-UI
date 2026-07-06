# TikTok UI Automation

Scrapes video metrics (views, likes, comments, shares, saves) from TikTok's web UI via Playwright and writes results into a Google Sheet. No TikTok login/account required — runs logged-out and auto-clears TikTok's CAPTCHA when it appears.

This guide assumes no prior setup — follow it top to bottom even if you've never used this project before.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org) 18 or newer (includes npm)
- A Google Cloud service account with the **Google Sheets API** enabled
- A Google Sheet with a `Link Post` column containing TikTok video URLs (as hyperlinks)

Don't have Git or Node.js yet? The setup script below checks for them and tells you how to install anything missing.

## Getting the code

Clone the repository and move into the project folder:

```bash
git clone https://github.com/danielyoga/Scrape-Tiktok---automate-UI.git
cd Scrape-Tiktok---automate-UI
```

## Setup

Run the setup script from the project root. It detects your OS, checks that Git/Node.js/npm are installed (with install instructions if not), installs the project's dependencies, and downloads the Chromium browser Playwright needs:

```bash
./setup.sh
```

If it can't run directly, make it executable first:

```bash
chmod +x setup.sh
./setup.sh
```

The script stops with a clear error message if something is missing or fails — fix the reported issue and re-run it.

### Manual install (alternative to the script)

If you'd rather install things yourself:

```bash
npm install
npx playwright install chromium
```

### Google Sheets credentials

1. Create a GCP service account and download its JSON key:
   - [console.cloud.google.com](https://console.cloud.google.com) → create/select a project.
   - APIs & Services → Library → enable **Google Sheets API**.
   - APIs & Services → Credentials → Create Credentials → **Service Account**.
   - Open the service account → Keys → Add Key → JSON → download.
   - Save the downloaded file as `credentials.json` in the project root (gitignored, treat as a secret).

2. Share the target Google Sheet with the service account:
   - Copy the service account's email from `credentials.json` (`client_email` field).
   - Open the sheet → Share → add that email as **Editor**.

3. Configure the sheet target and scrape range in [src/config.ts](src/config.ts):

   | Constant | What it is | How to find it |
   | --- | --- | --- |
   | `SPREADSHEET_ID` | The sheet's ID | From the sheet URL: `docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit` |
   | `SHEET_GID` | The specific tab's ID | From the sheet URL's `#gid=<SHEET_GID>` when that tab is open |
   | `SCRAPE_RANGE_START_ROW` | First row to scrape (inclusive) | Row number in the sheet, e.g. `34` |
   | `SCRAPE_RANGE_END_ROW` | Last row to scrape (inclusive) | Row number in the sheet, e.g. `3` (start/end can be given in either order) |
   | `CREDENTIALS_PATH` | Path to the service account key | Defaults to `credentials.json` in project root |
   | `SESSION_PATH` | Where the Playwright browser session is cached | Defaults to `session/tiktok-state.json` — can leave as-is |

   Video URLs must be in column **C** as hyperlinks; results are written to columns **D–I** (Views, Likes, Comments, Shared, Reposted, Saved).

## Running

- Scrape a single video (hardcoded to row 3, useful for a quick smoke test):

  ```bash
  npm run scrape
  ```

- Scrape the full configured row range (`SCRAPE_RANGE_START_ROW` → `SCRAPE_RANGE_END_ROW`):

  ```bash
  npm run scrape-range
  ```

  This opens a visible (non-headless) Chromium window, processes rows from highest to lowest, and flushes results to the sheet in a single batch update at the end (or immediately if interrupted with Ctrl+C).

## Notes

- `credentials.json` and `session/` are gitignored — never commit them.
- No TikTok account login is needed; the scraper reads public profile/video data and solves TikTok's on-page CAPTCHA challenge automatically when it shows up.
- See [docs/02-scrape-rnd.md](docs/02-scrape-rnd.md) and [docs/03-optimization.md](docs/03-optimization.md) for background on the current architecture.
