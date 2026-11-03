/**
 * Create a Party is offered only while the browser socket is connected to
 * apps/server. That process is the room server. Redis is optional.
 * A Cloudflare Worker is not this server, and this branch does not add a paid host.
 *
 * CI run 39986079083 on b64b811 passed tests/socket_party_roundtrip.test.ts:
 * one host socket and two player sockets, join, and reconnect, in memory mode.
 * The public button still stays disabled until that socket is actually connected.
 */
export function partyCreateAllowed(socketConnected: boolean): boolean {
  return socketConnected;
}

export const PARTY_CREATE_OWNER_ACTION =
  "Create a Party stays off until the Node room server socket is connected. Wave007 starts apps/server on 127.0.0.1:3001. Set VITE_API_URL and VITE_WS_URL to that origin. Do not point them at a Cloudflare Worker, and do not add a new paid host.";

export function partyHttpCreateAllowed(apiUrl: string, backendConfigured: boolean): boolean {
  if (!backendConfigured) return false;
  try {
    const host = new URL(apiUrl).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}
