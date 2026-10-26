/** Versioned game-session contract. It does not play a Pedestrian race. */

import { randomBytes } from 'node:crypto';

export const GAME_SESSION_CONTRACT_NAME = 'gunnchos.beatlink.game_session';
export const GAME_SESSION_CONTRACT_VERSION = 1;
export const PEDESTRIAN_PURSUIT_APPLICATION_ID = 'pedestrian-pursuit';

const sessions = new Map();
const invitations = new Map();
const sessionsBySecret = new Map();

function secret() {
  return randomBytes(32).toString('hex');
}

function prefixedId(prefix) {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
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
}

export function openGameSession({ applicationId, roomCode }) {
  if (applicationId !== PEDESTRIAN_PURSUIT_APPLICATION_ID) {
    return { status: 400, error: 'Unsupported application' };
  }
  const code = String(roomCode || '').trim().toUpperCase();
  if (!code || code === applicationId || code === PEDESTRIAN_PURSUIT_APPLICATION_ID.toUpperCase()) {
    return { status: 400, error: 'Room code is separate from the application' };
  }
  if (sessions.has(code)) return { status: 409, error: 'Room already open' };
  const hostId = prefixedId('host');
  const hostSession = secret();
  const invitation = prefixedId('inv');
  if (hostId === hostSession || invitation === hostSession) throw new Error('HOST_ID_IS_SESSION');
  const record = {
    applicationId,
    roomCode: code,
    hostId,
    hostSession,
    invitation,
    memberId: null,
    memberSession: null,
    phase: 'lobby',
    events: [],
    logs: [],
    telemetry: [],
  };
  sessions.set(code, record);
  invitations.set(invitation, code);
  sessionsBySecret.set(hostSession, { roomCode: code, role: 'host' });
  note(record, 'logs', 'session_opened', { hostId });
  note(record, 'telemetry', 'session_opened', { hostId });
  return { status: 200, hostSession, invitation, session: publicSession(record) };
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

export function redeemInvitation(invitation) {
  const code = invitations.get(String(invitation || ''));
  const record = code ? sessions.get(code) : null;
  if (!record || record.phase === 'closed') return { status: 404, error: 'Invitation not found' };
  if (record.memberSession) return { status: 409, error: 'Invitation already redeemed' };
  const memberId = prefixedId('member');
  const memberSession = secret();
  if (memberSession === record.hostSession) throw new Error('MEMBER_SESSION_IS_HOST');
  record.memberId = memberId;
  record.memberSession = memberSession;
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

function actor(presentedSession) {
  return sessionsBySecret.get(String(presentedSession || '')) ?? null;
}

function hostAction(presentedSession, action, phase) {
  const found = actor(presentedSession);
  if (!found || found.role !== 'host') return { status: 403, error: 'Host session required' };
  const record = sessions.get(found.roomCode);
  if (!record) return { status: 404, error: 'Room not found' };
  record.phase = phase;
  note(record, 'logs', action, { hostId: record.hostId, phase });
  note(record, 'telemetry', action, { hostId: record.hostId, phase });
  return { status: 200, session: publicSession(record) };
}

export function startGame(presentedSession) {
  return hostAction(presentedSession, 'start', 'playing');
}

export function rematchGame(presentedSession) {
  return hostAction(presentedSession, 'rematch', 'lobby');
}

export function endGame(presentedSession) {
  return hostAction(presentedSession, 'end', 'closed');
}

export function publishResult(presentedSession, result) {
  const found = actor(presentedSession);
  if (!found || found.role !== 'host') return { status: 403, error: 'Host session required' };
  const record = sessions.get(found.roomCode);
  if (!record) return { status: 404, error: 'Room not found' };
  if (record.events.some((event) => event.type === 'result')) {
    return { status: 409, error: 'Result already published' };
  }
  const cloned = JSON.parse(JSON.stringify(result ?? {}));
  delete cloned.hostSession;
  delete cloned.hostToken;
  const event = {
    type: 'result',
    eventId: prefixedId('result'),
    result: assertNoSecret(cloned, record.hostSession),
    choice: null,
    acknowledgements: { host: false, guest: false },
  };
  record.events.push(event);
  note(record, 'logs', 'result_published', { eventId: event.eventId });
  note(record, 'telemetry', 'result_published', { eventId: event.eventId });
  return { status: 200, event: publicEvent(record, event) };
}

export function publishRematchOrExit(presentedSession, choice) {
  const found = actor(presentedSession);
  if (!found || found.role !== 'host') return { status: 403, error: 'Host session required' };
  if (choice !== 'rematch' && choice !== 'exit') {
    return { status: 400, error: 'Choice must be rematch or exit' };
  }
  const record = sessions.get(found.roomCode);
  if (!record) return { status: 404, error: 'Room not found' };
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

export function acknowledge(presentedSession, eventId) {
  const found = actor(presentedSession);
  if (!found) return { status: 403, error: 'Session required' };
  const record = sessions.get(found.roomCode);
  if (!record) return { status: 404, error: 'Room not found' };
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
