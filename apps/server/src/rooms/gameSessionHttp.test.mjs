import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import express from 'express';
import { registerGameSessionRoutes } from './gameSessionHttp.mjs';
import { bindRuntimeProducer, resetGameSessions, runtimeRaceDigest } from './gameSessionContract.mjs';
import { resetAuthority } from './roomHttp.mjs';

beforeEach(() => { resetAuthority(); resetGameSessions(); });
async function boot(t) {
  const app = express(); app.use(express.json()); registerGameSessionRoutes(app);
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  return async (path, body, runtimeSession) => {
    const response = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(runtimeSession ? { authorization: `Bearer ${runtimeSession}` } : {}) }, body: JSON.stringify(body) });
    const contentType = response.headers.get('content-type') ?? '';
    return { status: response.status, data: contentType.includes('application/json') ? await response.json() : await response.text() };
  };
}
async function room(post) {
  const host = await post('/game-sessions', { applicationId: 'pedestrian-pursuit' });
  assert.equal(host.status, 200); const code = host.data.session.roomCode;
  const guest = await post(`/game-sessions/${code}/redeem`, { invitation: host.data.invitation });
  assert.equal(guest.status, 200);
  const started = await post(`/game-sessions/${code}/start`, { session: host.data.hostSession });
  assert.equal(started.status, 200);
  return { host: host.data, guest: guest.data, code, roundId: started.data.session.roundId };
}
function packet(r, overrides = {}) {
  const result = { applicationId: 'pedestrian-pursuit', roomCode: r.code, roundId: r.roundId,
    courseId: 'verdant_cascade_circuit', hostMemberId: r.host.session.hostId,
    guestMemberId: r.guest.memberId, lapsCompleted: { host: 1, guest: 1 },
    checkpointCrossings: { host: 2, guest: 2 }, drivenMsec: 12000,
    finishOrder: [r.host.session.hostId, r.guest.memberId], bothFinished: true,
    producedBy: 'pedestrian-pursuit-race-runtime',
    sourceLog: { resultsPath: true, hostLapCompleted: true, guestLapCompleted: true, hostCheckpoint: true, guestCheckpoint: true }, ...overrides };
  return { ...result, runtimeDigest: runtimeRaceDigest(result) };
}
function trustedFixtureBinding(r) {
  // Simulates a trusted server adapter, not proof of real Godot execution.
  const bound = bindRuntimeProducer({ roomCode: r.code, roundId: r.roundId, courseId: 'verdant_cascade_circuit' });
  assert.equal(bound.status, 200); return bound.runtimeSession;
}

test('real HTTP closes stale-host reopen and gives an explicit unavailable runtime boundary by default', async (t) => {
  const post = await boot(t); const r = await room(post); const result = packet(r);
  const unbound = await post(`/game-sessions/${r.code}/runtime-result`, result);
  assert.equal(unbound.status, 503); assert.equal(unbound.data.error, 'runtime_authority_unavailable');
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, result, r.host.hostSession)).status, 503);
  assert.equal((await post(`/game-sessions/${r.code}/end`, { session: r.guest.memberSession })).status, 403);
  assert.equal((await post(`/game-sessions/${r.code}/end`, { session: r.host.hostSession })).status, 200);
  for (const action of ['start', 'rematch', 'end']) {
    assert.equal((await post(`/game-sessions/${r.code}/${action}`, { session: r.host.hostSession })).status, 403);
  }
  assert.equal((await post(`/game-sessions/${r.code}/reconnect`, { session: r.guest.memberSession })).status, 403);
  assert.notEqual((await post(`/game-sessions/${r.code}/runtime-result`, result)).status, 200);
});

