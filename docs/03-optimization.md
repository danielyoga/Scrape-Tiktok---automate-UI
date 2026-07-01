# Technical Plan — Part 3: Performance & Request Optimization

## Purpose
Reduce wall-clock time per row and the number of external requests (Google
Sheets API + TikTok page loads), and make element-wait failures self-heal
via automatic retries before falling back to a human prompt.

## Current State (already done, for reference)
- **Sheets API calls per full batch run: 3 total, regardless of row count.**
  1. `spreadsheets.get` (sheet title lookup, cached in-memory after first call)
  2. `spreadsheets.get` with `includeGridData` (batched read of all C-column
     links for the whole row range, one call)
  3. `spreadsheets.values.batchUpdate` (batched write of all D:I results for
     every row, one call, flushed at the end or on `Ctrl+C`)
- **Browser**: one `browser`/`context`/`page` reused for the entire batch —
  no relaunching per row. CAPTCHA-clearance cookies persist across rows.
- **Navigation**: uses `domcontentloaded` instead of `networkidle` (TikTok
  pages never go network-idle due to background polling/video buffering, so
  `networkidle` was causing false 30s timeouts).
- **Element waits**: capped at a short 5s timeout, then falls back to a
  terminal prompt for manual inspection (currently: *no* automatic retry in
  between — goes straight from timeout to blocking on the user).

## Problems to Address

### 1. No auto-retry before human escalation
`waitForLocator` (`src/utils/wait-with-prompt.ts`) times out after 5s and
immediately blocks on `promptEnter`, even for a merely slow page load. Every
transient slowness becomes a manual interruption.

**Fix:** add N automatic silent retries before prompting a human — e.g. 3
attempts of 5s each (15s total), optionally reloading the page between
attempts if the element still isn't found by the 2nd try. Only escalate to
the terminal prompt after all automatic retries are exhausted. This
directly targets "retry to find element before timeout."

### 2. One avoidable Sheets API call (sheet title lookup)
The tab title (`getSheetTitle`) is fetched once per process and cached, but
it's still 1 of the 3 total calls. If the tab name is known and stable, it
can be hardcoded in `config.ts`, dropping total calls to 2.

**Trade-off:** hardcoding breaks silently if the tab is ever renamed. Given
it only saves 1 call out of 3 (already well under quota), recommend
**leaving as-is** unless quota becomes a problem again — not worth the
fragility for this savings.

### 3. No explicit navigation timeout tuning
`page.goto()` calls rely on Playwright's default 30s timeout. Combined with
`domcontentloaded` (fast) this is rarely hit, but if TikTok is slow/rate
limiting, a run can stall 30s per navigation before failing. Lowering to a
deliberate value (e.g. 15s) fails faster into the retry logic instead of
hanging.

### 4. No per-row timing visibility
There's no data on where time actually goes per row (profile nav vs video
nav vs element wait vs captcha prompt). Without this, further optimization
is guesswork.

**Fix:** log elapsed time for each phase per row (profile load, views read,
video load, stats read). Cheap to add, makes future tuning evidence-based
instead of speculative.

### 5. Sequential-only processing (intentional, not a bug)
Rows are processed one at a time in a single tab. Running multiple tabs/
contexts in parallel would cut wall-clock time roughly linearly, but:
- Increases the chance of triggering TikTok's bot detection/CAPTCHA across
  multiple concurrent sessions.
- Cookies/CAPTCHA-clearance are tied to one context — parallel contexts
  would each need their own CAPTCHA clearance, multiplying manual prompts.

**Decision: do not parallelize.** Documenting this explicitly so it isn't
mistaken for an oversight — the sequential, single-session design is a
deliberate trade favoring fewer CAPTCHA interruptions over raw speed.

### 6. Headless mode (future option, not default)
Running headless would reduce rendering overhead per navigation. Deferred
because headless browsers are more readily flagged by TikTok's bot
detection, and this project already fights CAPTCHA once per session as-is —
switching to headless risks making that worse, not better. Revisit only
after selector/CAPTCHA handling has proven stable over many runs.

## Planned Changes (in priority order)
1. Add auto-retry (3× before prompting) to `waitForLocator`, with an
   optional reload between attempts — biggest win for "not taking long
   time" since most timeouts are transient, not real selector breakage.
2. Add per-row phase timing logs.
3. Add an explicit, shorter navigation timeout (config value) instead of
   relying on Playwright's 30s default.
4. Leave Sheets API call count at 3 (already near-optimal); no change.
5. No parallelization, no headless — explicitly deferred per above.

## Config Additions
```
ELEMENT_WAIT_RETRIES = 3
ELEMENT_WAIT_RELOAD_AFTER_ATTEMPT = 2   // reload page before this attempt
NAVIGATION_TIMEOUT_MS = 15000
```
