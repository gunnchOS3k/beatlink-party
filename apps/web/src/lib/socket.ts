import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  AudienceInfluenceEvent,
  AudienceMember,
  Beatmap,
  GameResults,
  RoomState,
  ScoreEvent,
} from '@beatlink/shared';
import { WS_URL } from './api';

const HOST_TOKEN_KEY = 'beatlink_host';

let sharedSocket: Socket | null = null;

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(WS_URL, { transports: ['websocket', 'polling'] });
  }
  return sharedSocket;
}

export function storeHostToken(roomCode: string, hostToken: string): void {
  localStorage.setItem(HOST_TOKEN_KEY, JSON.stringify({ roomCode, hostToken }));
}

export function loadHostToken(roomCode: string): string | undefined {
  try {
    const raw = localStorage.getItem(HOST_TOKEN_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { roomCode?: string; hostToken?: string };
    return parsed.roomCode === roomCode ? parsed.hostToken : undefined;
  } catch {
    return undefined;
  }
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
    onHostMigrated?: (room: RoomState, newHostPlayerId: string | null) => void;
    onAudienceInfluence?: (room: RoomState, event: AudienceInfluenceEvent) => void;
  },
) {
  const { socket } = useSocket();

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!code) return;

    const onState = (room: RoomState) => handlersRef.current.onState?.(room);
    const onCountdown = ({ room, countdown }: { room: RoomState; countdown: number | null }) =>
      handlersRef.current.onCountdown?.(room, countdown);
    const onStarted = ({
      room,
      beatmap,
      startTime,
    }: {
      room: RoomState;
      beatmap: Beatmap;
      startTime: number;
    }) => handlersRef.current.onStarted?.(room, beatmap, startTime);
    const onScore = ({
      room,
      scoreEvent,
    }: {
      room: RoomState;
      scoreEvent: ScoreEvent | null;
    }) => handlersRef.current.onScore?.(room, scoreEvent);
    const onEnded = ({ room, results }: { room: RoomState; results: GameResults }) =>
      handlersRef.current.onEnded?.(room, results);
    const onPlayerJoined = ({ room }: { room: RoomState }) =>
      handlersRef.current.onPlayerJoined?.(room);
    const onPlayerLeft = ({ room }: { room: RoomState }) =>
      handlersRef.current.onPlayerLeft?.(room);
    const onReady = ({ room }: { room: RoomState }) => handlersRef.current.onState?.(room);
    const onHostMigrated = ({
      room,
      newHostPlayerId,
    }: {
      room: RoomState;
      newHostPlayerId?: string | null;
    }) => handlersRef.current.onHostMigrated?.(room, newHostPlayerId ?? null);
    const onAudienceInfluence = ({
      room,
      event,
    }: {
      room: RoomState;
      event: AudienceInfluenceEvent;
    }) => handlersRef.current.onAudienceInfluence?.(room, event);

    socket.on('room.state', onState);
    socket.on('game.countdown', onCountdown);
    socket.on('game.started', onStarted);
    socket.on('game.score_update', onScore);
    socket.on('game.ended', onEnded);
    socket.on('room.player_joined', onPlayerJoined);
    socket.on('room.player_left', onPlayerLeft);
    socket.on('room.ready_changed', onReady);
    socket.on('room.host_migrated', onHostMigrated);
    socket.on('audience.influence', onAudienceInfluence);

    return () => {
      socket.off('room.state', onState);
      socket.off('game.countdown', onCountdown);
      socket.off('game.started', onStarted);
      socket.off('game.score_update', onScore);
      socket.off('game.ended', onEnded);
      socket.off('room.player_joined', onPlayerJoined);
      socket.off('room.player_left', onPlayerLeft);
      socket.off('room.ready_changed', onReady);
      socket.off('room.host_migrated', onHostMigrated);
      socket.off('audience.influence', onAudienceInfluence);
    };
  }, [code, socket]);
}

const ROOM_CREATE_TIMEOUT_MS = 12_000;

function waitForSocketConnection(socket: Socket, timeoutMs: number): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      socket.off('connect', onConnect);
      reject(
        new Error(
          'BeatLink could not reach the room server. Confirm the host service is running and that this phone can reach it.',
        ),
      );
    }, timeoutMs);
    const onConnect = () => {
      window.clearTimeout(timer);
      socket.off('connect', onConnect);
      resolve();
    };
    socket.on('connect', onConnect);
    socket.connect();
  });
}

export function useCreateRoom() {
  const { socket } = useSocket();
  return useCallback(async () => {
    await waitForSocketConnection(socket, ROOM_CREATE_TIMEOUT_MS);
    return new Promise<{ code: string; hostToken: string }>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(
          new Error(
            'BeatLink could not reach the room server. Confirm the host service is running and that this phone can reach it.',
          ),
        );
      }, ROOM_CREATE_TIMEOUT_MS);
      socket.emit('room.create', (data: { code?: string; hostToken?: string; error?: string }) => {
        window.clearTimeout(timer);
        if (data?.code && data.hostToken) {
          storeHostToken(data.code, data.hostToken);
          resolve({ code: data.code, hostToken: data.hostToken });
        } else if (data?.code) {
          resolve({ code: data.code, hostToken: '' });
        } else {
          reject(new Error(data?.error ?? 'Failed to create room'));
        }
      });
    });
  }, [socket]);
}

export function useJoinRoom() {
  const { socket } = useSocket();
  return useCallback(
    (code: string, name: string, playerId?: string, playerToken?: string) =>
      new Promise<{
        player: import('@beatlink/shared').Player;
        room: RoomState;
        playerToken?: string;
      }>((resolve, reject) => {
        socket.emit(
          'room.join',
          { code, name, playerId, playerToken },
          (result: {
            ok: boolean;
            error?: string;
            player?: import('@beatlink/shared').Player;
            room?: RoomState;
            playerToken?: string;
          }) => {
            if (result.ok && result.player && result.room) {
              resolve({
                player: result.player,
                room: result.room,
                playerToken: result.playerToken,
              });
            } else {
              reject(new Error(result.error ?? 'Join failed'));
            }
          },
        );
      }),
    [socket],
  );
}

export function useJoinAudience() {
  const { socket } = useSocket();
  return useCallback(
    (code: string, name: string, audienceId?: string, audienceToken?: string) =>
      new Promise<{ audience: AudienceMember; room: RoomState; audienceToken?: string }>(
        (resolve, reject) => {
          socket.emit(
            'room.join_audience',
            { code, name, audienceId, audienceToken },
            (result: {
              ok: boolean;
              error?: string;
              audience?: AudienceMember;
              room?: RoomState;
              audienceToken?: string;
            }) => {
              if (result.ok && result.audience && result.room) {
                resolve({
                  audience: result.audience,
                  room: result.room,
                  audienceToken: result.audienceToken,
                });
              } else {
                reject(new Error(result.error ?? 'Audience join failed'));
              }
            },
          );
        },
      ),
    [socket],
  );
}
