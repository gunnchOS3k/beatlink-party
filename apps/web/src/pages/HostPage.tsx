import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type {
  GameResults,
  LinkResolveResult,
  ProviderAuthStatus,
  RoomState,
  SongCatalogEntry,
} from '@beatlink/shared';
import { ROLES } from '@beatlink/shared';
import { fetchProviderStatus, fetchSongs, resolveLink } from '../lib/api';
import { startCalibrationClicks, startHostMetronome, resumeAudioContext } from '../lib/hostAudio';
import { useCreateRoom, useRoomEvents, useSocket } from '../lib/socket';

function statusBadgeClass(status: LinkResolveResult['playbackStatus']): string {
  if (status === 'PLAYABLE_APPROVED' || status === 'PLAYABLE_AUTHORIZED_PLATFORM') {
    return 'status-playable';
  }
  if (status === 'UNSUPPORTED' || status === 'BLOCKED_BY_POLICY') return 'status-blocked';
  return 'status-metadata';
}

function LinkPreview({ result }: { result: LinkResolveResult }) {
  return (
    <div className="compliance-banner link-preview">
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <span className={`status-badge ${statusBadgeClass(result.playbackStatus)}`}>
          {result.playbackStatus}
        </span>
        <span style={{ fontSize: '0.85rem' }}>{result.platform}</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: '1rem' }}>
        {result.artworkUrl ? (
          <img
            src={result.artworkUrl}
            alt=""
            width={96}
            height={96}
            style={{ borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : null}
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{result.title ?? 'Unknown title'}</p>
          {result.artist ? <p style={{ color: 'var(--muted)' }}>{result.artist}</p> : null}
          {result.durationMs != null ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Duration: {Math.round(result.durationMs / 1000)}s
            </p>
          ) : null}
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>{result.message}</p>
        </div>
      </div>
      {result.sourceId &&
      (result.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM' ||
        result.playbackStatus === 'METADATA_ONLY') ? (
        <ProviderEmbed result={result} />
      ) : null}
    </div>
  );
}

function ProviderEmbed({ result }: { result: LinkResolveResult }) {
  if (!result.sourceId) return null;
  const isAuthorized = result.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM';
  if (result.platform === 'youtube') {
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <p className="label">
          {isAuthorized
            ? 'Official YouTube embed (authorized platform path)'
            : 'Official YouTube embed preview (no API key required)'}
        </p>
        <iframe
          title="YouTube preview"
          width="100%"
          height="200"
          src={`https://www.youtube.com/embed/${result.sourceId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ border: 0, borderRadius: 12 }}
        />
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
          Host hearing uses the official embed. Multiplayer scoring still follows catalog metronome /
          calibration unless a future SDK auth path unlocks platform-synced rounds.
        </p>
      </div>
    );
  }
  if (result.platform === 'spotify' && result.sourceId.startsWith('track:')) {
    const id = result.sourceId.slice('track:'.length);
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <p className="label">
          {isAuthorized
            ? 'Official Spotify embed (authorized platform path)'
            : 'Official Spotify embed preview (no client secret required for iframe)'}
        </p>
        <iframe
          title="Spotify preview"
          style={{ borderRadius: 12, border: 0 }}
          src={`https://open.spotify.com/embed/track/${id}`}
          width="100%"
          height="152"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
          User-initiated Spotify iframe playback is shown here. Synchronized controller rounds still
          require catalog match or Spotify Web Playback SDK + user OAuth.
        </p>
      </div>
    );
  }
  if (result.platform === 'apple_music') {
    const deepLink = result.sourceId
      ? `https://music.apple.com/song/${encodeURIComponent(result.sourceId)}`
      : null;
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <p className="label">Apple Music — legal deep-link / MusicKit boundary</p>
        {deepLink ? (
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ display: 'inline-block', marginTop: '0.35rem' }}
          >
            Open in Apple Music
          </a>
        ) : (
          <p style={{ fontSize: '0.9rem' }}>Paste a song URL with a recognizable Apple Music song id.</p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
          MusicKit JS playback needs a signed developer token from a secure server endpoint. BeatLink
          does not embed private keys or mint tokens in the client.
        </p>
      </div>
    );
  }
  return null;
}

