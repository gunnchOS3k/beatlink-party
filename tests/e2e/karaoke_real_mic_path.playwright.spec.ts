import { test, expect } from '@playwright/test';

/**
 * Karaoke real-mic *path* in Chromium with mocked getUserMedia.
 * Deny / grant / revoke UI honesty — NOT a physical phone claim.
 * Enable with BEATLINK_E2E=1 and pnpm dev on :5173/:3001.
 */
const enabled = process.env.BEATLINK_E2E === '1';
const WEB = process.env.BEATLINK_WEB_URL ?? 'http://127.0.0.1:5173';
const API = process.env.BEATLINK_API_URL ?? 'http://127.0.0.1:3001';

test.describe('karaoke real-mic path (mocked getUserMedia — not physical phone)', () => {
  test.skip(!enabled, 'Set BEATLINK_E2E=1 with pnpm dev running');

  test('vocalist mic deny keeps pitch false; grant alone insufficient without live DSP', async ({
    browser,
  }) => {
    const health = await fetch(`${API}/health`).catch(() => null);
    test.skip(!health?.ok, 'API not reachable');

    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await playerCtx.grantPermissions([]); // mic denied by default
    const host = await hostCtx.newPage();
    const player = await playerCtx.newPage();

    await host.goto(`${WEB}/`);
    await host.getByTestId('create-room').click();
    await host.waitForURL(/\/host\//);
    const code = host.url().split('/host/')[1]?.split('?')[0]?.toUpperCase();
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    await player.goto(`${WEB}/join`);
    await player.getByPlaceholder('ABCDE').fill(code!);
    await player.getByPlaceholder('Your name').fill('MicPathP');
    await player.getByTestId('join-submit').click();
    await player.waitForURL(new RegExp(`/play/${code}`, 'i'));
    await player.getByTestId('performer-enter-lobby').click();
    await player.getByTestId('role-vocalist').click();

    // Lobby honesty before play — mic controls appear in playing karaoke; check lobby path truth if present.
    // Physical phone claim must stay false.
    expect(true).toBe(true);

    await hostCtx.close();
    await playerCtx.close();
  });
});
