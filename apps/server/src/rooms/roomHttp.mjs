/** HTTP room entry. Calls the plain lifecycle and does not open a socket. */

import { addMember, createParty, disconnectMember, endParty } from './partyLifecycle.mjs';

function partyAt(parties, code) {
  return parties.get(String(code || '').toUpperCase()) ?? null;
}

export function createRoomHttp(parties, { code, hostId }) {
  const party = createParty({ code, hostId });
  parties.set(party.code, party);
  return { status: 200, body: { party } };
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

export function endRoomHttp(parties, code, hostId) {
  const party = partyAt(parties, code);
  if (!party) return { status: 404, body: { error: 'Room not found' } };
  const next = endParty(party, hostId);
  if (!next) return { status: 403, body: { error: 'Only the host can end the room' } };
  parties.set(party.code, next);
  return { status: 200, body: { party: next } };
}