function ConnectProviderCta({
  result,
  providers,
}: {
  result: LinkResolveResult;
  providers: ProviderAuthStatus | null;
}) {
  if (result.playbackStatus !== 'METADATA_ONLY' && result.playbackStatus !== 'PLAYABLE_AUTHORIZED_PLATFORM') {
    return null;
  }
  const configured =
    result.platform === 'spotify'
      ? providers?.spotify
      : result.platform === 'youtube'
        ? providers?.youtube
        : result.platform === 'apple_music'
          ? providers?.apple_music
          : false;

  return (
    <div className="card stack" style={{ borderColor: 'var(--warning)' }}>
      <h4>Connect Provider</h4>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Status:{' '}
        <strong>{configured ? 'Credentials present on server' : 'Credentials missing'}</strong>
      </p>
      {!configured ? (
        <p style={{ fontSize: '0.9rem' }}>
          Remaining <strong>METADATA_ONLY</strong>. Set provider env vars (
          <code>SPOTIFY_CLIENT_ID</code>, <code>YOUTUBE_API_KEY</code>, or{' '}
          <code>APPLE_MUSIC_DEVELOPER_TOKEN</code>) and restart the server. BeatLink never downloads
          or rips platform audio.
        </p>
      ) : (
        <p style={{ fontSize: '0.9rem' }}>
          Provider auth path is available as <strong>PLAYABLE_AUTHORIZED_PLATFORM</strong>. Embed
          preview may appear above when a source id is present. Gameplay still uses the approved
          catalog metronome path when a catalog match exists.
        </p>
      )}
      <ul style={{ color: 'var(--muted)', fontSize: '0.85rem', paddingLeft: '1.25rem' }}>
        {result.fallbackOptions.slice(0, 3).map((opt) => (
          <li key={opt}>{opt}</li>
        ))}
      </ul>
    </div>
  );
}

function CalibrationPanel({
  bpm,
  currentOffsetMs,
  onSubmit,
}: {
  bpm: number;
  currentOffsetMs: number;
  onSubmit: (offsetMs: number) => void;
}) {
  const [samples, setSamples] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const lastBeatRef = useRef<number | null>(null);
  const handleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.stop();
    };
  }, []);

  function start() {
    void resumeAudioContext();
    handleRef.current?.stop();
    setSamples([]);
    setRunning(true);
    handleRef.current = startCalibrationClicks(bpm, (expectedAtMs) => {
      lastBeatRef.current = expectedAtMs;
    });
  }

  function stop() {
    handleRef.current?.stop();
    handleRef.current = null;
    setRunning(false);
  }

  function tap() {
    const expected = lastBeatRef.current;
    if (expected == null) return;
    const offset = Date.now() - expected;
    // Normalize to nearest beat half so late/early land in ±beat/2
    const beatMs = 60_000 / bpm;
    let delta = offset;
    while (delta > beatMs / 2) delta -= beatMs;
    while (delta < -beatMs / 2) delta += beatMs;
    setSamples((prev) => [...prev.slice(-7), Math.round(delta)]);
  }

  const average =
    samples.length > 0
      ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
      : currentOffsetMs;

  return (
    <div className="stage stack" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center' }}>Beat Calibration</h2>
      <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
        Tap on each click to measure host latency. Offset is stored on the room and beatmap ({bpm}{' '}
        BPM).
      </p>
      <div style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 800 }}>
        {average} ms
      </div>
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Samples: {samples.length ? samples.join(', ') : 'none yet'}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        {!running ? (
          <button type="button" className="btn-secondary" onClick={start}>
            Start Clicks
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={stop}>
            Stop Clicks
          </button>
        )}
        <button type="button" className="btn-primary btn-large" onClick={tap} disabled={!running}>
          Tap on Beat
        </button>
      </div>
      <button
        type="button"
        className="btn-primary btn-large"
        onClick={() => {
          stop();
          onSubmit(average);
        }}
        disabled={samples.length < 1 && currentOffsetMs === 0}
      >
        Save Offset & Continue
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          stop();
          onSubmit(0);
        }}
      >
        Use 0 ms & Start Countdown
      </button>
    </div>
  );
}

