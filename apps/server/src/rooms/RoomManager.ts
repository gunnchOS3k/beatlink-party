import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AudienceInfluenceEvent,
  AudienceInfluenceType,
  AudienceMember,
  Beatmap,
  DifficultyId,
  GameModeId,
  GameResults,
  LinkResolveResult,
  Player,
  PlayerInputEvent,
  RoomPhase,
  RoomPrivacySettings,
  RoomState,
  ScoreEvent,
  TeamId,
} from '@beatlink/shared';
import {
  PLAYER_COLORS,
  AUDIENCE_COLORS,
  AUDIENCE_INFLUENCE_COOLDOWN_MS,
  AUDIENCE_INFLUENCE_MAX_PER_ROUND,
  AUDIENCE_INFLUENCE_MAX_DELTA,
  AUDIENCE_CROWD_METER_FLOOR,
  AUDIENCE_CROWD_METER_CEILING,
  DEFAULT_CAPACITY_PROFILE,
  DEFAULT_DIFFICULTY,
  DEFAULT_GAME_MODE,
  EMPTY_TEAM_SCORES,
  MAX_PERFORMERS,
  generateRoomCode,
  maxAudienceForProfile,
  sanitizePlayerName,
  HYPE_COOLDOWN_MS,
  comboFromStreak,
  createRoomPrivacy,
  emitTelemetry,
  isTeamId,
  publicPlayerView,
  type CapacityProfile,
} from '@beatlink/shared';
import {
  assertTransition,
  buildRoomJoinQrPayload,
  calibratedGameTimeMs,
  clampCalibrationOffset,
  computeAwards,
  computeCalibrationOffset,
  findActiveVocalPrompt,
  findNearestHypeEvent,
  findNearestNote,
  isGameModeId,
  nextPredictionSection,
  predictionChoiceCorrect,
  recomputeTeamScores,
  responseMatchedForCallAndResponse,
  scoreBeatTap,
  scoreForMode,
  scoreHypeAction,
  scoreVocalPhrase,
  updatePlayerStats,
  winningTeam,
  type CalibrationSample,
  AchievementRuntime,
  parseAchievementCatalog,
  memoryPersist,
  pulsePartyPace,
  presentAvFeedback,
} from '@beatlink/game-engine';
import { getBeatmapForSong } from '../beatmaps/store.js';
import {
  InMemoryRoomStore,
  deserializeRoom,
  serializeRoom,
  type RoomStore,
} from './store/index.js';

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PLAYERS = MAX_PERFORMERS;

function loadDefaultAchievements(): AchievementRuntime {
  const catalogPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../release/ACHIEVEMENTS.json',
  );
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown;
  return new AchievementRuntime(parseAchievementCatalog(raw), memoryPersist());
}

interface InternalRoom extends RoomState {
  beatmap: Beatmap | null;
  hypeCooldowns: Map<string, number>;
  hostToken: string;
  playerTokens: Map<string, string>;
  audienceTokens: Map<string, string>;
  scoredTargets: Set<string>;
  /** Public web origin used when minting join QR payloads. */
  publicOrigin: string;
  calibrationSamples: CalibrationSample[];
}

export class RoomManager {
  /** Live in-process room objects (Maps/Sets). Snapshots sync to `store`. */
  private rooms = new Map<string, InternalRoom>();
  private store: RoomStore;
  private playerToRoom = new Map<string, string>();
  private audienceToRoom = new Map<string, string>();
  private socketToPlayer = new Map<string, string>();
  private socketToAudience = new Map<string, string>();
  private socketToHostRoom = new Map<string, string>();
  private achievements: AchievementRuntime;
  private sessionModes = new Map<string, Set<GameModeId>>();
  private rankFloor = new Map<string, Map<string, number>>();

  constructor(
    store: RoomStore = new InMemoryRoomStore(),
    achievements?: AchievementRuntime,
  ) {
    this.store = store;
    this.achievements = achievements ?? loadDefaultAchievements();
    for (const [code, snapshot] of this.store.entries()) {
      this.rooms.set(code.toUpperCase(), deserializeRoom(snapshot) as InternalRoom);
    }
  }

  getStoreBackend(): RoomStore['backend'] {
    return this.store.backend;
  }

  /** Swap durable backend (e.g. Redis hydrate at process boot). Keeps live socket maps. */
  replaceStore(store: RoomStore): void {
    this.store = store;
    for (const [code, snapshot] of this.store.entries()) {
      const key = code.toUpperCase();
      if (!this.rooms.has(key)) {
        this.rooms.set(key, deserializeRoom(snapshot) as InternalRoom);
      } else {
        // Refresh durable snapshot from the live object already in memory.
        this.commit(this.rooms.get(key)!);
      }
    }
  }

  /** Persist durable snapshot after in-place mutation. */
  private commit(room: InternalRoom): void {
    this.rooms.set(room.code.toUpperCase(), room);
    this.store.set(room.code, serializeRoom(room as unknown as import('./store/serialize.js').InternalRoomLive));
  }

  private publish(room: InternalRoom): RoomState {
    this.commit(room);
    return this.stripInternal(room);
  }

  private dropRoom(code: string): void {
    const key = code.toUpperCase();
    this.rooms.delete(key);
    this.store.delete(key);
    this.sessionModes.delete(key);
    this.rankFloor.delete(key);
  }

