# Technical Plan — Part 2: TikTok Scrape R&D (`scrape.ts`)

## Purpose
Given a saved session and a video URL, open the video page in-UI and extract
the metrics needed for the sheet: Views, Likes, Comments, Shared, Reposted,
Saved, Username.

This part is explicitly **R&D** — TikTok's DOM is undocumented and shifts
often, so the goal here is to validate selectors and extraction logic against
real pages before wiring it into the full pipeline (Part 3: sheet I/O).

## Scope
- Single-video extraction only (no batch loop, no sheet read/write yet).
- Input: one hardcoded/CLI-arg video URL.
- Output: console-logged JSON of extracted fields, for manual verification
  against what's visible on the page.

## Known Selectors (from manual inspection, confirm still valid before use)
| Field    | Selector | Confidence |
|----------|----------|------------|
| Views    | `[data-e2e="video-views"]` | high |
| Likes    | `[data-e2e="like-count"]` | high |
| Comments | `[data-e2e="comment-count"]` | high |
| Shared   | `[data-e2e="share-count"]` | high |
| Saved    | `[data-e2e="favorite-count"]` | high |
| Reposted | **none — confirmed unavailable** | TikTok's video-page UI does not expose a repost count/element at all (checked directly, not just a zero-count case). Sheet column H (Reposted) will always be written as blank/0. |
| Username | `href="/@<username>"` on profile link | medium — verify it's still the author link and not a suggested/related account |

## R&D Tasks (in order)
1. **Confirm session reuse works for scraping** — load `storageState`,
   navigate directly to a video URL, verify no login redirect.
2. **Confirm count selectors on 2–3 different videos** (including at least
   one with high counts using K/M suffixes, e.g. `4.4K`) to validate the
   number parser handles both raw and abbreviated formats.
3. ~~Find the Reposted selector~~ — **done, confirmed unavailable.** TikTok's
   video-page UI has no repost-count element. Sheet column H (Reposted) will
   always be written blank/0. No further R&D needed here.
4. **Number parsing** — not a real risk, but implement correctly up front:
   - Observed format for counts under ~100K: `.` as thousands separator
     (e.g. `18.800` = 18,800, `4.409` = 4,409) — confirmed from real sheet
     data, this is TikTok's locale-based full-number display.
   - Above ~100K, TikTok switches to abbreviated form (`1.2K` → 1200, `3.4M`
     → 3,400,000) — none of the current sample videos hit this range, but
     the parser should handle both cases from the start since it costs
     nothing extra to write once, correctly.
   - Validate parser output against ground truth by cross-checking a known
     video's real, human-visible count.
5. **Timing/reliability** — determine wait strategy: fixed selector-wait
   (`page.waitForSelector`) vs. explicit sleep. Avoid fixed sleeps where
   possible; prefer waiting on the actual DOM node.
6. **Rate-limiting / bot-detection behavior** — note any CAPTCHA, "detected
   unusual traffic" interstitials, or blocks encountered while navigating
   multiple videos in a row; decide on delay-between-requests strategy for
   Part 3 based on what's observed here.

## Output of This Phase
- A working `scrape.ts` that, given one URL, prints:
  ```json
  { "username": "...", "views": 688, "likes": 31, "comments": 6, "shared": 3, "reposted": null, "saved": 0 }
  ```
- A short findings note (append to this doc) on: confirmed/rejected
  selectors, number format observed, any bot-detection encountered, and the
  final answer on Reposted.

## Explicitly Deferred to Part 3
- Reading the video URL list from the Google Sheet (column C).
- Writing results back to columns D–I.
- Looping over multiple rows / batching / delays between requests at scale.
- Retry logic for failed navigations.

## Findings (from live no-login test against C3's video)
- **Video watch page** (e.g. `tiktok.com/@user/video/<id>`) works while
  logged out — no login wall. It renders as a feed item
  (`data-e2e="feed-video"` / `recommend-list-item-container"`), and exposes
  `like-count`, `comment-count`, `share-count`, `favorite-count` reliably.
  It does **not** expose `video-views` at all — that field lives elsewhere.
- **Views come from the profile grid**, not the video page — matches the
  original `@steps` capture (views were read from the video's thumbnail
  `<a data-e2e="...">` card while on the profile page, not the open video).
- **Profile pages require login to view the video grid** while logged out —
  confirmed live: navigating to `tiktok.com/@<user>` while logged out shows
  the profile header fine, but the "Videos" tab is gated behind a slider
  CAPTCHA + "Log in" prompt. The grid `<a href="/video/...">` links are not
  in the DOM at all until authenticated.
- **Conclusion:** Views cannot be scraped without an authenticated session.
  Likes/Comments/Shares/Saved *can* be scraped logged-out from the video
  page alone, but since Views requires login anyway, the real pipeline
  should always use the authenticated session (Part 1's `login.ts` /
  `storageState`) for both steps — no logged-out fast path.
- Number parsing and Reposted findings (above) still hold — no change.

## Next Step
Re-run this same two-step scrape (profile grid for views, video page for the
rest) using the saved `storageState` from `login.ts` instead of a fresh
logged-out context, to confirm the CAPTCHA/login wall disappears once
authenticated.
