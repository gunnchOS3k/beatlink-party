import type { PartyRecord } from './partyLifecycle.mjs';

export type PublicParty = {
  code: string;
  phase: PartyRecord['phase'];
  hostId: string;
  members: PartyRecord['members'];
};

export type MemberSessionRecord = {
  code: string;
  memberId: string;
};

export type RoomAuthority = {
  parties: Map<string, PartyRecord>;
  hostSessions: Map<string, string>;
  memberSessions: Map<string, MemberSessionRecord>;
  expiresAt: Map<string, number>;
};

export type PartyHttpSuccess = {
  status: 200;
  body: { party: PublicParty | null };
};

export type PartyHttpFailure = {
  status: 403 | 404 | 409 | 410;
  body: { error: string };
};

export const roomAuthority: RoomAuthority;

export function setAuthorityClock(fn: unknown): void;
export function resetAuthority(): void;
export function invalidateAuthority(code: string): void;
export function invalidateMember(code: string, memberId: string): void;
export function publicParty(party: PartyRecord | null | undefined): PublicParty | null;

export function createRoomHttp(input: {
  code: string;
  hostId: string;
  ttlMs?: number;
}): {
  status: 200;
  body: { party: PublicParty | null; hostSession: string };
};

export function joinRoomHttp(
  code: string,
):
  | { status: 200; body: { party: PublicParty | null; memberSession: string } }
  | { status: 404 | 409 | 410; body: { error: string } };

export function disconnectRoomHttp(
  code: string,
  presentedSession: string,
): PartyHttpSuccess | { status: 403 | 404 | 410; body: { error: string } };

export function readPartyHttp(
  code: string,
  presentedSession: string,
): PartyHttpSuccess | { status: 403 | 404 | 410; body: { error: string } };

export function endRoomHttp(
  code: string,
  presentedHostSession: string,
): PartyHttpSuccess | { status: 403 | 404 | 410; body: { error: string } };
