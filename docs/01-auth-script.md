# Technical Plan — Part 1: Auth Script (`login.ts`)

## Purpose
One-time (or as-needed) script that opens a real browser, lets the user log
into TikTok manually, and persists the resulting session so later scripts
never touch the login form.

## Scope
- Login only. No scraping, no sheet writes.
- Manual trigger: `npm run login` (or `ts-node src/login.ts`).

## Behavior
1. Launch Playwright Chromium, **non-headless**, fresh context (no existing
   storageState).
2. Navigate to `https://www.tiktok.com/login`.
3. Wait for user to complete login manually in the opened window (handles
   captcha/2FA/QR — anything automation can't do reliably).
4. Detect successful login by polling for a logged-in-only element (e.g. the
   profile avatar in the top nav, or absence of the login button) —
   poll every 2s, timeout after 5 minutes with a clear error message.
5. On success: `context.storageState({ path: 'session/tiktok-state.json' })`.
6. Print confirmation with the logged-in username (scrape it from the nav)
   so the user can visually confirm the right account was saved.

## File Output
- `session/tiktok-state.json` — Playwright storageState (cookies +
  localStorage). Gitignored.

## Error Handling
- Timeout waiting for login → exit with non-zero code, clear message
  ("login not detected within 5 minutes, re-run and try again").
- No retry/auto-fallback logic — this script is inherently a manual,
  human-in-the-loop step.

## Validation Script (`check-session.ts`, optional small addition)
Small standalone check reusable by `scrape.ts`:
- Launch with existing `storageState`.
- Navigate to `tiktok.com/foryou` (or profile page).
- If redirected to login / login button visible → session expired.
- Exit code 0 = valid, 1 = expired.

## Open Questions
- `src/session.ts` currently guesses `[data-e2e="nav-avatar"]` as the
  logged-in indicator — unverified, since inspecting a real logged-in TikTok
  session requires an actual account (can't be done from here). **First run
  of `npm run login` must confirm this selector**; if login succeeds but
  the script times out anyway, inspect the nav bar's avatar element and
  update `LOGGED_IN_SELECTOR` in `src/session.ts`.
- Do we support only one saved session at a time, or multiple named
  sessions (e.g. `session/<account>.json`)? Default: single session file
  for v1, revisit if multi-account is needed later.

## Out of Scope (v1)
- Automated captcha solving.
- Auto re-login on expiry (user re-runs `login.ts` manually).
- Encrypting the session file at rest.
