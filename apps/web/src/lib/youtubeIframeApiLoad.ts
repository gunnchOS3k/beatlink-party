/**
 * YouTube IFrame API script loader with rejected-promise retry support.
 * Visible-player path only — never used for AV separation / audio extraction.
 */

export type YoutubeApiWindow = {
  YT?: { Player?: unknown };
  onYouTubeIframeAPIReady?: () => void;
};

let apiLoadPromise: Promise<void> | null = null;

export function resetYouTubeIframeApiLoadCache(
  doc: Pick<Document, 'querySelectorAll'> = typeof document !== 'undefined' ? document : ({
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
  } as Pick<Document, 'querySelectorAll'>),
  win: YoutubeApiWindow | undefined = typeof window !== 'undefined' ? window : undefined,
): void {
  apiLoadPromise = null;
  doc.querySelectorAll('script[data-beatlink-yt-api]').forEach((el) => {
    if (!win?.YT?.Player) el.remove();
  });
}

export function loadYouTubeIframeApi(
  win: YoutubeApiWindow & {
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
    setTimeout: typeof setTimeout;
  } = window as YoutubeApiWindow & {
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
    setTimeout: typeof setTimeout;
  },
  doc: Document = document,
): Promise<void> {
  if (!win) return Promise.reject(new Error('no window'));
  if (win.YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  const pending = new Promise<void>((resolve, reject) => {
    const prior = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };

    const existing = doc.querySelector<HTMLScriptElement>('script[data-beatlink-yt-api]');
    if (existing) {
      const poll = win.setInterval(() => {
        if (win.YT?.Player) {
          win.clearInterval(poll);
          resolve();
        }
      }, 50);
      win.setTimeout(() => {
        win.clearInterval(poll);
        if (!win.YT?.Player) {
          reject(new Error('YouTube IFrame API script present but Player unavailable'));
        }
      }, 8_000);
      return;
    }

    const tag = doc.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.dataset.beatlinkYtApi = '1';
    tag.onerror = () => reject(new Error('YouTube IFrame API failed to load'));
    doc.head.appendChild(tag);

    const poll = win.setInterval(() => {
      if (win.YT?.Player) {
        win.clearInterval(poll);
        resolve();
      }
    }, 50);
    win.setTimeout(() => win.clearInterval(poll), 15_000);
  });

  apiLoadPromise = pending.catch((err: unknown) => {
    apiLoadPromise = null;
    doc.querySelectorAll('script[data-beatlink-yt-api]').forEach((el) => el.remove());
    throw err;
  });

  return apiLoadPromise;
}
