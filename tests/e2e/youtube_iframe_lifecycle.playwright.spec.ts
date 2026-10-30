import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';

/**
 * BL-LINK-002 live YouTube IFrame API smoke:
 * visible player load/buffer/error/reconnect against youtube.com iframe_api.
 * Does NOT claim audio extraction or gameplay sync — API key ≠ sync.
 * Enable with BEATLINK_YT_SMOKE=1 (network to youtube.com required).
 *
 * Served over http://127.0.0.1 — YouTube rejects null/file origins.
 */
const enabled = process.env.BEATLINK_YT_SMOKE === '1';
/** Google's IFrame API sample id — official visible embed lifecycle only. */
const VIDEO_ID = process.env.BEATLINK_YT_SMOKE_VIDEO_ID ?? 'M7lc1UVf-VE';

function smokeHtml(videoId: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>BeatLink YT smoke</title></head>
<body>
  <p id="honesty">Official visible IFrame only — no AV separation / audio extraction / gameplay sync. YOUTUBE_API_KEY ≠ gameplay sync.</p>
  <div id="player" style="width:640px;height:360px;background:#111" data-testid="yt-mount"></div>
  <div id="state" data-testid="yt-state">loading</div>
  <div id="error" data-testid="yt-error"></div>
  <button id="reconnect" data-testid="yt-reconnect" type="button">Reconnect</button>
  <script>
    window.__yt = { state: 'loading', player: null, ready: false, errors: [] };
    function setState(s) {
      window.__yt.state = s;
      document.getElementById('state').textContent = s;
    }
    function mountPlayer() {
      setState('loading');
      document.getElementById('error').textContent = '';
      if (window.__yt.player) {
        try { window.__yt.player.destroy(); } catch (e) {}
        window.__yt.player = null;
      }
      const mount = document.getElementById('player');
      mount.innerHTML = '';
      window.__yt.player = new YT.Player('player', {
        videoId: ${JSON.stringify(videoId)},
        width: 640,
        height: 360,
        playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: function () { window.__yt.ready = true; setState('cued'); },
          onStateChange: function (e) {
            var map = { '-1': 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };
            setState(map[String(e.data)] || ('state_' + e.data));
          },
          onError: function (e) {
            window.__yt.errors.push(e.data);
            document.getElementById('error').textContent = String(e.data);
            setState('error');
          }
        }
      });
    }
    window.onYouTubeIframeAPIReady = function () { mountPlayer(); };
    document.getElementById('reconnect').onclick = function () {
      window.__yt.ready = false;
      mountPlayer();
    };
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  </script>
</body>
</html>`;
}

test.describe('YouTube IFrame lifecycle / reconnect', () => {
  test.skip(!enabled, 'Set BEATLINK_YT_SMOKE=1 for live youtube.com iframe_api smoke');

  test('visible player loads, reports state, reconnect remounts iframe', async ({ page }) => {
    const html = smokeHtml(VIDEO_ID);
    const server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}/`;

    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('yt-mount')).toBeVisible();
      const box = await page.getByTestId('yt-mount').boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThanOrEqual(320);
      expect(box!.height).toBeGreaterThanOrEqual(180);

      await expect
        .poll(async () => page.getByTestId('yt-state').innerText(), { timeout: 60_000 })
        .toMatch(/cued|playing|buffering|paused|unstarted/);

      const iframe = page.locator(
        '#player iframe, iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]',
      );
      await expect(iframe.first()).toBeVisible({ timeout: 20_000 });
      const iframeBox = await iframe.first().boundingBox();
      expect(iframeBox).toBeTruthy();
      expect(iframeBox!.width).toBeGreaterThan(100);
      expect(iframeBox!.height).toBeGreaterThan(100);

      await page.getByTestId('yt-reconnect').click();
      await expect
        .poll(async () => page.getByTestId('yt-state').innerText(), { timeout: 60_000 })
        .toMatch(/cued|playing|buffering|paused|unstarted/);
      await expect(iframe.first()).toBeVisible({ timeout: 20_000 });

      await expect(page.locator('#honesty')).toContainText(/YOUTUBE_API_KEY/i);
      await expect(page.locator('#honesty')).toContainText(/no AV separation/i);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
