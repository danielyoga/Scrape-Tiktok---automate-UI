import type { Page } from "playwright";
import { parseCount } from "../utils/parse-count.ts";
import { waitForLocator } from "../utils/wait-with-prompt.ts";
import { gotoWithRetry } from "../utils/retry-navigation.ts";
import { NAVIGATION_TIMEOUT_MS } from "../config.ts";

export interface VideoStats {
  likes: number | null;
  comments: number | null;
  shared: number | null;
  saved: number | null;
}

export class VideoPage {
  constructor(private readonly page: Page) {}

  async open(url: string) {
    const ok = await gotoWithRetry(this.page, url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    if (!ok) throw new Error(`Skipped: could not open video page ${url}`);
  }

  async getStats(): Promise<VideoStats> {
    const found = await waitForLocator(this.page.locator('[data-e2e="like-count"]').first(), "video page like-count");
    if (!found) return { likes: null, comments: null, shared: null, saved: null };

    return {
      likes: await this.readCount("like-count"),
      comments: await this.readCount("comment-count"),
      shared: await this.readCount("share-count"),
      saved: await this.readCount("favorite-count"),
    };
  }

  private async readCount(e2e: string): Promise<number | null> {
    const el = this.page.locator(`[data-e2e="${e2e}"]`).first();
    if ((await el.count()) === 0) return null;
    return parseCount(await el.textContent());
  }
}
