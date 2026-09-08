import type { Page } from "playwright";

const ERROR_TEXTS = ["Oops! Something went wrong", "Something went wrong", "Please try again later"];

async function hasErrorText(page: Page): Promise<boolean> {
  for (const text of ERROR_TEXTS) {
    if ((await page.getByText(text).count()) > 0) return true;
  }
  return false;
}

/**
 * TikTok occasionally serves a generic error interstitial ("Oops! Something
 * went wrong" or "Something went wrong / Please try again later", with its
 * own "Refresh" button) in place of the real content — usually rate-limiting
 * or a transient backend hiccup. A plain `page.reload()` re-requests the
 * same broken response too often to be reliable here, so instead re-navigate
 * (page.goto) to the current URL, which behaves like typing the link fresh
 * rather than resubmitting the failed request — clears it more reliably.
 * Retries a few times before giving up and letting the caller's normal
 * selector-timeout handling kick in.
 */
export async function reloadIfErrorPage(page: Page, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await hasErrorText(page))) return;
    console.log(`TikTok error page detected (attempt ${attempt}/${maxAttempts}) — re-navigating to ${page.url()}...`);
    await page.goto(page.url(), { waitUntil: "domcontentloaded" });
  }
}
