import type { Page } from "playwright";

const ERROR_TEXT = "Oops! Something went wrong";

/**
 * TikTok occasionally serves a generic "Oops! Something went wrong" error
 * page (rate-limiting or a transient backend hiccup) in place of the real
 * content. A plain reload reliably clears it, so retry a few times before
 * giving up and letting the caller's normal selector-timeout handling kick in.
 */
export async function reloadIfErrorPage(page: Page, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if ((await page.getByText(ERROR_TEXT).count()) === 0) return;
    console.log(`TikTok error page detected (attempt ${attempt}/${maxAttempts}) — reloading...`);
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}
