const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[console:${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('response', async r => {
    if (r.url().includes('/api/devotion')) {
      logs.push(`[resp] ${r.status()} ${r.url()}`);
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/vq_1_initial.png' });

  // Check if phone registration screen is present
  const phoneInput = await page.$('input[name="phone"]');
  if (phoneInput) {
    await phoneInput.fill('81357049895');
    const submit = await page.$('button[type="submit"]');
    await submit.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: '/tmp/vq_2_after_login.png' });

  await page.goto('http://localhost:3000/devotional', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/vq_3_devotional.png', fullPage: true });

  console.log(JSON.stringify(logs, null, 2));
  await browser.close();
})();
