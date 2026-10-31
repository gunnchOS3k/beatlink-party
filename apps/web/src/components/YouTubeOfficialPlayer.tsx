/**
 * Official YouTube IFrame API — visible player only.
 * Events / state / controls / errors / reconnect.
 * No AV separation, no audio extraction, no hidden players.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  loadYouTubeIframeApi,
  resetYouTubeIframeApiLoadCache,
} from '../lib/youtubeIframeApiLoad';

export type YtPlayerState =
  | 'unstarted'
  | 'ended'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'cued'
  | 'error'
  | 'loading';

const YT_STATE_MAP: Record<number, YtPlayerState> = {
  [-1]: 'unstarted',
  [0]: 'ended',
  [1]: 'playing',
  [2]: 'paused',
  [3]: 'buffering',
  [5]: 'cued',
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayerHandle }) => void;
            onStateChange?: (e: { data: number; target: YtPlayerHandle }) => void;
            onError?: (e: { data: number; target: YtPlayerHandle }) => void;
          };
        },
      ) => YtPlayerHandle;
      PlayerState?: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayerHandle {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  destroy: () => void;
}

export { loadYouTubeIframeApi, resetYouTubeIframeApiLoadCache };

export interface YouTubeOfficialPlayerProps {
  videoId: string;
  /** Visible player required — never zero-size / offscreen. */
  height?: number;
  title?: string;
  onStateChange?: (state: YtPlayerState) => void;
}

export function YouTubeOfficialPlayer({
  videoId,
  height = 220,
  title = 'YouTube official player',
  onStateChange,
}: YouTubeOfficialPlayerProps) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `beatlink-yt-${reactId}`;
  const playerRef = useRef<YtPlayerHandle | null>(null);
  const [state, setState] = useState<YtPlayerState>('loading');
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let player: YtPlayerHandle | null = null;

    void (async () => {
      try {
        await loadYouTubeIframeApi();
        if (cancelled || !window.YT?.Player) return;
        const mount = document.getElementById(containerId);
        if (!mount) return;
        player = new window.YT.Player(containerId, {
          videoId,
          width: '100%',
          height,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setState('cued');
              onStateChange?.('cued');
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const next = YT_STATE_MAP[e.data] ?? 'unstarted';
              setState(next);
              onStateChange?.(next);
            },
            onError: (e) => {
              if (cancelled) return;
              setErrorCode(e.data);
              setState('error');
              onStateChange?.('error');
            },
          },
        });
        playerRef.current = player;
      } catch {
        if (!cancelled) {
          setState('error');
          setErrorCode(-1);
          onStateChange?.('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional reconnect remount
  }, [videoId, height, containerId, reconnectKey]);

  function reconnect() {
    setErrorCode(null);
    setState('loading');
    resetYouTubeIframeApiLoadCache();
    setReconnectKey((k) => k + 1);
  }

  return (
    <div
      className="youtube-official-player"
      data-testid="youtube-official-player"
      data-yt-state={state}
      style={{ marginTop: '0.75rem' }}
    >
      <p className="label">Official YouTube IFrame API (visible player — no AV separation)</p>
      <div
        id={containerId}
        title={title}
        style={{
          width: '100%',
          minHeight: height,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111',
        }}
      />
      <div className="row" style={{ gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={() => playerRef.current?.playVideo()}>
          Play
        </button>
        <button type="button" className="btn" onClick={() => playerRef.current?.pauseVideo()}>
          Pause
        </button>
        <button type="button" className="btn" onClick={() => playerRef.current?.stopVideo()}>
          Stop
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => playerRef.current?.seekTo(0, true)}
        >
          Seek 0
        </button>
        {state === 'error' ? (
          <button type="button" className="btn" data-testid="youtube-reconnect" onClick={reconnect}>
            Reconnect
          </button>
        ) : null}
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }} data-testid="youtube-state">
          state={state}
          {errorCode != null ? ` error=${errorCode}` : ''}
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
        Host hearing uses the official visible embed. Multiplayer scoring still requires catalog
        match or rights-verified direct HTTPS + beat grid — never YouTube audio extraction.
        Metadata/embed ≠ gameplay.
      </p>
    </div>
  );
}
