import type { Page } from "playwright";
import { CaptchaPage } from "../pages/captcha.page.ts";

/**
 * TikTok's slider CAPTCHA here is the "rotate to align" variant: two
 * circular crops of the same photo — a full outer circle and a smaller
 * inner circle that starts mis-rotated. Dragging the slider rotates the
 * inner circle; solved when its content lines up with the outer circle at
 * the same radius/angle. There's no known fixed px->degree ratio, so the
 * solve calibrates it live mid-drag instead of guessing.
 */

const CONTAINER_SELECTOR = CaptchaPage.CONTAINER_SELECTOR;
const IMG_SELECTOR = `${CONTAINER_SELECTOR} img[alt="Captcha"]`;
const SLIDE_BUTTON_SELECTOR = "#captcha_slide_button";
const REFRESH_BUTTON_SELECTOR = "#captcha_refresh_button";

/** Finds the rotation (degrees, 0-360) that best aligns the inner circle with the outer one. */
async function computeTargetAngle(page: Page): Promise<number> {
  return page.evaluate(
    ({ imgSelector }) => {
      return new Promise<number>((resolve, reject) => {
        const imgs = document.querySelectorAll(imgSelector);
        if (imgs.length < 2) return reject(new Error("captcha images not found"));
        const outerEl = imgs[0] as HTMLImageElement;
        const innerEl = imgs[1] as HTMLImageElement;

        const loadImage = (src: string) =>
          new Promise<HTMLImageElement>((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = src;
          });

        Promise.all([loadImage(outerEl.src), loadImage(innerEl.src)]).then(([outer, inner]) => {
          const SIZE = 64;
          const outerCanvas = document.createElement("canvas");
          outerCanvas.width = SIZE;
          outerCanvas.height = SIZE;
          const outerCtx = outerCanvas.getContext("2d")!;
          outerCtx.drawImage(outer, 0, 0, SIZE, SIZE);
          const outerData = outerCtx.getImageData(0, 0, SIZE, SIZE).data;

          const scale = innerEl.clientHeight / outerEl.clientHeight || 0.6;
          const innerCanvas = document.createElement("canvas");
          innerCanvas.width = SIZE;
          innerCanvas.height = SIZE;
          const innerCtx = innerCanvas.getContext("2d")!;

          function scoreAt(thetaDeg: number): number {
            innerCtx.clearRect(0, 0, SIZE, SIZE);
            innerCtx.save();
            innerCtx.translate(SIZE / 2, SIZE / 2);
            innerCtx.rotate((thetaDeg * Math.PI) / 180);
            const drawSize = SIZE / scale;
            innerCtx.drawImage(inner, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            innerCtx.restore();
            const innerData = innerCtx.getImageData(0, 0, SIZE, SIZE).data;

            let diff = 0;
            let count = 0;
            const c = SIZE / 2;
            const maxR = SIZE / 2;
            for (let y = 0; y < SIZE; y++) {
              for (let x = 0; x < SIZE; x++) {
                const dx = x - c;
                const dy = y - c;
                const r = Math.sqrt(dx * dx + dy * dy);
                if (r > maxR * 0.85 || r < maxR * 0.15) continue;
                const idx = (y * SIZE + x) * 4;
                if (innerData[idx + 3] < 10) continue;
                const dr = outerData[idx] - innerData[idx];
                const dg = outerData[idx + 1] - innerData[idx + 1];
                const db = outerData[idx + 2] - innerData[idx + 2];
                diff += dr * dr + dg * dg + db * db;
                count++;
              }
            }
            return count > 0 ? diff / count : Infinity;
          }

          let bestAngle = 0;
          let bestScore = Infinity;
          for (let theta = 0; theta < 360; theta += 2) {
            const score = scoreAt(theta);
            if (score < bestScore) {
              bestScore = score;
              bestAngle = theta;
            }
          }
          for (let theta = bestAngle - 2; theta <= bestAngle + 2; theta += 0.5) {
            const t = ((theta % 360) + 360) % 360;
            const score = scoreAt(t);
            if (score < bestScore) {
              bestScore = score;
              bestAngle = t;
            }
          }
          resolve(bestAngle);
        }, reject);
      });
    },
    { imgSelector: IMG_SELECTOR },
  );
}

async function getSliderGeometry(page: Page) {
  return page.evaluate(
    ({ buttonSelector }) => {
      const button = document.querySelector(buttonSelector) as HTMLElement | null;
      const track = button?.closest(".cap-rounded-full") as HTMLElement | null;
      if (!button || !track) throw new Error("captcha slider elements not found");
      const trackRect = track.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        startX: buttonRect.left + buttonRect.width / 2,
        startY: buttonRect.top + buttonRect.height / 2,
        maxDragPx: trackRect.width - buttonRect.width,
      };
    },
    { buttonSelector: SLIDE_BUTTON_SELECTOR },
  );
}

