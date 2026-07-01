import type { Page } from "playwright";

export class CaptchaPage {
  static readonly CONTAINER_SELECTOR = "#captcha-verify-container-main-page, .captcha-verify-container";

  constructor(private readonly page: Page) {}

  async isPresent(): Promise<boolean> {
    return (await this.page.locator(CaptchaPage.CONTAINER_SELECTOR).count()) > 0;
  }

  /** Polls until the captcha container disappears (user solved it manually) or times out. */
  async waitUntilCleared(timeoutMs: number, pollIntervalMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.isPresent())) return true;
      await this.page.waitForTimeout(pollIntervalMs);
    }
    return false;
  }
}
