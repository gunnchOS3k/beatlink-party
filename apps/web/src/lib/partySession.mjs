/** Application-client party membership. The host session stays out of guest views. */

const SECRET_KEYS = new Set(["hostSession", "hostToken"]);

function stripSecrets(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(stripSecrets);
    return;
  }
  for (const key of Object.keys(node)) {
    if (SECRET_KEYS.has(key)) delete node[key];
    else stripSecrets(node[key]);
  }
}

export function publicPartyPayload(value, hostSession) {
  const cloned = JSON.parse(JSON.stringify(value ?? {}));
  stripSecrets(cloned);
  if (hostSession && JSON.stringify(cloned).includes(hostSession)) {
    throw new Error("HOST_SESSION_LEAKED");
  }
  return cloned;
}

export function applicationPartyPlan(baseUrl) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return {
    create: { method: "POST", url: `${base}/rooms`, body: {} },
    join(code) {
      return { method: "POST", url: `${base}/rooms/${encodeURIComponent(code)}/join`, body: {} };
    },
    disconnect(code, memberSession) {
      return {
        method: "POST",
        url: `${base}/rooms/${encodeURIComponent(code)}/disconnect`,
        body: { session: memberSession },
      };
    },
    end(code, hostSession) {
      return {
        method: "POST",
        url: `${base}/rooms/${encodeURIComponent(code)}/end`,
        body: { hostSession },
      };
    },
    unauthorizedEnd(code, hostId) {
      return {
        method: "POST",
        url: `${base}/rooms/${encodeURIComponent(code)}/end`,
        body: { hostId },
      };
    },
  };
}

function memberIdFromJoin(before, party) {
  const previous = new Set((before?.members || []).map((member) => member.id));
  const added = (party?.members || []).find((member) => !previous.has(member.id));
  return added?.id ?? null;
}

export async function runApplicationParty(send, baseUrl) {
  const plan = applicationPartyPlan(baseUrl);
  const created = await send(plan.create);
  const hostSession = created.body?.hostSession;
  const party = publicPartyPayload(created.body?.party, hostSession);
  if (!created.body?.code && party.code) created.body.code = party.code;
  if (!hostSession || !party.code || party.hostId === hostSession) {
    throw new Error("HOST_ID_IS_SESSION");
  }
  const joined = await send(plan.join(party.code));
  const guestParty = publicPartyPayload(joined.body?.party, hostSession);
  const memberId = memberIdFromJoin(party, guestParty);
  const memberSession = joined.body?.memberSession;
  if (!memberSession || !memberId || memberSession === hostSession) {
    throw new Error("MEMBER_SESSION_MISSING");
  }
  const guestView = publicPartyPayload(
    { party: guestParty, memberId },
    hostSession,
  );
  const logs = [{ event: "party.joined", code: party.code, memberId }];
  const telemetry = [{ name: "party.join", code: party.code, memberId }];
  const published = JSON.stringify({ guestView, logs, telemetry });
  if (published.includes(hostSession) || published.includes(memberSession)) {
    throw new Error("SESSION_LEAKED");
  }
  const denied = await send(plan.unauthorizedEnd(party.code, party.hostId));
  const left = await send(plan.disconnect(party.code, memberSession));
  const ended = await send(plan.end(party.code, hostSession));
  return {
    code: party.code,
    hostId: party.hostId,
    memberId,
    hostIdIsSession: party.hostId === hostSession,
    guestContainsHostSession: false,
    logContainsHostSession: false,
    telemetryContainsHostSession: false,
    unauthorizedEndStatus: denied.status,
    disconnectStatus: left.status,
    endStatus: ended.status,
    membersAfterDisconnect: left.members ?? null,
    storeClosed: ended.closed === true,
  };
}

const HOST_TOKEN_KEY = 'beatlink_host';

function browserApiUrl() {
  const env = import.meta.env;
  if (env && typeof env.VITE_API_URL === 'string' && env.VITE_API_URL) return env.VITE_API_URL;
  return 'http://localhost:3001';
}

function rememberHostSession(roomCode, hostSession) {
  localStorage.setItem(HOST_TOKEN_KEY, JSON.stringify({ roomCode, hostToken: hostSession }));
}

function rememberedHostSession(roomCode) {
  try {
    const raw = localStorage.getItem(HOST_TOKEN_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && parsed.roomCode === roomCode ? parsed.hostToken : undefined;
  } catch {
    return undefined;
  }
}

async function postJson(request) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body ?? {}),
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

export async function createHostParty() {
  const plan = applicationPartyPlan(browserApiUrl());
  const created = await postJson(plan.create);
  const hostSession = created.body && created.body.hostSession;
  const party = publicPartyPayload(created.body && created.body.party, hostSession);
  const code = (created.body && created.body.code) || party.code;
  if (!created.ok || !hostSession || !code || party.hostId === hostSession) {
    throw new Error((created.body && created.body.error) || 'Failed to create room');
  }
  rememberHostSession(code, hostSession);
  return { code };
}

export async function joinGuestParty(code) {
  const plan = applicationPartyPlan(browserApiUrl());
  const joined = await postJson(plan.join(code));
  const party = publicPartyPayload(joined.body && joined.body.party, undefined);
  const members = Array.isArray(party.members) ? party.members : [];
  const member = [...members].reverse().find((item) => item && item.role !== 'host');
  const memberSession = joined.body && joined.body.memberSession;
  if (!joined.ok || !memberSession || !member || !member.id) {
    throw new Error((joined.body && joined.body.error) || 'Join failed');
  }
  return { memberId: member.id, memberSession };
}

export async function disconnectGuestParty(code, memberSession) {
  const plan = applicationPartyPlan(browserApiUrl());
  await postJson(plan.disconnect(code, memberSession));
}

export async function endHostParty(code) {
  const hostSession = rememberedHostSession(code);
  if (!hostSession) return { ok: false, error: 'Host session required' };
  const plan = applicationPartyPlan(browserApiUrl());
  const ended = await postJson(plan.end(code, hostSession));
  publicPartyPayload(ended.body && ended.body.party, hostSession);
  return { ok: ended.ok, error: ended.body && ended.body.error };
}
