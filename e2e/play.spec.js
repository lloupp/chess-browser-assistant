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

test('promotion lets the player choose the piece', async ({ page }) => {
  await page.goto('/?fen=' + encodeURIComponent('8/P7/8/8/8/8/k7/4K3 w - - 0 1'));
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  await sq(page, 'a7').click();
  await sq(page, 'a8').click();
  await expect(page.locator('#promo')).toBeVisible();
  await page.click('#promo [data-piece="n"]');
  await expect(page.locator('#feedback .tag')).toContainText('a8=N', { timeout: 30_000 });
});

test('review lets the player retry a missed mate', async ({ page }) => {
  await page.goto('/?fen=' + encodeURIComponent('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'));
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  await sq(page, 'g1').click();
  await sq(page, 'f2').click(); // misses Ra8#
  await expect(page.locator('#feedback')).toContainText('Havia mate em 1 começando com Ra8#', { timeout: 30_000 });
  await expect(page.locator('#status')).toHaveText(/Sua vez/, { timeout: 30_000 });

  await page.click('#review-btn');
  await expect(page.locator('#review li')).toHaveCount(1);
  await page.click('#review li button');
  await expect(page.locator('#status')).toHaveText('Treino: sua vez.');
  await sq(page, 'a1').click();
  await sq(page, 'a8').click();
  await expect(page.locator('#status')).toContainText('Acertou!', { timeout: 30_000 });
});

test('a piece can be dragged to its destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  const from = await sq(page, 'g1').boundingBox();
  const to = await sq(page, 'f3').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(page.locator('.ghost')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.ghost')).toHaveCount(0);
  await expect(page.locator('#feedback .tag')).toContainText('Nf3:', { timeout: 30_000 });
});

test('history numbering follows the starting FEN', async ({ page }) => {
  // Black to move at move 20; the player takes black.
  await page.goto('/?fen=' + encodeURIComponent('4k3/8/8/8/8/8/4P3/4K3 b - - 0 20'));
  await page.selectOption('#color', 'b');
  await page.click('#new');
  await expect(page.locator('#status')).toHaveText('Sua vez.', { timeout: 30_000 });
  await sq(page, 'e8').click();
  await sq(page, 'd8').click();
  await expect(page.locator('#history')).toHaveAttribute('start', '20');
  await expect(page.locator('#history li').first()).toHaveText(/^… Kd8$/, { timeout: 30_000 });
});
