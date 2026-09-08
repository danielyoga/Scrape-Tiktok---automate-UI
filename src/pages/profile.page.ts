import type { Locator, Page } from "playwright";
import { parseCount } from "../utils/parse-count.ts";
import { waitForLocator } from "../utils/wait-with-prompt.ts";
import { gotoWithRetry } from "../utils/retry-navigation.ts";
import { NAVIGATION_TIMEOUT_MS } from "../config.ts";

export class ProfilePage {
  constructor(private readonly page: Page) {}

  async open(username: string) {
    const ok = await gotoWithRetry(this.page, `https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (!ok) throw new Error(`Skipped: could not open profile for @${username}`);
  }

  /** Reads the Views count from a video's thumbnail card on the profile grid. */
  async getVideoViews(videoId: string): Promise<number | null> {
    const card = this.page.locator(`a[href*="/video/${videoId}"]`).first();
    await this.scrollUntilVisible(card);
    const found = await waitForLocator(card, `profile grid card for video ${videoId}`);
    if (!found) return null;
    return parseCount(await card.locator('[data-e2e="video-views"]').textContent());
  }

  /**
   * The profile grid lazy-loads videos as the page scrolls, so older videos
   * aren't in the DOM on initial load. Scrolls to the bottom repeatedly until
   * the card appears or the page stops growing (no more videos to load).
   */
  private async scrollUntilVisible(card: Locator, maxAttempts = 20): Promise<void> {
    let lastHeight = -1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if ((await card.count()) > 0) return;

      // document.body can be transiently null/gone if the page is still
      // mid-navigation (e.g. a redirect firing right after domcontentloaded)
      // or gets swapped out between our count() check and evaluate() below —
      // treat that as "not ready yet" and retry instead of crashing the row.
      let height: number | null;
      try {
        height = await this.page.evaluate(() => document.body?.scrollHeight ?? null);
      } catch {
        height = null;
      }
      if (height === null) {
        await this.page.waitForTimeout(500);
        continue;
      }

      if (height === lastHeight) return;
      lastHeight = height;
      await this.page
        .evaluate(() => window.scrollTo(0, document.body?.scrollHeight ?? 0))
        .catch(() => {});
      await this.page.waitForTimeout(800);
    }
  }
}