  createRoom(
    hostSocketId: string,
    options: {
      publicOrigin?: string;
      gameMode?: GameModeId;
      difficulty?: DifficultyId;
      privacy?: Partial<RoomPrivacySettings>;
      /** `event_sim` raises soft audience ceiling for Beta in-process simulation. */
      capacityProfile?: CapacityProfile;
    } = {},
  ): RoomState & { hostToken: string } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    const now = Date.now();
    const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173';
    const expiresAt = now + ROOM_TTL_MS;
    const privacy = createRoomPrivacy(options.privacy ?? {});
    const capacityProfile = options.capacityProfile ?? DEFAULT_CAPACITY_PROFILE;
    const room: InternalRoom = {
      code,
      phase: 'lobby',
      hostId: hostSocketId,
      players: [],
      audience: [],
      selectedSongId: null,
      pastedLinkUrl: null,
      linkResolveResult: null,
      gameMode: options.gameMode ?? DEFAULT_GAME_MODE,
      difficulty: options.difficulty ?? DEFAULT_DIFFICULTY,
      calibrationOffsetMs: 0,
      countdown: null,
      gameStartTime: null,
      gameDurationMs: 45000,
      teamScore: 0,
      crowdMeter: 50,
      capacityProfile,
      rematchRound: 0,
      joinQr: buildRoomJoinQrPayload({ code, origin: publicOrigin, expiresAt }),
      privacy,
      teamScores: { ...EMPTY_TEAM_SCORES },
      createdAt: now,
      expiresAt,
      beatmap: null,
      hypeCooldowns: new Map(),
      hostToken: randomUUID(),
      playerTokens: new Map(),
      audienceTokens: new Map(),
      scoredTargets: new Set(),
      publicOrigin,
      calibrationSamples: [],
    };
    this.commit(room);
    this.socketToHostRoom.set(hostSocketId, code);
    this.sessionModes.set(code, new Set());
    this.rankFloor.set(code, new Map());
    this.achievements.reportEvent('party_started', 1);
    pulsePartyPace('lobby_ready', `room ${code}`);
    presentAvFeedback('join_chime', 'Party room created');
    emitTelemetry('room_created', code, {
      rematchRound: 0,
      gameMode: room.gameMode,
      capacityProfile: room.capacityProfile,
    });
    return { ...this.stripInternal(room), hostToken: room.hostToken };
  }

  getAchievements(): AchievementRuntime {
    return this.achievements;
  }

  getRoom(code: string): InternalRoom | null {
    const key = code.toUpperCase();
    let room = this.rooms.get(key);
    if (!room) {
      const snapshot = this.store.get(key);
      if (snapshot) {
        room = deserializeRoom(snapshot) as InternalRoom;
        this.rooms.set(key, room);
      }
    }
    if (!room) return null;
    if (Date.now() > room.expiresAt) {
      this.dropRoom(key);
      return null;
    }
    return room;
  }

  stripInternal(room: InternalRoom): RoomState {
    const {
      beatmap: _beatmap,
      hypeCooldowns: _hypeCooldowns,
      hostToken: _hostToken,
      playerTokens: _playerTokens,
      audienceTokens: _audienceTokens,
      scoredTargets: _scoredTargets,
      publicOrigin: _publicOrigin,
      calibrationSamples: _calibrationSamples,
      ...state
    } = room;
    void _beatmap;
    void _hypeCooldowns;
    void _hostToken;
    void _playerTokens;
    void _audienceTokens;
    void _scoredTargets;
    void _publicOrigin;
    void _calibrationSamples;
    const summary = this.achievements.summary();
    const withAchievements: RoomState = {
      ...state,
      achievementSummary: {
        unlocked: summary.unlocked,
        total: summary.total,
        percent: summary.percent,
        entries: summary.entries,
      },
    };
    if (!room.privacy.redactDisplayNames) return withAchievements;
    return {
      ...withAchievements,
      players: room.players.map((p, i) => publicPlayerView(p, room.privacy, i)),
    };
  }

  getHostToken(code: string, socketId: string): string | null {
    const room = this.getRoom(code);
    return room?.hostId === socketId ? room.hostToken : null;
  }

  /** Validate host token and re-bind host socket (reconnect / migration claim). */
  authorizeHost(code: string, socketId: string, hostToken: string | undefined): boolean {
    const room = this.getRoom(code);
    if (!room || !hostToken || room.hostToken !== hostToken) return false;
    if (room.hostId && room.hostId !== socketId) {
      this.socketToHostRoom.delete(room.hostId);
    }
    room.hostId = socketId;
    this.socketToHostRoom.set(socketId, room.code);
    this.commit(room);
    return true;
  }

  ownsPlayer(code: string, socketId: string, playerId: string): boolean {
    return (
      this.socketToPlayer.get(socketId) === playerId &&
      this.playerToRoom.get(playerId) === code.toUpperCase()
    );
  }

  ownsAudience(code: string, socketId: string, audienceId: string): boolean {
    return (
      this.socketToAudience.get(socketId) === audienceId &&
      this.audienceToRoom.get(audienceId) === code.toUpperCase()
    );
  }

  joinRoom(
    code: string,
    socketId: string,
    name: string,
  ): { room: RoomState; player: Player; playerToken: string } | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results') {
      return null;
    }

    const existingPlayerId = this.socketToPlayer.get(socketId);
    if (existingPlayerId) {
      const player = room.players.find((p) => p.id === existingPlayerId);
      if (player) {
        player.connected = true;
        return {
          room: this.publish(room),
          player,
          playerToken: room.playerTokens.get(player.id)!,
        };
      }
    }

    if (room.players.length >= MAX_PLAYERS) return null;

    const player: Player = {
      id: randomUUID(),
      name: sanitizePlayerName(name) || 'Player',
      role: null,
      ready: false,
      connected: true,
      score: 0,
      accuracy: 0,
      streak: 0,
      maxStreak: 0,
      combo: 1,
      teamId: 'solo',
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
    };
    room.players.push(player);
    const playerToken = randomUUID();
    room.playerTokens.set(player.id, playerToken);
    this.playerToRoom.set(player.id, room.code);
    this.socketToPlayer.set(socketId, player.id);
    emitTelemetry('player_join', room.code, { playerCount: room.players.length });
    return { room: this.publish(room), player, playerToken };
  }

  joinAudience(
    code: string,
    socketId: string,
    name: string,
  ): { room: RoomState; audience: AudienceMember; audienceToken: string } | null {
    const room = this.getRoom(code);
    if (!room) return null;

    const existingId = this.socketToAudience.get(socketId);
    if (existingId) {
      const member = room.audience.find((a) => a.id === existingId);
      if (member) {
        member.connected = true;
        return {
          room: this.publish(room),
          audience: member,
          audienceToken: room.audienceTokens.get(member.id)!,
        };
      }
    }

    if (room.audience.length >= maxAudienceForProfile(room.capacityProfile)) return null;

    const audience: AudienceMember = {
      id: randomUUID(),
      name: sanitizePlayerName(name) || 'Spectator',
      connected: true,
      muted: false,
      sandboxed: room.privacy.audienceSandboxByDefault,
      influenceCount: 0,
      lastInfluenceAt: null,
      color: AUDIENCE_COLORS[room.audience.length % AUDIENCE_COLORS.length],
    };
    room.audience.push(audience);
    const audienceToken = randomUUID();
    room.audienceTokens.set(audience.id, audienceToken);
    this.audienceToRoom.set(audience.id, room.code);
    this.socketToAudience.set(socketId, audience.id);
    emitTelemetry('audience_join', room.code, { audienceCount: room.audience.length });
    return { room: this.publish(room), audience, audienceToken };
  }

  reconnectPlayer(
    code: string,
    playerId: string,
    playerToken: string,
    socketId: string,
  ): Player | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.playerTokens.get(playerId) !== playerToken) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.connected = true;
    this.socketToPlayer.set(socketId, player.id);
    this.playerToRoom.set(player.id, room.code);
    this.achievements.reportEvent('player_reconnected', 1);
    pulsePartyPace('disconnect_reconnect', playerId);
    presentAvFeedback('disconnect_warn', 'Player reconnected');
    return player;
  }

  reconnectAudience(
    code: string,
    audienceId: string,
    audienceToken: string,
    socketId: string,
  ): AudienceMember | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.audienceTokens.get(audienceId) !== audienceToken) return null;
    const member = room.audience.find((a) => a.id === audienceId);
    if (!member) return null;
    member.connected = true;
    this.socketToAudience.set(socketId, member.id);
    this.audienceToRoom.set(member.id, room.code);
    return member;
  }

  reconnectHost(code: string, hostToken: string, socketId: string): RoomState | null {
    if (!this.authorizeHost(code, socketId, hostToken)) return null;
    const room = this.getRoom(code);
    return room ? this.publish(room) : null;
  }

  /**
   * When the host socket disconnects, migrate host seat to the first connected player
   * (or keep hostId null until host reconnects with token). Returns new host player id if migrated.
   */
  migrateHostOnDisconnect(socketId: string): {
    room: RoomState;
    previousHostId: string | null;
    newHostPlayerId: string | null;
    hostToken: string;
  } | null {
    const code = this.socketToHostRoom.get(socketId);
    if (!code) return null;
    const room = this.getRoom(code);
    if (!room || room.hostId !== socketId) {
      this.socketToHostRoom.delete(socketId);
      return null;
    }

    const previousHostId = room.hostId;
    this.socketToHostRoom.delete(socketId);

    const successor = room.players.find((p) => p.connected);
    if (successor) {
      // Temporary host claim for continuity — full auth still requires hostToken.
      room.hostId = `player-host:${successor.id}`;
      emitTelemetry('host_migrated', room.code, { rematchRound: room.rematchRound });
      this.achievements.reportEvent('host_migrated', 1);
      pulsePartyPace('host_migrated', successor.id);
      presentAvFeedback('host_migrated', 'Host continuity recovered');
      return {
        room: this.publish(room),
        previousHostId,
        newHostPlayerId: successor.id,
        hostToken: room.hostToken,
      };
    }

    room.hostId = null;
    emitTelemetry('host_migrated', room.code, { rematchRound: room.rematchRound });
    this.achievements.reportEvent('host_migrated', 1);
    pulsePartyPace('host_migrated', 'no-successor');
    presentAvFeedback('host_migrated', 'Host disconnected — awaiting claim');
    return {
      room: this.publish(room),
      previousHostId,
      newHostPlayerId: null,
      hostToken: room.hostToken,
    };
  }

  claimHostAsPlayer(
    code: string,
    playerId: string,
    playerToken: string,
    socketId: string,
  ): { room: RoomState; hostToken: string } | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.playerTokens.get(playerId) !== playerToken) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.connected) return null;
    // Allow claim when host is missing or already migrated to this player.
    if (
      room.hostId !== null &&
      room.hostId !== `player-host:${playerId}` &&
      !room.hostId.startsWith('player-host:')
    ) {
      return null;
    }
    if (room.hostId?.startsWith('player-host:') && room.hostId !== `player-host:${playerId}`) {
      return null;
    }
    room.hostId = socketId;
    this.socketToHostRoom.set(socketId, room.code);
    emitTelemetry('host_migrated', room.code, { claimed: true });
    return { room: this.publish(room), hostToken: room.hostToken };
  }

  setAudienceMuted(
    code: string,
    audienceId: string,
    muted: boolean,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.audience.find((a) => a.id === audienceId);
    if (!member) return null;
    member.muted = muted;
    emitTelemetry('moderation_action', room.code, { action: 'mute', muted });
    return this.publish(room);
  }

  setAudienceSandboxed(
    code: string,
    audienceId: string,
    sandboxed: boolean,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.audience.find((a) => a.id === audienceId);
    if (!member) return null;
    member.sandboxed = sandboxed;
    emitTelemetry('moderation_action', room.code, { action: 'sandbox', sandboxed });
    return this.publish(room);
  }

  /** Assign player to team A / B / solo (lobby / results / song_select). */
  setPlayerTeam(code: string, playerId: string, teamId: TeamId | string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results')) {
      return null;
    }
    if (!isTeamId(teamId)) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.teamId = teamId;
    room.teamScores = recomputeTeamScores(room.players);
    emitTelemetry('team_assigned', room.code, { teamId });
    return this.publish(room);
  }

  /** Auto-split connected players into A/B. */
  autoAssignTeams(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results')) {
      return null;
    }
    room.players.forEach((p, i) => {
      p.teamId = i % 2 === 0 ? 'A' : 'B';
    });
    room.teamScores = recomputeTeamScores(room.players);
    emitTelemetry('team_assigned', room.code, { auto: true });
    return this.publish(room);
  }

  updatePrivacy(
    code: string,
    patch: Partial<RoomPrivacySettings>,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results')) {
      return null;
    }
    const next = { ...room.privacy };
    for (const [key, value] of Object.entries(patch) as Array<
      [keyof RoomPrivacySettings, RoomPrivacySettings[keyof RoomPrivacySettings] | undefined]
    >) {
      if (value !== undefined) {
        (next as Record<string, unknown>)[key] = value;
      }
    }
    room.privacy = next;
    emitTelemetry('privacy_updated', room.code, {
      redactDisplayNames: room.privacy.redactDisplayNames,
      telemetryEnabled: room.privacy.telemetryEnabled,
    });
    return this.publish(room);
  }

  /** Test / harness hook — force phase without full transition checks. */
  forcePhase(code: string, phase: RoomPhase): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = phase;
    return this.publish(room);
  }

  /**
   * Moderated audience influence with anti-grief rate limits.
   * Sandboxed members get accepted=false (no crowd effect).
   */
  processAudienceInfluence(
    code: string,
    audienceId: string,
    type: AudienceInfluenceType,
    choice?: string,
  ): { room: RoomState; event: AudienceInfluenceEvent } | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.audience.find((a) => a.id === audienceId);
    if (!member || !member.connected) return null;

    const now = Date.now();
    let accepted = true;
    let reason: string | undefined;
    let crowdDelta = 0;

    if (member.muted) {
      accepted = false;
      reason = 'muted';
    } else if (member.sandboxed) {
      accepted = false;
      reason = 'sandboxed';
    } else if (
      member.lastInfluenceAt != null &&
      now - member.lastInfluenceAt < AUDIENCE_INFLUENCE_COOLDOWN_MS
    ) {
      accepted = false;
      reason = 'rate_limited';
    } else if (member.influenceCount >= AUDIENCE_INFLUENCE_MAX_PER_ROUND) {
      accepted = false;
      reason = 'round_cap';
    } else if (room.phase !== 'playing' && room.phase !== 'countdown' && room.phase !== 'results') {
      accepted = false;
      reason = 'phase_blocked';
    }

    if (accepted) {
      member.lastInfluenceAt = now;
      member.influenceCount += 1;
      const rawDelta = type === 'hype' ? 2 : 1;
      crowdDelta = Math.min(AUDIENCE_INFLUENCE_MAX_DELTA, Math.max(0, rawDelta));
      const proposed = room.crowdMeter + crowdDelta;
      if (proposed > AUDIENCE_CROWD_METER_CEILING) {
        crowdDelta = Math.max(0, AUDIENCE_CROWD_METER_CEILING - room.crowdMeter);
      }
      // Soft floor only blocks further decreases (audience path is non-negative today).
      if (room.crowdMeter + crowdDelta < AUDIENCE_CROWD_METER_FLOOR && crowdDelta < 0) {
        crowdDelta = Math.min(0, AUDIENCE_CROWD_METER_FLOOR - room.crowdMeter);
      }
      room.crowdMeter = Math.min(100, Math.max(0, room.crowdMeter + crowdDelta));
    }

    const event: AudienceInfluenceEvent = {
      audienceId,
      type,
      choice: choice?.slice(0, 32),
      accepted,
      reason,
      crowdDelta,
      atMs: now,
    };
    if (accepted) this.achievements.reportEvent('audience_influence', 1);
    if (accepted) {
      pulsePartyPace('audience_pulse', type);
      presentAvFeedback('audience_hype', `Audience ${type}`);
    }
    emitTelemetry('audience_influence', room.code, {
      accepted,
      type,
      reason: reason ?? null,
    });
    return { room: this.publish(room), event };
  }

  leaveRoom(socketId: string): RoomState | null {
    const audienceId = this.socketToAudience.get(socketId);
    if (audienceId) {
      const code = this.audienceToRoom.get(audienceId);
      this.socketToAudience.delete(socketId);
      if (!code) return null;
      const room = this.getRoom(code);
      if (!room) return null;
      const member = room.audience.find((a) => a.id === audienceId);
      if (member) member.connected = false;
      emitTelemetry('disconnect', room.code, { seat: 'audience' });
      return this.publish(room);
    }

    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return null;
    const code = this.playerToRoom.get(playerId);
    if (!code) return null;
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    this.socketToPlayer.delete(socketId);
    emitTelemetry('disconnect', room.code, { seat: 'player' });
    return this.publish(room);
  }

  endRoom(code: string, hostSocketId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.hostId !== hostSocketId) return null;
    return this.shutdownRoom(code, { reason: 'host_end', hostSocketId });
  }

  /**
   * Clean shutdown — clears seats, tokens, maps, and marks phase closed.
   * Accepts host token or matching host socket id.
   */
  shutdownRoom(
    code: string,
    options: { reason?: string; hostSocketId?: string; hostToken?: string } = {},
  ): RoomState | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    if (options.hostToken && room.hostToken !== options.hostToken) return null;
    if (
      options.hostSocketId &&
      room.hostId !== options.hostSocketId &&
      !options.hostToken
    ) {
      return null;
    }

    for (const player of room.players) {
      this.playerToRoom.delete(player.id);
      room.playerTokens.delete(player.id);
    }
    for (const member of room.audience) {
      this.audienceToRoom.delete(member.id);
      room.audienceTokens.delete(member.id);
    }
    for (const [socketId, playerId] of [...this.socketToPlayer.entries()]) {
      if (room.players.some((p) => p.id === playerId)) {
        this.socketToPlayer.delete(socketId);
      }
    }
    for (const [socketId, audienceId] of [...this.socketToAudience.entries()]) {
      if (room.audience.some((a) => a.id === audienceId)) {
        this.socketToAudience.delete(socketId);
      }
    }
    if (room.hostId) this.socketToHostRoom.delete(room.hostId);
    room.phase = 'closed';
    const closed = this.stripInternal({ ...room, players: [], audience: [] });
    this.dropRoom(code);
    emitTelemetry('room_shutdown', code, { reason: options.reason ?? 'shutdown' });
    return closed;
  }

  /** Purge expired rooms (TTL). Returns number removed. */
  purgeExpiredRooms(nowMs = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, room] of [...this.rooms.entries()]) {
      if (nowMs > room.expiresAt) {
        this.shutdownRoom(code, { reason: 'expired', hostToken: room.hostToken });
        emitTelemetry('room_expired', code, { rematchRound: room.rematchRound });
        removed.push(code);
      }
    }
    return removed;
  }

  /** Refresh join QR payload (same code, updated expiry / origin). */
  refreshJoinQr(code: string, publicOrigin?: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.phase === 'closed') return null;
    if (publicOrigin) room.publicOrigin = publicOrigin;
    room.joinQr = buildRoomJoinQrPayload({
      code: room.code,
      origin: room.publicOrigin,
      expiresAt: room.expiresAt,
    });
    return this.publish(room);
  }

  setGameMode(code: string, gameMode: GameModeId | string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results')) {
      return null;
    }
    if (!isGameModeId(gameMode)) return null;
    room.gameMode = gameMode;
    emitTelemetry('mode_selected', room.code, { gameMode });
    return this.publish(room);
  }

  setDifficulty(code: string, difficulty: DifficultyId): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select' && room.phase !== 'results')) {
      return null;
    }
    if (!['beginner', 'casual', 'pro', 'nightmare'].includes(difficulty)) return null;
    room.difficulty = difficulty;
    return this.publish(room);
  }

  setRole(code: string, playerId: string, role: Player['role']): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select')) return null;
    if (!role || !['beat_tapper', 'vocalist', 'hype_captain'].includes(role)) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.role = role;
    return this.publish(room);
  }

  setReady(code: string, playerId: string, ready: boolean): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select')) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.ready = ready;
    return this.publish(room);
  }

  selectSong(code: string, songId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select')) return null;
    const beatmap = getBeatmapForSong(songId);
    if (!beatmap) return null;
    room.selectedSongId = songId;
    room.beatmap = {
      ...beatmap,
      offsetMs: room.calibrationOffsetMs,
    };
    room.gameDurationMs = room.beatmap?.durationMs ?? 45000;
    room.phase = 'song_select';
    return this.publish(room);
  }

  /** Persist pasted link + resolve snapshot so peers can see preview/eligibility. */
  setResolvedLink(code: string, url: string, result: LinkResolveResult): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'lobby' && room.phase !== 'song_select')) return null;
    room.pastedLinkUrl = url;
    room.linkResolveResult = result;
    if (result.matchedCatalogId && result.playbackStatus === 'PLAYABLE_APPROVED') {
      const beatmap = getBeatmapForSong(result.matchedCatalogId);
      if (beatmap) {
        room.selectedSongId = result.matchedCatalogId;
        room.beatmap = {
          ...beatmap,
          offsetMs: room.calibrationOffsetMs,
        };
        room.gameDurationMs = beatmap.durationMs;
        room.phase = 'song_select';
      }
    }
    return this.publish(room);
  }

  startCalibration(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (
      !room ||
      !room.selectedSongId ||
      !room.beatmap ||
      !assertCanStart(room) ||
      (room.phase !== 'lobby' && room.phase !== 'song_select')
    ) {
      return null;
    }
    if (room.phase === 'lobby') {
      assertTransition('lobby', 'song_select');
      room.phase = 'song_select';
    }
    assertTransition(room.phase, 'calibrating');
    room.phase = 'calibrating';
    room.calibrationSamples = [];
    pulsePartyPace('calibration_start', code);
    presentAvFeedback('calibration_tick', 'Latency calibration started');
    return this.publish(room);
  }

  /** Record a single calibration tap sample (expected vs tapped). */
  recordCalibrationSample(
    code: string,
    sample: CalibrationSample,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.phase !== 'calibrating') return null;
    room.calibrationSamples.push(sample);
    return this.publish(room);
  }

  submitCalibration(code: string, offsetMs?: number): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.phase !== 'calibrating') return null;

    let clamped: number;
    if (typeof offsetMs === 'number' && Number.isFinite(offsetMs)) {
      clamped = clampCalibrationOffset(offsetMs);
    } else if (room.calibrationSamples.length > 0) {
      const computed = computeCalibrationOffset(room.calibrationSamples);
      if (!computed.accepted) {
        // Still apply best-effort offset so hosts can proceed; confidence is in telemetry.
        clamped = computed.offsetMs;
        emitTelemetry('calibration_submitted', room.code, {
          accepted: false,
          reason: computed.reason ?? 'rejected',
          confidence: computed.confidence,
          sampleCount: computed.sampleCount,
        });
      } else {
        clamped = computed.offsetMs;
        emitTelemetry('calibration_submitted', room.code, {
          accepted: true,
          confidence: computed.confidence,
          sampleCount: computed.sampleCount,
          stdDevMs: Math.round(computed.stdDevMs),
        });
      }
    } else {
      clamped = 0;
      emitTelemetry('calibration_submitted', room.code, {
        accepted: true,
        confidence: 0.2,
        sampleCount: 0,
      });
    }

    room.calibrationOffsetMs = clamped;
    if (room.beatmap) {
      room.beatmap = {
        ...room.beatmap,
        offsetMs: clamped,
      };
    }
    this.achievements.setFlag('calibrated');
    return this.publish(room);
  }

  startCountdown(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (
      !room ||
      !room.selectedSongId ||
      !room.beatmap ||
      !assertCanStart(room) ||
      room.phase !== 'calibrating'
    ) {
      return null;
    }
    assertTransition(room.phase, 'countdown');
    room.phase = 'countdown';
    room.countdown = 3;
    for (const p of room.players) {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.accuracy = 0;
      p.combo = 1;
    }
    for (const a of room.audience) {
      a.influenceCount = 0;
      a.lastInfluenceAt = null;
    }
    room.teamScore = 0;
    room.teamScores = { ...EMPTY_TEAM_SCORES };
    room.crowdMeter = 50;
    room.hypeCooldowns.clear();
    room.scoredTargets.clear();
    this.rankFloor.set(room.code, new Map());
    return this.publish(room);
  }

  tickCountdown(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || room.phase !== 'countdown') return null;
    if (room.countdown === null) return null;
    room.countdown -= 1;
    if (room.countdown <= 0) {
      room.phase = 'playing';
      room.countdown = null;
      room.gameStartTime = Date.now();
      this.noteModeRound(room);
    }
    return this.publish(room);
  }

  getGameTimeMs(code: string): number {
    const room = this.getRoom(code);
    if (!room || !room.gameStartTime) return 0;
    return Date.now() - room.gameStartTime;
  }

  getCalibratedGameTimeMs(code: string): number {
    const room = this.getRoom(code);
    if (!room) return 0;
    return calibratedGameTimeMs(this.getGameTimeMs(code), room.calibrationOffsetMs || 0);
  }

  
  /**
   * HOST_CONTROLLED_SESSION_PAUSE — only authorized host may pause/resume.
   * While paused, gameplay inputs are rejected; room sync state is preserved.
   */
  pauseSession(
    code: string,
    hostSocketId: string,
    hostToken: string | undefined,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (!this.authorizeHost(code, hostSocketId, hostToken)) return null;
    if (room.phase !== 'playing') return null;
    assertTransition(room.phase, 'paused');
    room.phase = 'paused';
    room.pausedAtMs = Date.now();
    room.pauseElapsedGameMs = this.getGameTimeMs(code);
    emitTelemetry('session_pause', room.code, { host: true });
    pulsePartyPace('pause', code);
    return this.publish(room);
  }

  resumeSession(
    code: string,
    hostSocketId: string,
    hostToken: string | undefined,
  ): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (!this.authorizeHost(code, hostSocketId, hostToken)) return null;
    if (room.phase !== 'paused') return null;
    assertTransition(room.phase, 'playing');
    // Preserve timeline: shift gameStartTime so getGameTimeMs continues from pauseElapsedGameMs.
    const elapsed = typeof room.pauseElapsedGameMs === 'number' ? room.pauseElapsedGameMs : 0;
    room.gameStartTime = Date.now() - elapsed;
    room.phase = 'playing';
    room.pausedAtMs = undefined;
    room.pauseElapsedGameMs = undefined;
    emitTelemetry('session_resume', room.code, { host: true });
    this.achievements.reportEvent('pause_resume', 1);
    pulsePartyPace('resume', code);
    return this.publish(room);
  }

  processInput(code: string, input: PlayerInputEvent): { room: RoomState; scoreEvent: ScoreEvent | null } | null {
    const room = this.getRoom(code);
    if (!room || !room.beatmap) return null;
    if (room.phase === 'paused') {
      emitTelemetry('input_rejected_paused', room.code, { playerId: input.playerId });
      return { room: this.publish(room), scoreEvent: null };
    }
    if (room.phase !== 'playing') return null;
    const player = room.players.find((p) => p.id === input.playerId);
    if (!player) return null;

    const rawGameTimeMs = this.getGameTimeMs(code);
    const gameTimeMs = calibratedGameTimeMs(rawGameTimeMs, room.calibrationOffsetMs || 0);
    let scoreEvent: ScoreEvent | null = null;

    if (player.role === 'beat_tapper' && input.type === 'tap') {
      const note =
        (input.noteId
          ? room.beatmap.notes.find((n) => n.id === input.noteId)
          : null) ??
        findNearestNote(room.beatmap.notes, gameTimeMs, 150, 'beat_tapper');
      const targetKey = note ? `${player.id}:note:${note.id}` : null;
      if (
        note &&
        targetKey &&
        !room.scoredTargets.has(targetKey) &&
        Math.abs(note.timeMs - gameTimeMs) < 200
      ) {
        room.scoredTargets.add(targetKey);
        const tap = scoreBeatTap(input, note.timeMs, gameTimeMs, player.streak);
        const modeScore = scoreForMode({
          modeId: room.gameMode,
          difficulty: room.difficulty,
          grade: tap.grade,
          basePoints: tap.points,
          streak: tap.streak,
          meta: {
            role: player.role,
            responseMatched:
              room.gameMode === 'CallAndResponse' &&
              responseMatchedForCallAndResponse(
                room.beatmap.sections,
                gameTimeMs,
                tap.grade,
              ),
          },
        });
        const result = {
          ...tap,
          points: modeScore.points,
          message: modeScore.message,
          crowdBoost: modeScore.crowdBoost,
        };
        Object.assign(player, updatePlayerStats(player, result));
        room.teamScore += result.points;
        room.teamScores = recomputeTeamScores(room.players);
        room.crowdMeter = Math.min(100, Math.max(0, room.crowdMeter + result.crowdBoost));
        scoreEvent = {
          playerId: player.id,
          grade: result.grade,
          points: result.points,
          streak: result.streak,
          combo: result.combo,
          message: result.message,
        };
      }
    } else if (player.role === 'vocalist' && input.type === 'vocal_phrase') {
      const prompt =
        (input.promptId
          ? room.beatmap.vocalPrompts.find((v) => v.id === input.promptId)
          : null) ?? findActiveVocalPrompt(room.beatmap.vocalPrompts, gameTimeMs, 500);
      const targetKey = prompt ? `${player.id}:vocal:${prompt.id}` : null;
      if (
        prompt &&
        targetKey &&
        !room.scoredTargets.has(targetKey) &&
        gameTimeMs >= prompt.timeMs - 200 &&
        gameTimeMs <= prompt.timeMs + prompt.durationMs + 200
      ) {
        room.scoredTargets.add(targetKey);
        const vocal = scoreVocalPhrase(
          input,
          prompt.timeMs,
          prompt.durationMs,
          gameTimeMs,
          player.streak,
        );
        const modeScore = scoreForMode({
          modeId: room.gameMode,
          difficulty: room.difficulty,
          grade: vocal.grade,
          basePoints: vocal.points,
          streak: vocal.streak,
          meta: {
            role: player.role,
            noRecording: true,
            responseMatched:
              room.gameMode === 'CallAndResponse' &&
              responseMatchedForCallAndResponse(
                room.beatmap.sections,
                gameTimeMs,
                vocal.grade,
              ),
          },
        });
        const result = {
          ...vocal,
          points: modeScore.points,
          message: modeScore.message,
          crowdBoost: modeScore.crowdBoost,
        };
        Object.assign(player, updatePlayerStats(player, result));
        room.teamScore += result.points;
        room.teamScores = recomputeTeamScores(room.players);
        room.crowdMeter = Math.min(100, room.crowdMeter + result.crowdBoost);
        scoreEvent = {
          playerId: player.id,
          grade: result.grade,
          points: result.points,
          streak: result.streak,
          combo: result.combo,
          message: result.message,
        };
      }
    } else if (
      room.gameMode === 'PredictionTrivia' &&
      input.type === 'prediction_lock'
    ) {
      const target =
        (input.sectionId
          ? room.beatmap.sections.find((s) => s.id === input.sectionId)
          : null) ?? nextPredictionSection(room.beatmap.sections, gameTimeMs);
      const targetKey = target ? `${player.id}:pred:${target.id}` : null;
      if (target && targetKey && !room.scoredTargets.has(targetKey)) {
        if (gameTimeMs >= target.startMs) {
          emitTelemetry('score', room.code, {
            grade: 'miss',
            points: 0,
            combo: player.combo,
            reason: 'prediction_late',
          });
          room.scoredTargets.add(targetKey);
          const modeScore = scoreForMode({
            modeId: 'PredictionTrivia',
            difficulty: room.difficulty,
            grade: 'miss',
            basePoints: 0,
            streak: 0,
            meta: { predictionCorrect: false, late: true },
          });
          const result = {
            grade: 'miss' as const,
            points: modeScore.points,
            streak: 0,
            combo: 1,
            accuracy: 0,
            message: modeScore.message,
            crowdBoost: modeScore.crowdBoost,
          };
          Object.assign(player, updatePlayerStats(player, result));
          room.teamScore += result.points;
          room.teamScores = recomputeTeamScores(room.players);
          room.crowdMeter = Math.min(100, Math.max(0, room.crowdMeter + result.crowdBoost));
          scoreEvent = {
            playerId: player.id,
            grade: result.grade,
            points: result.points,
            streak: result.streak,
            combo: result.combo,
            message: result.message,
          };
        } else {
          room.scoredTargets.add(targetKey);
          const correct = predictionChoiceCorrect(target, input.predictionChoice);
          const modeScore = scoreForMode({
            modeId: 'PredictionTrivia',
            difficulty: room.difficulty,
            grade: correct ? 'perfect' : 'miss',
            basePoints: 0,
            streak: player.streak,
            meta: { predictionCorrect: correct, sectionId: target.id },
          });
          const result = {
            grade: (correct ? 'perfect' : 'miss') as 'perfect' | 'miss',
            points: modeScore.points,
            streak: correct ? player.streak + 1 : 0,
            combo: correct ? player.combo : 1,
            accuracy: correct ? 100 : 0,
            message: modeScore.message,
            crowdBoost: modeScore.crowdBoost,
          };
          Object.assign(player, updatePlayerStats(player, result));
          room.teamScore += result.points;
          room.teamScores = recomputeTeamScores(room.players);
          room.crowdMeter = Math.min(100, Math.max(0, room.crowdMeter + result.crowdBoost));
          scoreEvent = {
            playerId: player.id,
            grade: result.grade,
            points: result.points,
            streak: result.streak,
            combo: result.combo,
            message: result.message,
          };
        }
      }
    } else if (player.role === 'hype_captain' && input.type.startsWith('hype_')) {
      const lastHype = room.hypeCooldowns.get(player.id) ?? 0;
      if (Date.now() - lastHype < HYPE_COOLDOWN_MS) {
        return { room: this.publish(room), scoreEvent: null };
      }
      const event = findNearestHypeEvent(room.beatmap.hypeEvents, gameTimeMs, 300);
      const targetTime = event?.timeMs ?? gameTimeMs;
      const result = scoreHypeAction(gameTimeMs, targetTime, player.streak);
      Object.assign(player, updatePlayerStats(player, result));
      room.teamScore += result.points;
      room.teamScores = recomputeTeamScores(room.players);
      room.crowdMeter = Math.min(100, room.crowdMeter + result.crowdBoost);
      room.hypeCooldowns.set(player.id, Date.now());
      scoreEvent = {
        playerId: player.id,
        grade: result.grade,
        points: result.points,
        streak: result.streak,
        combo: result.combo,
        message: result.message,
      };
    }

    if (scoreEvent) {
      emitTelemetry('score', room.code, {
        grade: scoreEvent.grade,
        points: scoreEvent.points,
        combo: scoreEvent.combo,
      });
    }

    if (rawGameTimeMs >= room.gameDurationMs) {
      room.phase = 'results';
    }

    this.recordRanks(room);
    return { room: this.publish(room), scoreEvent };
  }

  endGame(code: string): GameResults | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = 'results';
    room.teamScores = recomputeTeamScores(room.players);
    const awards = computeAwards(room.players);
    this.checkComeback(room);
    this.commit(room);
    pulsePartyPace('results', `room ${code}`);
    presentAvFeedback('results_sting', 'Round results ready');
    return {
      teamScore: room.teamScore,
      crowdMeter: room.crowdMeter,
      teamScores: { ...room.teamScores },
      winningTeam: winningTeam(room.teamScores),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        teamId: p.teamId,
        score: p.score,
        accuracy: p.accuracy,
        maxStreak: p.maxStreak,
      })),
      awards,
    };
  }

  /** Rematch: keep seats/tokens, clear scores, return to lobby for next song. */
  rematch(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || (room.phase !== 'results' && room.phase !== 'lobby')) return null;
    room.rematchRound += 1;
    room.phase = 'lobby';
    pulsePartyPace('rematch', `round ${room.rematchRound}`);
    presentAvFeedback('rematch_ready', 'Rematch lobby ready');
    room.countdown = null;
    room.gameStartTime = null;
    room.pastedLinkUrl = null;
    room.linkResolveResult = null;
    room.calibrationOffsetMs = 0;
    room.calibrationSamples = [];
    room.selectedSongId = null;
    room.beatmap = null;
    for (const p of room.players) {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.accuracy = 0;
      p.combo = 1;
      p.ready = false;
    }
    for (const a of room.audience) {
      a.influenceCount = 0;
      a.lastInfluenceAt = null;
    }
    room.teamScore = 0;
    room.teamScores = { ...EMPTY_TEAM_SCORES };
    room.crowdMeter = 50;
    room.hypeCooldowns.clear();
    room.scoredTargets.clear();
    room.joinQr = buildRoomJoinQrPayload({
      code: room.code,
      origin: room.publicOrigin,
      expiresAt: room.expiresAt,
    });
    emitTelemetry('rematch', room.code, {
      rematchRound: room.rematchRound,
      gameMode: room.gameMode,
    });
    return this.publish(room);
  }

  /** Alias for rematch — host "Next song" control. */
  nextRound(code: string): RoomState | null {
    return this.rematch(code);
  }

  /** @deprecated Prefer rematch() — keeps seats; still supported for host UI. */
  replay(code: string): RoomState | null {
    return this.rematch(code);
  }

  private noteModeRound(room: InternalRoom): void {
    this.achievements.setFlag(`mode:${room.gameMode}`);
    const modes = this.sessionModes.get(room.code) ?? new Set<GameModeId>();
    modes.add(room.gameMode);
    this.sessionModes.set(room.code, modes);
    if (modes.size >= 5) this.achievements.setFlag('five_mode_session');
    if (room.gameMode === 'BandRoles') {
      const roles = new Set(room.players.map((p) => p.role).filter(Boolean));
      if (roles.size >= 2) this.achievements.setFlag('band_cooperation');
    }
  }

  private recordRanks(room: InternalRoom): void {
    if (room.players.length < 2) return;
    const floors = this.rankFloor.get(room.code) ?? new Map<string, number>();
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    sorted.forEach((player, idx) => {
      const rank = idx + 1;
      const prev = floors.get(player.id) ?? 0;
      if (rank > prev) floors.set(player.id, rank);
    });
    this.rankFloor.set(room.code, floors);
  }

  private checkComeback(room: InternalRoom): void {
    if (room.players.length < 2) return;
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const leader = sorted[0];
    if (!leader) return;
    const worst = this.rankFloor.get(room.code)?.get(leader.id) ?? 1;
    if (worst >= room.players.length) this.achievements.reportEvent('comeback', 1);
  }

  getBeatmap(code: string): Beatmap | null {
    const room = this.getRoom(code);
    return room?.beatmap ?? null;
  }

  getPlayerIdForSocket(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  getAudienceIdForSocket(socketId: string): string | undefined {
    return this.socketToAudience.get(socketId);
  }

  resetToLobby(code: string, phase: RoomPhase = 'lobby'): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = phase;
    return this.publish(room);
  }
}

function assertCanStart(room: InternalRoom): boolean {
  const connectedPlayers = room.players.filter((player) => player.connected);
  return (
    connectedPlayers.length > 0 &&
    connectedPlayers.every((player) => player.ready && player.role !== null)
  );
}

export const roomManager = new RoomManager();

// Re-export for tests that assert combo helper wiring
export { comboFromStreak };
