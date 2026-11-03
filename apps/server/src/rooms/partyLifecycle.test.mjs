import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loopbackBindHost } from '../net/loopbackBind.mjs';
import { addMember, createParty, disconnectMember, endParty } from './partyLifecycle.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('loopback bind guard', () => {
  it('defaults to loopback and refuses a public address without listening', () => {
    const noLan = { BEATLINK_PARTY_LAN: '', BEATLINK_ALLOW_LAN_BIND: '' };
    assert.equal(loopbackBindHost(undefined, noLan), '127.0.0.1');
    assert.equal(loopbackBindHost('', noLan), '127.0.0.1');
    assert.equal(loopbackBindHost('localhost', noLan), '127.0.0.1');
    assert.equal(loopbackBindHost('::1', noLan), '::1');
    assert.throws(() => loopbackBindHost('0.0.0.0', noLan), /BEATLINK_PARTY_LAN|non-loopback/);
    assert.throws(() => loopbackBindHost('192.168.1.20', noLan), /BEATLINK_PARTY_LAN|non-loopback/);
    assert.throws(() => loopbackBindHost('8.8.8.8', noLan), /non-loopback/);
  });

  it('allows private LAN / all-interfaces only with explicit party LAN flag', () => {
    const lan = { BEATLINK_PARTY_LAN: '1' };
    assert.equal(loopbackBindHost('0.0.0.0', lan), '0.0.0.0');
    assert.equal(loopbackBindHost('192.168.1.20', lan), '192.168.1.20');
    assert.equal(loopbackBindHost('10.0.0.5', lan), '10.0.0.5');
    assert.throws(() => loopbackBindHost('8.8.8.8', lan), /non-loopback/);
  });
});

describe('room lifecycle', () => {
  it('creates a room, adds a second member, removes that member on disconnect, and ends the room', () => {
    const room = createParty({ code: 'mb5un', hostId: 'host-1' });
    assert.equal(room.phase, 'lobby');
    assert.deepEqual(room.members.map((member) => member.id), ['host-1']);

    const joined = addMember(room, 'member-2');
    assert.deepEqual(joined.members.map((member) => member.id), ['host-1', 'member-2']);

    const afterDisconnect = disconnectMember(joined, 'member-2');
    assert.deepEqual(afterDisconnect.members.map((member) => member.id), ['host-1']);
    assert.equal(disconnectMember(afterDisconnect, 'host-1').members.some((member) => member.id === 'host-1'), true);

    assert.equal(endParty(afterDisconnect, 'member-2'), null);
    const ended = endParty(afterDisconnect, 'host-1');
    assert.equal(ended.phase, 'closed');
    assert.deepEqual(ended.members, []);
  });

  it('is the logic the server calls, and the server never hardcodes a public bind', () => {
    const indexSource = readFileSync(join(here, '../index.ts'), 'utf8');
    const roomSource = readFileSync(join(here, 'RoomManager.ts'), 'utf8');
    assert.equal(indexSource.includes("listen(PORT, '0.0.0.0'"), false);
    assert.equal(indexSource.includes('loopbackBindHost'), true);
    assert.equal(indexSource.includes('BEATLINK_PARTY_LAN') || indexSource.includes('partyLan'), true);
    assert.equal(roomSource.includes('createParty'), true);
    assert.equal(roomSource.includes('addMember'), true);
    assert.equal(roomSource.includes('disconnectMember'), true);
    assert.equal(roomSource.includes('endParty'), true);
  });
});
