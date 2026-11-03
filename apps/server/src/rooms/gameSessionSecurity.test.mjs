import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  resetGameSessions, openGameSessionOnRoom, redeemInvitationOnRoom, startGame,
  rematchGame, endGame, disconnectGuest, reconnectGuest, guestPayload,
  bindRuntimeProducer, runtimeRaceDigest, submitRuntimeRaceResult, publishResult,
  publishRematchOrExit, acknowledge, readLogs, readTelemetry,
} from './gameSessionContract.mjs';
import { resetAuthority, readPartyHttp, setAuthorityClock, endRoomHttp, disconnectRoomHttp } from './roomHttp.mjs';

beforeEach(() => { resetAuthority(); resetGameSessions(); });
function ready() {
  const host = openGameSessionOnRoom('pedestrian-pursuit');
  const guest = redeemInvitationOnRoom(host.invitation);
  const started = startGame(host.hostSession);
  assert.equal(started.status, 200);
  return { host, guest, roundId: started.session.roundId };
}
function fields(room, overrides = {}) {
  const p = { applicationId: 'pedestrian-pursuit', roomCode: room.host.session.roomCode,
    roundId: room.roundId, courseId: 'verdant_cascade_circuit', hostMemberId: room.host.session.hostId,
    guestMemberId: room.guest.memberId, lapsCompleted: { host: 1, guest: 1 },
    checkpointCrossings: { host: 2, guest: 2 }, drivenMsec: 12000,
    finishOrder: [room.host.session.hostId, room.guest.memberId], bothFinished: true,
    producedBy: 'pedestrian-pursuit-race-runtime',
    sourceLog: { resultsPath: true, hostLapCompleted: true, guestLapCompleted: true, hostCheckpoint: true, guestCheckpoint: true }, ...overrides };
  return { ...p, runtimeDigest: runtimeRaceDigest(p) };
}
function bind(room) {
  const result = bindRuntimeProducer({ roomCode: room.host.session.roomCode, roundId: room.roundId, courseId: 'verdant_cascade_circuit' });
  assert.equal(result.status, 200); return result.runtimeSession;
}

test('no installed runtime authority fails closed despite self-authored producer/hash or host/member tokens', () => {
  const room = ready(); const packet = fields(room);
  for (const token of [undefined, room.host.hostSession, room.guest.memberSession, 'invented-runtime']) {
    assert.equal(submitRuntimeRaceResult(packet, token).status, 503);
  }
  assert.equal(publishResult(room.host.hostSession, packet).status, 422);
});

test('capability is room, round and course bound; invalid input does not consume it', () => {
  const a = ready(); const b = ready(); const capability = bind(a); bind(b);
  for (const token of [undefined, a.host.hostSession, a.guest.memberSession, 'forged']) {
    assert.equal(submitRuntimeRaceResult(fields(a), token).status, 403);
  }
  assert.equal(submitRuntimeRaceResult(fields(b), capability).status, 403);
  for (const bad of [{ roundId: 'old-round' }, { courseId: 'other-course' }, { lapsCompleted: {} },
    { checkpointCrossings: { host: '2', guest: 2 } }, { drivenMsec: 0 }, { producedBy: 'host-packet' }]) {
    assert.equal(submitRuntimeRaceResult(fields(a, bad), capability).status, 422);
  }
  const packet = fields(a);
  assert.equal(submitRuntimeRaceResult({ ...packet, runtimeDigest: 'wrong' }, capability).status, 422);
  assert.equal(submitRuntimeRaceResult(packet, capability).status, 200);
  assert.equal(submitRuntimeRaceResult(packet, capability).status, 409);
});

test('end closes transport and permanently revokes host, member, invitation and producer capabilities', () => {
  const r = ready(); const cap = bind(r);
  assert.equal(endGame(r.host.hostSession).session.phase, 'closed');
  for (const action of [startGame, rematchGame, endGame]) assert.equal(action(r.host.hostSession).status, 403);
  for (const action of [disconnectGuest, reconnectGuest]) assert.equal(action(r.guest.memberSession).status, 403);
  assert.equal(redeemInvitationOnRoom(r.host.invitation).status, 404);
  assert.notEqual(readPartyHttp(r.host.session.roomCode, r.host.hostSession).status, 200);
  assert.notEqual(submitRuntimeRaceResult(fields(r), cap).status, 200);
  assert.equal(guestPayload(r.host.session.roomCode).payload.phase, 'closed');
});

