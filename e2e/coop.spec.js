import { test, expect } from '@playwright/test';

test('two browsers join by code, share a sector and shots, and transfer host on disconnect', async ({ browser }) => {
  const first = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true, isMobile: true });
  const second = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true, isMobile: true });
  const a = await first.newPage(); const b = await second.newPage();
  const errors = [];
  a.on('pageerror', e => errors.push(e.message)); b.on('pageerror', e => errors.push(e.message));
  const messages = [];
  b.on('websocket', socket => socket.on('framereceived', event => {
    const message = JSON.parse(String(event.payload));
    if (message.type === 'state') messages.push(message);
  }));
  await a.goto('/');
  await a.locator('#player-name').fill('Alpha');
  await a.locator('#seed').fill('TEST-SECTOR');
  await a.locator('#create-room').tap();
  await expect(a.locator('#lobby')).toBeVisible();
  await expect(a.locator('#lobby-start')).toBeDisabled();
  const code = await a.locator('#lobby-code').textContent();
  expect(code).toMatch(/^[A-F0-9]{6}$/);
  await b.goto('/');
  await b.locator('#player-name').fill('Bravo');
  await b.locator('#room-code').fill(code.toLowerCase());
  await b.locator('#join-room').tap();
  await expect(b.locator('#lobby-players')).toContainText('Alpha');
  await expect(a.locator('#lobby-players')).toContainText('Bravo');
  await expect(a.locator('#lobby-start')).toBeEnabled();
  await a.locator('#lobby-start').tap();
  await expect(a.locator('#modal-title')).toHaveText('SZEKTOR 1');
  await expect(b.locator('#modal-title')).toHaveText('SZEKTOR 1');
  await a.locator('#resume').tap(); await b.locator('#resume').tap();
  await expect(a.locator('#team-list')).toContainText('Bravo');
  await expect(b.locator('#team-list')).toContainText('Alpha');
  await expect(a.locator('#map-seed')).toHaveText(await b.locator('#map-seed').textContent());
  await a.locator('#touch-fire').dispatchEvent('pointerdown', { pointerId: 1 });
  await expect.poll(async () => Number(await a.locator('#ammo').textContent())).toBeLessThan(30);
  await a.locator('#touch-fire').dispatchEvent('pointerup', { pointerId: 1 });
  await expect.poll(() => messages.some(m => m.events.some(e => e.type === 'shot'))).toBe(true);
  await b.screenshot({ path: '/tmp/opencode/null-sector-coop.png' });
  await first.close();
  await expect(b.locator('#team-list')).not.toContainText('Alpha');
  await expect.poll(() => messages.at(-1)?.host === messages.at(-1)?.players[0]?.id).toBe(true);
  expect(errors).toEqual([]);
  await second.close();
});

test('invalid room code gives a recoverable error', async ({ page }) => {
  await page.goto('/');
  await page.locator('#room-code').fill('NOPE');
  await page.locator('#join-room').click();
  await expect(page.locator('#coop-error')).toHaveText('Nincs ilyen szobakód.');
  await page.locator('#create-room').click();
  await expect(page.locator('#lobby')).toBeVisible();
  await page.locator('#lobby-leave').click();
  await expect(page.locator('#menu')).toBeVisible();
});
