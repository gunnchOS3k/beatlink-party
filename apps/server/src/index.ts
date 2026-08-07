import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { registerTelemetrySink } from '@beatlink/shared';
import { setupRealtime } from './realtime/socket.js';
import { loadCatalog, getBeatmapForSong } from './beatmaps/store.js';
import { getProviderAuthStatus, resolveLink } from './music/linkResolver.js';
import { roomManager } from './rooms/RoomManager.js';

if (process.env.BEATLINK_TELEMETRY === '1') {
  registerTelemetrySink((event) => {
    console.log('[telemetry]', event.name, event.roomCodeHash, event.meta ?? {});
  });
}

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'beatlink-party' });
});

app.post('/rooms', (_req, res) => {
  const room = roomManager.createRoom('http-' + Date.now());
  res.json({ code: room.code, room });
});

app.get('/rooms/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room: roomManager.stripInternal(room) });
});

app.get('/songs', (_req, res) => {
  res.json({ songs: loadCatalog() });
});

app.get('/beatmaps/:songId', (req, res) => {
  const beatmap = getBeatmapForSong(req.params.songId);
  if (!beatmap) return res.status(404).json({ error: 'Beatmap not found' });
  res.json({ beatmap });
});

app.get('/providers/status', (_req, res) => {
  res.json({ providers: getProviderAuthStatus() });
});

app.post('/songs/resolve-link', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const result = await resolveLink(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to resolve link',
    });
  }
});

const httpServer = createServer(app);
setupRealtime(httpServer, CORS_ORIGIN);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BeatLink Party server running on http://0.0.0.0:${PORT}`);
});
