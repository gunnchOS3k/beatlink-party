#!/usr/bin/env node
/**
 * BeatLink Pixel multiplayer acceptance — Mac (Playwright) + Pixel (ADB AcceptNav + JS).
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const evRoot = path.join(root, 'docs/product-quality/evidence/pixel-multiplayer');
const WEB = process.env.BEATLINK_WEB_URL || 'http://10.0.0.113:5173';
const PKG = 'com.gunnchos.beatlinkparty';
const SERIAL = process.env.ANDROID_SERIAL || '27211JEGR06194';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function adb(args) {
  return sh(`adb -s ${SERIAL} ${args}`);
}
function shotDevice(rel) {
  const out = path.join(evRoot, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  execSync(`adb -s ${SERIAL} exec-out screencap -p > ${JSON.stringify(out)}`, { shell: '/bin/zsh' });
}
function navJoin(code, name) {
  adb(
    `shell am broadcast -a ${PKG}.ACCEPT_NAV -n ${PKG}/.AcceptNavReceiver --es code ${code} --es name ${name} --ez auto true`,
  );
}
function navJs(js) {
  // Android `am`/`sh` mangle parentheses; ship JS as base64.
  const b64 = Buffer.from(js, 'utf8').toString('base64');
  adb(
    `shell am broadcast -a ${PKG}.ACCEPT_NAV -n ${PKG}/.AcceptNavReceiver --es action js_b64 --es js_b64 ${b64}`,
  );
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHostText(page, re, timeout = 60000) {
  await page.waitForFunction(
    (pattern) => new RegExp(pattern, 'i').test(document.body?.innerText || ''),
    typeof re === 'string' ? re : re.source,
    { timeout },
  );
}

async function waitBothReady(hostPage, timeout = 60000) {
  await hostPage.waitForFunction(
    () => {
      const t = document.body?.innerText || '';
      const readyCount = (t.match(/✓ Ready/g) || []).length;
      return readyCount >= 2;
    },
    null,
    { timeout },
  );
}

function pixelEnterLobbyJs() {
  navJs(
    "(()=>{const b=[...document.querySelectorAll('button')].find((x)=>/Enter Lobby/i.test(x.textContent||''));b&&b.click();})()",
  );
}
function pixelReadyJs() {
  navJs(
    "(()=>{const btns=[...document.querySelectorAll('button')];const enter=btns.find((b)=>/Enter Lobby/i.test(b.textContent||''));if(enter){enter.click();return;}const role=btns.find((b)=>/Beat Tapper/i.test(b.textContent||''));role&&role.click();const ready=btns.find((b)=>/^Ready!?$/i.test((b.textContent||'').trim()));ready&&ready.click();})()",
  );
}

function pixelCreateRoomJs() {
  navJs(
    "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create Room/i.test(x.textContent||''));b&&b.click();})()",
  );
}

function pixelLogRoomCodeJs() {
  // Value is returned to Android Log via evaluateJavascript callback.
  navJs("(function(){var c=document.querySelector('.room-code');return c?String(c.textContent||'').trim():'';})()");
}

async function readRoomCodeFromLogcat(maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const dump = sh(`adb -s ${SERIAL} logcat -d -v brief | grep -E 'BeatLinkAccept|BL_ROOM|JS_RESULT' | tail -20`);
    const m =
      dump.match(/JS_RESULT:"([A-Z0-9]{4,6})"/) ||
      dump.match(/JS_RESULT:\\"([A-Z0-9]{4,6})\\"/) ||
      dump.match(/BL_ROOM:([A-Z0-9]{4,6})/);
    if (m) return m[1];
    await sleep(700);
  }
  return '';
}

function ocrRoomCodeFromPng(pngPath) {
  try {
    const crop = '/tmp/bl-room-crop.png';
    const py = '/tmp/bl-crop-room.py';
    writeFileSync(
      py,
      `from PIL import Image\nim=Image.open(${JSON.stringify(pngPath)})\nw,h=im.size\nim.crop((0,int(h*0.08),w,int(h*0.28))).resize((w*2,int(h*0.4))).save(${JSON.stringify(crop)})\n`,
    );
    sh(`python3 ${py}`);
    const txt = sh(
      `tesseract ${JSON.stringify(crop)} stdout -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 --psm 6 2>/dev/null || true`,
    );
    const compact = txt.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hits = compact.match(/[A-Z0-9]{5}/g) || [];
    for (const h of hits) {
      if (!['PARTY', 'HOSTM', 'BEATL', 'READY', 'NENGR', 'PLAYE'].includes(h)) return h;
    }
    const full = sh(`tesseract ${JSON.stringify(pngPath)} stdout 2>/dev/null || true`).toUpperCase();
    const spaced = full.match(/\b[A-Z0-9](?:\s+[A-Z0-9]){4}\b/);
    if (spaced) return spaced[0].replace(/\s+/g, '');
  } catch {
    /* ignore */
  }
  return '';
}

