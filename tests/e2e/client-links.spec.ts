import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('client page mobile, downloads, comments, keyboard gallery and print', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://localhost:3000'))
      external.push(r.url());
  });
  const response = await page.goto('/c/fixture');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'Your invoice.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/client-mobile.png', fullPage: true });
  for (const name of ['Download PDF', 'Download receipt PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    await file.saveAs(`test-results/client-${name.replaceAll(' ', '-')}.pdf`);
    expect((await readFile((await file.path())!)).subarray(0,5).toString()).toBe('%PDF-');
  }
  await page.getByRole('button', { name: 'Send comment' }).click();
  expect(
    await page
      .locator('input[name=name]')
      .evaluate((e: HTMLInputElement) => e.validity.valueMissing),
  ).toBe(true);
  await page.route('**/api/client-comments/*', (r) => r.fulfill({ json: { ok: true } }));
  await page.getByLabel('Your name').fill('Client');
  await page.getByLabel('Message', { exact: true }).fill('Please confirm.');
  await page.getByRole('button', { name: 'Send comment' }).click();
  await expect(page.getByRole('status')).toContainText('Your comment was sent');
  await page.getByRole('button', { name: /Open image 1/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog')).toContainText('2 / 2');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: /Open image 1/ })).toBeFocused();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.cp-sheet')).toBeVisible();
  await expect(page.locator('.cp-section').first()).not.toBeVisible();
  await expect(page.locator('.cp-header')).not.toBeVisible();
  expect(
    await page.locator('.cp-sheet .document').evaluate((e) => getComputedStyle(e).visibility),
  ).toBe('visible');
  expect(external).toEqual([]);
});
test('public comment endpoint rejects bad origin, oversized input and honeypots', async ({ request }) => {
  const url = '/api/client-comments/' + 'a'.repeat(43);
  expect((await request.post(url,{data:{name:'Client',message:'Hello'},headers:{origin:'https://other.example'}})).status()).toBe(400);
  expect((await request.post(url,{data:{name:'Client',message:'x'.repeat(9000)},headers:{origin:'http://localhost:3000'}})).status()).toBe(400);
  expect((await request.post(url,{data:{name:'Client',message:'Hello',website:'spam'},headers:{origin:'http://localhost:3000'}})).status()).toBe(400);
});
test('unknown link is generic and has no download', async ({ page }) => {
  await page.goto('/c/not-a-token');
  await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toHaveCount(0);
});
