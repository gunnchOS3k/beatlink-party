/**
 * Sibling Wave007 free Playwright: one real browser party cycles all five
 * registered modes with authentic UI inputs (no synthetic player masquerading).
 * Karaoke default remains timing-only — MICROPHONE_PITCH_ANALYSIS=false until
 * continuous consented live mic DSP (never a synthetic tone probe claim).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BEATLINK_WEB_URL ?? 'http://127.0.0.1:5173';
const API = process.env.BEATLINK_API_URL ?? 'http://127.0.0.1:3001';
const ART = join(process.cwd(), 'artifacts/engineering_wave007');
const SONG_ID = 'demo-neon-groove';

const MODES = [
  'BeatTap',
  'CallAndResponse',
  'KaraokePerformance',
  'BandRoles',
  'PredictionTrivia',
] as const;

type ModeId = (typeof MODES)[number];

type BeatmapPayload = {
  notes: Array<{ id: string; timeMs: number; type: string }>;
  vocalPrompts: Array<{ id: string; timeMs: number; durationMs: number; text: string }>;
  sections: Array<{ id: string; label: string; startMs: number; endMs: number }>;
  hypeEvents: Array<{ id: string; timeMs: number }>;
};

function writeJson(name: string, data: unknown) {
  mkdirSync(ART, { recursive: true });
  const text = JSON.stringify(data, null, 2) + '\n';
  if (/\/Users\//.test(text) || /SPOTIFY_CLIENT|APPLE_MUSIC|YOUTUBE_API|sk-|Bearer /i.test(text)) {
    throw new Error(`artifact hygiene failed for ${name}`);
  }
  writeFileSync(join(ART, name), text);
}

async function fetchBeatmap(): Promise<BeatmapPayload> {
  const res = await fetch(`${API}/beatmaps/${SONG_ID}`);
  if (!res.ok) throw new Error(`beatmap fetch failed ${res.status}`);
  const body = (await res.json()) as { beatmap: BeatmapPayload };
  return body.beatmap;
}

async function waitRoomPhase(code: string, phase: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${API}/rooms/${code}`);
    if (res.ok) {
      const body = (await res.json()) as { room?: { phase?: string; gameStartTime?: number | null } };
      if (body.room?.phase === phase) return body.room;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for phase=${phase}`);
}

async function joinPerformer(
  browser: Browser,
  roomCode: string,
  name: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`);
  await page.getByPlaceholder('ABCDE').fill(roomCode);
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByTestId('join-submit').click();
  await page.waitForURL(new RegExp(`/play/${roomCode}`, 'i'));
  await page.getByTestId('performer-enter-lobby').click();
  await expect(page.getByText(/Welcome/i)).toBeVisible({ timeout: 15000 });
  return { ctx, page };
}

async function setRoleReady(page: Page, role: 'beat_tapper' | 'vocalist' | 'hype_captain') {
  await page.getByTestId(`role-${role}`).click();
  await expect(page.locator(`[data-testid="role-${role}"].selected`)).toBeVisible({
    timeout: 8000,
  });
  const ready = page.getByTestId('performer-ready');
  // Ensure ready=true (button label flips to "Not Ready" when ready).
  const label = (await ready.innerText()).trim();
  if (label === 'Ready!') {
    await ready.click();
  }
  await expect(ready).toHaveText(/Not Ready/i, { timeout: 8000 });
}

/** Poll real UI until vocal timing tap is enabled, then click (timing-only path). */
async function submitVocalTiming(page: Page, timeoutMs = 16000) {
  await expect(page.getByTestId('controller-vocalist')).toBeVisible({ timeout: 20000 });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const btn = page.getByTestId('performer-vocal-fallback');
    if (await btn.isVisible().catch(() => false)) {
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click();
        return;
      }
    }
    await page.waitForTimeout(120);
  }
  throw new Error('vocal timing window never enabled');
}

async function startRound(host: Page, code: string) {
  await expect(host.getByTestId('host-start-calibration')).toHaveAttribute(
    'data-start-state',
    'enabled',
    { timeout: 25000 },
  );
  await host.getByTestId('host-start-calibration').click();
  await expect(host.getByTestId('host-skip-calibration')).toBeVisible({ timeout: 15000 });
  await host.getByTestId('host-skip-calibration').click();
  return waitRoomPhase(code, 'playing', 40000);
}

async function waitUntilGameMs(gameStartTime: number, targetMs: number) {
  const delay = gameStartTime + targetMs - Date.now();
  if (delay > 20) {
    await new Promise((r) => setTimeout(r, Math.min(delay, 14000)));
  }
}

async function endRoundCollectScores(host: Page, performers: Page[]) {
  await host.getByTestId('host-force-end-playing').click();
  await expect(host.getByTestId('host-ledger-checksum')).toBeVisible({ timeout: 20000 });
  const hostHash = (await host.getByTestId('host-ledger-checksum').innerText())
    .replace(/^Ledger:\s*/, '')
    .trim();
  const scores: number[] = [];
  for (const p of performers) {
    const visible = await p.getByTestId('performer-result-score').isVisible().catch(() => false);
    if (visible) {
      const text = await p.getByTestId('performer-result-score').innerText();
      scores.push(Number.parseInt(text.replace(/\D/g, ''), 10) || 0);
    }
  }
  return { hostHash, scores, maxScore: Math.max(0, ...scores) };
}

