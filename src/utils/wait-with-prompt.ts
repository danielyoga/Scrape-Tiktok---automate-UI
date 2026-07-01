import type { Locator } from "playwright";
import { promptEnter } from "./prompt.ts";
import { SELECTOR_WAIT_TIMEOUT_MS, ELEMENT_WAIT_RETRIES, ELEMENT_WAIT_RELOAD_AFTER_ATTEMPT } from "../config.ts";

/**
 * Waits for a locator with a short timeout, retrying silently a few times
 * (reloading the page partway through) before ever bothering the user —
 * most timeouts are transient slow loads, not real selector breakage.
 * Only escalates to a terminal prompt after all automatic retries fail.
 */
export async function waitForLocator(locator: Locator, description: string): Promise<void> {
  for (let attempt = 1; attempt <= ELEMENT_WAIT_RETRIES; attempt++) {
    try {
      await locator.waitFor({ timeout: SELECTOR_WAIT_TIMEOUT_MS });
      return;
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
    await promptEnter(`Still can't find "${description}" — inspect the page for the correct selector, then`);
    try {
      await locator.waitFor({ timeout: SELECTOR_WAIT_TIMEOUT_MS });
      return;
    } catch {
      console.log(`Still not found: ${description}`);
    }
  }
}
