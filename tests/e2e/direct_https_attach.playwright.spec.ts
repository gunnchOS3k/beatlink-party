import { test, expect } from '@playwright/test';

/**
 * Production-UI direct HTTPS attach journey.
 * Requires BEATLINK_E2E=1 with `pnpm dev` on :5173 + :3001.
 * Does not claim full scored new-media browser playback unless servers are live.
 */
const enabled = process.env.BEATLINK_E2E === '1';
const WEB = process.env.BEATLINK_WEB_URL ?? 'http://127.0.0.1:5173';

test.describe('Direct HTTPS workflow UI', () => {
  test.skip(!enabled, 'Set BEATLINK_E2E=1 with pnpm dev running on :5173/:3001');

  test('host panel evaluates and surfaces attach gating', async ({ page }) => {
    await page.goto(`${WEB}/`);
    await page.getByTestId('create-room').click();
    await page.waitForURL(/\/host\//);

    const panel = page.getByTestId('direct-https-workflow');
    await expect(panel).toBeVisible();

    await page.getByTestId('direct-https-url').fill('https://127.0.0.1/owned.wav');
    await page.getByTestId('direct-https-hash').fill('a'.repeat(64));
    await page.getByTestId('direct-https-evaluate').click();

    const evalResult = page.getByTestId('direct-https-eval-result');
    await expect(evalResult).toBeVisible({ timeout: 15_000 });
    const body = await evalResult.innerText();
    expect(body.toLowerCase()).toMatch(/blocked|loopback|private|internal|unsupported|error/);

    // Attach after rejected private-host evaluation must not claim scored play.
    await page.getByTestId('direct-https-attach-lobby').click();
    const attachMsg = page.getByTestId('direct-https-attach-message');
    await expect(attachMsg).toBeVisible({ timeout: 10_000 });
    const msg = (await attachMsg.innerText()).toLowerCase();
    expect(msg).toMatch(/reject|denied|refused|blocked|could not|evaluation|host|loopback|private/);
  });
});
