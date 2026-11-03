import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  disconnectRoomHttp,
  endRoomHttp,
  joinRoomHttp,
  createRoomHttp,
  resetAuthority,
  roomAuthority,
} from "../../../server/src/rooms/roomHttp.mjs";
import { applicationPartyPlan, runApplicationParty } from "./partySession.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));

function send(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const body = request.body || {};
  if (request.method === "POST" && parts.length === 1 && parts[0] === "rooms") {
    assert.deepEqual(body, {});
    const code = randomBytes(3).toString("hex").toUpperCase();
    const hostId = `host-${randomBytes(4).toString("hex")}`;
    return createRoomHttp({ code, hostId });
  }
  const code = decodeURIComponent(parts[1] || "");
  const action = parts[2];
  if (request.method === "POST" && action === "join") {
    assert.deepEqual(body, {});
    assert.equal(Object.hasOwn(body, "hostId"), false);
    assert.equal(Object.hasOwn(body, "hostSession"), false);
    return joinRoomHttp(code);
  }
  if (request.method === "POST" && action === "disconnect") {
    const result = disconnectRoomHttp(code, body.session);
    const party = roomAuthority.parties.get(code.toUpperCase());
    return { ...result, members: party ? party.members.length : 0 };
  }
  if (request.method === "POST" && action === "end") {
    assert.equal(Object.hasOwn(body, "hostId") && Object.hasOwn(body, "hostSession"), false);
    const result = endRoomHttp(code, String(body.hostSession || ""));
    if (result.status === 200) roomAuthority.parties.delete(code.toUpperCase());
    return { ...result, closed: !roomAuthority.parties.has(code.toUpperCase()) };
  }
  throw new Error(`unexpected ${request.method} ${url.pathname}`);
}

test("application client party uses one room store and keeps the host session private", async () => {
  resetAuthority();
  const plan = applicationPartyPlan("http://127.0.0.1:3001");
  assert.deepEqual(plan.join("AB12").body, {});
  assert.deepEqual(plan.unauthorizedEnd("AB12", "host-1").body, { hostId: "host-1" });
  assert.equal(Object.hasOwn(plan.unauthorizedEnd("AB12", "host-1").body, "hostSession"), false);

  const report = await runApplicationParty(send, "http://127.0.0.1:3001");
  assert.equal(report.hostIdIsSession, false);
  assert.equal(report.unauthorizedEndStatus, 403);
  assert.equal(report.disconnectStatus, 200);
  assert.equal(report.membersAfterDisconnect, 1);
  assert.equal(report.endStatus, 200);
  assert.equal(report.storeClosed, true);
  assert.equal(roomAuthority.parties.has(report.code), false);
  assert.equal(JSON.stringify(report).includes("hostSession"), false);

  const manager = readFileSync(new URL("../../../server/src/rooms/RoomManager.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../../../server/src/index.ts", import.meta.url), "utf8");
  assert.match(manager, /roomAuthority\.parties/);
  assert.match(index, /disconnectRoomHttp/);
  assert.match(index, /endRoomHttp/);
  assert.match(index, /roomManager\.shutdownRoom/);
  assert.equal(here.includes("/apps/web/src/lib/"), true);
});