test('real HTTP valid fixture result/rematch; host, guest, body-only capabilities and stale rounds cannot forge producer', async (t) => {
  const post = await boot(t); const r = await room(post); const cap = trustedFixtureBinding(r); const result = packet(r);
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, { ...result, runtimeSession: cap })).status, 403);
  for (const token of [r.host.hostSession, r.guest.memberSession, 'forged']) {
    assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, result, token)).status, 403);
  }
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, packet(r, { lapsCompleted: {} }), cap)).status, 422);
  const accepted = await post(`/game-sessions/${r.code}/runtime-result`, result, cap);
  assert.equal(accepted.status, 200);
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, result, cap)).status, 409);
  assert.equal((await post(`/game-sessions/${r.code}/result`, { hostSession: r.guest.memberSession, runtimeDigest: result.runtimeDigest })).status, 403);
  const published = await post(`/game-sessions/${r.code}/result`, { hostSession: r.host.hostSession, runtimeDigest: result.runtimeDigest });
  assert.equal(published.status, 200);
  const publicText = JSON.stringify([accepted.data, published.data]);
  for (const token of [cap, r.host.hostSession, r.guest.memberSession]) assert.equal(publicText.includes(token), false);
  assert.equal((await post(`/game-sessions/${r.code}/rematch`, { session: r.host.hostSession })).status, 200);
  const next = await post(`/game-sessions/${r.code}/start`, { session: r.host.hostSession });
  assert.equal(next.status, 200); assert.notEqual(next.data.session.roundId, r.roundId);
  const nextRoom = { ...r, roundId: next.data.session.roundId }; const nextCap = trustedFixtureBinding(nextRoom);
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, result, nextCap)).status, 422);
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, packet(nextRoom), cap)).status, 403);
  assert.equal((await post(`/game-sessions/${r.code}/runtime-result`, packet(nextRoom), nextCap)).status, 200);
});

test('real HTTP wrong-room host/result/runtime/redeem operations cannot mutate or consume another room', async (t) => {
  const post = await boot(t); const a = await room(post); const b = await room(post);
  const cap = trustedFixtureBinding(a); const otherCap = trustedFixtureBinding(b);
  assert.equal((await post(`/game-sessions/${b.code}/end`, { session: a.host.hostSession })).status, 403);
  assert.equal((await post(`/game-sessions/${b.code}/result`, { hostSession: a.host.hostSession, runtimeDigest: packet(a).runtimeDigest })).status, 403);
  assert.equal((await post(`/game-sessions/${b.code}/runtime-result`, packet(a), cap)).status, 400);
  assert.equal((await post(`/game-sessions/${b.code}/runtime-result`, packet(b), cap)).status, 403);
  assert.equal((await post(`/game-sessions/${b.code}/runtime-result`, packet(b), otherCap)).status, 200);
  const fresh = await post('/game-sessions', { applicationId: 'pedestrian-pursuit' });
  assert.equal((await post(`/game-sessions/${a.code}/redeem`, { invitation: fresh.data.invitation })).status, 404);
  assert.equal((await post(`/game-sessions/${fresh.data.session.roomCode}/redeem`, { invitation: fresh.data.invitation })).status, 200);
  assert.equal((await post(`/game-sessions/${a.code}/start`, { session: a.host.hostSession })).status, 409);
});

test('no public runtime binder exists; invalid state and exit decisions remain explicit', async (t) => {
  const post = await boot(t); const opened = await post('/game-sessions', { applicationId: 'pedestrian-pursuit' });
  const code = opened.data.session.roomCode;
  assert.equal((await post(`/game-sessions/${code}/start`, { session: opened.data.hostSession })).status, 409);
  assert.equal((await post(`/game-sessions/${code}/bind-runtime`, { session: opened.data.hostSession })).status, 404);
  const r = await room(post); const cap = trustedFixtureBinding(r); const result = packet(r);
  await post(`/game-sessions/${r.code}/runtime-result`, result, cap);
  await post(`/game-sessions/${r.code}/result`, { hostSession: r.host.hostSession, runtimeDigest: result.runtimeDigest });
  assert.equal((await post(`/game-sessions/${r.code}/rematch-or-exit`, { session: r.host.hostSession, choice: 'bad-choice' })).status, 400);
  assert.equal((await post(`/game-sessions/${r.code}/rematch-or-exit`, { session: r.host.hostSession, choice: 'exit' })).status, 200);
  assert.equal((await post(`/game-sessions/${r.code}/rematch`, { session: r.host.hostSession })).status, 409);
  assert.equal((await post(`/game-sessions/${r.code}/end`, { session: r.host.hostSession })).status, 200);
});
