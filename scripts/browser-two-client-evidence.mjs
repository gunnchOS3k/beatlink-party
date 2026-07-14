#!/usr/bin/env node
/**
 * Archive a complete two-browser BeatLink round for product-quality evidence.
 * Requires: server on :3001, web on :5173, playwright installed.
 */
import { chromium } from 'playwright';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/product-quality/evidence/browser-two-client');
mkdirSync(out, { recursive: true });

const BASE = process.env.BEATLINK_WEB_URL || 'http://127.0.0.1:5173';
const API = process.env.BEATLINK_API_URL || 'http://127.0.0.1:3001';

const hostConsole = [];
const playerConsole = [];
const wsLog = [];
const roomLog = [];

function ts() {
  return new Date().toISOString();
}

function logWs(side, kind, payload) {
  const line = `[${ts()}] [${side}] ${kind} ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n`;
  wsLog.push(line);
  appendFileSync(path.join(out, 'websocket-transitions.log'), line);
}

function logRoom(note, state) {
  const line = `[${ts()}] ${note} ${JSON.stringify(state)}\n`;
  roomLog.push(line);
  appendFileSync(path.join(out, 'room-state-transitions.log'), line);
}

function attachConsole(page, bucket, side) {
  page.on('console', (msg) => {
    const line = `[${ts()}] [${msg.type()}] ${msg.text()}`;
    bucket.push(line);
  });
  page.on('pageerror', (err) => {
    bucket.push(`[${ts()}] [pageerror] ${err.message}`);
  });
  page.on('websocket', (ws) => {
    logWs(side, 'ws-open', ws.url());
    ws.on('framereceived', (f) => logWs(side, '←', f.payload?.toString?.()?.slice(0, 500) ?? f.payload));
    ws.on('framesent', (f) => logWs(side, '→', f.payload?.toString?.()?.slice(0, 500) ?? f.payload));
    ws.on('close', () => logWs(side, 'ws-close', ''));
  });
}

async function shot(page, name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log('screenshot', name);
}

async function waitPhase(page, phase, timeout = 30000) {
  await page.waitForFunction(
    (p) => {
      const el = document.body?.innerText || '';
      return el.toLowerCase().includes(p.toLowerCase()) || document.querySelector(`[data-phase="${p}"]`);
    },
    phase,
    { timeout },
  ).catch(() => {});
}

