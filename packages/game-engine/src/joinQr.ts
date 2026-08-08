import type { RoomJoinQrPayload } from '@beatlink/shared';

/**
 * Build a join QR payload without third-party QR image APIs.
 * Clients encode `qrText` locally (or display the room code + URL).
 */
export function buildRoomJoinQrPayload(input: {
  code: string;
  origin: string;
  expiresAt: number;
  joinPath?: string;
}): RoomJoinQrPayload {
  const joinPath = input.joinPath ?? '/join';
  const base = input.origin.replace(/\/$/, '');
  const joinUrl = `${base}${joinPath}?code=${encodeURIComponent(input.code)}`;
  const qrText = `beatlink:join:${input.code}|${joinUrl}`;
  return {
    code: input.code,
    joinPath,
    joinUrl,
    qrText,
    expiresAt: input.expiresAt,
  };
}

export function isJoinQrExpired(payload: RoomJoinQrPayload, nowMs = Date.now()): boolean {
  return nowMs > payload.expiresAt;
}
