import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import type { DifficultyId, GameModeId } from '@beatlink/shared';
import { registerTelemetrySink } from '@beatlink/shared';
import { listGameModes } from '@beatlink/game-engine';
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

app.post('/rooms', (req, res) => {
  const body = (req.body ?? {}) as {
    publicOrigin?: string;
    gameMode?: GameModeId;
    difficulty?: DifficultyId;
  };
  const room = roomManager.createRoom('http-' + Date.now(), {
    publicOrigin: body.publicOrigin,
    gameMode: body.gameMode,
    difficulty: body.difficulty,
  });
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

app.get('/modes', (_req, res) => {
  res.json({
    modes: listGameModes().map((m) => ({
      id: m.id,
      label: m.label,
      tagline: m.tagline,
      primaryRoles: m.primaryRoles,
      micPolicy: m.micPolicy,
      tutorial: m.tutorial,
    })),
  });
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

const purgeTimer = setInterval(() => {
  roomManager.purgeExpiredRooms();
}, 60_000);
purgeTimer.unref?.();

function cleanShutdown(signal: string) {
  console.log(`[beatlink] clean shutdown on ${signal}`);
  // Expire every live room so clients observe closed/absent state.
  roomManager.purgeExpiredRooms(Number.MAX_SAFE_INTEGER);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref?.();
}

process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
process.on('SIGINT', () => cleanShutdown('SIGINT'));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`BeatLink Party server running on http://0.0.0.0:${PORT}`);
});
