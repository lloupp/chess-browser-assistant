import { test, expect } from '@playwright/test';

const sq = (page, s) => page.locator(`[data-square="${s}"]`);

test('play a move, get a lesson and an engine reply', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });

  await sq(page, 'e2').click();
  await sq(page, 'e4').click();
  await expect(page.locator('#feedback .tag')).toContainText('e4:', { timeout: 30_000 });
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  await expect(page.locator('#history li').first()).toHaveText(/^e4 \S+/);

  await page.click('#hint');
  await expect(page.locator('#feedback')).toContainText('Dica', { timeout: 30_000 });
  await expect(page.locator('.sq.hint')).toHaveCount(1);

  await page.click('#undo');
  await expect(page.locator('#history li')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('playing black: engine opens and board is flipped', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  await page.selectOption('#color', 'b');
  await page.click('#new');
  await expect(page.locator('#history li')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.sq').first()).toHaveAttribute('data-square', 'h1');
});
