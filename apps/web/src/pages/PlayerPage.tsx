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
  buildPredictionChoices,
  buildTimelineSync,
  calibratedGameTimeMs,
  canSubmitVocalPhrase,
  describeCombo,
  isCallAndResponseWindow,
  nextPredictionSection,
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
  const [deviceCalibStatus, setDeviceCalibStatus] = useState<string | null>(null);
  const [deviceCalibBusy, setDeviceCalibBusy] = useState(false);
  const inputSeqRef = useRef(0);
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
    inputSeqRef.current += 1;
    const eventId = `${player.id}:${type}:${inputSeqRef.current}:${Date.now()}`;
    socket.emit('game.input', {
      code,
      input: {
        playerId: player.id,
        type,
        clientTimeMs: Date.now(),
        event_id: eventId,
        idempotency_key: eventId,
        round_id: room.round_id,
        client_sequence: inputSeqRef.current,
        ...extra,
      },
    });
    if ('vibrate' in navigator) navigator.vibrate(30);
  }

  function runDeviceCalibration() {
    if (!player) return;
    setDeviceCalibBusy(true);
    // Deterministic tap samples — no fabricated audio_output_latency in browser CI.
    const samples = [
      { expectedMs: 0, tappedMs: 45 },
      { expectedMs: 500, tappedMs: 548 },
      { expectedMs: 1000, tappedMs: 1042 },
    ];
    socket.emit(
      'game.submit_player_device_calibration',
      {
        code,
        playerId: player.id,
        samples,
        deviceId: `web:${navigator.userAgent.slice(0, 24)}`,
      },
      () => {
        setDeviceCalibBusy(false);
      },
    );
    setDeviceCalibStatus('submitted');
    setDeviceCalibBusy(false);
  }

  function handleTap() {
    if (!beatmap) return;
    const note = beatmap.notes.find((n) => Math.abs(n.timeMs - gameTimeMs) < 200);
    sendInput('tap', { noteId: note?.id });
  }

  function handleSwipe() {
    if (!beatmap) return;
    const note =
      beatmap.notes.find((n) => n.type === 'swipe' && Math.abs(n.timeMs - gameTimeMs) < 200) ??
      beatmap.notes.find((n) => Math.abs(n.timeMs - gameTimeMs) < 200);
    sendInput('swipe', { noteId: note?.id });
  }

  function handleVocal() {
    sendInput('vocal_phrase', { promptId: currentPrompt?.id });
  }

  function handleVocalFallbackTap() {
    // Mic-denied / accessibility fallback — tap while prompt is active.
    sendInput('vocal_fallback_tap', { promptId: currentPrompt?.id });
  }

  function handleHype(type: 'cheer' | 'lights' | 'boost' | 'combo_save') {
    if (hypeCooldown) return;
    setHypeCooldown(true);
    setTimeout(() => setHypeCooldown(false), 2000);
    sendInput(`hype_${type}`, { hypeType: type });
  }

  function handlePrediction(sectionId: string, predictionChoice: string) {
    sendInput('prediction_lock', { sectionId, predictionChoice });
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
          <button className="btn-primary btn-large" onClick={handleJoin} data-testid="performer-enter-lobby">
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
                data-testid={`role-${r.id}`}
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
            data-testid="performer-ready"
          >
            {player?.ready ? 'Not Ready' : 'Ready!'}
          </button>
          <div className="card stack" data-testid="device-calibration-panel">
            <h3>Device timing calibration</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Tap samples measure input latency. Audio output latency stays unknown/null in this
              browser path (not fabricated).
            </p>
            <button
              className="btn-secondary"
              type="button"
              data-testid="performer-calibrate"
              disabled={deviceCalibBusy}
              onClick={runDeviceCalibration}
            >
              {deviceCalibBusy ? 'Calibrating…' : 'Calibrate this device'}
            </button>
            {player?.deviceTiming && (
              <p data-testid="device-calibration-result" style={{ fontSize: '0.85rem' }}>
                offset {player.deviceTiming.effectiveScoringOffsetMs ?? player.deviceTiming.offsetMs}ms
                · confidence {Math.round((player.deviceTiming.confidence ?? 0) * 100)}%
                · accepted={String(player.deviceTiming.accepted)}
                · audio_out=
                {player.deviceTiming.audioOutputLatencyMs == null
                  ? 'null'
                  : `${player.deviceTiming.audioOutputLatencyMs}ms`}
              </p>
            )}
            {deviceCalibStatus && !player?.deviceTiming && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Calibration {deviceCalibStatus}</p>
            )}
          </div>
          {hostOffer && (
            <button className="btn-secondary btn-large" onClick={claimHost} data-testid="claim-host">
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

        {room.gameMode === 'CallAndResponse' && beatmap && (
          <p style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            {isCallAndResponseWindow(beatmap.sections, gameTimeMs).phase === 'call'
              ? 'Listen — call phase'
              : isCallAndResponseWindow(beatmap.sections, gameTimeMs).phase === 'response'
                ? 'Echo now — response window'
                : 'Wait for the next call'}
          </p>
        )}

        {room.gameMode === 'PredictionTrivia' && beatmap && (
          <div className="card stack" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            <p className="label">Predict the next section</p>
            {(() => {
              const target = nextPredictionSection(beatmap.sections, gameTimeMs);
              if (!target) {
                return <p style={{ color: 'var(--muted)' }}>No upcoming section to lock.</p>;
              }
              const choices = buildPredictionChoices(beatmap, room.difficulty, target);
              return (
                <>
                  <p>
                    Lock before <strong>{target.label}</strong> starts
                  </p>
                  <div className="role-grid">
                    {choices.map((choice) => (
                      <button
                        key={choice}
                        className="btn-secondary btn-large"
                        onClick={() => handlePrediction(target.id, choice)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {player.role === 'beat_tapper' && (
          <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
            <button className="tap-button" onClick={handleTap} data-testid="performer-tap">
              TAP
            </button>
            <button
              className="btn-secondary btn-large"
              onClick={handleSwipe}
              data-testid="performer-swipe"
            >
              SWIPE
            </button>
          </div>
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
              data-testid="performer-vocal"
              disabled={karaokeState ? !canSubmitVocalPhrase(karaokeState) : !currentPrompt}
            >
              Hit Prompt Window
            </button>
            <button
              className="btn-secondary"
              onClick={handleVocalFallbackTap}
              data-testid="performer-vocal-fallback"
              disabled={karaokeState ? !canSubmitVocalPhrase(karaokeState) : !currentPrompt}
            >
              Prompt timing tap (no mic)
            </button>
            <p
              style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}
              data-testid="vocal-path-truth"
            >
              VOCAL_PROMPT_TIMING_MODE — MICROPHONE_PITCH_ANALYSIS=false ·
              GENERAL_VOCAL_RECOGNITION=false. No audio stored.
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
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent3)' }} data-testid="performer-result-score">
            {myResult?.score ?? 0}
          </div>
          <p data-testid="performer-ledger-checksum">
            Ledger: {results.ledgerChecksum ?? 'n/a'}
          </p>
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
        {room?.achievementSummary && (
          <div className="card">
            <h3>
              Achievements {room.achievementSummary.unlocked}/{room.achievementSummary.total} (
              {Math.round(room.achievementSummary.percent)}%)
            </h3>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <p style={{ textAlign: 'center', color: 'var(--muted)' }}>Connecting...</p>
    </div>
  );
}
