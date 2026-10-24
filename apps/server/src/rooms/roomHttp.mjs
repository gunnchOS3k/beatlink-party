/** HTTP room entry. Calls the plain lifecycle and does not open a socket. */

import { randomBytes } from 'node:crypto';
import { addMember, createParty, disconnectMember, endParty } from './partyLifecycle.mjs';

function partyAt(parties, code) {
  return parties.get(String(code || '').toUpperCase()) ?? null;
}

export function createRoomHttp(parties, sessions, { code, hostId }) {
  const party = createParty({ code, hostId });
  const hostSession = randomBytes(32).toString('hex');
  parties.set(party.code, party);
  sessions.set(party.code, hostSession);
  return { status: 200, body: { party, hostSession } };
}

export function joinRoomHttp(parties, code, memberId) {
  const party = partyAt(parties, code);
  if (!party) return { status: 404, body: { error: 'Room not found' } };
  const next = addMember(party, memberId);
  if (!next) return { status: 409, body: { error: 'Room is closed' } };
  parties.set(party.code, next);
  return { status: 200, body: { party: next } };
}

export function disconnectRoomHttp(parties, code, memberId) {
  const party = partyAt(parties, code);
  if (!party) return { status: 404, body: { error: 'Room not found' } };
  const next = disconnectMember(party, memberId);
  if (!next) return { status: 404, body: { error: 'Room not found' } };
  parties.set(party.code, next);
  return { status: 200, body: { party: next } };
}

export function endRoomHttp(parties, sessions, code, presentedHostId) {
  const party = partyAt(parties, code);
  if (!party) return { status: 404, body: { error: 'Room not found' } };
  const hostSession = sessions.get(party.code);
  if (!hostSession || presentedHostId !== hostSession) {
    return { status: 403, body: { error: 'Host session required' } };
  }
  const next = endParty(party, party.hostId);
  if (!next) return { status: 403, body: { error: 'Host session required' } };
  parties.set(party.code, next);
  sessions.delete(party.code);
  return { status: 200, body: { party: next } };
}