async function pixelTapDuringPlay(seconds = 14) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    navJs(
      "(()=>{const b=document.querySelector('.tap-button')||[...document.querySelectorAll('button')].find(x=>/TAP|Sing|Cheer|Boost/i.test(x.textContent||''));b&&b.click();})()",
    );
    await sleep(400);
  }
}

async function runDirectionB(browser) {
  const dir = path.join(evRoot, 'direction-b');
  mkdirSync(dir, { recursive: true });
  const log = [];
  const note = (m) => {
    log.push(`${new Date().toISOString()} ${m}`);
    console.log('[B]', m);
  };

  adb(`shell am force-stop ${PKG}`);
  adb('logcat -c');
  const rec = spawn('adb', ['-s', SERIAL, 'shell', 'screenrecord', '--time-limit', '170', '/sdcard/beatlink-dir-b.mp4'], {
    stdio: 'ignore',
  });

  const host = await browser.newPage();
  const macPlayer = await browser.newPage();
  await host.setViewportSize({ width: 1280, height: 900 });
  await macPlayer.setViewportSize({ width: 420, height: 860 });

  await host.goto(WEB + '/', { waitUntil: 'networkidle' });
  await host.screenshot({ path: path.join(dir, '01-mac-landing.png') });
  await host.getByRole('button', { name: /Create Room/i }).click();
  await host.waitForURL(/\/host\//);
  const code = host.url().split('/host/')[1].toUpperCase();
  note(`room=${code}`);
  writeFileSync(path.join(dir, 'room-code.txt'), code);
  await sleep(1200);
  await host.screenshot({ path: path.join(dir, '02-mac-host-qr.png'), fullPage: true });

  adb(`shell am start -n ${PKG}/.MainActivity`);
  await sleep(2500);
  navJoin(code, 'PixelPlayer');
  await sleep(3500);
  shotDevice('direction-b/03-pixel-joined.png');
  pixelEnterLobbyJs();
  await sleep(2000);
  pixelReadyJs();
  await sleep(1200);
  pixelReadyJs();
  await sleep(1200);
  pixelReadyJs();
  await sleep(800);
  shotDevice('direction-b/05-pixel-ready.png');

  await macPlayer.goto(`${WEB}/join?code=${code}&name=MacPlayer&auto=1`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const enter = macPlayer.getByRole('button', { name: /Enter Lobby/i });
  if (await enter.isVisible().catch(() => false)) await enter.click();
  await sleep(800);
  await macPlayer.getByRole('button', { name: /Beat Tapper/i }).click();
  await sleep(300);
  await macPlayer.getByRole('button', { name: /^Ready!?$/i }).click();
  await macPlayer.screenshot({ path: path.join(dir, '04-mac-player-ready.png') });

  await waitBothReady(host, 45000);
  await host.screenshot({ path: path.join(dir, '06-host-both-ready.png'), fullPage: true });

  await host.locator('.song-item').first().click();
  await sleep(500);
  await host.getByRole('button', { name: /Start Countdown/i }).click();
  await waitHostText(host, /Get ready|LIVE|countdown|^[123]$/i, 20000);
  await host.screenshot({ path: path.join(dir, '07-countdown.png') });
  shotDevice('direction-b/08-pixel-countdown.png');

  await waitHostText(host, /LIVE/i, 20000);
  await host.screenshot({ path: path.join(dir, '09-round-host.png') });
  shotDevice('direction-b/10-pixel-round.png');

  const tapLoop = (async () => {
    for (let i = 0; i < 60; i++) {
      await macPlayer.locator('.tap-button').click({ timeout: 400 }).catch(async () => {
        await macPlayer.mouse.click(210, 520).catch(() => {});
      });
      await sleep(250);
    }
  })();
  await Promise.all([tapLoop, pixelTapDuringPlay(18)]);

  await waitHostText(host, /Round Complete/i, 90000);
  await sleep(1500);
  await host.screenshot({ path: path.join(dir, '11-results-host.png'), fullPage: true });
  shotDevice('direction-b/12-pixel-results.png');
  await macPlayer.screenshot({ path: path.join(dir, '13-mac-player-results.png') });

  adb('shell input keyevent KEYCODE_HOME');
  await sleep(2000);
  adb(`shell am start -n ${PKG}/.MainActivity`);
  await sleep(2000);
  shotDevice('direction-b/14-pixel-resume.png');

  await host.getByRole('button', { name: /End Room/i }).click();
  await sleep(1500);
  await host.screenshot({ path: path.join(dir, '15-mac-after-end.png') });
  shotDevice('direction-b/16-pixel-room-ended.png');

  await macPlayer.goto(`${WEB}/join?code=${code}&name=ReuseProbe&auto=1`, { waitUntil: 'networkidle' });
  await sleep(1000);
  const reuseEnter = macPlayer.getByRole('button', { name: /Enter Lobby/i });
  if (await reuseEnter.isVisible().catch(() => false)) await reuseEnter.click();
  await sleep(1500);
  await macPlayer.screenshot({ path: path.join(dir, '17-reuse-rejected.png') });

  await macPlayer.goto(`${WEB}/join?code=ZZZZZ&name=BadCode&auto=1`, { waitUntil: 'networkidle' });
  await sleep(1000);
  const badEnter = macPlayer.getByRole('button', { name: /Enter Lobby/i });
  if (await badEnter.isVisible().catch(() => false)) await badEnter.click();
  await sleep(1500);
  await macPlayer.screenshot({ path: path.join(dir, '18-invalid-code.png') });

  try {
    rec.kill('SIGINT');
  } catch {
    /* */
  }
  await sleep(1200);
  try {
    adb(`pull /sdcard/beatlink-dir-b.mp4 ${JSON.stringify(path.join(dir, 'beatlink-direction-b.mp4'))}`);
  } catch (e) {
    note(`record pull failed: ${e.message}`);
  }
  writeFileSync(
    path.join(dir, 'pixel-logcat.txt'),
    sh(`adb -s ${SERIAL} logcat -d -v time | grep -iE 'beatlink|gunnchos|FATAL|AndroidRuntime|BL_ROOM' | tail -500`),
  );
  writeFileSync(path.join(dir, 'runner.log'), log.join('\n'));
  await host.close();
  await macPlayer.close();
  return code;
}

async function runDirectionA(browser) {
  const dir = path.join(evRoot, 'direction-a');
  mkdirSync(dir, { recursive: true });
  const log = [];
  const note = (m) => {
    log.push(`${new Date().toISOString()} ${m}`);
    console.log('[A]', m);
  };

  adb(`shell am force-stop ${PKG}`);
  adb('logcat -c');
  const rec = spawn('adb', ['-s', SERIAL, 'shell', 'screenrecord', '--time-limit', '170', '/sdcard/beatlink-dir-a.mp4'], {
    stdio: 'ignore',
  });

  adb(`shell am start -W -n ${PKG}/.MainActivity`);
  await sleep(3000);
  shotDevice('direction-a/01-cold-launch.png');
  pixelCreateRoomJs();
  await sleep(4500);
  shotDevice('direction-a/02-host-lobby.png');
  pixelLogRoomCodeJs();
  await sleep(800);
  let code = await readRoomCodeFromLogcat(6000);
  if (!code) code = ocrRoomCodeFromPng(path.join(dir, '02-host-lobby.png'));
  if (!code) {
    pixelCreateRoomJs();
    await sleep(4000);
    shotDevice('direction-a/02-host-lobby.png');
    code = ocrRoomCodeFromPng(path.join(dir, '02-host-lobby.png'));
  }
  if (!code) {
    writeFileSync(path.join(dir, 'BLOCKED.txt'), 'Room code not found via logcat/OCR after Create Room JS');
    note('BLOCKED no room code');
    try {
      rec.kill('SIGINT');
    } catch {
      /* */
    }
    return null;
  }
  note(`pixel_host_room=${code}`);
  writeFileSync(path.join(dir, 'room-code.txt'), code);

  const mac = await browser.newPage();
  await mac.setViewportSize({ width: 420, height: 860 });
  await mac.goto(`${WEB}/join?code=${code}&name=MacGuest&auto=1`, { waitUntil: 'networkidle' });
  await sleep(1500);
  const enter = mac.getByRole('button', { name: /Enter Lobby/i });
  if (await enter.isVisible().catch(() => false)) await enter.click();
  await sleep(800);
  await mac.getByRole('button', { name: /Beat Tapper/i }).click();
  await sleep(300);
  await mac.getByRole('button', { name: /^Ready!?$/i }).click();
  await mac.screenshot({ path: path.join(dir, '03-mac-joined-ready.png') });
  shotDevice('direction-a/04-pixel-host-with-player.png');

  // Pixel host: select first song + start via JS
  navJs(
    "(()=>{const s=document.querySelector('.song-item');s&&s.click();setTimeout(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Start Countdown/i.test(x.textContent||''));b&&b.click();},400);})()",
  );
  await sleep(3000);
  shotDevice('direction-a/05-countdown.png');
  await mac.screenshot({ path: path.join(dir, '06-mac-countdown.png') });

  await waitHostText(mac, /LIVE|Score|TAP|Round Complete/i, 25000).catch(() => {});
  shotDevice('direction-a/07-round.png');
  await mac.screenshot({ path: path.join(dir, '08-mac-round.png') });

  const tapLoop = (async () => {
    for (let i = 0; i < 70; i++) {
      await mac.locator('.tap-button').click({ timeout: 400 }).catch(async () => {
        await mac.mouse.click(210, 520).catch(() => {});
      });
      await sleep(250);
    }
  })();
  // Pixel host is host UI — may not submit game input; MacGuest does. Still attempt.
  await Promise.all([tapLoop, pixelTapDuringPlay(12)]);

  await waitHostText(mac, /Round Complete|accuracy|Team Score/i, 90000).catch(() => {});
  await sleep(2000);
  shotDevice('direction-a/09-results.png');
  await mac.screenshot({ path: path.join(dir, '10-mac-results.png') });

  await mac.context().setOffline(true);
  await sleep(2000);
  await mac.context().setOffline(false);
  await sleep(2500);
  await mac.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await sleep(2000);
  await mac.screenshot({ path: path.join(dir, '11-mac-reconnect.png') });
  shotDevice('direction-a/12-pixel-after-reconnect.png');

  navJs(
    "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/End Room/i.test(x.textContent||''));b&&b.click();})()",
  );
  await sleep(2000);
  shotDevice('direction-a/13-room-ended.png');

  await mac.goto(`${WEB}/join?code=${code}&name=ReuseA&auto=1`, { waitUntil: 'networkidle' });
  await sleep(1000);
  const re = mac.getByRole('button', { name: /Enter Lobby/i });
  if (await re.isVisible().catch(() => false)) await re.click();
  await sleep(1500);
  await mac.screenshot({ path: path.join(dir, '14-reuse-rejected.png') });

  try {
    rec.kill('SIGINT');
  } catch {
    /* */
  }
  await sleep(1200);
  try {
    adb(`pull /sdcard/beatlink-dir-a.mp4 ${JSON.stringify(path.join(dir, 'beatlink-direction-a.mp4'))}`);
  } catch (e) {
    note(`record pull failed: ${e.message}`);
  }
  writeFileSync(
    path.join(dir, 'pixel-logcat.txt'),
    sh(`adb -s ${SERIAL} logcat -d -v time | grep -iE 'beatlink|gunnchos|FATAL|AndroidRuntime|BL_ROOM' | tail -500`),
  );
  writeFileSync(path.join(dir, 'runner.log'), log.join('\n'));
  await mac.close();
  return code;
}

async function main() {
  mkdirSync(evRoot, { recursive: true });
  if (adb('get-state') !== 'device') throw new Error('Pixel not device');
  const browser = await chromium.launch({ headless: true });
  try {
    let prev = {};
    try {
      prev = JSON.parse(readFileSync(path.join(evRoot, 'SUMMARY.json'), 'utf8'));
    } catch {
      /* */
    }
    const b = process.env.BEATLINK_SKIP_B
      ? prev.directionB ?? null
      : await runDirectionB(browser);
    console.log('Direction B room', b);
    const a = process.env.BEATLINK_SKIP_A ? prev.directionA ?? null : await runDirectionA(browser);
    console.log('Direction A room', a);
    writeFileSync(
      path.join(evRoot, 'SUMMARY.json'),
      JSON.stringify(
        {
          directionB: b,
          directionA: a,
          web: WEB,
          apkSha: 'cdfa3409331e913a6fafad4741906014d2730870a8280fcf3066d72cd0490490',
          version: '1.1.1 (3)',
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
