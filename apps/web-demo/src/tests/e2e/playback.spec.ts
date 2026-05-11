import { test, expect } from '@playwright/test';

test('demo renders stream form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('视频预览')).toBeVisible();
  await expect(page.getByPlaceholder('粘贴摄像头或直播地址')).toBeVisible();
});
