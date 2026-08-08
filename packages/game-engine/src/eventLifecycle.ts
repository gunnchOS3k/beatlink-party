/**
 * Full room/event lifecycle stress — Beta digital.
 * Exercises create → join → mode/song → calibrate → countdown → play →
 * influence → results → rematch → expire/shutdown under repeated loops.
 */

import { GAME_MODE_IDS, MAX_PERFORMERS, emitTelemetry, type GameModeId } from '@beatlink/shared';
import type { AudienceInfluenceType } from '@beatlink/shared';

export interface LifecycleRoomApi {
  createRoom(
    hostSocketId: string,
    options?: { capacityProfile?: 'party' | 'event_sim'; gameMode?: GameModeId },
  ): { code: string; hostToken: string };
  joinRoom(
    code: string,
    socketId: string,
    name: string,
  ): { player: { id: string }; playerToken: string } | null;
  joinAudience(
    code: string,
    socketId: string,
    name: string,
  ): { audience: { id: string }; audienceToken: string } | null;
  setRole?(code: string, playerId: string, role: string): unknown;
  setReady?(code: string, playerId: string, ready: boolean): unknown;
  autoAssignTeams?(code: string): unknown;
  setGameMode(code: string, mode: GameModeId | string): unknown;
  selectSong?(code: string, songId: string): unknown;
  startCalibration?(code: string): unknown;
  recordCalibrationSample?(
    code: string,
    sample: { expectedMs: number; tappedMs: number },
  ): unknown;
  submitCalibration?(code: string): unknown;
  startCountdown?(code: string): unknown;
  tickCountdown?(code: string): unknown;
  forcePhase?(code: string, phase: string): void;
  processAudienceInfluence(
    code: string,
    audienceId: string,
    type: AudienceInfluenceType,
  ): { event: { accepted: boolean } } | null;
  setAudienceSandboxed?(code: string, audienceId: string, sandboxed: boolean): unknown;
  leaveRoom(socketId: string): unknown;
  reconnectPlayer?(
    code: string,
    playerId: string,
    playerToken: string,
    socketId: string,
  ): unknown;
  migrateHostOnDisconnect(socketId: string): { newHostPlayerId: string | null } | null;
  claimHostAsPlayer?(
    code: string,
    playerId: string,
    playerToken: string,
    socketId: string,
  ): { hostToken: string } | null;
  endGame(code: string): { players: unknown[] } | null;
  nextRound(code: string): { phase: string; rematchRound: number } | null;
  shutdownRoom(
    code: string,
    options: { hostToken: string },
  ): { phase: string } | null;
  purgeExpiredRooms?(nowMs?: number): string[];
  getRoom(code: string): { phase: string; players: unknown[]; audience: unknown[] } | null;
}

export interface LifecycleLoopResult {
  loop: number;
  mode: GameModeId;
  ok: boolean;
  phasesSeen: string[];
  rematchRound: number;
  notes: string[];
  wallMs: number;
}

export interface LifecycleStressReport {
  loops: number;
  results: LifecycleLoopResult[];
  passed: boolean;
  token: 'BEATLINK_EVENT_LIFECYCLE_STRESS_PASS' | 'BEATLINK_EVENT_LIFECYCLE_STRESS_FAIL';
}

