/** Versioned game-session contract bound to the room transport. It does not play a race by itself. */

import { createHash, randomBytes } from 'node:crypto';
import { createRoomHttp, joinRoomHttp, readPartyHttp, endRoomHttp, roomAuthority } from './roomHttp.mjs';

export const GAME_SESSION_CONTRACT_NAME = 'gunnchos.beatlink.game_session';
export const GAME_SESSION_CONTRACT_VERSION = 2;
export const PEDESTRIAN_PURSUIT_APPLICATION_ID = 'pedestrian-pursuit';
export const RACE_RUNTIME_PRODUCER = 'pedestrian-pursuit-race-runtime';
const DRIVE_BOUND_MSEC = 150000;

const sessions = new Map();
const invitations = new Map();
const sessionsBySecret = new Map();
// Issued only by a trusted in-process runtime adapter, never by an HTTP client.
// A public producer label or unkeyed content digest is not runtime identity.
const runtimeSessions = new Map();

function secret() {
  return randomBytes(32).toString('hex');
}

function prefixedId(prefix) {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

function roomCode() {
  return randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
}

function assertNoSecret(value, hostSession) {
  if (hostSession && JSON.stringify(value).includes(hostSession)) {
    throw new Error('HOST_SESSION_LEAKED');
  }
  return value;
}

function note(record, channel, name, fields) {
  const entry = assertNoSecret(
    {
      name,
      applicationId: record.applicationId,
      roomCode: record.roomCode,
      ...fields,
    },
    record.hostSession,
  );
  record[channel].push(entry);
}

function publicSession(record) {
  return assertNoSecret(
    {
      contract: GAME_SESSION_CONTRACT_NAME,
      version: GAME_SESSION_CONTRACT_VERSION,
      applicationId: record.applicationId,
      roomCode: record.roomCode,
      hostId: record.hostId,
      phase: record.phase,
      memberId: record.memberId,
      guestConnected: record.guestConnected,
      roundId: record.roundId,
    },
    record.hostSession,
  );
}

function publicEvent(record, event) {
  return assertNoSecret(
    {
      type: event.type,
      eventId: event.eventId,
      applicationId: record.applicationId,
      roomCode: record.roomCode,
      choice: event.choice ?? null,
      result: event.result ?? null,
      acknowledgements: { host: event.acknowledgements.host, guest: event.acknowledgements.guest },
    },
    record.hostSession,
  );
}

export function resetGameSessions() {
  sessions.clear();
  invitations.clear();
  sessionsBySecret.clear();
  runtimeSessions.clear();
}

export function runtimeRaceDigest(result) {
  const canonical = {
    applicationId: result.applicationId,
    roomCode: result.roomCode,
    roundId: result.roundId,
    courseId: result.courseId,
    hostMemberId: result.hostMemberId,
    guestMemberId: result.guestMemberId,
    lapsCompleted: { host: result.lapsCompleted?.host, guest: result.lapsCompleted?.guest },
    checkpointCrossings: { host: result.checkpointCrossings?.host, guest: result.checkpointCrossings?.guest },
    drivenMsec: result.drivenMsec,
    finishOrder: result.finishOrder,
    bothFinished: result.bothFinished,
    producedBy: result.producedBy,
    sourceLog: {
      resultsPath: result.sourceLog?.resultsPath,
      hostLapCompleted: result.sourceLog?.hostLapCompleted,
      guestLapCompleted: result.sourceLog?.guestLapCompleted,
      hostCheckpoint: result.sourceLog?.hostCheckpoint,
      guestCheckpoint: result.sourceLog?.guestCheckpoint,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function openGameSession({ applicationId, roomCode, hostId, hostSession }) {
  if (applicationId !== PEDESTRIAN_PURSUIT_APPLICATION_ID) {
    return { status: 400, error: 'Unsupported application' };
  }
  const code = String(roomCode || '').trim().toUpperCase();
  if (!code || code === applicationId || code === PEDESTRIAN_PURSUIT_APPLICATION_ID.toUpperCase()) {
    return { status: 400, error: 'Room code is separate from the application' };
  }
  if (sessions.has(code)) return { status: 409, error: 'Room already open' };
  const publicHostId = hostId ? String(hostId) : prefixedId('host');
  const issuedHostSession = hostSession ? String(hostSession) : secret();
  const invitation = prefixedId('inv');
  if (publicHostId === issuedHostSession || invitation === issuedHostSession) {
    return { status: 400, error: 'Host id is not the host session' };
  }
  const record = {
    applicationId,
    roomCode: code,
    hostId: publicHostId,
    hostSession: issuedHostSession,
    invitation,
    memberId: null,
    memberSession: null,
    guestConnected: false,
    phase: 'lobby',
    roundId: null,
    runtimeSession: null,
    transportBound: roomAuthority.hostSessions.get(code) === issuedHostSession,
    events: [],
    logs: [],
    telemetry: [],
    runtimeResult: null,
  };
  sessions.set(code, record);
  invitations.set(invitation, code);
  sessionsBySecret.set(issuedHostSession, { roomCode: code, role: 'host' });
  note(record, 'logs', 'session_opened', { hostId: publicHostId });
  note(record, 'telemetry', 'session_opened', { hostId: publicHostId });
  return { status: 200, hostSession: issuedHostSession, invitation, session: publicSession(record) };
}

export function openGameSessionOnRoom(applicationId) {
  if (applicationId !== PEDESTRIAN_PURSUIT_APPLICATION_ID) return { status: 400, error: 'Unsupported application' };
  const hostId = prefixedId('host');
  const code = roomCode();
  const room = createRoomHttp({ code, hostId });
  if (room.status !== 200 || !room.body?.party || !room.body.hostSession) {
    return { status: 502, error: 'Room transport did not create a room' };
  }
  if (room.body.party.hostId !== hostId || room.body.party.code !== code) {
    return { status: 502, error: 'Room transport changed the application room' };
  }
  if (room.body.hostSession === hostId) {
    return { status: 502, error: 'Room transport used the host session as the host id' };
  }
  return openGameSession({
    applicationId,
    roomCode: room.body.party.code,
    hostId: room.body.party.hostId,
    hostSession: room.body.hostSession,
  });
}

export function guestPayload(roomCode) {
  const record = sessions.get(String(roomCode || '').toUpperCase());
  if (!record) return { status: 404, error: 'Room not found' };
  return {
    status: 200,
    payload: assertNoSecret(
      {
        ...publicSession(record),
        events: record.events.map((event) => publicEvent(record, event)),
      },
      record.hostSession,
    ),
  };
}

export function redeemInvitation(invitation, roomMember) {
  const code = invitations.get(String(invitation || ''));
  const record = code ? sessions.get(code) : null;
  if (!record || record.phase === 'closed') return { status: 404, error: 'Invitation not found' };
  if (record.memberSession) return { status: 409, error: 'Invitation already redeemed' };
  const memberId = roomMember && roomMember.memberId ? String(roomMember.memberId) : prefixedId('member');
  const memberSession = roomMember && roomMember.memberSession ? String(roomMember.memberSession) : secret();
  if (memberSession === record.hostSession || memberId === record.hostSession) {
    return { status: 403, error: 'Host session is not a member session' };
  }
  record.memberId = memberId;
  record.memberSession = memberSession;
  record.guestConnected = true;
  sessionsBySecret.set(memberSession, { roomCode: record.roomCode, role: 'guest' });
  note(record, 'logs', 'invitation_redeemed', { memberId });
  note(record, 'telemetry', 'invitation_redeemed', { memberId });
  return {
    status: 200,
    memberId,
    memberSession,
    payload: guestPayload(record.roomCode).payload,
  };
}

export function redeemInvitationOnRoom(invitation, expectedRoomCode) {
  const code = invitations.get(String(invitation || ''));
  const record = code ? sessions.get(code) : null;
  if (!record || record.phase === 'closed') return { status: 404, error: 'Invitation not found' };
  if (expectedRoomCode && record.roomCode !== String(expectedRoomCode).toUpperCase()) {
    return { status: 404, error: 'Invitation is for a different room' };
  }
  if (record.phase !== 'lobby') return { status: 409, error: 'Room is not in the lobby' };
  if (record.memberSession) return { status: 409, error: 'Invitation already redeemed' };
  const joined = joinRoomHttp(record.roomCode);
  if (joined.status !== 200 || !joined.body?.memberSession) {
    return { status: joined.status || 403, error: joined.body?.error || 'Room join failed' };
  }
  const members = Array.isArray(joined.body.party?.members) ? joined.body.party.members : [];
  const guest = [...members].reverse().find((member) => member && member.role !== 'host');
  if (!guest?.id) return { status: 502, error: 'Room transport did not issue a member' };
  return redeemInvitation(invitation, { memberId: guest.id, memberSession: joined.body.memberSession });
}

function actor(presentedSession) {
  return sessionsBySecret.get(String(presentedSession || '')) ?? null;
}

function revokeRuntime(record) {
  if (record.runtimeSession) runtimeSessions.delete(record.runtimeSession);
  record.runtimeSession = null;
}

function closeRecord(record) {
  if (record.transportBound) endRoomHttp(record.roomCode, record.hostSession);
  record.phase = 'closed';
  record.guestConnected = false;
  revokeRuntime(record);
  invitations.delete(record.invitation);
  sessionsBySecret.delete(record.hostSession);
  if (record.memberSession) sessionsBySecret.delete(record.memberSession);
}

function context(presentedSession, role, expectedRoomCode) {
  const found = actor(presentedSession);
  if (!found || (role && found.role !== role)) return { status: 403, error: role === 'host' ? 'Host session required' : 'Member session required' };
  if (expectedRoomCode && found.roomCode !== String(expectedRoomCode).toUpperCase()) {
    return { status: 403, error: 'Session is for a different room' };
  }
  const record = sessions.get(found.roomCode);
  if (!record) return { status: 404, error: 'Room not found' };
  if (record.phase === 'closed') return { status: 410, error: 'Room is closed' };
  if (record.transportBound && readPartyHttp(record.roomCode, record.hostSession).status !== 200) {
    closeRecord(record);
    return { status: 410, error: 'Room authority is closed, expired, or revoked' };
  }
  if (record.transportBound && found.role === 'guest' && readPartyHttp(record.roomCode, presentedSession).status !== 200) {
    sessionsBySecret.delete(record.memberSession);
    record.guestConnected = false;
    return { status: 403, error: 'Member authority was revoked' };
  }
  return { record, found };
}

function syncTransportPhase(record) {
  if (!record.transportBound) return;
  const party = roomAuthority.parties.get(record.roomCode);
  if (party) roomAuthority.parties.set(record.roomCode, { ...party, phase: record.phase });
}

function hostAction(presentedSession, action, phase, expectedRoomCode) {
  const active = context(presentedSession, 'host', expectedRoomCode);
  if ('error' in active) return active;
  const { record } = active;
  if (action === 'start') {
    if (record.phase !== 'lobby' || !record.memberId || !record.guestConnected) {
      return { status: 409, error: 'Start requires a connected member in the lobby' };
    }
    record.roundId = prefixedId('round');
    record.runtimeResult = null;
    record.events = [];
    revokeRuntime(record);
  } else if (action === 'rematch') {
    const choice = record.events.find((event) => event.type === 'rematch_or_exit');
    if (record.phase !== 'results' || (choice && choice.choice !== 'rematch')) {
      return { status: 409, error: 'Rematch requires results without an exit decision' };
    }
    record.roundId = null;
    record.runtimeResult = null;
    record.events = [];
    revokeRuntime(record);
  } else if (action === 'end') {
    closeRecord(record);
  }
  record.phase = phase;
  syncTransportPhase(record);
  note(record, 'logs', action, { hostId: record.hostId, phase });
  note(record, 'telemetry', action, { hostId: record.hostId, phase });
  return { status: 200, session: publicSession(record) };
}

export function startGame(presentedSession, expectedRoomCode) {
  return hostAction(presentedSession, 'start', 'playing', expectedRoomCode);
}

export function rematchGame(presentedSession, expectedRoomCode) {
  return hostAction(presentedSession, 'rematch', 'lobby', expectedRoomCode);
}

export function endGame(presentedSession, expectedRoomCode) {
  return hostAction(presentedSession, 'end', 'closed', expectedRoomCode);
}

export function disconnectGuest(memberSession, expectedRoomCode) {
  const active = context(memberSession, 'guest', expectedRoomCode);
  if ('error' in active) return active;
  const { record } = active;
  record.guestConnected = false;
  note(record, 'logs', 'guest_disconnected', { memberId: record.memberId });
  note(record, 'telemetry', 'guest_disconnected', { memberId: record.memberId });
  return { status: 200, payload: guestPayload(record.roomCode).payload };
}

export function reconnectGuest(memberSession, expectedRoomCode) {
  const active = context(memberSession, 'guest', expectedRoomCode);
  if ('error' in active) return active;
  const { record } = active;
  record.guestConnected = true;
  note(record, 'logs', 'guest_reconnected', { memberId: record.memberId });
  note(record, 'telemetry', 'guest_reconnected', { memberId: record.memberId });
  return { status: 200, payload: guestPayload(record.roomCode).payload };
}

function raceShape(record, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'Race result is missing';
  if (JSON.stringify(result).includes(record.hostSession)) return 'Host session is not part of a race result';
  if (result.producedBy !== RACE_RUNTIME_PRODUCER) return 'Race result was not produced by the game runtime';
  if (result.applicationId !== record.applicationId || result.roomCode !== record.roomCode) {
    return 'Race result is for a different room';
  }
  if (result.roundId !== record.roundId) return 'Race result is for a different round';
  if (result.hostMemberId !== record.hostId || result.guestMemberId !== record.memberId) {
    return 'Race result members do not match the room';
  }
  if (typeof result.courseId !== 'string' || result.courseId.length < 1) return 'Race result has no course';
  const laps = result.lapsCompleted;
  const checks = result.checkpointCrossings;
  if (!laps || !Number.isSafeInteger(laps.host) || laps.host < 1 ||
      !Number.isSafeInteger(laps.guest) || laps.guest < 1) return 'Both members must complete a lap';
  if (!checks || !Number.isSafeInteger(checks.host) || checks.host < 1 ||
      !Number.isSafeInteger(checks.guest) || checks.guest < 1) return 'Both members must cross a checkpoint';
  if (!Number.isInteger(result.drivenMsec) || result.drivenMsec < 1 || result.drivenMsec > DRIVE_BOUND_MSEC) {
    return 'Driven time is outside the race bound';
  }
  if (result.bothFinished !== true) return 'The race runtime did not finish both members';
  const order = Array.isArray(result.finishOrder) ? result.finishOrder : [];
  const expected = new Set([record.hostId, record.memberId]);
  if (order.length !== 2 || new Set(order).size !== 2 || order.some((id) => !expected.has(id))) {
    return 'Finish order must be the two room members';
  }
  const source = result.sourceLog;
  if (
    !source ||
    source.resultsPath !== true ||
    source.hostLapCompleted !== true ||
    source.guestLapCompleted !== true ||
    source.hostCheckpoint !== true ||
    source.guestCheckpoint !== true
  ) {
    return 'Race result is missing runtime log evidence';
  }
  return '';
}

/**
 * Trusted server adapter boundary. There is deliberately NO HTTP binding route.
 * The adapter must authenticate/control the actual runtime before giving it this
 * round/course-scoped capability. This API alone does not verify Godot execution.
 * The current production server installs no adapter, so HTTP results fail closed.
 */
export function bindRuntimeProducer({ roomCode, roundId, courseId }) {
  const record = sessions.get(String(roomCode || '').toUpperCase());
  if (!record) return { status: 404, error: 'Room not found' };
  if (record.phase !== 'playing' || record.roundId !== roundId) {
    return { status: 409, error: 'Runtime binding requires the active playing round' };
  }
  if (record.transportBound && readPartyHttp(record.roomCode, record.hostSession).status !== 200) {
    closeRecord(record);
    return { status: 410, error: 'Room authority is closed, expired, or revoked' };
  }
  if (typeof courseId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(courseId)) {
    return { status: 400, error: 'Runtime binding requires a course id' };
  }
  if (record.runtimeSession) return { status: 409, error: 'Runtime is already bound to this round' };
  const runtimeSession = secret();
  runtimeSessions.set(runtimeSession, { roomCode: record.roomCode, roundId, courseId, consumed: false });
  record.runtimeSession = runtimeSession;
  return { status: 200, runtimeSession, roomCode: record.roomCode, roundId, courseId };
}

export function submitRuntimeRaceResult(result, presentedRuntimeSession) {
  const code = String(result?.roomCode || '').toUpperCase();
  const record = sessions.get(code);
  if (!record || !record.memberId) return { status: 404, error: 'Room members are not ready' };
  if (record.phase !== 'playing') return { status: 409, error: 'Runtime result requires the playing phase' };
  if (record.transportBound && readPartyHttp(record.roomCode, record.hostSession).status !== 200) {
    closeRecord(record);
    return { status: 410, error: 'Room authority is closed, expired, or revoked' };
  }
  if (!record.runtimeSession) {
    return { status: 503, error: 'runtime_authority_unavailable', message: 'No authenticated runtime adapter is bound to this round' };
  }
  const authority = runtimeSessions.get(String(presentedRuntimeSession || ''));
  if (!authority || authority.roomCode !== code || authority.roundId !== record.roundId) {
    return { status: 403, error: 'Runtime authority required for this room and round' };
  }
  if (authority.consumed) return { status: 409, error: 'Runtime result already submitted' };
  if (result?.courseId !== authority.courseId) return { status: 422, error: 'Race result is for a different bound course' };
  const problem = raceShape(record, result);
  if (problem) return { status: 422, error: problem };
  const digest = runtimeRaceDigest(result);
  if (result.runtimeDigest !== digest) return { status: 422, error: 'Race result digest does not match the runtime fields' };
  const stored = assertNoSecret(
    {
      applicationId: result.applicationId,
      roomCode: result.roomCode,
      roundId: record.roundId,
      courseId: result.courseId,
      hostMemberId: result.hostMemberId,
      guestMemberId: result.guestMemberId,
      lapsCompleted: { host: result.lapsCompleted.host, guest: result.lapsCompleted.guest },
      checkpointCrossings: { host: result.checkpointCrossings.host, guest: result.checkpointCrossings.guest },
      drivenMsec: result.drivenMsec,
      finishOrder: [...result.finishOrder],
      bothFinished: true,
      producedBy: result.producedBy,
      sourceLog: {
        resultsPath: true, hostLapCompleted: true, guestLapCompleted: true,
        hostCheckpoint: true, guestCheckpoint: true,
      },
      runtimeDigest: digest,
    },
    record.hostSession,
  );
  record.runtimeResult = stored;
  authority.consumed = true;
  note(record, 'logs', 'runtime_race_result', { courseId: stored.courseId, runtimeDigest: digest });
  note(record, 'telemetry', 'runtime_race_result', { courseId: stored.courseId, runtimeDigest: digest });
  return { status: 200, result: stored };
}

export function publishResult(presentedSession, packet, expectedRoomCode) {
  const active = context(presentedSession, 'host', expectedRoomCode);
  if ('error' in active) return active;
  const { record } = active;
  if (record.events.some((event) => event.type === 'result')) {
    return { status: 409, error: 'Result already published' };
  }
  if (record.phase !== 'playing') return { status: 409, error: 'Result publication requires the playing phase' };
  const digest = packet && typeof packet.runtimeDigest === 'string' ? packet.runtimeDigest : '';
  if (!record.runtimeResult || digest !== record.runtimeResult.runtimeDigest) {
    return { status: 422, error: 'Result is not the runtime race result' };
  }
  const event = {
    type: 'result',
    eventId: prefixedId('result'),
    result: record.runtimeResult,
    choice: null,
    acknowledgements: { host: false, guest: false },
  };
  record.events.push(event);
  record.phase = 'results';
  syncTransportPhase(record);
  note(record, 'logs', 'result_published', { eventId: event.eventId, runtimeDigest: digest });
  note(record, 'telemetry', 'result_published', { eventId: event.eventId, runtimeDigest: digest });
  return { status: 200, event: publicEvent(record, event) };
}

export function publishRematchOrExit(presentedSession, choice, expectedRoomCode) {
  const active = context(presentedSession, 'host', expectedRoomCode);
  if ('error' in active) return active;
  const { record } = active;
  if (choice !== 'rematch' && choice !== 'exit') {
    return { status: 400, error: 'Choice must be rematch or exit' };
  }
  if (record.phase !== 'results') return { status: 409, error: 'Rematch or exit requires results' };
  if (record.events.some((event) => event.type === 'rematch_or_exit')) {
    return { status: 409, error: 'Rematch or exit already published' };
  }
  const event = {
    type: 'rematch_or_exit',
    eventId: prefixedId('rematch-or-exit'),
    choice,
    result: null,
    acknowledgements: { host: false, guest: false },
  };
  record.events.push(event);
  note(record, 'logs', 'rematch_or_exit_published', { eventId: event.eventId, choice });
  note(record, 'telemetry', 'rematch_or_exit_published', { eventId: event.eventId, choice });
  return { status: 200, event: publicEvent(record, event) };
}

export function acknowledge(presentedSession, eventId, expectedRoomCode) {
  const active = context(presentedSession, null, expectedRoomCode);
  if ('error' in active) return active;
  const { record, found } = active;
  const event = record.events.find((item) => item.eventId === eventId);
  if (!event) return { status: 404, error: 'Event not found' };
  event.acknowledgements[found.role === 'host' ? 'host' : 'guest'] = true;
  note(record, 'logs', 'event_acknowledged', { eventId, role: found.role });
  note(record, 'telemetry', 'event_acknowledged', { eventId, role: found.role });
  return {
    status: 200,
    event: publicEvent(record, event),
    bothAcknowledged: event.acknowledgements.host === true && event.acknowledgements.guest === true,
  };
}

export function readLogs(roomCode) {
  const record = sessions.get(String(roomCode || '').toUpperCase());
  if (!record) return [];
  return assertNoSecret(record.logs.map((entry) => ({ ...entry })), record.hostSession);
}

export function readTelemetry(roomCode) {
  const record = sessions.get(String(roomCode || '').toUpperCase());
  if (!record) return [];
  return assertNoSecret(record.telemetry.map((entry) => ({ ...entry })), record.hostSession);
}
