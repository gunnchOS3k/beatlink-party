import { API_URL } from "./api";
import { loadHostToken, storeHostToken } from "./socket";
import { applicationPartyPlan, publicPartyPayload } from "./partySession.mjs";

type PartyBody = {
  code?: string;
  hostSession?: string;
  memberSession?: string;
  party?: { code?: string; hostId?: string; members?: Array<{ id: string }> };
  error?: string;
};

async function postParty(request: { url: string; method: string; body: object }): Promise<{ ok: boolean; status: number; body: PartyBody }> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });
  const body = (await response.json()) as PartyBody;
  return { ok: response.ok, status: response.status, body };
}

export async function createHostParty(): Promise<{ code: string }> {
  const plan = applicationPartyPlan(API_URL);
  const created = await postParty(plan.create);
  const hostSession = created.body.hostSession;
  const party = publicPartyPayload(created.body.party, hostSession);
  const code = created.body.code || party.code;
  if (!created.ok || !hostSession || !code || party.hostId === hostSession) {
    throw new Error(created.body.error || "Failed to create room");
  }
  storeHostToken(code, hostSession);
  return { code };
}

export async function joinGuestParty(code: string): Promise<{ memberId: string; memberSession: string }> {
  const plan = applicationPartyPlan(API_URL);
  const joined = await postParty(plan.join(code));
  const party = publicPartyPayload(joined.body.party, undefined);
  const member = [...(party.members || [])].reverse().find((item: { id: string; role?: string }) => item.role !== "host");
  if (!joined.ok || !joined.body.memberSession || !member?.id) {
    throw new Error(joined.body.error || "Join failed");
  }
  return { memberId: member.id, memberSession: joined.body.memberSession };
}

export async function disconnectGuestParty(code: string, memberSession: string): Promise<void> {
  const plan = applicationPartyPlan(API_URL);
  await postParty(plan.disconnect(code, memberSession));
}

export async function endHostParty(code: string): Promise<{ ok: boolean; error?: string }> {
  const hostSession = loadHostToken(code);
  if (!hostSession) return { ok: false, error: "Host session required" };
  const plan = applicationPartyPlan(API_URL);
  const ended = await postParty(plan.end(code, hostSession));
  publicPartyPayload(ended.body.party, hostSession);
  return { ok: ended.ok, error: ended.body.error };
}
