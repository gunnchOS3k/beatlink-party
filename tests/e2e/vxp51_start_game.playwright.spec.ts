/**
 * VXP-5.1 human-path start-game E2E — host + player, real Socket.IO, no phase injection.
 * Requires BEATLINK_E2E=1 with web+server already running.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const enabled = process.env.BEATLINK_E2E === '1';
const WEB = process.env.BEATLINK_WEB_URL ?? 'http://127.0.0.1:5173';
const API = process.env.BEATLINK_API_URL ?? 'http://127.0.0.1:3001';
const ART = join(process.cwd(), 'artifacts/vxp51');

function writeJson(name: string, data: unknown) {
  mkdirSync(ART, { recursive: true });
  writeFileSync(join(ART, name), JSON.stringify(data, null, 2) + '\n');
}

test.describe('VXP-5.1 human start-game path', () => {
  test.skip(!enabled, 'Set BEATLINK_E2E=1 with pnpm dev serving web+server');

  test('host+player: ghost disconnect cannot block Start → countdown → playing → input', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ghostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const host = await hostCtx.newPage();
    const player = await playerCtx.newPage();
    const ghost = await ghostCtx.newPage();

    await host.goto(`${WEB}/`);
    await host.getByTestId('create-room').click();
    await host.waitForURL(/\/host\//, { timeout: 15000 });
    const code = (await host.getByTestId('host-room-code').innerText()).trim().toUpperCase();
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    await player.goto(`${WEB}/join`);
    await player.getByPlaceholder('ABCDE').fill(code);
    await player.getByPlaceholder('Your name').fill('Jordan');
    await player.getByTestId('join-submit').click();
    await player.waitForURL(new RegExp(`/play/${code}`, 'i'));
    await player.getByTestId('performer-enter-lobby').click();
    await player.getByTestId('role-beat_tapper').click();
    await player.getByTestId('performer-ready').click();

    // Ghost joins then disconnects without ready — previously soft-locked Start.
    await ghost.goto(`${WEB}/join`);
    await ghost.getByPlaceholder('ABCDE').fill(code);
    await ghost.getByPlaceholder('Your name').fill('Ghost');
    await ghost.getByTestId('join-submit').click();
    await ghost.getByTestId('performer-enter-lobby').click();
    await ghostCtx.close();

    await host.getByTestId('select-song-demo-neon-groove').click();
    await expect(host.getByTestId('host-start-reason')).toBeVisible();
    await expect(host.getByTestId('host-start-calibration')).toBeEnabled({ timeout: 10000 });
    await expect(host.getByTestId('host-start-calibration')).toHaveAttribute(
      'data-start-state',
      'enabled',
    );

    await host.getByTestId('host-start-calibration').click();
    await host.getByTestId('host-skip-calibration').click();

    await expect(host.getByTestId('host-countdown').or(host.getByTestId('host-gameplay'))).toBeVisible({
      timeout: 20000,
    });
    const hostCountdown = await host.getByTestId('host-countdown').isVisible().catch(() => false);
    await expect(player.getByTestId('performer-tap')).toBeVisible({ timeout: 25000 });

    await player.getByTestId('performer-tap').click();
    await player.getByTestId('performer-swipe').click();

    const room = await fetch(`${API}/rooms/${code}`).then((r) => r.json());
    expect(room.room?.phase).toMatch(/playing|results|countdown/);
    expect(room.room?.selectedSongId).toBe('demo-neon-groove');
    expect(room.room?.round_id).toBeTruthy();

    writeJson('E2E_HUMAN_START_RESULT.json', {
      ok: true,
      room_code: code,
      host_countdown_seen: hostCountdown,
      player_controls_visible: true,
      phase: room.room?.phase,
      selectedSongId: room.room?.selectedSongId,
      round_id: room.room?.round_id,
      ghost_disconnect_did_not_block_start: true,
      evidence_class: 'REAL_MULTICLIENT_E2E',
    });

    await hostCtx.close();
    await playerCtx.close();
  });
});
