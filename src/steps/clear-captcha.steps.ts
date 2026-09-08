import type { BrowserContext, Page } from "playwright";
import { CaptchaPage } from "../pages/captcha.page.ts";
import { autoSolveCaptcha } from "./solve-captcha.steps.ts";
import { promptEnter } from "../utils/prompt.ts";
import { SESSION_PATH } from "../config.ts";

/**
 * If TikTok's slider CAPTCHA is showing, try to solve it automatically
 * (rotate-to-align solve in solve-captcha.steps.ts). Only falls back to a
 * human prompt if every automatic attempt fails. Persists the resulting
 * cookies so later runs can skip re-triggering it (for a while).
 */
export async function clearCaptchaIfPresent(page: Page, context: BrowserContext): Promise<void> {
  const captcha = new CaptchaPage(page);
  if (!(await captcha.isPresent())) return;

  const solved = await autoSolveCaptcha(page);

  if (!solved) {
    await promptEnter("Auto-solve failed — solve the slider puzzle manually in the browser window.");
    if (await captcha.isPresent()) {
      throw new Error("CAPTCHA still present after confirmation — solve it fully before continuing.");
    }
  }

  await context.storageState({ path: SESSION_PATH });
  console.log(`CAPTCHA cleared — cookies saved to ${SESSION_PATH}`);
}
