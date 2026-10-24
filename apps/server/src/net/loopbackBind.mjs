const LOOPBACK = new Set(['127.0.0.1', '::1']);

/** Refuse every non-loopback host. This function does not open a socket. */
export function loopbackBindHost(requested) {
  const host = requested == null || String(requested).trim() === '' ? '127.0.0.1' : String(requested).trim();
  if (host === 'localhost') return '127.0.0.1';
  if (!LOOPBACK.has(host)) {
    throw new Error('Refusing to listen on a non-loopback address');
  }
  return host;
}
