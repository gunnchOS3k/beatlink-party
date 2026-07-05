import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Beatmap, GameResults, RoomState, ScoreEvent } from '@beatlink/shared';
import { WS_URL } from './api';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(WS_URL, { transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

export function useSocket(): { socket: Socket; connected: boolean } {
  const socketRef = useRef(getSocket());
  const [connected, setConnected] = useState(socketRef.current.connected);

  useEffect(() => {
    const s = socketRef.current;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    setConnected(s.connected);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected };
}

export function useRoomEvents(
  code: string | undefined,
  handlers: {
    onState?: (room: RoomState) => void;
    onCountdown?: (room: RoomState, countdown: number | null) => void;
    onStarted?: (room: RoomState, beatmap: Beatmap, startTime: number) => void;
    onScore?: (room: RoomState, scoreEvent: ScoreEvent | null) => void;
    onEnded?: (room: RoomState, results: GameResults) => void;
    onPlayerJoined?: (room: RoomState) => void;
    onPlayerLeft?: (room: RoomState) => void;
  },
) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!code) return;

    const h = handlers;
    const onState = (room: RoomState) => h.onState?.(room);
    const onCountdown = ({ room, countdown }: { room: RoomState; countdown: number | null }) =>
      h.onCountdown?.(room, countdown);
    const onStarted = ({
      room,
      beatmap,
      startTime,
    }: {
      room: RoomState;
      beatmap: Beatmap;
      startTime: number;
    }) => h.onStarted?.(room, beatmap, startTime);
    const onScore = ({
      room,
      scoreEvent,
    }: {
      room: RoomState;
      scoreEvent: ScoreEvent | null;
    }) => h.onScore?.(room, scoreEvent);
    const onEnded = ({ room, results }: { room: RoomState; results: GameResults }) =>
      h.onEnded?.(room, results);
    const onPlayerJoined = ({ room }: { room: RoomState }) => h.onPlayerJoined?.(room);
    const onPlayerLeft = ({ room }: { room: RoomState }) => h.onPlayerLeft?.(room);

    socket.on('room.state', onState);
    socket.on('game.countdown', onCountdown);
    socket.on('game.started', onStarted);
    socket.on('game.score_update', onScore);
    socket.on('game.ended', onEnded);
    socket.on('room.player_joined', onPlayerJoined);
    socket.on('room.player_left', onPlayerLeft);
    socket.on('room.ready_changed', ({ room }: { room: RoomState }) => h.onState?.(room));

    return () => {
      socket.off('room.state', onState);
      socket.off('game.countdown', onCountdown);
      socket.off('game.started', onStarted);
      socket.off('game.score_update', onScore);
      socket.off('game.ended', onEnded);
      socket.off('room.player_joined', onPlayerJoined);
      socket.off('room.player_left', onPlayerLeft);
    };
  }, [code, socket, handlers]);
}

export function useCreateRoom() {
  const { socket } = useSocket();
  return useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        socket.emit('room.create', (data: { code: string }) => {
          if (data?.code) resolve(data.code);
          else reject(new Error('Failed to create room'));
        });
      }),
    [socket],
  );
}

export function useJoinRoom() {
  const { socket } = useSocket();
  return useCallback(
    (code: string, name: string, playerId?: string) =>
      new Promise<{ player: import('@beatlink/shared').Player; room: RoomState }>(
        (resolve, reject) => {
          socket.emit(
            'room.join',
            { code, name, playerId },
            (result: {
              ok: boolean;
              error?: string;
              player?: import('@beatlink/shared').Player;
              room?: RoomState;
            }) => {
              if (result.ok && result.player && result.room) {
                resolve({ player: result.player, room: result.room });
              } else {
                reject(new Error(result.error ?? 'Join failed'));
              }
            },
          );
        },
      ),
    [socket],
  );
}
