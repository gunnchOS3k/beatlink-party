/**
 * VXP-5 authentic multi-client Playwright capture against real Vite + server + Socket.IO.
 * Evidence class: REAL_RUNTIME_MULTICLIENT_CAPTURE
 *
 * Usage (from worktree root, with network):
 *   node scripts/vxp5-runtime-capture.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAPTURE_DIR = resolve(ROOT, 'artifacts/vxp5/captures');
const MANIFEST_PATH = resolve(ROOT, 'artifacts/vxp5/manifests/VXP5_RUNTIME_CAPTURE_MANIFEST.json');
const WEB = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3001';
const SKIP_BOOT = process.env.VXP5_SKIP_BOOT === '1';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sourceSha() {
  try {
    return readFileSync(resolve(ROOT, '.git/HEAD'), 'utf8').trim();
  } catch {
    return 'unknown';
  }
}

async function waitForHealth(url, attempts = 120) {
  let lastErr = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status > 0 && res.status < 500) return;
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Health check failed for ${url} (${lastErr})`);
}

async function shot(page, id, meta, entries) {
  const path = join(CAPTURE_DIR, `${id}.png`);
  await page.screenshot({ path, fullPage: false });
  const buf = readFileSync(path);
  // png IHDR width/height
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  entries.push({
    id,
    path: `artifacts/vxp5/captures/${id}.png`,
    surface: meta.surface,
    client_type: meta.client_type,
    room_state: meta.room_state,
    viewport: meta.viewport,
    evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
    source_sha: meta.source_sha,
    sha256: sha256File(path),
    width,
    height,
  });
  console.log(`captured ${id}`);
}

async function main() {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });

  const gitSha = spawn('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  let sha = sourceSha();
  await new Promise((resolveP) => {
    let out = '';
    gitSha.stdout.on('data', (d) => (out += d));
    gitSha.on('close', () => {
      if (out.trim()) sha = out.trim();
      resolveP();
    });
  });

  const env = {
    ...process.env,
    VITE_API_URL: API,
    VITE_WS_URL: API,
    PORT: '3001',
    BEATLINK_STORE: 'memory',
  };

  let child = null;
  let bootLog = '';

  if (!SKIP_BOOT) {
    child = spawn('pnpm', ['dev'], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (d) => {
      bootLog += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      bootLog += d.toString();
      process.stderr.write(d);
    });
  }

  try {
    await waitForHealth(`${API}/health`);
    await waitForHealth(WEB);

    const browser = await chromium.launch({ headless: true });
    const entries = [];
    const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const host = await hostCtx.newPage();
    const player = await phoneCtx.newPage();

    // Landing desktop
    await host.goto(WEB, { waitUntil: 'networkidle' });
    await host.getByTestId('create-room').waitFor();
    await shot(host, 'landing_desktop', {
      surface: 'landing',
      client_type: 'host',
      room_state: 'none',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    // Landing phone
    await player.goto(WEB, { waitUntil: 'networkidle' });
    await shot(player, 'landing_phone', {
      surface: 'landing',
      client_type: 'player',
      room_state: 'none',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    // Create party
    await host.getByTestId('create-room').click();
    await host.waitForURL(/\/host\//);
    await host.getByTestId('host-room-code').waitFor();
    const code = (await host.getByTestId('host-room-code').innerText()).trim();
    await shot(host, 'host_create', {
      surface: 'host_create',
      client_type: 'host',
      room_state: 'lobby',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    await shot(host, 'host_lobby', {
      surface: 'host_lobby',
      client_type: 'host',
      room_state: 'lobby',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    // Player join
    await player.goto(`${WEB}/join`, { waitUntil: 'networkidle' });
    await shot(player, 'player_join', {
      surface: 'player_join',
      client_type: 'player',
      room_state: 'pre_join',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    await player.getByTestId('join-code').fill(code);
    await player.getByTestId('join-name').fill('VXP5Player');
    await player.getByTestId('join-submit').click();
    await player.waitForURL(new RegExp(`/play/${code}`, 'i'));
    await player.getByTestId('performer-enter-lobby').click();
    await player.getByTestId('player-role-select').waitFor();
    await shot(player, 'player_role_select', {
      surface: 'player_role_select',
      client_type: 'player',
      room_state: 'lobby',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    await player.getByTestId('role-beat_tapper').click();
    await player.getByTestId('performer-ready').click();
    await shot(player, 'player_ready', {
      surface: 'player_ready',
      client_type: 'player',
      room_state: 'lobby_ready',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    // Host song select + compliance
    await host.getByTestId('host-song-select').waitFor();
    await shot(host, 'host_song_select', {
      surface: 'host_song_select',
      client_type: 'host',
      room_state: 'song_select',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    const songBtn = host.locator('[data-testid^="select-song-"]').first();
    await songBtn.click();

    // Resolve a metadata-only link for compliance capture
    const linkInput = host.locator('input[type="url"]');
    await linkInput.fill('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl');
    await host.getByRole('button', { name: /Resolve/i }).click();
    await host.getByTestId('host-link-compliance').waitFor({ timeout: 15000 });
    await shot(host, 'host_link_compliance', {
      surface: 'host_link_compliance',
      client_type: 'host',
      room_state: 'song_select',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    // Calibration → countdown → play
    await host.getByTestId('host-start-calibration').click();
    await host.getByTestId('host-skip-calibration').click();
    const cd = host.getByTestId('host-countdown');
    if (await cd.count()) {
      await shot(host, 'countdown', {
        surface: 'countdown',
        client_type: 'host',
        room_state: 'countdown',
        viewport: '1440x900',
        source_sha: sha,
      }, entries);
    }

    await host.getByTestId('host-gameplay').or(host.getByText(/LIVE/i)).first().waitFor({ timeout: 20000 });
    await shot(host, 'host_gameplay', {
      surface: 'host_gameplay',
      client_type: 'host',
      room_state: 'playing',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    await player.getByTestId('controller-beat-tapper').or(player.getByTestId('performer-tap')).first().waitFor({ timeout: 20000 });
    await shot(player, 'controller_beat_tapper', {
      surface: 'controller_beat_tapper',
      client_type: 'player',
      room_state: 'playing',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    // Role fixtures via second phone contexts (same room, different roles need rematch cycle —
    // capture design fixture boards for vocalist/hype if round too short; also try force role
    // by ending and rejoining with new names)
    await host.getByTestId('host-force-end-playing').click();
    await host.getByTestId('host-rematch').waitFor({ timeout: 20000 });
    await shot(host, 'host_results', {
      surface: 'host_results',
      client_type: 'host',
      room_state: 'results',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    await player.getByTestId('player-results').waitFor({ timeout: 15000 });
    await shot(player, 'player_results', {
      surface: 'player_results',
      client_type: 'player',
      room_state: 'results',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    await host.getByTestId('host-rematch').click();
    await shot(host, 'replay', {
      surface: 'replay',
      client_type: 'host',
      room_state: 'lobby',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    // Reconnect / network calm banner — offline simulation
    await player.context().setOffline(true);
    await player.waitForTimeout(800);
    await shot(player, 'reconnect', {
      surface: 'reconnect',
      client_type: 'player',
      room_state: 'offline',
      viewport: '390x844',
      source_sha: sha,
    }, entries);
    await player.context().setOffline(false);

    // A11y high contrast + reduced motion on landing
    await host.goto(WEB);
    await host.evaluate(() => {
      document.documentElement.classList.add('a11y-high-contrast', 'a11y-reduce-motion');
    });
    await shot(host, 'a11y_high_contrast_reduce_motion', {
      surface: 'a11y',
      client_type: 'host',
      room_state: 'none',
      viewport: '1440x900',
      source_sha: sha,
    }, entries);

    // Viewport extremes
    await host.setViewportSize({ width: 1280, height: 720 });
    await host.goto(`${WEB}/host/${code}`);
    await shot(host, 'viewport_host_1280', {
      surface: 'host_lobby',
      client_type: 'host',
      room_state: 'lobby',
      viewport: '1280x720',
      source_sha: sha,
    }, entries);

    await host.setViewportSize({ width: 1920, height: 1080 });
    await shot(host, 'viewport_host_1920', {
      surface: 'host_lobby',
      client_type: 'host',
      room_state: 'lobby',
      viewport: '1920x1080',
      source_sha: sha,
    }, entries);

    await player.setViewportSize({ width: 360, height: 800 });
    await player.goto(WEB);
    await shot(player, 'viewport_phone_360', {
      surface: 'landing',
      client_type: 'player',
      room_state: 'none',
      viewport: '360x800',
      source_sha: sha,
    }, entries);

    await player.setViewportSize({ width: 412, height: 915 });
    await shot(player, 'viewport_phone_412', {
      surface: 'landing',
      client_type: 'player',
      room_state: 'none',
      viewport: '412x915',
      source_sha: sha,
    }, entries);

    // Second player for vocalist + hype controllers after rematch
    const p2 = await phoneCtx.newPage();
    await p2.goto(`${WEB}/join`);
    await p2.getByTestId('join-code').fill(code);
    await p2.getByTestId('join-name').fill('VXP5Vocal');
    await p2.getByTestId('join-submit').click();
    await p2.getByTestId('performer-enter-lobby').click();
    await p2.getByTestId('role-vocalist').click();
    await p2.getByTestId('performer-ready').click();

    const p3 = await phoneCtx.newPage();
    await p3.goto(`${WEB}/join`);
    await p3.getByTestId('join-code').fill(code);
    await p3.getByTestId('join-name').fill('VXP5Hype');
    await p3.getByTestId('join-submit').click();
    await p3.getByTestId('performer-enter-lobby').click();
    await p3.getByTestId('role-hype_captain').click();
    await p3.getByTestId('performer-ready').click();

    // Re-ready original player if needed
    try {
      await player.getByTestId('role-beat_tapper').click({ timeout: 3000 });
      await player.getByTestId('performer-ready').click();
    } catch {
      /* may already be ready from prior round */
    }

    await host.goto(`${WEB}/host/${code}`);
    const song2 = host.locator('[data-testid^="select-song-"]').first();
    await song2.click();
    await host.getByTestId('host-start-calibration').click();
    await host.getByTestId('host-skip-calibration').click();
    await host.getByTestId('host-gameplay').waitFor({ timeout: 20000 });

    await p2.getByTestId('controller-vocalist').waitFor({ timeout: 15000 });
    await shot(p2, 'controller_vocalist', {
      surface: 'controller_vocalist',
      client_type: 'player',
      room_state: 'playing',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    await p3.getByTestId('controller-hype-captain').waitFor({ timeout: 15000 });
    await shot(p3, 'controller_hype_captain', {
      surface: 'controller_hype_captain',
      client_type: 'player',
      room_state: 'playing',
      viewport: '390x844',
      source_sha: sha,
    }, entries);

    const manifest = {
      program: 'VXP-5',
      evidence_class: 'REAL_RUNTIME_MULTICLIENT_CAPTURE',
      network: {
        topology: 'local_loopback',
        store: 'in-memory',
        redis: false,
        wan_carrier_claimed: false,
      },
      source_sha: sha,
      captured_at: new Date().toISOString(),
      room_code: code,
      entries,
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`manifest written ${MANIFEST_PATH} (${entries.length} shots)`);

    await browser.close();
  } catch (err) {
    console.error('CAPTURE_FAILED', err);
    console.error(bootLog.slice(-4000));
    process.exitCode = 1;
  } finally {
    if (child) {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000);
    }
  }
}

main();
