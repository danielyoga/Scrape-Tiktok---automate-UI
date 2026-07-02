import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { getCellLinksInRange, batchUpdateRowMetrics, sheetsErrorMessage, type RowMetrics } from "../sheets.ts";
import { scrapeVideo } from "../steps/scrape-video.steps.ts";
import { SESSION_PATH, SCRAPE_RANGE_START_ROW, SCRAPE_RANGE_END_ROW } from "../config.ts";

const links = await getCellLinksInRange(SCRAPE_RANGE_START_ROW, SCRAPE_RANGE_END_ROW);
const rows = [...links.keys()].sort((a, b) => b - a);

const browser = await chromium.launch({ headless: false, args: ["--mute-audio"] });
const context = await browser.newContext(
  existsSync(SESSION_PATH) ? { storageState: SESSION_PATH } : {},
);
const page = await context.newPage();

const results: Record<number, unknown> = {};
const pendingMetrics = new Map<number, RowMetrics>();

async function flush() {
  if (pendingMetrics.size === 0) return;
  console.log(`\nFlushing ${pendingMetrics.size} row(s) to the sheet in one batch...`);
  await batchUpdateRowMetrics(pendingMetrics);
  pendingMetrics.clear();
}

process.on("SIGINT", async () => {
  console.log("\nInterrupted — flushing pending updates before exit...");
  await flush();
  await browser.close();
  process.exit(0);
});

for (const row of rows) {
  console.log(`\n--- Row ${row} ---`);
  const url = links.get(row) ?? null;
  if (!url) {
    console.log(`Row ${row}: C${row} has no hyperlink, skipping.`);
    results[row] = null;
    continue;
  }

  try {
    const result = await scrapeVideo(page, context, url);
    console.log(JSON.stringify(result, null, 2));
    results[row] = result;
    pendingMetrics.set(row, {
      views: result.views,
      likes: result.likes,
      comments: result.comments,
      shared: result.shared,
      saved: result.saved,
    });
  } catch (err) {
    console.error(`Row ${row} failed: ${sheetsErrorMessage(err)}`);
    results[row] = null;
  }

  await context.storageState({ path: SESSION_PATH });
}

await flush();

console.log("\n=== Summary ===");
console.log(JSON.stringify(results, null, 2));

await browser.close();
