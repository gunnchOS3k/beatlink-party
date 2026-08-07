import { Server as SocketServer } from 'socket.io';
import type { Server } from 'http';
import type {
  AudienceInfluenceType,
  LinkResolveResult,
  PlayerInputEvent,
} from '@beatlink/shared';
import { roomManager } from '../rooms/RoomManager.js';
import { resolveLink } from '../music/linkResolver.js';

function requireHost(
  code: string,
  socketId: string,
  hostToken: string | undefined,
): boolean {
  return roomManager.authorizeHost(code, socketId, hostToken);
}

export function setupRealtime(httpServer: Server, corsOrigin: string) {
  const io = new SocketServer(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('room.create', (cb?: (room: { code: string; hostToken?: string }) => void) => {
      const room = roomManager.createRoom(socket.id);
      socket.join(room.code);
      cb?.({ code: room.code, hostToken: room.hostToken });
      socket.emit('room.state', roomManager.stripInternal(roomManager.getRoom(room.code)!));
      socket.emit('room.host_token', { code: room.code, hostToken: room.hostToken });
    });

    socket.on(
      'room.host_reconnect',
      (
        data: { code: string; hostToken: string },
        cb?: (result: { ok: boolean; error?: string; room?: unknown }) => void,
      ) => {
        const code = data.code.toUpperCase();
        const room = roomManager.reconnectHost(code, data.hostToken, socket.id);
        if (!room) {
          cb?.({ ok: false, error: 'Host auth failed' });
          return;
        }
        socket.join(code);
        socket.emit('room.host_token', { code, hostToken: data.hostToken });
        io.to(code).emit('room.state', room);
        cb?.({ ok: true, room });
      },
    );

    socket.on(
      'room.claim_host',
      (
        data: { code: string; playerId: string; playerToken: string },
        cb?: (result: { ok: boolean; error?: string; room?: unknown; hostToken?: string }) => void,
      ) => {
        const code = data.code.toUpperCase();
        const result = roomManager.claimHostAsPlayer(
          code,
          data.playerId,
          data.playerToken,
          socket.id,
        );
        if (!result) {
          cb?.({ ok: false, error: 'Unable to claim host' });
          return;
        }
        socket.join(code);
        io.to(code).emit('room.host_migrated', {
          room: result.room,
          newHostPlayerId: data.playerId,
        });
        io.to(code).emit('room.state', result.room);
        cb?.({ ok: true, room: result.room, hostToken: result.hostToken });
      },
    );

    socket.on('room.subscribe', (data: { code: string; hostToken?: string }) => {
      const code = data.code.toUpperCase();
      const room = roomManager.getRoom(code);
      if (!room) {
        socket.emit('room.error', { error: 'Room not found' });
        return;
      }
      if (data.hostToken) {
        roomManager.authorizeHost(code, socket.id, data.hostToken);
      }
      socket.join(code);
      socket.emit('room.state', roomManager.stripInternal(room));
    });

    socket.on(
      'room.join',
      (
        data: { code: string; name: string; playerId?: string; playerToken?: string },
        cb?: (result: {
          ok: boolean;
          error?: string;
          player?: unknown;
          room?: unknown;
          playerToken?: string;
        }) => void,
      ) => {
        const code = data.code.toUpperCase();
        if (data.playerId && data.playerToken) {
          const player = roomManager.reconnectPlayer(
            code,
            data.playerId,
            data.playerToken,
            socket.id,
          );
          if (player) {
            socket.join(code);
            const room = roomManager.getRoom(code);
            io.to(code).emit('room.player_joined', {
              player,
              room: roomManager.stripInternal(room!),
            });
            cb?.({
              ok: true,
              player,
              room: roomManager.stripInternal(room!),
              playerToken: data.playerToken,
            });
            return;
          }
        }
        const result = roomManager.joinRoom(code, socket.id, data.name);
        if (!result) {
          cb?.({ ok: false, error: 'Room not found or full' });
          return;
        }
        socket.join(code);
        io.to(code).emit('room.player_joined', { player: result.player, room: result.room });
        cb?.({
          ok: true,
          player: result.player,
          room: result.room,
          playerToken: result.playerToken,
        });
      },
    );

    socket.on(
      'room.join_audience',
      (
        data: {
          code: string;
          name: string;
          audienceId?: string;
          audienceToken?: string;
        },
        cb?: (result: {
          ok: boolean;
          error?: string;
          audience?: unknown;
          room?: unknown;
          audienceToken?: string;
        }) => void,
      ) => {
        const code = data.code.toUpperCase();
        if (data.audienceId && data.audienceToken) {
          const audience = roomManager.reconnectAudience(
            code,
            data.audienceId,
            data.audienceToken,
            socket.id,
          );
          if (audience) {
            socket.join(code);
            const room = roomManager.getRoom(code)!;
            io.to(code).emit('room.state', roomManager.stripInternal(room));
            cb?.({
              ok: true,
              audience,
              room: roomManager.stripInternal(room),
              audienceToken: data.audienceToken,
            });
            return;
          }
        }
        const result = roomManager.joinAudience(code, socket.id, data.name);
        if (!result) {
          cb?.({ ok: false, error: 'Room not found or audience full' });
          return;
        }
        socket.join(code);
        io.to(code).emit('room.state', result.room);
        cb?.({
          ok: true,
          audience: result.audience,
          room: result.room,
          audienceToken: result.audienceToken,
        });
      },
    );

    socket.on(
      'audience.influence',
      (
        data: {
          code: string;
          audienceId: string;
          type: AudienceInfluenceType;
          choice?: string;
        },
        cb?: (result: { ok: boolean; error?: string; event?: unknown; room?: unknown }) => void,
      ) => {
        const code = data.code.toUpperCase();
        if (!roomManager.ownsAudience(code, socket.id, data.audienceId)) {
          cb?.({ ok: false, error: 'Not your audience seat' });
          return;
        }
        const result = roomManager.processAudienceInfluence(
          code,
          data.audienceId,
          data.type,
          data.choice,
        );
        if (!result) {
          cb?.({ ok: false, error: 'Influence rejected' });
          return;
        }
        io.to(code).emit('audience.influence', { room: result.room, event: result.event });
        io.to(code).emit('room.state', result.room);
        cb?.({ ok: true, event: result.event, room: result.room });
      },
    );

    socket.on(
      'audience.mute',
      (data: { code: string; audienceId: string; muted: boolean; hostToken?: string }) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) return;
        const room = roomManager.setAudienceMuted(code, data.audienceId, data.muted);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on(
      'audience.sandbox',
      (data: { code: string; audienceId: string; sandboxed: boolean; hostToken?: string }) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) return;
        const room = roomManager.setAudienceSandboxed(code, data.audienceId, data.sandboxed);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on('room.leave', () => {
      const room = roomManager.leaveRoom(socket.id);
      if (room) {
        socket.leave(room.code);
        io.to(room.code).emit('room.player_left', { room });
      }
    });

    socket.on(
      'room.set_role',
      (data: { code: string; playerId: string; role: string }) => {
        const code = data.code.toUpperCase();
        if (!roomManager.ownsPlayer(code, socket.id, data.playerId)) return;
        const room = roomManager.setRole(code, data.playerId, data.role as never);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on('room.ready', (data: { code: string; playerId: string; ready: boolean }) => {
      const code = data.code.toUpperCase();
      if (!roomManager.ownsPlayer(code, socket.id, data.playerId)) return;
      const room = roomManager.setReady(code, data.playerId, data.ready);
      if (room) io.to(code).emit('room.ready_changed', { room, playerId: data.playerId });
    });

    socket.on(
      'room.select_song',
      (data: { code: string; songId: string; hostToken?: string }) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) return;
        const room = roomManager.selectSong(code, data.songId);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on(
      'room.resolve_link',
      async (
        data: { code: string; url: string; hostToken?: string },
        cb?: (result: {
          ok: boolean;
          error?: string;
          room?: unknown;
          resolve?: LinkResolveResult;
        }) => void,
      ) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) {
          cb?.({ ok: false, error: 'Host auth required' });
          return;
        }
        try {
          const resolve = await resolveLink(data.url);
          const room = roomManager.setResolvedLink(code, data.url, resolve);
          if (!room) {
            cb?.({ ok: false, error: 'Unable to store link on room' });
            return;
          }
          io.to(code).emit('room.state', room);
          cb?.({ ok: true, room, resolve });
        } catch (err) {
          cb?.({
            ok: false,
            error: err instanceof Error ? err.message : 'Link resolve failed',
          });
        }
      },
    );

    socket.on(
      'room.set_resolved_link',
      (data: { code: string; url: string; result: LinkResolveResult; hostToken?: string }) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) return;
        const room = roomManager.setResolvedLink(code, data.url, data.result);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on('game.start_calibration', (data: { code: string; hostToken?: string }) => {
      const code = data.code.toUpperCase();
      if (!requireHost(code, socket.id, data.hostToken)) return;
      const room = roomManager.startCalibration(code);
      if (room) io.to(code).emit('room.state', room);
    });

    socket.on(
      'game.submit_calibration',
      (data: { code: string; offsetMs: number; hostToken?: string }) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) return;
        const room = roomManager.submitCalibration(code, data.offsetMs);
        if (room) io.to(code).emit('room.state', room);
      },
    );

    socket.on('game.start_countdown', (data: { code: string; hostToken?: string }) => {
      const code = data.code.toUpperCase();
      if (!requireHost(code, socket.id, data.hostToken)) return;
      const room = roomManager.startCountdown(code);
      if (!room) return;
      io.to(code).emit('game.countdown', { room, countdown: room.countdown });
      const interval = setInterval(() => {
        const updated = roomManager.tickCountdown(code);
        if (!updated) {
          clearInterval(interval);
          return;
        }
        if (updated.phase === 'playing') {
          clearInterval(interval);
          const beatmap = roomManager.getBeatmap(code);
          io.to(code).emit('game.started', {
            room: updated,
            beatmap,
            startTime: Date.now(),
          });
          const duration = updated.gameDurationMs;
          setTimeout(() => {
            const results = roomManager.endGame(code);
            const finalRoom = roomManager.getRoom(code);
            io.to(code).emit('game.ended', {
              room: roomManager.stripInternal(finalRoom!),
              results,
            });
          }, duration + 500);
        } else {
          io.to(code).emit('game.countdown', {
            room: updated,
            countdown: updated.countdown,
          });
        }
      }, 1000);
    });

    socket.on('game.input', (data: { code: string; input: PlayerInputEvent }) => {
      const code = data.code.toUpperCase();
      if (!roomManager.ownsPlayer(code, socket.id, data.input.playerId)) return;
      const result = roomManager.processInput(code, data.input);
      if (!result) return;
      io.to(code).emit('game.score_update', {
        room: result.room,
        scoreEvent: result.scoreEvent,
      });
      if (result.room.phase === 'results') {
        const results = roomManager.endGame(code);
        io.to(code).emit('game.ended', { room: result.room, results });
      }
    });

    socket.on('game.replay', (data: { code: string; hostToken?: string }) => {
      const code = data.code.toUpperCase();
      if (!requireHost(code, socket.id, data.hostToken)) return;
      const room = roomManager.rematch(code);
      if (room) io.to(code).emit('room.state', room);
    });

    socket.on('game.rematch', (data: { code: string; hostToken?: string }) => {
      const code = data.code.toUpperCase();
      if (!requireHost(code, socket.id, data.hostToken)) return;
      const room = roomManager.rematch(code);
      if (room) io.to(code).emit('room.state', room);
    });

    socket.on(
      'room.end',
      (data: { code: string; hostToken?: string }, cb?: (result: { ok: boolean; error?: string }) => void) => {
        const code = data.code.toUpperCase();
        if (!requireHost(code, socket.id, data.hostToken)) {
          cb?.({ ok: false, error: 'Host auth required' });
          return;
        }
        const room = roomManager.endRoom(code, socket.id);
        if (!room) {
          cb?.({ ok: false, error: 'Unable to end room (host only / not found)' });
          return;
        }
        io.to(code).emit('room.ended', { room });
        io.in(code).socketsLeave(code);
        cb?.({ ok: true });
      },
    );

    socket.on('game.tick', (data: { code: string }) => {
      const code = data.code.toUpperCase();
      const gameTimeMs = roomManager.getGameTimeMs(code);
      const calibratedMs = roomManager.getCalibratedGameTimeMs(code);
      const room = roomManager.getRoom(code);
      if (room) {
        socket.emit('game.tick', {
          gameTimeMs,
          calibratedMs,
          room: roomManager.stripInternal(room),
        });
      }
    });

    socket.on('disconnect', () => {
      const migration = roomManager.migrateHostOnDisconnect(socket.id);
      if (migration) {
        io.to(migration.room.code).emit('room.host_migrated', {
          room: migration.room,
          previousHostId: migration.previousHostId,
          newHostPlayerId: migration.newHostPlayerId,
        });
        io.to(migration.room.code).emit('room.state', migration.room);
      }
      const room = roomManager.leaveRoom(socket.id);
      if (room) io.to(room.code).emit('room.player_left', { room });
    });
  });

  return io;
}