export function runEventLifecycleStress(
  api: LifecycleRoomApi,
  options: {
    loops?: number;
    performers?: number;
    audience?: number;
    songId?: string;
  } = {},
): LifecycleStressReport {
  const loops = options.loops ?? GAME_MODE_IDS.length;
  const performers = options.performers ?? MAX_PERFORMERS;
  const audienceN = options.audience ?? 12;
  const songId = options.songId ?? 'demo-neon-groove';
  const results: LifecycleLoopResult[] = [];

  for (let loop = 0; loop < loops; loop++) {
    const mode = GAME_MODE_IDS[loop % GAME_MODE_IDS.length]!;
    const notes: string[] = [];
    const phasesSeen: string[] = [];
    const t0 = Date.now();
    const hostSock = `life-host-${loop}`;
    const created = api.createRoom(hostSock, { gameMode: mode });
    phasesSeen.push(api.getRoom(created.code)?.phase ?? 'missing');

    const players: Array<{ id: string; token: string; sock: string }> = [];
    for (let i = 0; i < performers; i++) {
      const sock = `lp-${loop}-${i}`;
      const joined = api.joinRoom(created.code, sock, `P${i}`);
      if (joined) {
        players.push({ id: joined.player.id, token: joined.playerToken, sock });
        api.setRole?.(
          created.code,
          joined.player.id,
          i % 3 === 0 ? 'beat_tapper' : i % 3 === 1 ? 'vocalist' : 'hype_captain',
        );
        api.setReady?.(created.code, joined.player.id, true);
      }
    }
    if (players.length !== performers) notes.push('performer_join_short');

    const aud = api.joinAudience(created.code, `la-${loop}`, 'Crowd');
    for (let i = 1; i < audienceN; i++) {
      api.joinAudience(created.code, `la-${loop}-${i}`, `A${i}`);
    }
    if (!aud) notes.push('audience_join_failed');

    api.autoAssignTeams?.(created.code);
    api.setGameMode(created.code, mode);
    api.selectSong?.(created.code, songId);
    api.startCalibration?.(created.code);
    phasesSeen.push(api.getRoom(created.code)?.phase ?? 'missing');
    api.recordCalibrationSample?.(created.code, { expectedMs: 0, tappedMs: 25 });
    api.recordCalibrationSample?.(created.code, { expectedMs: 500, tappedMs: 530 });
    api.submitCalibration?.(created.code);

    // Mid-loop reconnect
    const first = players[0];
    if (first) {
      api.leaveRoom(first.sock);
      const reSock = `${first.sock}-re`;
      if (api.reconnectPlayer?.(created.code, first.id, first.token, reSock)) {
        first.sock = reSock;
        notes.push('player_reconnected');
      }
    }

    api.startCountdown?.(created.code);
    api.tickCountdown?.(created.code);
    api.tickCountdown?.(created.code);
    api.tickCountdown?.(created.code);
    api.forcePhase?.(created.code, 'playing');
    phasesSeen.push(api.getRoom(created.code)?.phase ?? 'missing');

    if (aud) {
      api.setAudienceSandboxed?.(created.code, aud.audience.id, false);
      api.processAudienceInfluence(created.code, aud.audience.id, 'hype');
    }

    // Host migration mid-play
    const mig = api.migrateHostOnDisconnect(hostSock);
    if (mig?.newHostPlayerId) {
      const claimer = players.find((p) => p.id === mig.newHostPlayerId);
      if (claimer && api.claimHostAsPlayer) {
        api.claimHostAsPlayer(created.code, claimer.id, claimer.token, `life-host-claim-${loop}`);
        notes.push('host_claimed');
      }
    }

    api.forcePhase?.(created.code, 'playing');
    const ended = api.endGame(created.code);
    phasesSeen.push(api.getRoom(created.code)?.phase ?? 'missing');
    if (!ended || ended.players.length !== performers) notes.push('end_game_short');

    const next = api.nextRound(created.code);
    const rematchRound = next?.rematchRound ?? -1;
    if (next?.phase !== 'lobby') notes.push('rematch_not_lobby');
    phasesSeen.push(next?.phase ?? 'missing');

    // Second micro-round then shutdown
    api.setGameMode(created.code, mode);
    api.forcePhase?.(created.code, 'playing');
    api.endGame(created.code);
    const closed = api.shutdownRoom(created.code, { hostToken: created.hostToken });
    phasesSeen.push(closed?.phase ?? 'missing');
    const gone = api.getRoom(created.code) == null;

    const ok =
      players.length === performers &&
      aud != null &&
      ended != null &&
      rematchRound >= 1 &&
      (closed?.phase === 'closed' || gone) &&
      notes.filter((n) => n.endsWith('_failed') || n.endsWith('_short') || n === 'rematch_not_lobby')
        .length === 0;

    const result: LifecycleLoopResult = {
      loop,
      mode,
      ok,
      phasesSeen,
      rematchRound,
      notes,
      wallMs: Date.now() - t0,
    };
    results.push(result);
    emitTelemetry('event_lifecycle', created.code, {
      loop,
      mode,
      ok,
      rematchRound,
    });
  }

  // TTL purge path (empty rooms / expired) — optional
  api.purgeExpiredRooms?.(Date.now() + 3 * 60 * 60 * 1000);

  const passed = results.every((r) => r.ok);
  return {
    loops,
    results,
    passed,
    token: passed
      ? 'BEATLINK_EVENT_LIFECYCLE_STRESS_PASS'
      : 'BEATLINK_EVENT_LIFECYCLE_STRESS_FAIL',
  };
}
