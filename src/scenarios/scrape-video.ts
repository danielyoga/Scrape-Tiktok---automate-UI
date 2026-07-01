import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { getCellLinksInRange } from "../sheets.ts";
import { scrapeVideo } from "../steps/scrape-video.steps.ts";
import { SESSION_PATH } from "../config.ts";

const url = (await getCellLinksInRange(3, 3)).get(3) ?? null;
if (!url) {
  console.error("C3 has no hyperlink.");
  process.exit(1);
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext(
  existsSync(SESSION_PATH) ? { storageState: SESSION_PATH } : {},
);
const page = await context.newPage();

const result = await scrapeVideo(page, context, url);
console.log(JSON.stringify(result, null, 2));

await browser.close();
