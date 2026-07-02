import type { Page } from "playwright";
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
    const found = await waitForLocator(card, `profile grid card for video ${videoId}`);
    if (!found) return null;
    return parseCount(await card.locator('[data-e2e="video-views"]').textContent());
  }
}
