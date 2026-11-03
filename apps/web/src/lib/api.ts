const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export { API_URL, WS_URL };

/** True when the packaged app has no production backend configured. */
export function isBackendConfigured(): boolean {
  const api = import.meta.env.VITE_API_URL;
  const ws = import.meta.env.VITE_WS_URL;
  if (api && ws) return true;
  if (typeof window !== 'undefined' && window.location.protocol === 'capacitor:') {
    return false;
  }
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export async function fetchSongs() {
  const res = await fetch(`${API_URL}/songs`);
  if (!res.ok) throw new Error('Failed to load songs');
  return res.json() as Promise<{ songs: import('@beatlink/shared').SongCatalogEntry[] }>;
}

export async function resolveLink(url: string) {
  const res = await fetch(`${API_URL}/songs/resolve-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to resolve link');
  return res.json() as Promise<import('@beatlink/shared').LinkResolveResult>;
}

export async function evaluateDirectHttps(body: {
  url: string;
  mimeType?: string | null;
  contentSha256?: string | null;
  composition: {
    basis: string;
    syncAuthorized: boolean;
    adaptationAuthorized: boolean;
    ccDeedUrl?: string | null;
    licenseVersion?: string | null;
    attributionText?: string | null;
  };
  soundRecording: {
    basis: string;
    reproductionAuthorized: boolean;
    ccDeedUrl?: string | null;
    licenseVersion?: string | null;
    attributionText?: string | null;
  };
  beatGridReady: boolean;
  chartsReady: boolean;
  probe?: boolean;
}) {
  const res = await fetch(`${API_URL}/songs/evaluate-direct-https`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok && res.status !== 422) {
    throw new Error(String(json.error ?? 'Failed to evaluate direct HTTPS'));
  }
  return json;
}

export async function ingestCreatorBinary(body: {
  trackId: string;
  title: string;
  artist: string;
  attestorId: string;
  ownsOrLicensed: boolean;
  acknowledgeNoAutoPublish: boolean;
  audioBase64: string;
  mimeType?: string;
  declaredLicense?: string;
}) {
  const res = await fetch(`${API_URL}/content/creator-ingest-binary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok && res.status !== 422) {
    throw new Error(String(json.error ?? 'Creator binary ingest failed'));
  }
  return json;
}

export async function fetchProviderStatus() {
  const res = await fetch(`${API_URL}/providers/status`);
  if (!res.ok) throw new Error('Failed to load provider status');
  return res.json() as Promise<{ providers: import('@beatlink/shared').ProviderAuthStatus }>;
}
