import { chromium } from '@playwright/test';

const url = 'https://example.test/live/h265.flv?codeType=H265';
const browser = await chromium.launch({ headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', msg => console.log(`[console:${msg.type()}] ${msg.text().slice(0, 1000)}`));
page.on('pageerror', err => console.log(`[pageerror] ${err.message}`));
await page.goto('http://127.0.0.1:5177/', { waitUntil: 'domcontentloaded' });
console.log('isolation', await page.evaluate(() => ({ crossOriginIsolated, sab: typeof SharedArrayBuffer, secure: isSecureContext })));
await page.getByRole('textbox', { name: '视频地址' }).fill(url);
await page.getByRole('button', { name: '播放' }).click();
await page.waitForTimeout(45000);
const body = await page.locator('body').innerText();
console.log('BODY_START');
console.log(body);
console.log('BODY_END');
await page.screenshot({ path: '/tmp/streamflow-https-h265.png', fullPage: true });
await browser.close();
