import { google, sheets_v4 } from "googleapis";
import { SPREADSHEET_ID, SHEET_GID, CREDENTIALS_PATH } from "./config.ts";

let cachedClient: sheets_v4.Sheets | null = null;
let cachedTitle: string | null = null;

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedClient) return cachedClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

async function getSheetTitle(): Promise<string> {
  if (cachedTitle) return cachedTitle;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === SHEET_GID);
  if (!sheet?.properties?.title) {
    throw new Error(`No sheet found with gid ${SHEET_GID}`);
  }
  cachedTitle = sheet.properties.title;
  return cachedTitle;
}

/** Concise message for Google API errors — avoids dumping the full Gaxios object. */
export function sheetsErrorMessage(err: unknown): string {
  const anyErr = err as { code?: number; message?: string } | undefined;
  if (anyErr?.code === 429) return "Google Sheets API quota exceeded (rate limit) — slow down requests.";
  return anyErr?.message ?? String(err);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = (err as { code?: number })?.code === 429;
      if (!isRateLimit || attempt >= retries) throw err;
      const delayMs = 2000 * 2 ** attempt;
      console.log(`Sheets API rate limited, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Reads hyperlink URLs for a whole column range (e.g. "C60:C87") in a single API call. */
export async function getCellLinksInRange(startRow: number, endRow: number): Promise<Map<number, string | null>> {
  const [from, to] = startRow <= endRow ? [startRow, endRow] : [endRow, startRow];
  const sheets = await getSheetsClient();
  const title = await getSheetTitle();

  const meta = await withRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      includeGridData: true,
      ranges: [`${title}!C${from}:C${to}`],
    }),
  );

  const rowData = meta.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const result = new Map<number, string | null>();
  rowData.forEach((row, i) => {
    result.set(from + i, row.values?.[0]?.hyperlink ?? null);
  });
  return result;
}

export interface RowMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shared: number | null;
  reposted: number | null;
  saved: number | null;
}

/** Writes Views/Likes/Comments/Shared/Reposted/Saved (columns D-I) for many rows in a single API call. */
export async function batchUpdateRowMetrics(rowMetrics: Map<number, RowMetrics>): Promise<void> {
  if (rowMetrics.size === 0) return;
  const sheets = await getSheetsClient();
  const title = await getSheetTitle();

  const data = [...rowMetrics.entries()].map(([row, metrics]) => ({
    range: `${title}!D${row}:I${row}`,
    values: [
      [
        metrics.views ?? "",
        metrics.likes ?? "",
        metrics.comments ?? "",
        metrics.shared ?? "",
        metrics.reposted ?? "",
        metrics.saved ?? "",
      ],
    ],
  }));

  await withRetry(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: "RAW", data },
    }),
  );
}
