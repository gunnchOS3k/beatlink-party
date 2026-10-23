/**
 * Create a Party stays off until a Node room server accepts a second client.
 * Socket.IO is apps/server. It is not a Cloudflare Worker.
 * Do not set this true from a fixture, and do not add a paid host from this branch.
 *
 * Owner action: run apps/server on a host you already control, set
 * VITE_API_URL and VITE_WS_URL to that origin, and pass
 * tests/socket_party_roundtrip.test.ts against it. Redis is optional.
 */
export const PARTY_CREATE_ENABLED = false;

export const PARTY_CREATE_OWNER_ACTION =
  "Create a Party is off. Run apps/server on a host you already control, set VITE_API_URL and VITE_WS_URL to that origin, and pass tests/socket_party_roundtrip.test.ts against it. Do not point the web build at a Cloudflare Worker, and do not add a new paid host from this branch.";
