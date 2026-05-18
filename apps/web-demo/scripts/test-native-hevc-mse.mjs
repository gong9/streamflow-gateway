import { chromium } from 'playwright';

const url = process.env.STREAM_URL;
if (!url) {
  throw new Error('Set STREAM_URL to an HTTPS H265 FLV test stream before running this script.');
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => {
  const text = msg.text();
  if (/原生|H265|MSE|fMP4|fallback|error|raw-flv|fmp4|not supported/i.test(text)) console.log(`[console:${msg.type()}]`, text);
});
await page.goto('http://127.0.0.1:5177/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('env', await page.evaluate(() => ({
  secure: isSecureContext,
  coi: crossOriginIsolated,
  sab: typeof SharedArrayBuffer,
  mse: typeof MediaSource,
  hevc: typeof MediaSource !== 'undefined' ? [
    'video/mp4; codecs="hvc1.1.6.L120.B0"',
    'video/mp4; codecs="hev1.1.6.L120.B0"',
    'video/mp4; codecs="hvc1"',
    'video/mp4; codecs="hev1"'
  ].map(mime => [mime, MediaSource.isTypeSupported(mime)]) : []
})));
await page.fill('#stream-url', url);
await page.click('button[type="submit"]');
await page.waitForTimeout(25000);
const body = await page.locator('body').innerText();
console.log('BODY_START');
console.log(body);
console.log('BODY_END');
await browser.close();
