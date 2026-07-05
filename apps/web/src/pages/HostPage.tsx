import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { GameResults, LinkResolveResult, RoomState, SongCatalogEntry } from '@beatlink/shared';
import { ROLES } from '@beatlink/shared';
import { fetchSongs, resolveLink } from '../lib/api';
import { useCreateRoom, useRoomEvents, useSocket } from '../lib/socket';

export default function HostPage() {
  const { roomCode } = useParams();
  const { socket } = useSocket();
  const createRoom = useCreateRoom();
  const [code, setCode] = useState(roomCode?.toUpperCase() ?? '');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [songs, setSongs] = useState<SongCatalogEntry[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkResult, setLinkResult] = useState<LinkResolveResult | null>(null);
  const [gameTimeMs, setGameTimeMs] = useState(0);
  const [results, setResults] = useState<GameResults | null>(null);

  useEffect(() => {
    fetchSongs().then((d) => setSongs(d.songs)).catch(console.error);
  }, []);

  useEffect(() => {
    if (roomCode) {
      setCode(roomCode.toUpperCase());
      socket.emit('room.subscribe', { code: roomCode.toUpperCase() });
    } else if (!code) {
      createRoom().then((c) => {
        setCode(c);
        window.history.replaceState(null, '', `/host/${c}`);
      }).catch(console.error);
    }
  }, [roomCode, code, createRoom, socket]);

  const handlers = useCallback(
    () => ({
      onState: setRoom,
      onCountdown: (r: RoomState) => setRoom(r),
      onStarted: (r: RoomState) => {
        setRoom(r);
        setResults(null);
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
    if (!linkUrl.trim()) return;
    const result = await resolveLink(linkUrl);
    setLinkResult(result);
    if (result.matchedCatalogId) {
      socket.emit('room.select_song', { code, songId: result.matchedCatalogId });
    }
  }

  function selectSong(songId: string) {
    socket.emit('room.select_song', { code, songId });
    setLinkResult(null);
  }

  function startCountdown() {
    socket.emit('game.start_countdown', { code });
  }

  function replay() {
    socket.emit('game.replay', { code });
    setResults(null);
    setGameTimeMs(0);
  }

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join`
      : 'http://localhost:5173/join';

  if (!code) {
    return (
      <div className="page">
        <p>Creating room...</p>
      </div>
    );
  }

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
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
              Players join at: <strong>{joinUrl}</strong>
            </p>
          </div>

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
                  <div
                    key={s.id}
                    className={`song-item ${room?.selectedSongId === s.id ? 'selected' : ''}`}
                    onClick={() => selectSong(s.id)}
                  >
                    <strong>{s.title}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {s.artist} · {Math.round(s.durationMs / 1000)}s · {s.bpm} BPM
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="label">Paste Music Link (metadata only)</label>
                <div className="row">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="YouTube, Spotify, or Apple Music URL"
                    style={{ flex: 1 }}
                  />
                  <button className="btn-secondary" onClick={handleResolveLink}>
                    Resolve
                  </button>
                </div>
              </div>

              {linkResult && (
                <div className="compliance-banner">
                  <div className="row" style={{ marginBottom: '0.5rem' }}>
                    <span
                      className={`status-badge ${
                        linkResult.playbackStatus === 'PLAYABLE_APPROVED'
                          ? 'status-playable'
                          : 'status-metadata'
                      }`}
                    >
                      {linkResult.playbackStatus}
                    </span>
                    <span style={{ fontSize: '0.85rem' }}>{linkResult.platform}</span>
                  </div>
                  <p>{linkResult.message}</p>
                  {linkResult.title && (
                    <p style={{ marginTop: '0.5rem' }}>
                      Detected: <strong>{linkResult.title}</strong>
                    </p>
                  )}
                </div>
              )}

              <button
                className="btn-primary btn-large"
                onClick={startCountdown}
                disabled={!room?.selectedSongId || (room?.players.length ?? 0) < 1}
              >
                Start Countdown
              </button>
            </div>
          </div>
        </>
      ) : null}

      {room?.phase === 'countdown' && (
        <div className="stage">
          <div className="countdown">{room.countdown}</div>
          <p style={{ textAlign: 'center', fontSize: '1.5rem' }}>Get ready!</p>
        </div>
      )}

      {room?.phase === 'playing' && (
        <div className="stage">
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>🎤 LIVE</h2>
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
              <h3>Awards 🏆</h3>
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

          <button className="btn-primary btn-large" onClick={replay}>
            Replay / Next Song
          </button>
        </div>
      )}
    </div>
  );
}
