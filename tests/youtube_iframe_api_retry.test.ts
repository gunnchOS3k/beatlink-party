/**
 * Verifies rejected YouTube IFrame API load does not poison reconnect/retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadYouTubeIframeApi,
  resetYouTubeIframeApiLoadCache,
  type YoutubeApiWindow,
} from '../apps/web/src/lib/youtubeIframeApiLoad.ts';

function makeDoc() {
  const scripts: Array<{
    src: string;
    async: boolean;
    dataset: Record<string, string>;
    onerror: ((ev: unknown) => void) | null;
    remove: () => void;
  }> = [];

  const doc = {
    head: {
      appendChild(node: (typeof scripts)[number]) {
        scripts.push(node);
        return node;
      },
    },
    createElement(_tag: string) {
      const el = {
        src: '',
        async: false,
        dataset: {} as Record<string, string>,
        onerror: null as ((ev: unknown) => void) | null,
        remove() {
          const i = scripts.indexOf(el);
          if (i >= 0) scripts.splice(i, 1);
        },
      };
      return el;
    },
    querySelector(sel: string) {
      if (sel !== 'script[data-beatlink-yt-api]') return null;
      return scripts[0] ?? null;
    },
    querySelectorAll(sel: string) {
      if (sel !== 'script[data-beatlink-yt-api]') return [] as unknown as NodeListOf<Element>;
      return scripts as unknown as NodeListOf<Element>;
    },
  };

  return { doc: doc as unknown as Document, scripts };
}

describe('YouTube IFrame API load retry cache', () => {
  beforeEach(() => {
    resetYouTubeIframeApiLoadCache({
      querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears rejected apiLoadPromise so a second load can retry', async () => {
    const { doc, scripts } = makeDoc();
    const win: YoutubeApiWindow & {
      setInterval: typeof setInterval;
      clearInterval: typeof clearInterval;
      setTimeout: typeof setTimeout;
    } = {
      setInterval,
      clearInterval,
      setTimeout,
    };

    const first = loadYouTubeIframeApi(win, doc);
    expect(scripts).toHaveLength(1);
    scripts[0]!.onerror?.(new Event('error'));
    await expect(first).rejects.toThrow(/failed to load/i);
    expect(scripts).toHaveLength(0);

    const second = loadYouTubeIframeApi(win, doc);
    expect(scripts).toHaveLength(1);
    win.YT = { Player: class {} };
    win.onYouTubeIframeAPIReady?.();
    await expect(second).resolves.toBeUndefined();
  });
});
