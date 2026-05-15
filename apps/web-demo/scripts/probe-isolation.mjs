import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5177/probe.html');
const text = await page.locator('pre').textContent();
console.log(text);
await browser.close();
