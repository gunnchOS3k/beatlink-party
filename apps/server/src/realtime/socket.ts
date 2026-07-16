import { Server as SocketServer } from 'socket.io';
import type { Server } from 'http';
import type { LinkResolveResult, PlayerInputEvent } from '@beatlink/shared';
import { roomManager } from '../rooms/RoomManager.js';
import { resolveLink } from '../music/linkResolver.js';

export function setupRealtime(httpServer: Server, corsOrigin: string) {
  const io = new SocketServer(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('room.create', (cb?: (room: { code: string }) => void) => {
      const room = roomManager.createRoom(socket.id);
      socket.join(room.code);
      cb?.({ code: room.code });
      socket.emit('room.state', room);
    });

    socket.on('room.subscribe', (data: { code: string }) => {
      const code = data.code.toUpperCase();
      const room = roomManager.getRoom(code);
      if (!room) {
        socket.emit('room.error', { error: 'Room not found' });
        return;
      }
      socket.join(code);
      socket.emit('room.state', roomManager.stripInternal(room));
    });

    socket.on(
      'room.join',
      (
        data: { code: string; name: string; playerId?: string; playerToken?: string },
        cb?: (result: { ok: boolean; error?: string; player?: unknown; room?: unknown; playerToken?: string }) => void,
      ) => {
        const code = data.code.toUpperCase();
        if (data.playerId && data.playerToken) {
          const player = roomManager.reconnectPlayer(code, data.playerId, data.playerToken, socket.id);
          if (player) {
            socket.join(code);
            const room = roomManager.getRoom(code);
            io.to(code).emit('room.player_joined', { player, room: roomManager.stripInternal(room!) });
            cb?.({ ok: true, player, room: roomManager.stripInternal(room!), playerToken: data.playerToken });
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
        cb?.({ ok: true, player: result.player, room: result.room, playerToken: result.playerToken });
      },
    );

    socket.on('room.leave', () => {
      const room = roomManager.leaveRoom(socket.id);
      if (room) {
        socket.leave(room.code);
        io.to(room.code).emit('room.player_left', { room });
      }
    });

    socket.on('room.set_role', (data: { code: string; playerId: string; role: string }) => {
      const room = roomManager.setRole(data.code, data.playerId, data.role as never);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on('room.ready', (data: { code: string; playerId: string; ready: boolean }) => {
      const room = roomManager.setReady(data.code, data.playerId, data.ready);
      if (room) io.to(data.code).emit('room.ready_changed', { room, playerId: data.playerId });
    });

    socket.on('room.select_song', (data: { code: string; songId: string }) => {
      const room = roomManager.selectSong(data.code, data.songId);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on(
      'room.resolve_link',
      async (
        data: { code: string; url: string },
        cb?: (result: { ok: boolean; error?: string; room?: unknown; resolve?: LinkResolveResult }) => void,
      ) => {
        try {
          const resolve = await resolveLink(data.url);
          const room = roomManager.setResolvedLink(data.code, data.url, resolve);
          if (!room) {
            cb?.({ ok: false, error: 'Unable to store link on room' });
            return;
          }
          io.to(data.code).emit('room.state', room);
          cb?.({ ok: true, room, resolve });
        } catch (err) {
          cb?.({
            ok: false,
            error: err instanceof Error ? err.message : 'Link resolve failed',
          });
        }
      },
    );

    socket.on('room.set_resolved_link', (data: { code: string; url: string; result: LinkResolveResult }) => {
      const room = roomManager.setResolvedLink(data.code, data.url, data.result);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on('game.start_calibration', (data: { code: string }) => {
      const room = roomManager.startCalibration(data.code);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on('game.submit_calibration', (data: { code: string; offsetMs: number }) => {
      const room = roomManager.submitCalibration(data.code, data.offsetMs);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on('game.start_countdown', (data: { code: string }) => {
      const room = roomManager.startCountdown(data.code);
      if (!room) return;
      io.to(data.code).emit('game.countdown', { room, countdown: room.countdown });
      const interval = setInterval(() => {
        const updated = roomManager.tickCountdown(data.code);
        if (!updated) {
          clearInterval(interval);
          return;
        }
        if (updated.phase === 'playing') {
          clearInterval(interval);
          const beatmap = roomManager.getBeatmap(data.code);
          io.to(data.code).emit('game.started', { room: updated, beatmap, startTime: Date.now() });
          const duration = updated.gameDurationMs;
          setTimeout(() => {
            const results = roomManager.endGame(data.code);
            const finalRoom = roomManager.getRoom(data.code);
            io.to(data.code).emit('game.ended', {
              room: roomManager.stripInternal(finalRoom!),
              results,
            });
          }, duration + 500);
        } else {
          io.to(data.code).emit('game.countdown', { room: updated, countdown: updated.countdown });
        }
      }, 1000);
    });

    socket.on('game.input', (data: { code: string; input: PlayerInputEvent }) => {
      const result = roomManager.processInput(data.code, data.input);
      if (!result) return;
      io.to(data.code).emit('game.score_update', {
        room: result.room,
        scoreEvent: result.scoreEvent,
      });
      if (result.room.phase === 'results') {
        const results = roomManager.endGame(data.code);
        io.to(data.code).emit('game.ended', { room: result.room, results });
      }
    });

    socket.on('game.replay', (data: { code: string }) => {
      const room = roomManager.replay(data.code);
      if (room) io.to(data.code).emit('room.state', room);
    });

    socket.on('room.end', (data: { code: string }, cb?: (result: { ok: boolean; error?: string }) => void) => {
      const room = roomManager.endRoom(data.code, socket.id);
      if (!room) {
        cb?.({ ok: false, error: 'Unable to end room (host only / not found)' });
        return;
      }
      io.to(data.code).emit('room.ended', { room });
      io.in(data.code).socketsLeave(data.code);
      cb?.({ ok: true });
    });

    socket.on('game.tick', (data: { code: string }) => {
      const gameTimeMs = roomManager.getGameTimeMs(data.code);
      const room = roomManager.getRoom(data.code);
      if (room) {
        socket.emit('game.tick', { gameTimeMs, room: roomManager.stripInternal(room) });
      }
    });

    socket.on('disconnect', () => {
      const room = roomManager.leaveRoom(socket.id);
      if (room) io.to(room.code).emit('room.player_left', { room });
    });
  });

  return io;
}
