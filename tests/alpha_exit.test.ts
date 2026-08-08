import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryTelemetryBuffer,
  registerTelemetrySink,
  MAX_PERFORMERS,
  redactPiiMeta,
  t,
  resolveLocale,
  listMessageKeys,
  loadAccessibilitySettings,
  accessibilityClassList,
} from '@beatlink/shared';
import {
  analyzeAudio,
  assertModesComplete,
  canPublishChart,
  computeCalibrationOffset,
  calibrationClickSchedule,
  deleteNote,
  moveNote,
  openChartEditor,
  runLoadFaultHarness,
  scoreKaraokeDsp,
  synthesizeClickTrack,
  synthesizeKaraokeTone,
  winningTeam,
} from '@beatlink/game-engine';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

describe('Alpha exit — multi-client automated party loop', () => {
  let manager: RoomManager;
  let buffer: ReturnType<typeof createMemoryTelemetryBuffer>;
  let unregister: () => void;

  beforeEach(() => {
    manager = new RoomManager();
    buffer = createMemoryTelemetryBuffer();
    unregister = registerTelemetrySink(buffer.sink);
  });

  afterEach(() => {
    unregister();
  });

  it('runs host + 8 performers + audience through lifecycle with auth/reconnect/migration', () => {
    const created = manager.createRoom('host-0', {
      privacy: { redactDisplayNames: false },
    });
    expect(created.privacy).toBeTruthy();
    expect(created.teamScores).toEqual({ A: 0, B: 0, solo: 0 });

    const players: Array<{ id: string; token: string; sock: string }> = [];
    for (let i = 0; i < MAX_PERFORMERS; i++) {
      const sock = `p-sock-${i}`;
      const joined = manager.joinRoom(created.code, sock, `Player${i}`);
      expect(joined).not.toBeNull();
      players.push({ id: joined!.player.id, token: joined!.playerToken, sock });
      manager.setRole(created.code, joined!.player.id, i % 3 === 0 ? 'beat_tapper' : i % 3 === 1 ? 'vocalist' : 'hype_captain');
      manager.setReady(created.code, joined!.player.id, true);
    }
    expect(manager.joinRoom(created.code, 'overflow', 'Nope')).toBeNull();

    const aud = manager.joinAudience(created.code, 'aud-0', 'Crowd');
    expect(aud).not.toBeNull();

    manager.autoAssignTeams(created.code);
    const afterTeams = manager.getRoom(created.code)!;
    expect(afterTeams.players.some((p) => p.teamId === 'A')).toBe(true);
    expect(afterTeams.players.some((p) => p.teamId === 'B')).toBe(true);

    manager.setGameMode(created.code, 'BandRoles');
    manager.selectSong(created.code, 'demo-neon-groove');
    manager.startCalibration(created.code);
    manager.recordCalibrationSample(created.code, { expectedMs: 0, tappedMs: 30 });
    manager.recordCalibrationSample(created.code, { expectedMs: 500, tappedMs: 528 });
    manager.recordCalibrationSample(created.code, { expectedMs: 1000, tappedMs: 1035 });
    manager.submitCalibration(created.code);
    expect(manager.getRoom(created.code)!.calibrationOffsetMs).toBeGreaterThan(0);

    // Player disconnect + reconnect mid-lobby flow
    manager.leaveRoom(players[0]!.sock);
    const re = manager.reconnectPlayer(
      created.code,
      players[0]!.id,
      players[0]!.token,
      'p-sock-0-re',
    );
    expect(re?.connected).toBe(true);
    players[0]!.sock = 'p-sock-0-re';

    manager.startCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    expect(manager.getRoom(created.code)!.phase).toBe('playing');

    // Host drop → migration → claim
    const migrated = manager.migrateHostOnDisconnect('host-0');
    expect(migrated?.newHostPlayerId).toBeTruthy();
    const claimer = players.find((p) => p.id === migrated!.newHostPlayerId)!;
    const claimed = manager.claimHostAsPlayer(
      created.code,
      claimer.id,
      claimer.token,
      'new-host-sock',
    );
    expect(claimed?.hostToken).toBe(created.hostToken);

    manager.forcePhase(created.code, 'playing');
    const influence = manager.processAudienceInfluence(created.code, aud!.audience.id, 'hype');
    expect(influence?.event.accepted).toBe(true);

    const results = manager.endGame(created.code);
    expect(results?.teamScores).toBeTruthy();
    expect(results?.players).toHaveLength(MAX_PERFORMERS);

    const next = manager.nextRound(created.code);
    expect(next?.phase).toBe('lobby');
    expect(next?.rematchRound).toBe(1);

    const closed = manager.shutdownRoom(created.code, { hostToken: created.hostToken });
    expect(closed?.phase).toBe('closed');
    expect(manager.getRoom(created.code)).toBeNull();
    expect(buffer.events.some((e) => e.name === 'host_migrated')).toBe(true);
    expect(buffer.events.some((e) => e.name === 'room_shutdown')).toBe(true);
  });

  it('switches modes and respects privacy redaction', () => {
    const created = manager.createRoom('host-priv');
    manager.joinRoom(created.code, 'p1', 'SecretName');
    manager.updatePrivacy(created.code, { redactDisplayNames: true });
    const view = manager.stripInternal(manager.getRoom(created.code)!);
    expect(view.players[0]?.name).toBe('Player 1');
    expect(view.privacy.redactDisplayNames).toBe(true);

    for (const mode of [
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ] as const) {
      expect(manager.setGameMode(created.code, mode)?.gameMode).toBe(mode);
    }
    expect(assertModesComplete().complete).toBe(true);
  });

  it('redacts PII from telemetry meta helpers', () => {
    const cleaned = redactPiiMeta({
      grade: 'perfect',
      name: 'Alice',
      hostToken: 'secret',
      points: 300,
    });
    expect(cleaned).toEqual({ grade: 'perfect', points: 300 });
  });
});