test.describe.configure({ mode: 'serial' });

test('Five-mode browser party loop (authentic inputs)', async ({ browser }) => {
  test.setTimeout(360_000);

  const modeResults: Array<{
    mode: ModeId;
    completed: boolean;
    maxScore: number;
    ledger: string;
    banner?: string;
    detail?: string;
  }> = [];

  const beatmap = await fetchBeatmap();
  expect(beatmap.notes.length).toBeGreaterThan(0);

  const hostCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const host = await hostCtx.newPage();

  await host.goto(`${BASE}/`);
  await host.getByTestId('create-room').click();
  await host.waitForURL(/\/host\//, { timeout: 15000 });
  const roomCode = (await host.getByTestId('host-room-code').innerText()).trim().toUpperCase();
  expect(roomCode).toMatch(/^[A-Z0-9]{5}$/);

  const hostSecret = await host.evaluate(() => {
    try {
      const raw = localStorage.getItem('beatlink_host');
      const parsed = raw ? JSON.parse(raw) : null;
      return typeof parsed?.hostToken === 'string' ? parsed.hostToken : '';
    } catch {
      return '';
    }
  });
  expect(hostSecret.length).toBeGreaterThan(8);

  const p1 = await joinPerformer(browser, roomCode, 'FiveModeTap');
  const p2 = await joinPerformer(browser, roomCode, 'FiveModeVox');
  const p3 = await joinPerformer(browser, roomCode, 'FiveModeHype');

  const guestLeak = await p1.page.evaluate((secret) => {
    if (!secret) return true;
    const page = document.documentElement.innerText;
    const storage = `${sessionStorage.getItem('beatlink_member') || ''}${localStorage.getItem('beatlink_player') || ''}`;
    return page.includes(secret) || storage.includes(secret);
  }, hostSecret);
  expect(guestLeak).toBe(false);

  const playerCreds = await p1.page.evaluate(() => {
    const raw = localStorage.getItem('beatlink_player');
    return raw ? JSON.parse(raw) : null;
  });
  expect(playerCreds?.playerId && playerCreds?.playerToken).toBeTruthy();

  await expect(host.getByText('FiveModeTap')).toBeVisible({ timeout: 15000 });
  await expect(host.getByText('FiveModeVox')).toBeVisible({ timeout: 15000 });
  await expect(host.getByText('FiveModeHype')).toBeVisible({ timeout: 15000 });

  for (let i = 0; i < MODES.length; i++) {
    const mode = MODES[i]!;
    if (i > 0) {
      await host.getByTestId('host-rematch').click();
      await expect(host.getByTestId('host-room-code')).toBeVisible({ timeout: 10000 });
      await expect(host.getByTestId('host-game-mode')).toBeVisible({ timeout: 10000 });
      // Guests return to lobby after rematch.
      await expect(p1.page.getByTestId('player-lobby')).toBeVisible({ timeout: 15000 });
      await expect(p2.page.getByTestId('player-lobby')).toBeVisible({ timeout: 15000 });
      await expect(p3.page.getByTestId('player-lobby')).toBeVisible({ timeout: 15000 });

      // After BeatTap rematch: reconnect same identity into lobby (seat + host authority).
      if (mode === 'CallAndResponse') {
        await p1.ctx.close();
        const re = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const rePage = await re.newPage();
        await rePage.addInitScript(
          ([code, pid, token]) => {
            localStorage.setItem(
              'beatlink_player',
              JSON.stringify({ roomCode: code, playerId: pid, playerToken: token }),
            );
          },
          [roomCode, playerCreds.playerId, playerCreds.playerToken],
        );
        await rePage.goto(`${BASE}/play/${roomCode}?name=FiveModeTap`);
        await rePage.getByTestId('performer-enter-lobby').click();
        await expect(rePage.getByTestId('player-lobby')).toBeVisible({ timeout: 15000 });
        const roster = await host.locator('.player-card').filter({ hasText: 'FiveModeTap' }).count();
        expect(roster).toBe(1);
        Object.assign(p1, { ctx: re, page: rePage });
      }
    }

    await host.getByTestId('host-game-mode').selectOption(mode);
    await host.getByTestId(`select-song-${SONG_ID}`).click();
    await expect(host.locator('.song-item.selected')).toContainText(/Neon Groove/i);

    // Role seating for this mode
    if (mode === 'KaraokePerformance') {
      await setRoleReady(p1.page, 'vocalist');
      await setRoleReady(p2.page, 'beat_tapper');
      await setRoleReady(p3.page, 'hype_captain');
    } else if (mode === 'PredictionTrivia') {
      await setRoleReady(p1.page, 'hype_captain');
      await setRoleReady(p2.page, 'beat_tapper');
      await setRoleReady(p3.page, 'vocalist');
    } else if (mode === 'BandRoles') {
      await setRoleReady(p1.page, 'beat_tapper');
      await setRoleReady(p2.page, 'vocalist');
      await setRoleReady(p3.page, 'hype_captain');
    } else {
      await setRoleReady(p1.page, 'beat_tapper');
      await setRoleReady(p2.page, 'vocalist');
      await setRoleReady(p3.page, 'hype_captain');
    }

    const playing = await startRound(host, roomCode);
    const gameStartTime = playing.gameStartTime;
    expect(gameStartTime).toBeTruthy();

    const banner = await p1.page.getByTestId('active-mode-banner').innerText();
    expect(banner.length).toBeGreaterThan(0);
    if (mode === 'KaraokePerformance') {
      // Off-state contract: phrase timing with pitch off until mic consent.
      expect(banner).toMatch(/phrase timing/i);
      expect(banner).toMatch(/pitch off until mic consent/i);
      await expect(p1.page.getByTestId('vocal-path-truth')).toContainText('VOCAL_PROMPT_TIMING_MODE');
      await expect(p1.page.getByTestId('vocal-path-truth')).toContainText(
        'MICROPHONE_PITCH_ANALYSIS=false',
      );
    }

    // Authentic timed inputs — real button clicks aligned to catalog chart.
    if (mode === 'BeatTap' || mode === 'CallAndResponse' || mode === 'BandRoles') {
      const responseNotes =
        mode === 'CallAndResponse'
          ? beatmap.notes.filter((n) => {
              const section = beatmap.sections.find(
                (s) => n.timeMs >= s.startMs && n.timeMs < s.endMs,
              );
              if (!section) return false;
              const mid = section.startMs + (section.endMs - section.startMs) / 2;
              return n.timeMs >= mid;
            })
          : beatmap.notes;
      const targets = (responseNotes.length ? responseNotes : beatmap.notes).slice(0, 4);
      for (const note of targets) {
        await waitUntilGameMs(gameStartTime!, note.timeMs);
        if (await p1.page.getByTestId('performer-tap').isVisible().catch(() => false)) {
          await p1.page.getByTestId('performer-tap').click({ force: true });
        }
      }
      if (mode === 'BandRoles') {
        await submitVocalTiming(p2.page, 16000).catch(() => undefined);
        const hype = beatmap.hypeEvents[0] ?? { timeMs: 1500 };
        await waitUntilGameMs(gameStartTime!, hype.timeMs);
        if (await p3.page.getByTestId('hype-cheer').isVisible().catch(() => false)) {
          await p3.page.getByTestId('hype-cheer').click({ force: true });
        }
      }
    } else if (mode === 'KaraokePerformance') {
      expect(beatmap.vocalPrompts[0]).toBeTruthy();
      await submitVocalTiming(p1.page);
    } else if (mode === 'PredictionTrivia') {
      // Lock early — before first upcoming section starts.
      await waitUntilGameMs(gameStartTime!, 800);
      await expect(p1.page.getByTestId('prediction-choices')).toBeVisible({ timeout: 10000 });
      const verseBtn = p1.page.getByTestId('prediction-choice-verse');
      if (await verseBtn.isVisible().catch(() => false)) {
        await verseBtn.click();
      } else {
        await p1.page.locator('[data-testid^="prediction-choice-"]').first().click();
      }
    }

    const { hostHash, scores, maxScore } = await endRoundCollectScores(host, [
      p1.page,
      p2.page,
      p3.page,
    ]);
    // At least one authentic score point across the party for this mode.
    const completed = Boolean(hostHash && hostHash !== 'n/a' && maxScore > 0);
    modeResults.push({
      mode,
      completed,
      maxScore,
      ledger: hostHash,
      banner,
      detail: `scores=${JSON.stringify(scores)}`,
    });
    expect(completed, `${mode} must complete with real score > 0 (${JSON.stringify(scores)})`).toBe(
      true,
    );
  }

  // Host still authoritative — end room.
  await host.getByTestId('host-end-room').click();
  await host.waitForURL(/\/($|\?)/, { timeout: 15000 });
  const closedRes = await fetch(`${API}/rooms/${roomCode}`);
  expect(closedRes.status).toBe(404);

  const completedModes = modeResults.filter((m) => m.completed).map((m) => m.mode);
  writeJson('FIVE_MODES_BROWSER_RESULT.json', {
    playwright_ran: true,
    playwright_skipped: false,
    browser: 'chromium',
    room_code: roomCode,
    song_id: SONG_ID,
    chart_license: 'demo_generated_royalty_free',
    host_session_absent_from_guest: true,
    microphone_pitch_analysis: false,
    vocal_path_classification: 'VOCAL_PROMPT_TIMING_MODE',
    modes: modeResults,
    modes_completed: completedModes,
    modes_completed_count: completedModes.length,
    all_five_completed: completedModes.length === 5,
    ok: completedModes.length === 5,
  });

  await p1.ctx.close();
  await p2.ctx.close();
  await p3.ctx.close();
  await hostCtx.close();
});
