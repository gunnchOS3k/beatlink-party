import { randomUUID } from 'node:crypto';
import type {
  Beatmap,
  GameResults,
  Player,
  PlayerInputEvent,
  RoomPhase,
  RoomState,
  ScoreEvent,
} from '@beatlink/shared';
import {
  PLAYER_COLORS,
  generateRoomCode,
  sanitizePlayerName,
  HYPE_COOLDOWN_MS,
} from '@beatlink/shared';
import {
  assertTransition,
  computeAwards,
  scoreBeatTap,
  scoreHypeAction,
  scoreVocalPhrase,
  updatePlayerStats,
} from '@beatlink/game-engine';
import { getBeatmapForSong } from '../beatmaps/store.js';

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

interface InternalRoom extends RoomState {
  beatmap: Beatmap | null;
  hypeCooldowns: Map<string, number>;
}

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private playerToRoom = new Map<string, string>();
  private socketToPlayer = new Map<string, string>();

  createRoom(hostSocketId: string): RoomState {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    const now = Date.now();
    const room: InternalRoom = {
      code,
      phase: 'lobby',
      hostId: hostSocketId,
      players: [],
      selectedSongId: null,
      countdown: null,
      gameStartTime: null,
      gameDurationMs: 45000,
      teamScore: 0,
      crowdMeter: 50,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      beatmap: null,
      hypeCooldowns: new Map(),
    };
    this.rooms.set(code, room);
    return this.stripInternal(room);
  }

  getRoom(code: string): InternalRoom | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    if (Date.now() > room.expiresAt) {
      this.rooms.delete(code.toUpperCase());
      return null;
    }
    return room;
  }

  stripInternal(room: InternalRoom): RoomState {
    const { beatmap: _beatmap, hypeCooldowns: _hypeCooldowns, ...state } = room;
    void _beatmap;
    void _hypeCooldowns;
    return state;
  }

  joinRoom(code: string, socketId: string, name: string): { room: RoomState; player: Player } | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (room.phase !== 'lobby' && room.phase !== 'song_select') return null;

    const existingPlayerId = this.socketToPlayer.get(socketId);
    if (existingPlayerId) {
      const player = room.players.find((p) => p.id === existingPlayerId);
      if (player) {
        player.connected = true;
        return { room: this.stripInternal(room), player };
      }
    }

    if (room.players.length >= 6) return null;

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
      color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
    };
    room.players.push(player);
    this.playerToRoom.set(player.id, room.code);
    this.socketToPlayer.set(socketId, player.id);
    return { room: this.stripInternal(room), player };
  }

  reconnectPlayer(code: string, playerId: string, socketId: string): Player | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.connected = true;
    this.socketToPlayer.set(socketId, player.id);
    this.playerToRoom.set(player.id, room.code);
    return player;
  }

  leaveRoom(socketId: string): RoomState | null {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return null;
    const code = this.playerToRoom.get(playerId);
    if (!code) return null;
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
    this.socketToPlayer.delete(socketId);
    return this.stripInternal(room);
  }

  setRole(code: string, playerId: string, role: Player['role']): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.role = role;
    return this.stripInternal(room);
  }

  setReady(code: string, playerId: string, ready: boolean): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.ready = ready;
    return this.stripInternal(room);
  }

  selectSong(code: string, songId: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.selectedSongId = songId;
    room.beatmap = getBeatmapForSong(songId);
    room.gameDurationMs = room.beatmap?.durationMs ?? 45000;
    room.phase = 'song_select';
    return this.stripInternal(room);
  }

  startCountdown(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room || !room.selectedSongId || !room.beatmap) return null;
    assertTransition(room.phase, 'countdown');
    room.phase = 'countdown';
    room.countdown = 3;
    for (const p of room.players) {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.accuracy = 0;
    }
    room.teamScore = 0;
    room.crowdMeter = 50;
    room.hypeCooldowns.clear();
    return this.stripInternal(room);
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
    }
    return this.stripInternal(room);
  }

  getGameTimeMs(code: string): number {
    const room = this.getRoom(code);
    if (!room || !room.gameStartTime) return 0;
    return Date.now() - room.gameStartTime;
  }

  processInput(code: string, input: PlayerInputEvent): { room: RoomState; scoreEvent: ScoreEvent | null } | null {
    const room = this.getRoom(code);
    if (!room || room.phase !== 'playing' || !room.beatmap) return null;
    const player = room.players.find((p) => p.id === input.playerId);
    if (!player) return null;

    const gameTimeMs = this.getGameTimeMs(code);
    let scoreEvent: ScoreEvent | null = null;

    if (player.role === 'beat_tapper' && input.type === 'tap') {
      const note = room.beatmap.notes.find(
        (n) => n.id === input.noteId || Math.abs(n.timeMs - gameTimeMs) < 150,
      );
      if (note) {
        const result = scoreBeatTap(input, note.timeMs, gameTimeMs, player.streak);
        Object.assign(player, updatePlayerStats(player, result));
        room.teamScore += result.points;
        room.crowdMeter = Math.min(100, Math.max(0, room.crowdMeter + result.crowdBoost));
        scoreEvent = {
          playerId: player.id,
          grade: result.grade,
          points: result.points,
          streak: result.streak,
          message: result.message,
        };
      }
    } else if (player.role === 'vocalist' && input.type === 'vocal_phrase') {
      const prompt = room.beatmap.vocalPrompts.find(
        (v) => v.id === input.promptId || Math.abs(v.timeMs - gameTimeMs) < 500,
      );
      if (prompt) {
        const result = scoreVocalPhrase(
          input,
          prompt.timeMs,
          prompt.durationMs,
          gameTimeMs,
          player.streak,
        );
        Object.assign(player, updatePlayerStats(player, result));
        room.teamScore += result.points;
        room.crowdMeter = Math.min(100, room.crowdMeter + result.crowdBoost);
        scoreEvent = {
          playerId: player.id,
          grade: result.grade,
          points: result.points,
          streak: result.streak,
          message: result.message,
        };
      }
    } else if (player.role === 'hype_captain' && input.type.startsWith('hype_')) {
      const lastHype = room.hypeCooldowns.get(player.id) ?? 0;
      if (Date.now() - lastHype < HYPE_COOLDOWN_MS) {
        return { room: this.stripInternal(room), scoreEvent: null };
      }
      const event = room.beatmap.hypeEvents.find((e) => Math.abs(e.timeMs - gameTimeMs) < 300);
      const targetTime = event?.timeMs ?? gameTimeMs;
      const result = scoreHypeAction(gameTimeMs, targetTime, player.streak);
      Object.assign(player, updatePlayerStats(player, result));
      room.teamScore += result.points;
      room.crowdMeter = Math.min(100, room.crowdMeter + result.crowdBoost);
      room.hypeCooldowns.set(player.id, Date.now());
      scoreEvent = {
        playerId: player.id,
        grade: result.grade,
        points: result.points,
        streak: result.streak,
        message: result.message,
      };
    }

    if (gameTimeMs >= room.gameDurationMs) {
      room.phase = 'results';
    }

    return { room: this.stripInternal(room), scoreEvent };
  }

  endGame(code: string): GameResults | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = 'results';
    const awards = computeAwards(room.players);
    return {
      teamScore: room.teamScore,
      crowdMeter: room.crowdMeter,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        score: p.score,
        accuracy: p.accuracy,
        maxStreak: p.maxStreak,
      })),
      awards,
    };
  }

  replay(code: string): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = 'lobby';
    room.countdown = null;
    room.gameStartTime = null;
    for (const p of room.players) {
      p.score = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.accuracy = 0;
      p.ready = false;
    }
    room.teamScore = 0;
    room.crowdMeter = 50;
    return this.stripInternal(room);
  }

  getBeatmap(code: string): Beatmap | null {
    const room = this.getRoom(code);
    return room?.beatmap ?? null;
  }

  getPlayerIdForSocket(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  resetToLobby(code: string, phase: RoomPhase = 'lobby'): RoomState | null {
    const room = this.getRoom(code);
    if (!room) return null;
    room.phase = phase;
    return this.stripInternal(room);
  }
}

export const roomManager = new RoomManager();
