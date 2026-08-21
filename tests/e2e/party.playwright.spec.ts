import { test, expect } from '@playwright/test';

/**
 * Optional multi-context browser check. Skipped unless BEATLINK_E2E=1 and
 * `pnpm dev` is already serving :5173 + :3001. Never rips audio.
 */
const enabled = process.env.BEATLINK_E2E === '1';

test.describe('BeatLink host + player (Playwright multi-context)', () => {
  test.skip(!enabled, 'Set BEATLINK_E2E=1 with pnpm dev running on :5173');

  test('host creates a room and a second context joins by code', async ({ browser }) => {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const hostPage = await hostCtx.newPage();
    const playerPage = await playerCtx.newPage();

    await hostPage.goto('http://127.0.0.1:5173/');
    await hostPage.getByTestId('create-room').click();
    await hostPage.waitForURL(/\/host\//);
    const code = hostPage.url().split('/host/')[1]?.split('?')[0]?.toUpperCase();
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    await playerPage.goto(`http://127.0.0.1:5173/join`);
    await playerPage.getByPlaceholder('ABCDE').fill(code!);
    await playerPage.getByPlaceholder('Your name').fill('PlaywrightP2');
    await playerPage.getByRole('button', { name: /Join/i }).click();
    await expect(playerPage).toHaveURL(new RegExp(`/play/${code}`, 'i'));

    await hostCtx.close();
    await playerCtx.close();
  });
});
