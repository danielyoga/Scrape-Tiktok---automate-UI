import type { Locator, Page } from "playwright";
import { parseCount } from "../utils/parse-count.ts";
import { waitForLocator } from "../utils/wait-with-prompt.ts";
import { NAVIGATION_TIMEOUT_MS } from "../config.ts";

export class ProfilePage {
  constructor(private readonly page: Page) {}

  async open(username: string) {
    await this.page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
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
      const height = await this.page.evaluate(() => document.body.scrollHeight);
      if (height === lastHeight) return;
      lastHeight = height;
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(800);
    }
  }
}
