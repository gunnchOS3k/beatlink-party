/**
 * VXP-5 authentic multi-client Stage Energy capture.
 * Evidence class: REAL_RUNTIME_MULTICLIENT_CAPTURE
 * Requires Vite (:5173) + Socket.IO server (:3001) via `pnpm dev`.
 *
 * Usage:
 *   BEATLINK_E2E=1 pnpm exec playwright test tests/e2e/vxp5_stage_energy_capture.playwright.spec.ts
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const enabled = process.env.BEATLINK_E2E === '1';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CAPTURE_DIR = join(ROOT, 'artifacts/vxp5/captures/runtime');
const MANIFEST_PATH = join(ROOT, 'artifacts/vxp5/manifests/VXP5_RUNTIME_CAPTURE_MANIFEST.json');
const WEB = process.env.BEATLINK_WEB_URL ?? 'http://127.0.0.1:5173';

type ManifestEntry = {
  id: string;
  path: string;
  surface: string;
  client_type: 'host' | 'player' | 'shared';
  room_state: string;
  viewport: { width: number; height: number };
  evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE' | 'DESIGN_FIXTURE_NOT_RUNTIME_PROOF';
  source_sha: string;
  sha256: string;
  width: number;
  height: number;
};

function sourceSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

async function shot(
  page: Page,
  id: string,
  meta: Omit<ManifestEntry, 'id' | 'path' | 'sha256' | 'width' | 'height' | 'source_sha'>,
  entries: ManifestEntry[],
) {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  const file = join(CAPTURE_DIR, `${id}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const buf = readFileSync(file);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const viewport = page.viewportSize() ?? meta.viewport;
  entries.push({
    id,
    path: `artifacts/vxp5/captures/runtime/${id}.png`,
    ...meta,
    source_sha: sourceSha(),
    sha256,
    width: viewport.width,
    height: viewport.height,
  });
}

test.describe('VXP-5 Stage Energy multi-client capture', () => {
  test.skip(!enabled, 'Set BEATLINK_E2E=1 with pnpm dev on :5173 + :3001');

  test('authentic host+player journey screenshots', async ({ browser }) => {
    const entries: ManifestEntry[] = [];
    const hostCtx: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const playerCtx: BrowserContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const host = await hostCtx.newPage();
    const player = await playerCtx.newPage();

    // Landing — desktop
    await host.goto(`${WEB}/`);
    await expect(host.getByTestId('create-room')).toBeVisible();
    await shot(host, 'landing_desktop', {
      surface: 'landing',
      client_type: 'host',
      room_state: 'pre_party',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Landing — phone viewport (separate context)
    const phoneLandingCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phoneLanding = await phoneLandingCtx.newPage();
    await phoneLanding.goto(`${WEB}/`);
    await shot(phoneLanding, 'landing_phone', {
      surface: 'landing',
      client_type: 'player',
      room_state: 'pre_party',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);
    await phoneLandingCtx.close();

    // Host create / lobby
    await host.getByTestId('create-room').click();
    await host.waitForURL(/\/host\//);
    const code = host.url().split('/host/')[1]?.split('?')[0]?.toUpperCase();
    expect(code).toMatch(/^[A-Z0-9]{4,6}$/);
    await expect(host.getByTestId('host-room-code')).toBeVisible();
    await shot(host, 'host_create', {
      surface: 'host_create',
      client_type: 'host',
      room_state: 'lobby',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);
    await shot(host, 'host_lobby', {
      surface: 'host_lobby',
      client_type: 'host',
      room_state: 'lobby',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Player join
    await player.goto(`${WEB}/join`);
    await player.getByPlaceholder('ABCDE').fill(code!);
    await player.getByPlaceholder('Your name').fill('VXP5Player');
    await shot(player, 'player_join', {
      surface: 'player_join',
      client_type: 'player',
      room_state: 'joining',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);
    await player.getByTestId('join-submit').click();
    await expect(player).toHaveURL(new RegExp(`/play/${code}`, 'i'));
    await player.getByTestId('performer-enter-lobby').click();
    await expect(player.getByTestId('player-lobby')).toBeVisible({ timeout: 15_000 });
    await shot(player, 'player_role_select', {
      surface: 'player_role_select',
      client_type: 'player',
      room_state: 'lobby',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    await player.getByTestId('role-beat_tapper').click();
    await player.getByTestId('performer-ready').click();
    await shot(player, 'player_ready', {
      surface: 'player_ready',
      client_type: 'player',
      room_state: 'lobby_ready',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    await shot(host, 'host_lobby_with_player', {
      surface: 'host_lobby',
      client_type: 'host',
      room_state: 'lobby_with_player',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Song select + compliance surface
    const songBtn = host.locator('[data-testid^="select-song-"]').first();
    await expect(songBtn).toBeVisible({ timeout: 15_000 });
    await songBtn.click();
    await shot(host, 'host_song_select', {
      surface: 'host_song_select',
      client_type: 'host',
      room_state: 'song_select',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Attempt link resolve for compliance badge (metadata-only path)
    const linkInput = host.locator('input[type="url"]');
    if (await linkInput.count()) {
      await linkInput.fill('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl');
      await host.getByRole('button', { name: /Resolve/i }).click();
      await host.waitForTimeout(1500);
      if (await host.getByTestId('host-link-compliance').count()) {
        await shot(host, 'host_link_compliance', {
          surface: 'host_link_compliance',
          client_type: 'host',
          room_state: 'song_select',
          viewport: { width: 1440, height: 900 },
          evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
        }, entries);
      }
    }

    // Calibration → countdown → play
    const startCal = host.getByTestId('host-start-calibration');
    await expect(startCal).toBeEnabled({ timeout: 10_000 });
    await startCal.click();
    const skip = host.getByTestId('host-skip-calibration');
    if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await skip.click();
    }

    // Countdown may be brief
    await host.waitForTimeout(500);
    if (await host.getByTestId('host-countdown').count()) {
      await shot(host, 'countdown', {
        surface: 'countdown',
        client_type: 'host',
        room_state: 'countdown',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
    }

    await expect(host.getByTestId('host-gameplay')).toBeVisible({
      timeout: 20_000,
    });
    await shot(host, 'host_gameplay', {
      surface: 'host_gameplay',
      client_type: 'host',
      room_state: 'playing',
      viewport: { width: 1440, height: 900 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    await expect(player.getByTestId('player-controller').or(player.getByTestId('performer-tap')).first()).toBeVisible({
      timeout: 15_000,
    });
    await shot(player, 'controller_beat_tapper', {
      surface: 'controller_beat_tapper',
      client_type: 'player',
      room_state: 'playing',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Offline reconnect banner (player)
    await playerCtx.setOffline(true);
    await player.waitForTimeout(600);
    await shot(player, 'reconnect', {
      surface: 'reconnect',
      client_type: 'player',
      room_state: 'offline',
      viewport: { width: 390, height: 844 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);
    await playerCtx.setOffline(false);
    await player.waitForTimeout(400);

    // Force end for results
    const forceEnd = host.getByTestId('host-force-end-playing');
    if (await forceEnd.isVisible().catch(() => false)) {
      await forceEnd.click();
    }
    await host.waitForTimeout(1500);
    if (await host.getByTestId('host-rematch').count()) {
      await shot(host, 'host_results', {
        surface: 'host_results',
        client_type: 'host',
        room_state: 'results',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
      await shot(player, 'player_results', {
        surface: 'player_results',
        client_type: 'player',
        room_state: 'results',
        viewport: { width: 390, height: 844 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
      await shot(host, 'replay_controls', {
        surface: 'replay',
        client_type: 'host',
        room_state: 'results',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
      await host.getByTestId('host-rematch').click();
      await host.waitForTimeout(800);
      await shot(host, 'replay', {
        surface: 'replay',
        client_type: 'host',
        room_state: 'lobby',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
    }

    // Second / third players for vocalist + hype controllers
    const vocalCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const hypeCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const vocal = await vocalCtx.newPage();
    const hype = await hypeCtx.newPage();
    await vocal.goto(`${WEB}/join`);
    await vocal.getByPlaceholder('ABCDE').fill(code!);
    await vocal.getByPlaceholder('Your name').fill('VXP5Vocal');
    await vocal.getByTestId('join-submit').click();
    await vocal.getByTestId('performer-enter-lobby').click();
    await vocal.getByTestId('role-vocalist').click();
    await vocal.getByTestId('performer-ready').click();

    await hype.goto(`${WEB}/join`);
    await hype.getByPlaceholder('ABCDE').fill(code!);
    await hype.getByPlaceholder('Your name').fill('VXP5Hype');
    await hype.getByTestId('join-submit').click();
    await hype.getByTestId('performer-enter-lobby').click();
    await hype.getByTestId('role-hype_captain').click();
    await hype.getByTestId('performer-ready').click();

    try {
      await player.getByTestId('role-beat_tapper').click({ timeout: 3000 });
      await player.getByTestId('performer-ready').click();
    } catch {
      /* already ready */
    }

    await host.goto(`${WEB}/host/${code}`);
    const song2 = host.locator('[data-testid^="select-song-"]').first();
    if (await song2.count()) await song2.click();
    if (await host.getByTestId('host-start-calibration').isEnabled().catch(() => false)) {
      await host.getByTestId('host-start-calibration').click();
      const skip2 = host.getByTestId('host-skip-calibration');
      if (await skip2.isVisible({ timeout: 8_000 }).catch(() => false)) await skip2.click();
      await expect(host.getByTestId('host-gameplay')).toBeVisible({
        timeout: 20_000,
      });
      if (await vocal.getByTestId('controller-vocalist').count()) {
        await shot(vocal, 'controller_vocalist', {
          surface: 'controller_vocalist',
          client_type: 'player',
          room_state: 'playing',
          viewport: { width: 390, height: 844 },
          evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
        }, entries);
      }
      if (await hype.getByTestId('controller-hype-captain').count()) {
        await shot(hype, 'controller_hype_captain', {
          surface: 'controller_hype_captain',
          client_type: 'player',
          room_state: 'playing',
          viewport: { width: 390, height: 844 },
          evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
        }, entries);
      }
    }
    await vocalCtx.close();
    await hypeCtx.close();

    // A11y / reduced motion / HC — digital toggles on landing
    await host.goto(`${WEB}/`);
    const settings = host.getByTestId('settings-drawer').or(host.locator('summary', { hasText: /Settings/i }));
    if (await settings.count()) {
      await settings.first().click();
      const reduce = host.getByLabel(/Reduce motion/i);
      const hc = host.getByLabel(/High contrast/i);
      if (await reduce.count()) await reduce.check();
      await shot(host, 'a11y_reduce_motion', {
        surface: 'a11y',
        client_type: 'host',
        room_state: 'pre_party',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
      if (await hc.count()) await hc.check();
      await shot(host, 'a11y_high_contrast', {
        surface: 'a11y',
        client_type: 'host',
        room_state: 'pre_party',
        viewport: { width: 1440, height: 900 },
        evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      }, entries);
    }

    // Host 1920 viewport
    await host.setViewportSize({ width: 1920, height: 1080 });
    await host.goto(`${WEB}/`);
    await shot(host, 'viewport_host_1920', {
      surface: 'landing',
      client_type: 'host',
      room_state: 'pre_party',
      viewport: { width: 1920, height: 1080 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Phone 360
    await player.setViewportSize({ width: 360, height: 740 });
    await player.goto(`${WEB}/join`);
    await shot(player, 'viewport_phone_360', {
      surface: 'player_join',
      client_type: 'player',
      room_state: 'joining',
      viewport: { width: 360, height: 740 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    // Phone 412
    await player.setViewportSize({ width: 412, height: 915 });
    await player.goto(`${WEB}/`);
    await shot(player, 'viewport_phone_412', {
      surface: 'landing',
      client_type: 'player',
      room_state: 'pre_party',
      viewport: { width: 412, height: 915 },
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    }, entries);

    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          program: 'VXP-5',
          evidence_class_default: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
          network_topology: 'local_loopback_vite_plus_socketio',
          redis: 'not_required_for_capture',
          store: 'in_memory_default',
          wan_carrier_claimed: false,
          source_sha: sourceSha(),
          captured_at: new Date().toISOString(),
          entries,
        },
        null,
        2,
      ),
    );

    expect(entries.length).toBeGreaterThanOrEqual(10);
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    await hostCtx.close();
    await playerCtx.close();
  });
});
