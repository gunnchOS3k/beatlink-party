const LOOPBACK = new Set(['127.0.0.1', '::1']);

/** RFC1918 + link-local — allowed only with explicit party LAN flag. */
const PRIVATE_LAN_V4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/;

function partyLanEnabled(env = process.env) {
  const flag = String(env.BEATLINK_PARTY_LAN ?? env.BEATLINK_ALLOW_LAN_BIND ?? '')
    .trim()
    .toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function isPrivateLanHost(host) {
  if (host === '0.0.0.0' || host === '::') return true;
  return PRIVATE_LAN_V4.test(host);
}

/**
 * Resolve listen host.
 * Default: loopback only.
 * With BEATLINK_PARTY_LAN=1 (or BEATLINK_ALLOW_LAN_BIND=1): allow 0.0.0.0 / private LAN
 * for local Wi-Fi phone+TV party testing. Never opens a socket itself.
 * Public internet binds remain refused.
 */
export function loopbackBindHost(requested, env = process.env) {
  const host =
    requested == null || String(requested).trim() === ''
      ? '127.0.0.1'
      : String(requested).trim();
  if (host === 'localhost') return '127.0.0.1';
  if (LOOPBACK.has(host)) return host;

  if (partyLanEnabled(env) && isPrivateLanHost(host)) {
    return host;
  }

  if (isPrivateLanHost(host) || host === '0.0.0.0' || host === '::') {
    throw new Error(
      'Refusing non-loopback bind without BEATLINK_PARTY_LAN=1 (local-dev/party Wi-Fi only — see docs/LAN_PARTY_PHONE_TV.md)',
    );
  }
  throw new Error('Refusing to listen on a non-loopback address');
}

export function isPartyLanBindEnabled(env = process.env) {
  return partyLanEnabled(env);
}
