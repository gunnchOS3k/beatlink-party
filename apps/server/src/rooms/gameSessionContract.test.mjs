import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GAME_SESSION_CONTRACT_NAME,
  GAME_SESSION_CONTRACT_VERSION,
  PEDESTRIAN_PURSUIT_APPLICATION_ID,
  acknowledge,
  endGame,
  guestPayload,
  openGameSession,
  publishRematchOrExit,
  publishResult,
  readLogs,
  readTelemetry,
  redeemInvitation,
  rematchGame,
  resetGameSessions,
  startGame,
} from './gameSessionContract.mjs';

describe('pedestrian game-session contract', () => {
  it('keeps the application, invitation, and host session apart and rejects guest host actions', () => {
    resetGameSessions();
    assert.equal(GAME_SESSION_CONTRACT_NAME, 'gunnchos.beatlink.game_session');
    assert.equal(GAME_SESSION_CONTRACT_VERSION, 1);

    const opened = openGameSession({
      applicationId: PEDESTRIAN_PURSUIT_APPLICATION_ID,
      roomCode: 'pp-room',
    });
    assert.equal(opened.status, 200);
    assert.equal(opened.session.applicationId, 'pedestrian-pursuit');
    assert.equal(opened.session.roomCode, 'PP-ROOM');
    assert.notEqual(opened.session.applicationId, opened.session.roomCode);
    assert.notEqual(opened.session.hostId, opened.hostSession);
    assert.equal(opened.session.hostId.startsWith('host-'), true);
    assert.equal(JSON.stringify(opened.session).includes(opened.hostSession), false);
    assert.equal(openGameSession({ applicationId: 'beatlink-party', roomCode: 'other' }).status, 400);

    const redeemed = redeemInvitation(opened.invitation);
    assert.equal(redeemed.status, 200);
    assert.notEqual(redeemed.memberSession, opened.hostSession);
    assert.equal(JSON.stringify(redeemed.payload).includes(opened.hostSession), false);
    assert.equal(redeemed.payload.applicationId, 'pedestrian-pursuit');
    assert.equal(redeemed.payload.roomCode, 'PP-ROOM');
    assert.equal(redeemed.payload.hostId, opened.session.hostId);

    assert.equal(startGame(redeemed.memberSession).status, 403);
    assert.equal(rematchGame(redeemed.memberSession).status, 403);
    assert.equal(endGame(redeemed.memberSession).status, 403);
    assert.equal(endGame(opened.session.hostId).status, 403);
    assert.equal(guestPayload('PP-ROOM').payload.phase, 'lobby');

    assert.equal(startGame(opened.hostSession).status, 200);
    assert.equal(guestPayload('PP-ROOM').payload.phase, 'playing');

    const result = publishResult(opened.hostSession, { label: 'shared-result' });
    assert.equal(result.status, 200);
    assert.equal(publishResult(redeemed.memberSession, { label: 'shared-result' }).status, 403);
    const resultHost = acknowledge(opened.hostSession, result.event.eventId);
    const resultGuest = acknowledge(redeemed.memberSession, result.event.eventId);
    assert.equal(resultHost.bothAcknowledged, false);
    assert.equal(resultGuest.bothAcknowledged, true);
    assert.equal(resultGuest.event.acknowledgements.host, true);
    assert.equal(resultGuest.event.acknowledgements.guest, true);

    const decision = publishRematchOrExit(opened.hostSession, 'exit');
    assert.equal(decision.status, 200);
    assert.equal(publishRematchOrExit(redeemed.memberSession, 'exit').status, 403);
    assert.equal(acknowledge(opened.hostSession, decision.event.eventId).bothAcknowledged, false);
    const decisionGuest = acknowledge(redeemed.memberSession, decision.event.eventId);
    assert.equal(decisionGuest.bothAcknowledged, true);
    assert.equal(decisionGuest.event.type, 'rematch_or_exit');
    assert.equal(decisionGuest.event.choice, 'exit');

    assert.equal(rematchGame(opened.hostSession).session.phase, 'lobby');
    assert.equal(endGame(opened.hostSession).session.phase, 'closed');

    const visible = JSON.stringify({
      guest: guestPayload('PP-ROOM').payload,
      logs: readLogs('PP-ROOM'),
      telemetry: readTelemetry('PP-ROOM'),
    });
    assert.equal(visible.includes(opened.hostSession), false);
    assert.equal(visible.includes('pedestrian-pursuit'), true);
    assert.equal(visible.includes('PP-ROOM'), true);
  });
});