async function readInnerRotation(page: Page): Promise<number> {
  return page.evaluate(({ imgSelector }) => {
    const imgs = document.querySelectorAll(imgSelector);
    const inner = imgs[1] as HTMLElement | undefined;
    const match = inner?.style.transform.match(/rotate\(([-\d.]+)deg\)/);
    return match ? parseFloat(match[1]) : 0;
  }, { imgSelector: IMG_SELECTOR });
}

/** Human-like eased step sizes: bigger moves early, finer near the target. */
function easedSteps(totalPx: number, steps: number): number[] {
  const offsets: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    offsets.push(totalPx * (1 - Math.pow(1 - t, 2)));
  }
  return offsets;
}

async function performDrag(page: Page, targetAngle: number, maxAttempts = 3): Promise<boolean> {
  const geom = await getSliderGeometry(page);

  await page.mouse.move(geom.startX, geom.startY);
  await page.mouse.down();

  // Calibration leg: move a small amount and read the resulting rotation
  // to derive degrees-per-pixel live, rather than assuming a fixed ratio.
  const calibrationPx = Math.max(8, Math.round(geom.maxDragPx * 0.15));
  for (const offset of easedSteps(calibrationPx, 5)) {
    await page.mouse.move(geom.startX + offset, geom.startY + (Math.random() * 2 - 1), { steps: 2 });
    await page.waitForTimeout(20 + Math.random() * 20);
  }
  const calibrationAngle = await readInnerRotation(page);
  const degreesPerPx = calibrationAngle !== 0 ? calibrationAngle / calibrationPx : 360 / geom.maxDragPx;

  const normalizedTarget = ((targetAngle % 360) + 360) % 360;
  const targetPx = Math.min(geom.maxDragPx, Math.max(0, normalizedTarget / degreesPerPx));

  for (const offset of easedSteps(targetPx - calibrationPx, 10)) {
    await page.mouse.move(geom.startX + calibrationPx + offset, geom.startY + (Math.random() * 2 - 1), {
      steps: 2,
    });
    await page.waitForTimeout(15 + Math.random() * 25);
  }

  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(600);

  const captcha = new CaptchaPage(page);
  return !(await captcha.isPresent());
}

/**
 * Attempts to solve the rotate-slider CAPTCHA automatically. Returns true if
 * cleared (or wasn't present), false if all attempts failed (caller decides
 * whether to fall back to a human prompt).
 */
export async function autoSolveCaptcha(page: Page, maxAttempts = 4): Promise<boolean> {
  const captcha = new CaptchaPage(page);
  if (!(await captcha.isPresent())) return true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const targetAngle = await computeTargetAngle(page);
      const solved = await performDrag(page, targetAngle);
      if (solved) {
        console.log(`CAPTCHA auto-solved (attempt ${attempt}/${maxAttempts}, angle ${targetAngle.toFixed(1)}deg)`);
        return true;
      }
      console.log(`CAPTCHA attempt ${attempt}/${maxAttempts} failed (angle ${targetAngle.toFixed(1)}deg) — refreshing puzzle...`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`CAPTCHA solve attempt ${attempt}/${maxAttempts} errored: ${message}`);
    }

    if (attempt < maxAttempts) {
      await page.locator(REFRESH_BUTTON_SELECTOR).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  return !(await captcha.isPresent());
}
