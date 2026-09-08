import type { Page } from "playwright";
import { promptEnterOrSkip } from "./prompt.ts";

/**
 * Navigates with a few silent retries (backoff + reload) before ever
 * bothering a human — TikTok blocks/rate-limits often clear up on their own
 * within a few seconds (e.g. net::ERR_HTTP_RESPONSE_CODE_FAILURE seen on
 * vt.tiktok.com short-link redirects). Only escalates to a terminal prompt
 * after all automatic retries are exhausted.
 *
 * Returns false if the user typed "skip" at the escalation prompt.
 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  opts: Parameters<Page["goto"]>[1],
  maxAttempts = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, opts);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Navigation failed (attempt ${attempt}/${maxAttempts}) for ${url}: ${message}`);
      if (attempt < maxAttempts) {
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  while (true) {
    const skip = await promptEnterOrSkip(
      `Still can't reach "${url}" after ${maxAttempts} retries — check the browser, then`,
    );
    if (skip) return false;
    try {
      await page.goto(url, opts);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Still failing: ${message}`);
    }
  }
}
