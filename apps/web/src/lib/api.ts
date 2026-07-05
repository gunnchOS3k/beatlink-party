const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export { API_URL, WS_URL };

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
