import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type {
  Beatmap,
  GameResults,
  Player,
  PlayerRole,
  RoomState,
  ScoreEvent,
  VocalPrompt,
} from '@beatlink/shared';
import { ROLES } from '@beatlink/shared';
import {
  buildKaraokePromptState,
  buildTimelineSync,
  calibratedGameTimeMs,
  canSubmitVocalPhrase,
  describeCombo,
} from '@beatlink/game-engine';
import { useJoinRoom, useRoomEvents, useSocket } from '../lib/socket';
import {
  AccessibilityPanel,
  DeviceRolePicker,
  useAccessibility,
  useDeviceRole,
} from '../lib/deviceSettings';

const PLAYER_STORAGE_KEY = 'beatlink_player';

export default function PlayerPage() {
  const { roomCode } = useParams();
  const [searchParams] = useSearchParams();
  const code = roomCode?.toUpperCase() ?? '';
  const initialName = searchParams.get('name') ?? '';

  const { socket } = useSocket();
  const joinRoom = useJoinRoom();

  const [player, setPlayer] = useState<Player | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [name, setName] = useState(initialName);
  const [joined, setJoined] = useState(false);
  const [beatmap, setBeatmap] = useState<Beatmap | null>(null);
  const [gameStartTime, setGameStartTime] = useState(0);
  const [rawElapsedMs, setRawElapsedMs] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [feedbackClass, setFeedbackClass] = useState('');
  const [results, setResults] = useState<GameResults | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<VocalPrompt | null>(null);
  const [hypeCooldown, setHypeCooldown] = useState(false);
  const [hostOffer, setHostOffer] = useState(false);
  const playerIdRef = useRef<string | undefined>(undefined);
  playerIdRef.current = player?.id;
  const { role: deviceRole, setRole: setDeviceRole, roles: deviceRoles } = useDeviceRole(false);
  const { settings, update } = useAccessibility();

  const calibrationOffsetMs = room?.calibrationOffsetMs ?? 0;
  const gameTimeMs = calibratedGameTimeMs(rawElapsedMs, calibrationOffsetMs);
  const timeline = useMemo(() => {
    if (!beatmap) return null;
    return buildTimelineSync(beatmap, rawElapsedMs, calibrationOffsetMs);
  }, [beatmap, rawElapsedMs, calibrationOffsetMs]);

  const karaokeState = useMemo(() => {
    if (!beatmap) return null;
    return buildKaraokePromptState(beatmap.vocalPrompts, gameTimeMs);
  }, [beatmap, gameTimeMs]);

  const handlers = useMemo(
    () => ({
      onState: (next: RoomState) => {
        setRoom(next);
        const me = next.players.find((p) => p.id === playerIdRef.current);
        if (me) setPlayer(me);
      },
      onCountdown: (next: RoomState) => {
        setRoom(next);
      },
      onStarted: (next: RoomState, bm: Beatmap, startTime: number) => {
        setRoom(next);
        setBeatmap(bm);
        setGameStartTime(startTime);
        setResults(null);
      },
      onScore: (next: RoomState, ev: ScoreEvent | null) => {
        setRoom(next);
        const me = next.players.find((p) => p.id === playerIdRef.current);
        if (me) setPlayer(me);
        if (ev && ev.playerId === playerIdRef.current) {
          const comboLabel = ev.combo > 1 ? ` ${describeCombo(ev.combo)}` : '';
          setFeedback(`${ev.message}${comboLabel}`);
          setFeedbackClass(ev.grade);
          setTimeout(() => setFeedback(''), 800);
        }
      },
      onEnded: (next: RoomState, res: GameResults) => {
        setRoom(next);
        setResults(res);
      },
      onPlayerJoined: setRoom,
      onPlayerLeft: setRoom,
      onHostMigrated: (next: RoomState, newHostPlayerId: string | null) => {
        setRoom(next);
        if (newHostPlayerId && newHostPlayerId === playerIdRef.current) {
          setHostOffer(true);
        }
      },
    }),
    [],
  );

  useRoomEvents(joined ? code : undefined, handlers);

  useEffect(() => {
    if (!joined || room?.phase !== 'playing') return;
    const id = setInterval(() => {
      if (gameStartTime) setRawElapsedMs(Date.now() - gameStartTime);
    }, 50);
    return () => clearInterval(id);
  }, [joined, room?.phase, gameStartTime]);

  useEffect(() => {
    if (!beatmap || !player) return;
    const prompt =
      karaokeState?.prompt ??
      beatmap.vocalPrompts.find(
        (v) => gameTimeMs >= v.timeMs - 500 && gameTimeMs <= v.timeMs + v.durationMs,
      );
    setCurrentPrompt(prompt ?? null);
  }, [beatmap, gameTimeMs, player, karaokeState]);

  function claimHost() {
    if (!player) return;
    const stored = localStorage.getItem(PLAYER_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    const playerToken = parsed?.roomCode === code ? parsed.playerToken : undefined;
    if (!playerToken) return;
    socket.emit(
      'room.claim_host',
      { code, playerId: player.id, playerToken },
      (result?: { ok?: boolean }) => {
        if (result?.ok) setHostOffer(false);
      },
    );
  }

  async function handleJoin() {
    if (!name.trim() || !code) return;
    const stored = localStorage.getItem(PLAYER_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    const playerId = parsed?.roomCode === code ? parsed.playerId : undefined;
    const playerToken = parsed?.roomCode === code ? parsed.playerToken : undefined;

    try {
      const result = await joinRoom(code, name.trim(), playerId, playerToken);
      setPlayer(result.player);
      setRoom(result.room);
      setJoined(true);
      localStorage.setItem(
        PLAYER_STORAGE_KEY,
        JSON.stringify({
          roomCode: code,
          playerId: result.player.id,
          playerToken: result.playerToken ?? playerToken,
        }),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Join failed');
    }
  }

  function setRole(role: PlayerRole) {
    if (!player) return;
    socket.emit('room.set_role', { code, playerId: player.id, role });
    setPlayer({ ...player, role });
  }

  function toggleReady() {
    if (!player) return;
    const ready = !player.ready;
    socket.emit('room.ready', { code, playerId: player.id, ready });
    setPlayer({ ...player, ready });
  }

  function sendInput(type: string, extra: Record<string, unknown> = {}) {
    if (!player || room?.phase !== 'playing') return;
    socket.emit('game.input', {
      code,
      input: {
        playerId: player.id,
        type,
        clientTimeMs: Date.now(),
        ...extra,
      },
    });
    if ('vibrate' in navigator) navigator.vibrate(30);
  }

  function handleTap() {
    if (!beatmap) return;
    const note = beatmap.notes.find((n) => Math.abs(n.timeMs - gameTimeMs) < 200);
    sendInput('tap', { noteId: note?.id });
  }

  function handleVocal() {
    sendInput('vocal_phrase', { promptId: currentPrompt?.id });
  }

  function handleHype(type: 'cheer' | 'lights' | 'boost' | 'combo_save') {
    if (hypeCooldown) return;
    setHypeCooldown(true);
    setTimeout(() => setHypeCooldown(false), 2000);
    sendInput(`hype_${type}`, { hypeType: type });
  }

  if (!joined) {
    return (
      <div className="page">
        <div className="hero">
          <h1 style={{ fontSize: '2rem' }}>Join {code}</h1>
        </div>
        <div className="card stack" style={{ maxWidth: 400, margin: '0 auto' }}>
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <button className="btn-primary btn-large" onClick={handleJoin}>
            Enter Lobby
          </button>
        </div>
      </div>
    );
  }

  if (room?.phase === 'calibrating') {
    return (
      <div className="page">
        <div className="card stack" style={{ textAlign: 'center' }}>
          <h2>Host is calibrating</h2>
          <p style={{ color: 'var(--muted)' }}>
            Latency offset: {room.calibrationOffsetMs ?? 0} ms. Get ready — countdown starts next.
          </p>
          {room.linkResolveResult?.title ? (
            <p>
              Song: <strong>{room.linkResolveResult.title}</strong>
              {room.linkResolveResult.artist ? ` — ${room.linkResolveResult.artist}` : ''}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (room?.phase === 'lobby' || room?.phase === 'song_select') {
    return (
      <div className="page">
        <div className="card stack">
          <h2>Welcome, {player?.name}!</h2>
          {room.linkResolveResult ? (
            <div className="compliance-banner">
              <span className="status-badge status-metadata">{room.linkResolveResult.playbackStatus}</span>
              <p style={{ marginTop: '0.5rem' }}>
                {room.linkResolveResult.title ?? 'Linked track'}
                {room.linkResolveResult.artist ? ` — ${room.linkResolveResult.artist}` : ''}
              </p>
            </div>
          ) : null}
          <p style={{ color: 'var(--muted)' }}>Choose your role</p>
          <div className="role-grid">
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={`role-btn ${player?.role === r.id ? 'selected' : ''}`}
                onClick={() => setRole(r.id)}
              >
                <strong>{r.label}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{r.description}</div>
              </button>
            ))}
          </div>
          <button
            className="btn-primary btn-large"
            onClick={toggleReady}
            disabled={!player?.role}
          >
            {player?.ready ? 'Not Ready' : 'Ready!'}
          </button>
          {hostOffer && (
            <button className="btn-secondary btn-large" onClick={claimHost}>
              Claim Host (previous host disconnected)
            </button>
          )}
          <DeviceRolePicker role={deviceRole} roles={deviceRoles} onChange={setDeviceRole} />
          <AccessibilityPanel settings={settings} update={update} />
        </div>
      </div>
    );
  }

  if (room?.phase === 'countdown') {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="countdown">{room.countdown}</div>
      </div>
    );
  }

  if (room?.phase === 'playing' && player) {
    return (
      <div className="page">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span>{ROLES.find((r) => r.id === player.role)?.label}</span>
          <span>Score: {player.score}</span>
          <span>
            Streak: {player.streak} · {describeCombo(player.combo ?? 1)}
          </span>
        </div>
        {timeline && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            Beat {timeline.beatIndex + 1} · {Math.floor(timeline.calibratedMs / 1000)}s · offset{' '}
            {calibrationOffsetMs}ms
          </p>
        )}

        <div className={`feedback ${feedbackClass}`}>{feedback}</div>

        {player.role === 'beat_tapper' && (
          <button className="tap-button" onClick={handleTap}>
            TAP
          </button>
        )}

        {player.role === 'vocalist' && (
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="card" style={{ textAlign: 'center', width: '100%' }}>
              <p className="label">
                Karaoke · {karaokeState?.phase ?? 'idle'}
                {karaokeState?.msUntilStart != null && karaokeState.phase === 'upcoming'
                  ? ` · in ${Math.ceil(karaokeState.msUntilStart / 1000)}s`
                  : ''}
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {currentPrompt?.text ?? karaokeState?.prompt?.text ?? 'Get ready...'}
              </p>
              {karaokeState && karaokeState.phase !== 'idle' && (
                <div className="meter" style={{ marginTop: '0.75rem' }}>
                  <div
                    className="meter-fill"
                    style={{ width: `${Math.round(karaokeState.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <button
              className="btn-primary btn-large"
              onClick={handleVocal}
              disabled={karaokeState ? !canSubmitVocalPhrase(karaokeState) : !currentPrompt}
            >
              Perform Phrase
            </button>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>
              Mic optional — tap when the prompt is active. No audio is stored.
            </p>
          </div>
        )}

        {player.role === 'hype_captain' && (
          <div className="hype-grid">
            <button
              className="hype-btn cheer"
              onClick={() => handleHype('cheer')}
              disabled={hypeCooldown}
            >
              🎉 Cheer
            </button>
            <button
              className="hype-btn lights"
              onClick={() => handleHype('lights')}
              disabled={hypeCooldown}
            >
              💡 Lights
            </button>
            <button
              className="hype-btn boost"
              onClick={() => handleHype('boost')}
              disabled={hypeCooldown}
            >
              🚀 Boost
            </button>
            <button
              className="hype-btn combo"
              onClick={() => handleHype('combo_save')}
              disabled={hypeCooldown}
            >
              ⚡ Combo Save
            </button>
          </div>
        )}
      </div>
    );
  }

  if (room?.phase === 'results' && results) {
    const myResult = results.players.find((p) => p.id === player?.id);
    const myAwards = results.awards.filter((a) => a.playerId === player?.id);
    return (
      <div className="page stack">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Your Results</h2>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent3)' }}>
            {myResult?.score ?? 0}
          </div>
          <p>Accuracy: {myResult?.accuracy ?? 0}% · Best streak: {myResult?.maxStreak ?? 0}</p>
        </div>
        {myAwards.length > 0 && (
          <div className="card">
            <h3>Your Awards</h3>
            {myAwards.map((a) => (
              <div key={a.id} className="award-card" style={{ marginTop: '0.5rem' }}>
                {a.label} — {a.reason}
              </div>
            ))}
          </div>
        )}
        <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
          Waiting for host to start next round...
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Connecting...</p>
    </div>
  );
}
