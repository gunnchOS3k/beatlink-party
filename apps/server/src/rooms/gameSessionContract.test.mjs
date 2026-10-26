import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resetAuthority, roomAuthority } from './roomHttp.mjs';
import {
  GAME_SESSION_CONTRACT_NAME,
  GAME_SESSION_CONTRACT_VERSION,
  PEDESTRIAN_PURSUIT_APPLICATION_ID,
  acknowledge,
  disconnectGuest,
  endGame,
  guestPayload,
  openGameSessionOnRoom,
  publishRematchOrExit,
  publishResult,
  readLogs,
  readTelemetry,
  reconnectGuest,
  redeemInvitationOnRoom,
  rematchGame,
  resetGameSessions,
  runtimeRaceDigest,
  startGame,
  submitRuntimeRaceResult,
} from './gameSessionContract.mjs';

function runtimeResult(opened, redeemed) {
  const result = {
    applicationId: PEDESTRIAN_PURSUIT_APPLICATION_ID,
    roomCode: opened.session.roomCode,
    courseId: 'verdant_cascade_circuit',
    hostMemberId: opened.session.hostId,
    guestMemberId: redeemed.memberId,
    lapsCompleted: { host: 1, guest: 1 },
    checkpointCrossings: { host: 2, guest: 2 },
    drivenMsec: 12000,
    finishOrder: [opened.session.hostId, redeemed.memberId],
    bothFinished: true,
    producedBy: 'pedestrian-pursuit-race-runtime',
    sourceLog: {
      resultsPath: true,
      hostLapCompleted: true,
      guestLapCompleted: true,
      hostCheckpoint: true,
      guestCheckpoint: true,
    },
  };
  return { ...result, runtimeDigest: runtimeRaceDigest(result) };
}

describe('pedestrian game-session contract on the room transport', () => {
  it('redeems a second client and rejects a host-invented result and guest host actions', () => {
    resetAuthority();
    resetGameSessions();
    assert.equal(GAME_SESSION_CONTRACT_NAME, 'gunnchos.beatlink.game_session');
    assert.equal(GAME_SESSION_CONTRACT_VERSION, 1);

    const opened = openGameSessionOnRoom(PEDESTRIAN_PURSUIT_APPLICATION_ID);
    assert.equal(opened.status, 200);
    assert.equal(opened.session.applicationId, 'pedestrian-pursuit');
    assert.notEqual(opened.session.applicationId, opened.session.roomCode);
    assert.notEqual(opened.session.hostId, opened.hostSession);
    assert.equal(roomAuthority.hostSessions.get(opened.session.roomCode), opened.hostSession);
    assert.equal(JSON.stringify(opened.session).includes(opened.hostSession), false);

    const redeemed = redeemInvitationOnRoom(opened.invitation);
    assert.equal(redeemed.status, 200);
    assert.notEqual(redeemed.memberSession, opened.hostSession);
    assert.equal(JSON.stringify(redeemed.payload).includes(opened.hostSession), false);
    assert.equal(redeemed.payload.hostId, opened.session.hostId);
    assert.equal(redeemed.payload.roomCode, opened.session.roomCode);

    assert.equal(startGame(redeemed.memberSession).status, 403);
    assert.equal(rematchGame(redeemed.memberSession).status, 403);
    assert.equal(endGame(redeemed.memberSession).status, 403);
    assert.equal(endGame(opened.session.hostId).status, 403);
    assert.equal(publishResult(opened.hostSession, { label: 'shared-result' }).status, 422);
    assert.equal(publishResult(redeemed.memberSession, { runtimeDigest: 'nope' }).status, 403);

    const produced = runtimeResult(opened, redeemed);
    assert.equal(submitRuntimeRaceResult({ ...produced, producedBy: 'host-packet' }).status, 422);
    const stored = submitRuntimeRaceResult(produced);
    assert.equal(stored.status, 200);
    const published = publishResult(opened.hostSession, { runtimeDigest: produced.runtimeDigest });
    assert.equal(published.status, 200);
    assert.equal(published.event.result.courseId, 'verdant_cascade_circuit');
    assert.equal(published.event.result.runtimeDigest, produced.runtimeDigest);
    const hostAck = acknowledge(opened.hostSession, published.event.eventId);
    const guestAck = acknowledge(redeemed.memberSession, published.event.eventId);
    assert.equal(hostAck.bothAcknowledged, false);
    assert.equal(guestAck.bothAcknowledged, true);

    assert.equal(disconnectGuest(redeemed.memberSession).payload.guestConnected, false);
    const restored = reconnectGuest(redeemed.memberSession);
    assert.equal(restored.status, 200);
    assert.equal(restored.payload.guestConnected, true);

    const decision = publishRematchOrExit(opened.hostSession, 'exit');
    assert.equal(decision.status, 200);
    assert.equal(publishRematchOrExit(redeemed.memberSession, 'rematch').status, 403);
    acknowledge(opened.hostSession, decision.event.eventId);
    const decisionGuest = acknowledge(redeemed.memberSession, decision.event.eventId);
    assert.equal(decisionGuest.bothAcknowledged, true);
    assert.equal(decisionGuest.event.choice, 'exit');

    assert.equal(rematchGame(opened.hostSession).session.phase, 'lobby');
    assert.equal(endGame(opened.hostSession).session.phase, 'closed');

    const visible = JSON.stringify({
      guest: guestPayload(opened.session.roomCode).payload,
      logs: readLogs(opened.session.roomCode),
      telemetry: readTelemetry(opened.session.roomCode),
    });
    assert.equal(visible.includes(opened.hostSession), false);
    assert.equal(visible.includes(redeemed.memberSession), false);
  });
});