async function main() {
  writeFileSync(path.join(out, 'websocket-transitions.log'), '');
  writeFileSync(path.join(out, 'room-state-transitions.log'), '');

  const health = await fetch(`${API}/health`).then((r) => r.json());
  writeFileSync(path.join(out, 'server-health.txt'), JSON.stringify(health, null, 2));
  const songs = await fetch(`${API}/songs`).then((r) => r.json());
  writeFileSync(path.join(out, 'songs-catalog.json'), JSON.stringify(songs, null, 2));
  const demoTitle = songs.songs?.[0]?.title || 'Neon Groove';

  const browser = await chromium.launch({ headless: true });
  const hostCtx = await browser.newContext();
  const playerCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const player = await playerCtx.newPage();
  attachConsole(host, hostConsole, 'host');
  attachConsole(player, playerConsole, 'player');

  // 1–4 Host startup / create room / code + QR
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await shot(host, '01-host-startup.png');
  await host.getByRole('button', { name: /Create Room/i }).click();
  await host.waitForURL(/\/host\//, { timeout: 15000 });
  await host.waitForSelector('.room-code', { timeout: 15000 });
  const roomCode = (await host.locator('.room-code').innerText()).trim();
  logRoom('host-created', { roomCode });
  await shot(host, '02-host-lobby.png');
  console.log('room', roomCode);

  // 5–6 Player joins (Join form → /play → Enter Lobby)
  await player.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await player.getByPlaceholder('ABCDE').fill(roomCode);
  await player.getByPlaceholder('Your name').fill('EvidencePlayer');
  await player.getByRole('button', { name: /Join Room/i }).click();
  await player.waitForURL(/\/play\//, { timeout: 15000 });
  await player.getByRole('button', { name: /Enter Lobby/i }).click();
  await host.waitForFunction(() => (document.body.innerText || '').includes('EvidencePlayer'), {
    timeout: 20000,
  });
  logRoom('player-joined', { roomCode, player: 'EvidencePlayer' });
  await shot(host, '03-host-lobby-with-player.png');
  await shot(player, '04-player-lobby.png');

  // 8–9 Role + ready
  await player.getByRole('button', { name: /Beat Tapper/i }).click();
  await player.getByRole('button', { name: /^Ready!$/i }).click();
  await host.waitForFunction(() => (document.body.innerText || '').includes('✓ Ready'), {
    timeout: 10000,
  });
  logRoom('player-ready', { role: 'beat_tapper' });
  await shot(host, '05-ready-state-host.png');
  await shot(player, '05-ready-state-player.png');

  // 10 Song select
  await host.getByRole('button', { name: new RegExp(demoTitle, 'i') }).click();
  await host.waitForTimeout(500);
  logRoom('song-selected', { song: demoTitle });

  // 11 Start
  await host.getByRole('button', { name: /Start Countdown/i }).click();
  await shot(host, '06-countdown-host.png');
  await shot(player, '06-countdown-player.png');
  logRoom('countdown', {});

  // Wait for round / playing
  await host.getByRole('heading', { name: /LIVE/i }).waitFor({ timeout: 20000 });
  await shot(host, '07-round-host.png');
  await shot(player, '07-round-player.png');
  logRoom('round', {});

  // Submit input (beat taps) for most of the 45s round
  const tap = player.locator('button.tap-button');
  await tap.waitFor({ timeout: 10000 });
  const tapUntil = Date.now() + 40000;
  let taps = 0;
  while (Date.now() < tapUntil) {
    const done = await host.getByRole('heading', { name: /Round Complete/i }).isVisible().catch(() => false);
    if (done) break;
    await tap.click({ timeout: 1000 }).catch(() => {});
    taps += 1;
    await player.waitForTimeout(280);
  }
  logRoom('taps-submitted', { taps });

  // Results
  await host.getByRole('heading', { name: /Round Complete/i }).waitFor({ timeout: 90000 });
  await shot(host, '08-results-host.png');
  await shot(player, '08-results-player.png');
  logRoom('results', { text: (await host.locator('body').innerText()).slice(0, 400) });

  // Disconnect / reconnect player (preserve storage for token)
  const playUrl = player.url();
  const storage = await playerCtx.storageState();
  writeFileSync(path.join(out, 'player-storage-state.json'), JSON.stringify(storage, null, 2));
  await playerCtx.close();
  logRoom('player-disconnected', { playUrl });
  await host.waitForTimeout(1500);

  const playerCtx2 = await browser.newContext({ storageState: storage });
  const player2 = await playerCtx2.newPage();
  attachConsole(player2, playerConsole, 'player-reconnect');
  await player2.goto(playUrl.includes('name=') ? playUrl : `${playUrl}?name=EvidencePlayer`, {
    waitUntil: 'networkidle',
  });
  // Re-enter lobby if needed
  const enterLobby = player2.getByRole('button', { name: /Enter Lobby/i });
  if (await enterLobby.isVisible().catch(() => false)) {
    await enterLobby.click();
  }
  await player2.waitForTimeout(2000);
  await shot(player2, '09-reconnect-player.png');
  await shot(host, '09-reconnect-host.png');
  logRoom('player-reconnected', { playUrl, text: (await player2.locator('body').innerText()).slice(0, 300) });

  // End room
  await host.getByRole('button', { name: /End Room/i }).click();
  await host.waitForTimeout(1000);
  await shot(host, '10-room-close-host.png');
  logRoom('room-ended', {});

  // Reject reuse
  const reuseCtx = await browser.newContext();
  const reuse = await reuseCtx.newPage();
  attachConsole(reuse, playerConsole, 'reuse');
  await reuse.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await reuse.getByPlaceholder('ABCDE').fill(roomCode);
  await reuse.getByPlaceholder('Your name').fill('ReuseAttempt');
  await reuse.getByRole('button', { name: /Join Room/i }).click();
  await reuse.waitForURL(/\/play\//, { timeout: 15000 }).catch(() => {});
  const reuseEnter = reuse.getByRole('button', { name: /Enter Lobby/i });
  if (await reuseEnter.isVisible().catch(() => false)) {
    await reuseEnter.click();
    await reuse.waitForTimeout(1500);
  }
  await shot(reuse, '11-room-reuse-rejected.png');
  const reuseText = await reuse.locator('body').innerText();
  logRoom('reuse-attempt', { roomCode, text: reuseText.slice(0, 400) });
  writeFileSync(path.join(out, 'room-reuse-result.txt'), reuseText);

  writeFileSync(path.join(out, 'host-console.log'), hostConsole.join('\n') + '\n');
  writeFileSync(path.join(out, 'player-console.log'), playerConsole.join('\n') + '\n');
  writeFileSync(
    path.join(out, 'run-summary.json'),
    JSON.stringify(
      {
        roomCode,
        demoTitle,
        health,
        screenshots: [
          '01-host-startup.png',
          '02-host-lobby.png',
          '03-host-lobby-with-player.png',
          '04-player-lobby.png',
          '05-ready-state-host.png',
          '05-ready-state-player.png',
          '06-countdown-host.png',
          '06-countdown-player.png',
          '07-round-host.png',
          '07-round-player.png',
          '08-results-host.png',
          '08-results-player.png',
          '09-reconnect-player.png',
          '09-reconnect-host.png',
          '10-room-close-host.png',
          '11-room-reuse-rejected.png',
        ],
        completedAt: ts(),
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log('DONE room', roomCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
