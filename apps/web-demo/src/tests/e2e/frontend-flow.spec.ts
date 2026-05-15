import { test, expect } from '@playwright/test';

test('frontend can start, switch, and stop a stream through the real gateway', async ({ page }) => {
  await page.goto('/');

  const input = page.getByPlaceholder('粘贴摄像头或直播地址');
  await input.fill('rtsp://example.test/live/front-a');
  await page.getByRole('button', { name: '开始播放' }).click();

  const streamId = page.getByTestId('stream-id');
  await expect(streamId).not.toHaveText('-');
  const firstStreamId = await streamId.textContent();
  await expect(page.getByTestId('ws-url')).toContainText(`/ws/streams/${firstStreamId}`);
  await expect(page.getByTestId('player-status')).not.toHaveText('已停止');

  await input.fill('rtmp://example.test/live/front-b');
  await page.getByRole('button', { name: '切换画面' }).click();
  await expect(streamId).not.toHaveText(firstStreamId ?? '');
  const secondStreamId = await streamId.textContent();
  await expect(page.getByTestId('ws-url')).toContainText(`/ws/streams/${secondStreamId}`);

  await page.getByRole('button', { name: '停止' }).click();
  await expect(page.getByTestId('player-status')).toHaveText('已停止');
  await expect(streamId).toHaveText('-');
  await expect(page.getByRole('button', { name: '停止' })).toBeDisabled();
});