test('valid authenticated fixture result/results/rematch gets a fresh round and rejects stale results', () => {
  const r = ready(); const cap = bind(r); const packet = fields(r);
  assert.equal(startGame(r.host.hostSession).status, 409);
  assert.equal(rematchGame(r.host.hostSession).status, 409);
  assert.equal(submitRuntimeRaceResult(packet, cap).status, 200);
  const published = publishResult(r.host.hostSession, packet);
  assert.equal(published.status, 200);
  assert.equal(guestPayload(r.host.session.roomCode).payload.phase, 'results');
  assert.equal(acknowledge(r.host.hostSession, published.event.eventId).status, 200);
  assert.equal(acknowledge(r.guest.memberSession, published.event.eventId).bothAcknowledged, true);
  assert.equal(rematchGame(r.host.hostSession).status, 200);
  const next = startGame(r.host.hostSession); assert.equal(next.status, 200);
  assert.notEqual(next.session.roundId, r.roundId);
  assert.equal(publishResult(r.host.hostSession, packet).status, 422);
  const nextRoom = { ...r, roundId: next.session.roundId }; const nextCap = bind(nextRoom);
  assert.equal(submitRuntimeRaceResult(fields(nextRoom), cap).status, 403);
  assert.equal(submitRuntimeRaceResult(packet, nextCap).status, 422);
  assert.equal(submitRuntimeRaceResult(fields(nextRoom), nextCap).status, 200);
});

test('wrong-room host operations and redemption reject before mutating either room', () => {
  const a = ready(); const b = openGameSessionOnRoom('pedestrian-pursuit');
  assert.equal(endGame(a.host.hostSession, b.session.roomCode).status, 403);
  assert.equal(guestPayload(a.host.session.roomCode).payload.phase, 'playing');
  assert.equal(redeemInvitationOnRoom(b.invitation, a.host.session.roomCode).status, 404);
  assert.equal(redeemInvitationOnRoom(b.invitation, b.session.roomCode).status, 200);
});

test('exit decision blocks rematch; credentials and result fields never appear in public data', () => {
  const r = ready(); const cap = bind(r); const packet = fields(r);
  submitRuntimeRaceResult(packet, cap); publishResult(r.host.hostSession, packet);
  assert.equal(publishRematchOrExit(r.host.hostSession, 'unexpected').status, 400);
  assert.equal(publishRematchOrExit(r.host.hostSession, 'exit').status, 200);
  assert.equal(rematchGame(r.host.hostSession).status, 409);
  const serialized = JSON.stringify({ view: guestPayload(r.host.session.roomCode), logs: readLogs(r.host.session.roomCode), telemetry: readTelemetry(r.host.session.roomCode) });
  for (const token of [r.host.hostSession, r.guest.memberSession, cap]) assert.equal(serialized.includes(token), false);
  assert.equal(endGame(r.host.hostSession).status, 200);
});

test('externally ended or expired room authority cannot be revived through retained game records', () => {
  const a = ready();
  endRoomHttp(a.host.session.roomCode, a.host.hostSession);
  assert.equal(endGame(a.host.hostSession).status, 410);
  assert.equal(guestPayload(a.host.session.roomCode).payload.phase, 'closed');
  const b = ready(); setAuthorityClock(() => Date.now() + 8_000_000);
  assert.equal(endGame(b.host.hostSession).status, 410);
  assert.equal(startGame(b.host.hostSession).status, 403);
});

test('externally revoked member token cannot reconnect through the game-session record', () => {
  const r = ready();
  assert.equal(disconnectRoomHttp(r.host.session.roomCode, r.guest.memberSession).status, 200);
  assert.equal(reconnectGuest(r.guest.memberSession).status, 403);
  assert.equal(guestPayload(r.host.session.roomCode).payload.guestConnected, false);
  assert.equal(endGame(r.host.hostSession).status, 200);
});
