import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createRoomHttp,
  disconnectRoomHttp,
  endRoomHttp,
  joinRoomHttp,
  resetAuthority,
  roomAuthority,
  setAuthorityClock,
} from './roomHttp.mjs';

test('host and member sessions stay out of the room and expire together', () => {
  resetAuthority();
  const created = createRoomHttp({ code: 'room1', hostId: 'host-1' });
  assert.equal(created.status, 200);
  assert.notEqual(created.body.hostSession, 'host-1');
  assert.equal(created.body.party.hostSession, undefined);
  assert.equal(created.body.party.hostId, 'host-1');
  assert.equal(JSON.stringify(created.body.party).includes(created.body.hostSession), false);
  const joined = joinRoomHttp('room1');
  assert.equal(joined.status, 200);
  assert.equal(joined.body.hostSession, undefined);
  assert.equal(JSON.stringify(joined.body).includes(created.body.hostSession), false);
  assert.notEqual(joined.body.memberSession, joined.body.party.members[1].id);
  assert.equal(joined.body.party.members.some((member) => member.id === 'host-1'), true);
  assert.equal(disconnectRoomHttp('room1', 'host-1').status, 403);
  assert.equal(disconnectRoomHttp('room1', joined.body.party.members[1].id).status, 403);
  assert.equal(endRoomHttp('room1', 'host-1').status, 403);
  assert.equal(endRoomHttp('room1', '').status, 403);
  const left = disconnectRoomHttp('room1', joined.body.memberSession);
  assert.equal(left.status, 200);
  assert.equal(left.body.party.members.some((member) => member.id === joined.body.party.members.at(-1)?.id), false);
  assert.equal(disconnectRoomHttp('room1', joined.body.memberSession).status, 403);
  const ended = endRoomHttp('room1', created.body.hostSession);
  assert.equal(ended.status, 200);
  assert.equal(ended.body.party.phase, 'closed');
  assert.equal(ended.body.hostSession, undefined);
  assert.equal(JSON.stringify(ended.body).includes(created.body.hostSession), false);
  assert.equal(endRoomHttp('room1', created.body.hostSession).status, 403);
  assert.equal(roomAuthority.hostSessions.has('ROOM1'), false);
  assert.equal(roomAuthority.memberSessions.has(joined.body.memberSession), false);

  resetAuthority();
  setAuthorityClock(() => 1_000);
  const expiring = createRoomHttp({ code: 'room2', hostId: 'host-2', ttlMs: 10 });
  setAuthorityClock(() => 1_020);
  assert.equal(endRoomHttp('room2', expiring.body.hostSession).status, 410);
  assert.equal(roomAuthority.hostSessions.has('ROOM2'), false);

  const entry = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  const manager = readFileSync(new URL('./RoomManager.ts', import.meta.url), 'utf8');
  assert.equal(entry.includes('roomAuthority'), true);
  assert.equal(entry.includes('const httpParties'), false);
  assert.equal(entry.includes('const httpHostSessions'), false);
  assert.equal(entry.includes('req.body?.hostId'), false);
  assert.equal(entry.includes('loopbackBindHost'), true);
  assert.equal(manager.includes('roomAuthority.parties'), true);
  assert.equal(manager.includes('private parties'), false);
  assert.equal(manager.includes('roomAuthority.hostSessions.set'), true);
});
