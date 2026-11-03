import { afterEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { io as client, type Socket } from 'socket.io-client';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { roomManager } from '../apps/server/src/rooms/RoomManager.js';
import type { PlayerInputEvent, ScoreEvent } from '../packages/shared/src/types.js';

let server: ReturnType<typeof createServer> | null = null;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const socket of sockets) socket.close(); sockets.length = 0;
  if (server) { await new Promise<void>((resolve) => server!.close(() => resolve())); server = null; }
});
function ack<T>(socket: Socket, event: string, data: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 3000);
    socket.emit(event, data, (value: T) => { clearTimeout(timer); resolve(value); });
  });
}
function connect(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = client(url, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 3000 });
    sockets.push(socket); socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
}
function score(host: Socket, sender: Socket, code: string, input: PlayerInputEvent): Promise<ScoreEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { host.off('game.score_update', handler); reject(new Error('score timeout')); }, 3000);
    const handler = (data: { scoreEvent: ScoreEvent | null }) => {
      if (data.scoreEvent?.playerId !== input.playerId) return;
      clearTimeout(timer); host.off('game.score_update', handler); resolve(data.scoreEvent);
    };
    host.on('game.score_update', handler); sender.emit('game.input', { code, input });
  });
}

it('real sockets enforce player identity, then award one karaoke pitch contribution and keep both timing scores', async () => {
  server = createServer(); setupRealtime(server, '*');
  await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No loopback port');
  const url = `http://127.0.0.1:${address.port}`;
  const host = await connect(url); const singerA = await connect(url); const singerB = await connect(url); const audience = await connect(url);
  const opened = await ack<{ code: string; hostToken: string }>(host, 'room.create', {});
  const a = await ack<{ player: { id: string } }>(singerA, 'room.join', { code: opened.code, name: 'Singer A' });
  const b = await ack<{ player: { id: string } }>(singerB, 'room.join', { code: opened.code, name: 'Singer B' });
  await ack(audience, 'room.join_audience', { code: opened.code, name: 'Audience' });
  // Only chart timing/lobby preparation is controlled here; score packets travel
  // through the actual Socket.IO identity guard and production scoring path.
  for (const member of [a, b]) { roomManager.setRole(opened.code, member.player.id, 'vocalist'); roomManager.setReady(opened.code, member.player.id, true); }
  roomManager.setGameMode(opened.code, 'KaraokePerformance'); roomManager.selectSong(opened.code, 'demo-neon-groove');
  roomManager.startCalibration(opened.code); roomManager.submitCalibration(opened.code, 0); roomManager.startCountdown(opened.code);
  roomManager.tickCountdown(opened.code); roomManager.tickCountdown(opened.code); roomManager.tickCountdown(opened.code);
  const room = roomManager.getRoom(opened.code)!; const prompt = room.beatmap!.vocalPrompts[0]!;
  const input = (id: string): PlayerInputEvent => ({ playerId: id, type: 'vocal_phrase', clientTimeMs: Date.now(), promptId: prompt.id,
    pitchAnalysisActive: true, pitchMatch: 1, voicedCoverage: 1, phraseFrames: 20, event_id: `socket-pitch:${id}` });
  room.gameStartTime = Date.now() - prompt.timeMs - prompt.durationMs / 2;
  audience.emit('game.input', { code: opened.code, input: input(a.player.id) });
  // Same-socket ack is a processing barrier after the spoofed input.
  await ack(audience, 'room.join_audience', { code: opened.code, name: 'Audience' });
  expect(roomManager.getRoom(opened.code)?.players.every((player) => player.score === 0)).toBe(true);
  room.gameStartTime = Date.now() - prompt.timeMs - prompt.durationMs / 2;
  const first = await score(host, singerA, opened.code, input(a.player.id));
  room.gameStartTime = Date.now() - prompt.timeMs - prompt.durationMs / 2;
  const second = await score(host, singerB, opened.code, input(b.player.id));
  expect(first.message).toBe('Phrase + pitch hit');
  expect(second.message).toBe('Phrase hit (timing; pitch already counted)');
  expect(second.points).toBeGreaterThan(0); expect(first.points).toBe(second.points + 40);
  roomManager.shutdownRoom(opened.code, { hostToken: opened.hostToken, reason: 'host_end' });
});
