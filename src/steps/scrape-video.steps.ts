import type { BrowserContext, Page } from "playwright";
import { ProfilePage } from "../pages/profile.page.ts";
import { VideoPage } from "../pages/video.page.ts";
import { clearCaptchaIfPresent } from "./clear-captcha.steps.ts";
import { reloadIfErrorPage } from "./reload-on-error.steps.ts";
import { NAVIGATION_TIMEOUT_MS } from "../config.ts";

export interface VideoMetrics {
  username: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shared: number | null;
  reposted: null;
  saved: number | null;
}

function parseVideoUrl(url: string): { username: string; videoId: string } {
  const match = url.match(/@([^/]+)\/video\/(\d+)/);
  if (!match) throw new Error(`Could not parse username/videoId from URL: ${url}`);
  const [, username, videoId] = match;
  return { username, videoId };
}

const SHORT_LINK_PATTERN = /^https?:\/\/(vt|vm)\.tiktok\.com\//;

/** Short links (vt.tiktok.com/vm.tiktok.com) redirect to the canonical /@user/video/id URL. */
async function resolveShortLink(page: Page, url: string): Promise<string> {
  if (!SHORT_LINK_PATTERN.test(url)) return url;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  return page.url();
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  console.log(`  [${label}] ${Date.now() - start}ms`);
  return result;
}

export async function scrapeVideo(page: Page, context: BrowserContext, url: string): Promise<VideoMetrics> {
  const resolvedUrl = await timed("resolve short link", () => resolveShortLink(page, url));
  const { username, videoId } = parseVideoUrl(resolvedUrl);

  const profilePage = new ProfilePage(page);
  await timed("profile load", () => profilePage.open(username));
  await reloadIfErrorPage(page);
  await clearCaptchaIfPresent(page, context);
  const views = await timed("read views", () => profilePage.getVideoViews(videoId));

  const videoPage = new VideoPage(page);
  await timed("video load", () => videoPage.open(resolvedUrl));
  await reloadIfErrorPage(page);
  await clearCaptchaIfPresent(page, context);
  const stats = await timed("read stats", () => videoPage.getStats());

  return { username, views, reposted: null, ...stats };
}