describe('Alpha exit — chart editor + calibration + karaoke DSP', () => {
  it('edits charts with confidence gates', () => {
    const samples = synthesizeClickTrack({ bpm: 120, durationMs: 6000, sampleRate: 22050 });
    const analysis = analyzeAudio(samples, { sampleRate: 22050, bpmHint: 120 });
    let editor = openChartEditor(analysis, 1);
    expect(editor.confidenceGate).not.toBe('blocked');
    const firstId = editor.chart.notes[0]!.id;
    editor = moveNote(editor, firstId, editor.chart.notes[0]!.timeMs + 10);
    editor = deleteNote(editor, editor.chart.notes[1]!.id);
    expect(editor.dirty).toBe(true);
    expect(canPublishChart(editor).ok || canPublishChart(editor, { forceReviewAck: true }).ok).toBe(
      true,
    );
  });

  it('computes stable calibration from click schedule samples', () => {
    const schedule = calibrationClickSchedule(0, 4, 500);
    const samples = schedule.map((expectedMs) => ({
      expectedMs,
      tappedMs: expectedMs + 40,
    }));
    const result = computeCalibrationOffset(samples);
    expect(result.accepted).toBe(true);
    expect(result.offsetMs).toBe(40);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('scores synthetic karaoke DSP pitch path without live mic', () => {
    const tone = synthesizeKaraokeTone({
      durationMs: 2000,
      sampleRate: 16000,
      pitchHz: 220,
      phraseWindowsMs: [{ startMs: 200, endMs: 1600 }],
    });
    const score = scoreKaraokeDsp(tone, {
      sampleRate: 16000,
      targetPitchHz: 220,
      window: { startMs: 400, endMs: 1200 },
    });
    expect(score.features.voiced).toBe(true);
    expect(score.features.pitchHz).toBeGreaterThan(180);
    expect(score.gradeHint).not.toBe('miss');
  });
});

describe('Alpha exit — a11y + i18n architecture', () => {
  it('exposes locale catalogs and accessibility class tokens', () => {
    expect(resolveLocale('es')).toBe('es');
    expect(t('mode.BeatTap', 'es')).toContain('Toque');
    expect(listMessageKeys('en').length).toBeGreaterThan(10);
    const a11y = loadAccessibilitySettings();
    expect(a11y.captions).toBe(true);
    expect(accessibilityClassList({ ...a11y, highContrast: true })).toContain(
      'a11y-high-contrast',
    );
  });
});

describe('Alpha exit — load/fault harness scaffolding', () => {
  it('passes 8/25/50 audience tiers with fault kinds', () => {
    const manager = new RoomManager();
    const report = runLoadFaultHarness({
      createRoom: (host) => manager.createRoom(host),
      joinRoom: (code, sock, name) => manager.joinRoom(code, sock, name),
      joinAudience: (code, sock, name) => manager.joinAudience(code, sock, name),
      leaveRoom: (sock) => manager.leaveRoom(sock),
      reconnectAudience: (code, id, token, sock) =>
        manager.reconnectAudience(code, id, token, sock),
      processAudienceInfluence: (code, id, type) =>
        manager.processAudienceInfluence(code, id, type),
      migrateHostOnDisconnect: (sock) => manager.migrateHostOnDisconnect(sock),
      setAudienceSandboxed: (code, id, sandboxed) =>
        manager.setAudienceSandboxed(code, id, sandboxed),
      getRoom: (code) => manager.getRoom(code),
      forcePhase: (code, phase) => {
        manager.forcePhase(code, phase as 'playing');
      },
    });

    expect(report.token).toBe('BEATLINK_LOAD_HARNESS_SCAFFOLD_PASS');
    expect(report.passed).toBe(true);
    expect(report.steps.length).toBe(3 * 5); // 3 tiers × 5 faults
    expect(winningTeam({ A: 100, B: 50, solo: 0 })).toBe('A');
  });
});
