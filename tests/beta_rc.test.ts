/**
 * Beta Event Platform + Digital RC — automated evidence.
 * Honest: in-process simulation ≠ live event; digital RC ≠ store/HSM/physical.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryTelemetryBuffer,
  registerTelemetrySink,
  MAX_PERFORMERS,
  MAX_AUDIENCE_SEATS,
  MAX_AUDIENCE_SEATS_EVENT,
  EVENT_AUDIENCE_TIERS,
  DEFAULT_ACCESSIBILITY,
} from '@beatlink/shared';
import {
  assertModesBetaDepth,
  assertAnalysisKaraokeEligible,
  assertDigitalRcReady,
  analyzeAudio,
  buildDigitalRcPackage,
  buildModeReplay,
  buildModeResultsBoard,
  emitModeTutorialTelemetry,
  gateMusicSource,
  getModeA11y,
  planDigitalRcRollback,
  planDigitalRcUpdate,
  resolveContentPath,
  resolveModeA11ySettings,
  runEventLifecycleStress,
  runEventScaleSimulation,
  scoreForMode,
  scoreKaraokeDsp,
  synthesizeClickTrack,
  synthesizeKaraokeTone,
} from '@beatlink/game-engine';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';


function roomApi(manager: RoomManager) {
  return {
    createRoom: (host: string, options?: { capacityProfile?: 'party' | 'event_sim'; gameMode?: string }) =>
      manager.createRoom(host, options as Parameters<RoomManager['createRoom']>[1]),
    joinRoom: (code: string, sock: string, name: string) => manager.joinRoom(code, sock, name),
    joinAudience: (code: string, sock: string, name: string) =>
      manager.joinAudience(code, sock, name),
    leaveRoom: (sock: string) => manager.leaveRoom(sock),
    reconnectAudience: (
      code: string,
      id: string,
      token: string,
      sock: string,
    ) => manager.reconnectAudience(code, id, token, sock),
    reconnectPlayer: (
      code: string,
      id: string,
      token: string,
      sock: string,
    ) => manager.reconnectPlayer(code, id, token, sock),
    processAudienceInfluence: (
      code: string,
      id: string,
      type: 'hype' | 'vote',
    ) => manager.processAudienceInfluence(code, id, type),
    migrateHostOnDisconnect: (sock: string) => manager.migrateHostOnDisconnect(sock),
    claimHostAsPlayer: (
      code: string,
      playerId: string,
      token: string,
      sock: string,
    ) => manager.claimHostAsPlayer(code, playerId, token, sock),
    setAudienceSandboxed: (code: string, id: string, sandboxed: boolean) =>
      manager.setAudienceSandboxed(code, id, sandboxed),
    setRole: (code: string, playerId: string, role: string) =>
      manager.setRole(code, playerId, role as 'beat_tapper' | 'vocalist' | 'hype_captain'),
    setReady: (code: string, playerId: string, ready: boolean) =>
      manager.setReady(code, playerId, ready),
    autoAssignTeams: (code: string) => manager.autoAssignTeams(code),
    setGameMode: (code: string, mode: string) => manager.setGameMode(code, mode),
    selectSong: (code: string, songId: string) => manager.selectSong(code, songId),
    startCalibration: (code: string) => manager.startCalibration(code),
    recordCalibrationSample: (
      code: string,
      sample: { expectedMs: number; tappedMs: number },
    ) => manager.recordCalibrationSample(code, sample),
    submitCalibration: (code: string) => manager.submitCalibration(code),
    startCountdown: (code: string) => manager.startCountdown(code),
    tickCountdown: (code: string) => manager.tickCountdown(code),
    forcePhase: (code: string, phase: string) => {
      manager.forcePhase(code, phase as 'playing');
    },
    endGame: (code: string) => manager.endGame(code),
    nextRound: (code: string) => manager.nextRound(code),
    shutdownRoom: (code: string, options: { hostToken: string }) =>
      manager.shutdownRoom(code, options),
    purgeExpiredRooms: (nowMs?: number) => manager.purgeExpiredRooms(nowMs),
    getRoom: (code: string) => manager.getRoom(code),
  };
}

describe('Beta — five-mode depth (tutorial/difficulty/scoring/a11y/teams/results/replay)', () => {
  let buffer: ReturnType<typeof createMemoryTelemetryBuffer>;
  let unregister: () => void;

  beforeEach(() => {
    buffer = createMemoryTelemetryBuffer();
    unregister = registerTelemetrySink(buffer.sink);
  });

  afterEach(() => {
    unregister();
  });

  it('passes beta depth gate for all five modes', () => {
    const depth = assertModesBetaDepth();
    expect(depth.failures).toEqual([]);
    expect(depth.complete).toBe(true);
  });

  it('builds results + replay + a11y + telemetry per mode', () => {
    for (const modeId of [
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ] as const) {
      emitModeTutorialTelemetry(modeId, 'BETA');
      const a11y = getModeA11y(modeId);
      expect(a11y.captionsRequired).toBe(true);
      const settings = resolveModeA11ySettings(modeId, DEFAULT_ACCESSIBILITY);
      expect(settings.captions).toBe(true);

      const scored = scoreForMode({
        modeId,
        difficulty: 'pro',
        grade: 'perfect',
        basePoints: 300,
        streak: 5,
        meta:
          modeId === 'PredictionTrivia'
            ? { predictionCorrect: true }
            : modeId === 'CallAndResponse'
              ? { responseMatched: true }
              : modeId === 'BandRoles'
                ? { role: 'vocalist', bandCoverage: true }
                : { noRecording: true },
      });
      expect(scored.points).toBeGreaterThan(0);

      const board = buildModeResultsBoard(modeId, {
        difficulty: 'pro',
        teamScore: scored.points,
        crowdMeter: 60,
        winningTeam: 'A',
        rows: [
          {
            playerId: 'p1',
            displayName: 'P1',
            teamId: 'A',
            score: scored.points,
            accuracy: 1,
            maxStreak: 5,
            role: 'beat_tapper',
          },
        ],
      });
      expect(board.modeId).toBe(modeId);
      expect(board.rows).toHaveLength(1);

      const replay = buildModeReplay(modeId, {
        difficulty: 'pro',
        durationMs: 10000,
        frames: [
          { atMs: 100, playerId: 'p1', grade: 'perfect', points: scored.points, noteId: 'n1' },
        ],
      });
      expect(replay.includesMicAudio).toBeUndefined();
      expect(replay.checksum).toMatch(/^[0-9a-f]{8}$/);
      expect(replay.frames[0]?.grade).toBe('perfect');
    }

    expect(buffer.events.some((e) => e.name === 'mode_tutorial')).toBe(true);
    expect(buffer.events.some((e) => e.name === 'mode_results')).toBe(true);
    expect(buffer.events.some((e) => e.name === 'mode_replay')).toBe(true);
  });
});

describe('Beta — room/event lifecycle stress', () => {
  it('runs full lifecycle across all five modes', () => {
    const manager = new RoomManager();
    const report = runEventLifecycleStress(roomApi(manager), {
      loops: 5,
      performers: MAX_PERFORMERS,
      audience: 10,
    });
    expect(report.token).toBe('BEATLINK_EVENT_LIFECYCLE_STRESS_PASS');
    expect(report.passed).toBe(true);
    expect(report.results).toHaveLength(5);
    expect(report.results.every((r) => r.rematchRound >= 1)).toBe(true);
  });
});

describe('Beta — event-scale simulation 8×25/50/100/300', () => {
  it('passes in-process simulation with metrics (≠ live event)', () => {
    const manager = new RoomManager();
    const party = manager.createRoom('cap-party');
    expect(party.capacityProfile).toBe('party');
    expect(
      manager.joinAudience(party.code, 'overflow-check', 'x'),
    ).toBeTruthy();

    // Party soft ceiling still 50
    const filled = manager.createRoom('cap-fill');
    for (let i = 0; i < MAX_AUDIENCE_SEATS; i++) {
      expect(manager.joinAudience(filled.code, `f-${i}`, `A${i}`)).not.toBeNull();
    }
    expect(manager.joinAudience(filled.code, 'f-overflow', 'Nope')).toBeNull();

    const report = runEventScaleSimulation(roomApi(manager), {
      performerCount: MAX_PERFORMERS,
      tiers: [...EVENT_AUDIENCE_TIERS],
    });
    expect(report.disclaimer).toContain('not a live event');
    expect(report.token).toBe('BEATLINK_EVENT_SCALE_SIM_PASS');
    expect(report.passed).toBe(true);
    expect(report.metrics.map((m) => m.tier)).toEqual([25, 50, 100, 300]);
    for (const m of report.metrics) {
      expect(m.performersJoined).toBe(8);
      expect(m.audienceJoined).toBe(m.tier);
      expect(m.audienceJoined).toBeLessThanOrEqual(MAX_AUDIENCE_SEATS_EVENT);
      expect(m.wallMs).toBeGreaterThanOrEqual(0);
      expect(m.joinLatencyMsP95).toBeGreaterThanOrEqual(m.joinLatencyMsP50);
    }

    const outDir = resolve(process.cwd(), 'docs/digital-rc');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      resolve(outDir, 'event-scale-metrics.json'),
      JSON.stringify(
        {
          disclaimer: report.disclaimer,
          token: report.token,
          performerCount: report.performerCount,
          metrics: report.metrics.map((m) => ({
            tier: m.tier,
            performersJoined: m.performersJoined,
            audienceJoined: m.audienceJoined,
            joinLatencyMsP50: m.joinLatencyMsP50,
            joinLatencyMsP95: m.joinLatencyMsP95,
            influenceAccepted: m.influenceAccepted,
            influenceRejected: m.influenceRejected,
            disconnects: m.disconnects,
            reconnects: m.reconnects,
            hostMigrated: m.hostMigrated,
            shutdownOk: m.shutdownOk,
            wallMs: m.wallMs,
            ok: m.ok,
          })),
          liveEvent: false,
          simulation: true,
        },
        null,
        2,
      ) + '\n',
    );
  });
});

describe('Beta — rights/legal content paths', () => {
  it('covers royalty-free, licensed pack, creator attestation, link match, rip block', () => {
    const catalog = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'content/songs/approved-demo-catalog.json'),
        'utf8',
      ),
    ) as {
      songs: Array<{
        id: string;
        title: string;
        artist: string;
        durationMs: number;
        bpm: number;
        beatmapId: string;
        license:
          | 'royalty_free'
          | 'public_domain'
          | 'demo_generated'
          | 'synthetic_original'
          | 'licensed_pack';
        description: string;
      }>;
    };

    const rf = catalog.songs.find((s) => s.license === 'royalty_free')!;
    const pd = catalog.songs.find((s) => s.license === 'public_domain')!;
    const licensed = catalog.songs.find((s) => s.license === 'licensed_pack')!;
    expect(rf).toBeTruthy();
    expect(pd).toBeTruthy();
    expect(licensed).toBeTruthy();

    const rfPath = resolveContentPath({ catalogEntry: rf });
    expect(rfPath.path).toBe('royalty_free');
    expect(rfPath.ok).toBe(true);
    expect(rfPath.analysisEligible).toBe(true);

    const licensedPath = resolveContentPath({ catalogEntry: licensed });
    expect(licensedPath.path).toBe('licensed_pack');
    expect(licensedPath.ok).toBe(true);

    const upload = resolveContentPath({
      creatorUpload: {
        trackId: 'upload-beta-1',
        attestorId: 'creator-1',
        ownsOrLicensed: true,
        ttlMs: 60_000,
        nowMs: 1000,
      },
      nowMs: 1000,
    });
    expect(upload.path).toBe('creator_upload_attested');
    expect(upload.ok).toBe(true);

    const linkMatch = resolveContentPath({
      catalogEntry: rf,
      linkResolve: {
        platform: 'youtube',
        sourceId: 'dQw4w9WgXcQ',
        title: rf.title,
        artist: rf.artist,
        album: null,
        artworkUrl: null,
        durationMs: rf.durationMs,
        playbackStatus: 'METADATA_ONLY',
        analysisEligible: false,
        lyricsEligible: false,
        matchedCatalogId: rf.id,
        message: 'matched',
        fallbackOptions: [],
      },
    });
    expect(linkMatch.path).toBe('link_catalog_match');
    expect(linkMatch.ok).toBe(true);

    const metaOnly = resolveContentPath({
      linkResolve: {
        platform: 'spotify',
        sourceId: 'track:abc',
        title: 'Unknown Hit',
        artist: 'Someone',
        album: null,
        artworkUrl: null,
        durationMs: null,
        playbackStatus: 'METADATA_ONLY',
        analysisEligible: false,
        lyricsEligible: false,
        matchedCatalogId: null,
        message: 'metadata only',
        fallbackOptions: ['upload'],
      },
    });
    expect(metaOnly.ok).toBe(false);

    const rip = resolveContentPath({
      catalogEntry: rf,
      claimedRipUrl: 'https://youtube.com/watch?v=abc',
    });
    expect(rip.path).toBe('blocked_rip_attempt');
    expect(rip.ok).toBe(false);
    expect(assertAnalysisKaraokeEligible(rip).ok).toBe(false);
  });
});

describe('Beta — analysis/karaoke on rights-cleared audio only', () => {
  it('analyzes synthetic/public-domain paths and scores karaoke DSP', () => {
    const synth = synthesizeClickTrack({ bpm: 120, durationMs: 4000, sampleRate: 22050 });
    const analysis = analyzeAudio(synth, { sampleRate: 22050, bpmHint: 120 });
    expect(analysis.confidence).toBeGreaterThan(0);

    const catalogSynth = {
      id: 'synth-click-train-120',
      title: 'Click Train 120',
      artist: 'BeatLink Synthetic Lab',
      durationMs: 30000,
      bpm: 120,
      beatmapId: 'synth-click-120',
      license: 'synthetic_original' as const,
      description: 'synth',
    };
    const decision = resolveContentPath({ catalogEntry: catalogSynth });
    expect(assertAnalysisKaraokeEligible(decision).ok).toBe(true);
    expect(gateMusicSource({ catalogEntry: catalogSynth }).ok).toBe(true);

    const tone = synthesizeKaraokeTone({
      durationMs: 1500,
      sampleRate: 16000,
      pitchHz: 220,
      phraseWindowsMs: [{ startMs: 100, endMs: 1400 }],
    });
    const score = scoreKaraokeDsp(tone, {
      sampleRate: 16000,
      targetPitchHz: 220,
      window: { startMs: 200, endMs: 1200 },
    });
    expect(score.features.voiced).toBe(true);
    expect(score.gradeHint).not.toBe('miss');
  });
});

describe('Digital RC — packaging / SBOM / update / rollback / offline / privacy', () => {
  it('builds DEV-signed digital RC package and earns ready token', () => {
    const pkg = buildDigitalRcPackage({
      versionName: '0.2.0-digital-rc',
      versionCode: 3,
      fromVersion: '0.1.0-alpha-exit',
      nowMs: Date.parse('2026-08-08T19:00:00Z'),
    });
    expect(pkg.disclaimer).toContain('Digital RC');
    expect(pkg.signing.mode).toBe('DEV');
    expect(pkg.signing.productionHsm).toBe(false);
    expect(pkg.signing.storeSubmission).toBe(false);
    expect(pkg.sbom.digestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.offline.includesMicRecording).toBe(false);
    expect(pkg.offline.includesPlatformSdks).toBe(false);
    expect(pkg.privacy.micRecordingDefault).toBe('off');

    const update = planDigitalRcUpdate(pkg);
    expect(update.toVersion).toBe(pkg.versionName);
    const rollback = planDigitalRcRollback(pkg);
    expect(rollback.targetVersion).toBe(pkg.update.fromVersion);

    const ready = assertDigitalRcReady(pkg);
    expect(ready.gaps).toEqual([]);
    expect(ready.ready).toBe(true);
    expect(ready.token).toBe('BEATLINK_DIGITAL_RC_READY');
  });
});
