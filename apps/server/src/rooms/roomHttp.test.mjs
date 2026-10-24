import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRoomHttp, disconnectRoomHttp, endRoomHttp, joinRoomHttp } from './roomHttp.mjs';

test('the server entry routes create, join, disconnect, and end through the lifecycle module', () => {
  const parties = new Map();
  const created = createRoomHttp(parties, { code: 'room1', hostId: 'host-1' });
  assert.equal(created.status, 200);
  assert.equal(created.body.party.phase, 'lobby');
  assert.deepEqual(created.body.party.members.map((member) => member.id), ['host-1']);
  const joined = joinRoomHttp(parties, 'room1', 'guest-2');
  assert.equal(joined.status, 200);
  assert.deepEqual(joined.body.party.members.map((member) => member.id), ['host-1', 'guest-2']);
  const left = disconnectRoomHttp(parties, 'room1', 'guest-2');
  assert.equal(left.status, 200);
  assert.deepEqual(left.body.party.members.map((member) => member.id), ['host-1']);
  const refused = endRoomHttp(parties, 'room1', 'guest-2');
  assert.equal(refused.status, 403);
  const ended = endRoomHttp(parties, 'room1', 'host-1');
  assert.equal(ended.status, 200);
  assert.equal(ended.body.party.phase, 'closed');
  assert.deepEqual(ended.body.party.members, []);
  const entry = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  for (const name of ['createRoomHttp', 'joinRoomHttp', 'disconnectRoomHttp', 'endRoomHttp', 'loopbackBindHost']) {
    assert.equal(entry.includes(name), true, name);
  }
  assert.equal(entry.includes("listen(PORT, '0.0.0.0'"), false);
});
