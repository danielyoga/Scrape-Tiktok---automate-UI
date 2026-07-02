import type { Locator } from "playwright";
import { promptEnterOrSkip } from "./prompt.ts";
import { SELECTOR_WAIT_TIMEOUT_MS, ELEMENT_WAIT_RETRIES, ELEMENT_WAIT_RELOAD_AFTER_ATTEMPT } from "../config.ts";

/**
 * Waits for a locator with a short timeout, retrying silently a few times
 * (reloading the page partway through) before ever bothering the user —
 * most timeouts are transient slow loads, not real selector breakage.
 * Only escalates to a terminal prompt after all automatic retries fail.
 *
 * Returns false if the user typed "skip" at the prompt, so the caller can
 * move on instead of blocking forever on a broken/missing selector.
 */
export async function waitForLocator(locator: Locator, description: string): Promise<boolean> {
  for (let attempt = 1; attempt <= ELEMENT_WAIT_RETRIES; attempt++) {
    try {
      await locator.waitFor({ timeout: SELECTOR_WAIT_TIMEOUT_MS });
      return true;
    } catch {
      console.log(
        `Timed out (attempt ${attempt}/${ELEMENT_WAIT_RETRIES}) waiting for: ${description}`,
      );
      if (attempt === ELEMENT_WAIT_RELOAD_AFTER_ATTEMPT) {
        await locator.page().reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
  }

  while (true) {
    const skip = await promptEnterOrSkip(
      `Still can't find "${description}" — inspect the page for the correct selector, then`,
    );
    if (skip) {
      console.log(`Skipped: ${description}`);
      return false;
    }
    try {
      await locator.waitFor({ timeout: SELECTOR_WAIT_TIMEOUT_MS });
      return true;
    } catch {
      console.log(`Still not found: ${description}`);
    }
  }
}
