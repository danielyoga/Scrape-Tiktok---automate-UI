import type { BrowserContext, Page } from "playwright";
import { CaptchaPage } from "../pages/captcha.page.ts";
import { promptEnter } from "../utils/prompt.ts";
import { SESSION_PATH } from "../config.ts";

/**
 * If TikTok's slider CAPTCHA is showing, pause and ask the user to solve it
 * manually in the visible browser window, then persist the resulting cookies
 * so later runs can skip re-triggering it (for a while).
 */
export async function clearCaptchaIfPresent(page: Page, context: BrowserContext): Promise<void> {
  const captcha = new CaptchaPage(page);
  if (!(await captcha.isPresent())) return;

  await promptEnter("CAPTCHA detected — solve the slider puzzle in the browser window.");

  if (await captcha.isPresent()) {
    throw new Error("CAPTCHA still present after confirmation — solve it fully before continuing.");
  }

  await context.storageState({ path: SESSION_PATH });
  console.log(`CAPTCHA cleared — cookies saved to ${SESSION_PATH}`);
}