export default function HostPage() {
  const { roomCode } = useParams();
  const { socket } = useSocket();
  const createRoom = useCreateRoom();
  const [code, setCode] = useState(roomCode?.toUpperCase() ?? '');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [songs, setSongs] = useState<SongCatalogEntry[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkResult, setLinkResult] = useState<LinkResolveResult | null>(null);
  const [providers, setProviders] = useState<ProviderAuthStatus | null>(null);
  const [resolving, setResolving] = useState(false);
  const [gameTimeMs, setGameTimeMs] = useState(0);
  const [results, setResults] = useState<GameResults | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [beatmapBpm, setBeatmapBpm] = useState(120);
  const [difficulty, setDifficulty] = useState<'beginner' | 'casual' | 'pro' | 'nightmare'>('casual');
  const [playMode, setPlayMode] = useState<'party' | 'competitive'>('party');
  const metronomeRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    fetchSongs()
      .then((d) => {
        setSongs(d.songs);
        setSongsError(null);
      })
      .catch((err) => {
        setSongsError(err instanceof Error ? err.message : 'Failed to load songs');
      });
    fetchProviderStatus()
      .then((d) => setProviders(d.providers))
      .catch(() => setProviders(null));
  }, []);

  useEffect(() => {
    if (roomCode) {
      setCode(roomCode.toUpperCase());
      socket.emit('room.subscribe', { code: roomCode.toUpperCase() });
    } else if (!code) {
      createRoom()
        .then((c) => {
          setCode(c);
          setCreateError(null);
          window.history.replaceState(null, '', `/host/${c}`);
        })
        .catch((err) => {
          setCreateError(err instanceof Error ? err.message : 'Failed to create room');
        });
    }
  }, [roomCode, code, createRoom, socket]);

  const handlers = useCallback(
    () => ({
      onState: (r: RoomState) => {
        setRoom(r);
        if (r.linkResolveResult) setLinkResult(r.linkResolveResult);
        if (r.pastedLinkUrl) setLinkUrl(r.pastedLinkUrl);
      },
      onCountdown: (r: RoomState) => setRoom(r),
      onStarted: (r: RoomState, beatmap: { bpm?: number } | null) => {
        setRoom(r);
        setResults(null);
        if (beatmap?.bpm) setBeatmapBpm(beatmap.bpm);
      },
      onScore: (r: RoomState) => setRoom(r),
      onEnded: (r: RoomState, res: GameResults) => {
        setRoom(r);
        setResults(res);
      },
      onPlayerJoined: setRoom,
      onPlayerLeft: setRoom,
    }),
    [],
  );

  useRoomEvents(code, handlers());

  // Host metronome for PLAYABLE_APPROVED catalog rounds (no copyrighted audio files).
  useEffect(() => {
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    if (room?.phase !== 'playing') return;
    const playback = room.linkResolveResult?.playbackStatus;
    const canMetronome =
      playback === 'PLAYABLE_APPROVED' ||
      (!room.linkResolveResult && Boolean(room.selectedSongId));
    if (!canMetronome) return;

    const song = songs.find((s) => s.id === room.selectedSongId);
    const bpm = song?.bpm ?? beatmapBpm;
    const startedAt = room.gameStartTime ?? Date.now();
    void resumeAudioContext();
    metronomeRef.current = startHostMetronome({
      bpm,
      offsetMs: room.calibrationOffsetMs ?? 0,
      durationMs: room.gameDurationMs,
      startedAtMs: startedAt,
    });
    return () => {
      metronomeRef.current?.stop();
      metronomeRef.current = null;
    };
  }, [
    room?.phase,
    room?.selectedSongId,
    room?.gameStartTime,
    room?.gameDurationMs,
    room?.calibrationOffsetMs,
    room?.linkResolveResult,
    songs,
    beatmapBpm,
  ]);

  useEffect(() => {
    if (room?.phase !== 'playing') return;
    const id = setInterval(() => {
      socket.emit('game.tick', { code });
    }, 100);
    const onTick = ({ gameTimeMs: t }: { gameTimeMs: number }) => setGameTimeMs(t);
    socket.on('game.tick', onTick);
    return () => {
      clearInterval(id);
      socket.off('game.tick', onTick);
    };
  }, [room?.phase, code, socket]);

  async function handleResolveLink() {
    if (!linkUrl.trim() || !code) return;
    setResolving(true);
    try {
      const result = await resolveLink(linkUrl);
      setLinkResult(result);
      socket.emit('room.set_resolved_link', { code, url: linkUrl.trim(), result });
      if (result.matchedCatalogId) {
        const song = songs.find((s) => s.id === result.matchedCatalogId);
        if (song) setBeatmapBpm(song.bpm);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to resolve link');
    } finally {
      setResolving(false);
    }
  }

  function selectSong(songId: string) {
    socket.emit('room.select_song', { code, songId });
    const song = songs.find((s) => s.id === songId);
    if (song) setBeatmapBpm(song.bpm);
  }

  function startCalibration() {
    void resumeAudioContext();
    socket.emit('game.start_calibration', { code });
  }

  function submitCalibration(offsetMs: number) {
    socket.emit('game.submit_calibration', { code, offsetMs });
    // After save, host starts countdown
    window.setTimeout(() => {
      socket.emit('game.start_countdown', { code });
    }, 50);
  }

  function replay() {
    socket.emit('game.replay', { code });
    setResults(null);
    setGameTimeMs(0);
    setLinkResult(null);
    setLinkUrl('');
  }

  function endRoom() {
    socket.emit('room.end', { code }, (result?: { ok?: boolean; error?: string }) => {
      if (result && result.ok === false) {
        setCreateError(result.error ?? 'Failed to end room');
        return;
      }
      window.location.href = '/';
    });
  }

  const displayResult = linkResult ?? room?.linkResolveResult ?? null;
  const canStartCalibration = useMemo(() => {
    if (!room?.selectedSongId || (room.players?.length ?? 0) < 1) return false;
    const ready = room.players.every((p) => p.ready && p.role);
    if (!ready) return false;
    if (
      displayResult &&
      displayResult.playbackStatus !== 'PLAYABLE_APPROVED' &&
      !room.selectedSongId
    ) {
      return false;
    }
    return true;
  }, [room, displayResult]);

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join`
      : 'http://localhost:5173/join';

  if (!code) {
    return (
      <div className="page">
        {createError ? (
          <div className="card stack" style={{ maxWidth: 520, margin: '2rem auto' }}>
            <h2>Could not create room</h2>
            <p style={{ color: 'var(--muted)' }}>{createError}</p>
            <Link to="/" className="btn-secondary">
              Back to Home
            </Link>
          </div>
        ) : (
          <p>Creating room…</p>
        )}
      </div>
    );
  }

  const qrUrl = `https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(joinUrl)}`;
  const selectedSong = songs.find((s) => s.id === room?.selectedSongId);

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <Link to="/" style={{ color: 'var(--muted)' }}>
          ← Home
        </Link>
        <span className="status-badge status-playable">Host Mode</span>
      </div>

      {room?.phase === 'lobby' || room?.phase === 'song_select' || !room ? (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <p className="label">Room Code — share with players</p>
            <div className="room-code">{code}</div>
            <div className="row" style={{ justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
              <img src={qrUrl} alt={`QR code for ${joinUrl}`} width={220} height={220} />
              <div>
                <p style={{ color: 'var(--muted)', marginBottom: '0.5rem' }}>
                  Players join at: <strong>{joinUrl}</strong>
                </p>
                <p style={{ color: 'var(--muted)' }}>
                  Connection: {socket.connected ? '✓ Room server connected' : '… Connecting'}
                </p>
              </div>
            </div>
          </div>
          {songsError && (
            <div className="compliance-banner" style={{ marginBottom: '1rem' }}>
              Song catalog unavailable: {songsError}
            </div>
          )}

          <div className="grid-2">
            <div className="card stack">
              <h3>Players ({room?.players.length ?? 0}/6)</h3>
              {(room?.players ?? []).map((p) => (
                <div key={p.id} className="player-card" style={{ borderColor: p.color }}>
                  <div className="player-dot" style={{ background: p.color }} />
                  <div>
                    <strong>{p.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {p.role ? ROLES.find((r) => r.id === p.role)?.label : 'No role'} ·{' '}
                      {p.ready ? '✓ Ready' : 'Not ready'}
                    </div>
                  </div>
                </div>
              ))}
              {(room?.players.length ?? 0) === 0 && (
                <p style={{ color: 'var(--muted)' }}>Waiting for players to join...</p>
              )}
            </div>

            <div className="card stack">
              <h3>Select Song</h3>
              <div className="song-list">
                {songs.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`song-item ${room?.selectedSongId === s.id ? 'selected' : ''}`}
                    onClick={() => selectSong(s.id)}
                  >
                    <strong>{s.title}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {s.artist} · {Math.round(s.durationMs / 1000)}s · {s.bpm} BPM
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Paste Music Link</label>
                <div className="row">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="YouTube, YouTube Music, Spotify, or Apple Music URL"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-secondary"
                    onClick={handleResolveLink}
                    disabled={resolving}
                    type="button"
                  >
                    {resolving ? 'Resolving…' : 'Resolve'}
                  </button>
                </div>
              </div>

              {displayResult && <LinkPreview result={displayResult} />}
              {displayResult && (
                <ConnectProviderCta result={displayResult} providers={providers} />
              )}

              {room?.pastedLinkUrl && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Shared with peers: {room.pastedLinkUrl}
                </p>
              )}

              <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: 140 }}>
                  <span className="label">Difficulty</span>
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as 'beginner' | 'casual' | 'pro' | 'nightmare')
                    }
                    style={{ width: '100%' }}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="casual">Casual</option>
                    <option value="pro">Pro</option>
                    <option value="nightmare">Nightmare</option>
                  </select>
                </label>
                <label style={{ flex: 1, minWidth: 140 }}>
                  <span className="label">Mode</span>
                  <select
                    value={playMode}
                    onChange={(e) => setPlayMode(e.target.value as 'party' | 'competitive')}
                    style={{ width: '100%' }}
                  >
                    <option value="party">Party</option>
                    <option value="competitive">Competitive</option>
                  </select>
                </label>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Selected for this room: {difficulty} · {playMode}
              </p>

              <button
                className="btn-primary btn-large"
                onClick={startCalibration}
                disabled={!canStartCalibration}
                type="button"
              >
                Start Calibration
              </button>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Flow: song select → calibrate latency → countdown → play (host metronome for approved
                catalog).
              </p>
              <button className="btn-secondary btn-large" onClick={endRoom} type="button">
                End Room
              </button>
            </div>
          </div>
        </>
      ) : null}

      {room?.phase === 'calibrating' && (
        <CalibrationPanel
          bpm={selectedSong?.bpm ?? beatmapBpm}
          currentOffsetMs={room.calibrationOffsetMs ?? 0}
          onSubmit={submitCalibration}
        />
      )}

      {room?.phase === 'countdown' && (
        <div className="stage">
          <div className="countdown">{room.countdown}</div>
          <p style={{ textAlign: 'center', fontSize: '1.5rem' }}>Get ready!</p>
          {room.calibrationOffsetMs != null && (
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
              Calibration offset: {room.calibrationOffsetMs} ms
            </p>
          )}
        </div>
      )}

      {room?.phase === 'playing' && (
        <div className="stage">
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>LIVE</h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            {displayResult?.playbackStatus === 'PLAYABLE_APPROVED' || room.selectedSongId
              ? 'Host metronome (Web Audio) — no copyrighted audio files'
              : 'Metadata / provider mode — no ripped audio'}
          </p>
          <div className="beat-lane">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="beat-bar" style={{ animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <span className="label">Team Score</span>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>{room.teamScore}</div>
            </div>
            <div style={{ flex: 1, maxWidth: 300, margin: '0 1rem' }}>
              <span className="label">Crowd Meter</span>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${room.crowdMeter}%` }} />
              </div>
            </div>
            <div>
              <span className="label">Time</span>
              <div style={{ fontSize: '1.5rem' }}>
                {Math.floor(gameTimeMs / 1000)}s / {Math.floor(room.gameDurationMs / 1000)}s
              </div>
            </div>
          </div>
          <div className="grid-2">
            {(room.players ?? []).map((p) => (
              <div key={p.id} className="player-card" style={{ borderColor: p.color }}>
                <div className="player-dot" style={{ background: p.color }} />
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: '0.85rem' }}>
                    {ROLES.find((r) => r.id === p.role)?.label} · Score: {p.score} · Streak:{' '}
                    {p.streak}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {room?.phase === 'results' && results && (
        <div className="stack">
          <div className="stage" style={{ textAlign: 'center' }}>
            <h2>Round Complete!</h2>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--accent3)' }}>
              {results.teamScore}
            </div>
            <p>Team Score · Crowd {results.crowdMeter}%</p>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Individual Scores</h3>
              {results.players.map((p) => (
                <div key={p.id} className="player-card">
                  <div>
                    <strong>{p.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Score: {p.score} · Accuracy: {p.accuracy}% · Best streak: {p.maxStreak}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Awards</h3>
              <div className="stack">
                {results.awards.map((a) => (
                  <div key={a.id} className="award-card">
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{a.label}</div>
                    <div>{a.playerName}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{a.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button className="btn-primary btn-large" onClick={replay} type="button">
            Replay / Next Song
          </button>
          <button className="btn-secondary btn-large" onClick={endRoom} type="button">
            End Room
          </button>
        </div>
      )}
    </div>
  );
}
