import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DifficultyId, GameModeId } from '@beatlink/shared';
import { registerTelemetrySink } from '@beatlink/shared';
import {
  createDefaultProviderBundle,
  ingestCreatorOwnedBinary,
  ingestCreatorOwnedStub,
  listGameModes,
} from '@beatlink/game-engine';
import { setupRealtime } from './realtime/socket.js';
import { loadCatalog, getBeatmapForSong } from './beatmaps/store.js';
import { getProviderAuthStatus, resolveLink } from './music/linkResolver.js';
import { roomManager } from './rooms/RoomManager.js';
import { createRoomStoreFromEnv } from './rooms/store/index.js';
import { isPartyLanBindEnabled, loopbackBindHost } from './net/loopbackBind.mjs';
import { roomAuthority } from './rooms/roomHttp.mjs';
import {
  disconnectRoomHttp,
  endRoomHttp,
  joinRoomHttp,
  publicParty,
  readPartyHttp,
} from './rooms/roomHttp.mjs';
import {
  endGame,
  guestPayload,
  openGameSessionOnRoom,
  publishRematchOrExit,
  disconnectGuest,
  publishResult,
  reconnectGuest,
  redeemInvitationOnRoom,
  rematchGame,
  startGame,
  submitRuntimeRaceResult,
} from './rooms/gameSessionContract.mjs';

if (process.env.BEATLINK_TELEMETRY === '1') {
  registerTelemetrySink((event) => {
    console.log('[telemetry]', event.name, event.roomCodeHash, event.meta ?? {});
  });
}

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const __dirname = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(__dirname, '../../../content');

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '14mb' }));
/** Rights-cleared launch WAV / rights JSON only — never a stream rip cache. */
app.use('/content', express.static(contentRoot, { fallthrough: true, index: false }));

const providers = createDefaultProviderBundle();
let roomStoreBackend: 'memory' | 'redis' = 'memory';

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'beatlink-party',
    roomStore: roomStoreBackend,
    partyLan: isPartyLanBindEnabled(),
  });
});

/**
 * Creator-owned ingest stub — metadata + rights attestation only.
 * Never accepts streaming rips, lyric scrapes, or DRM bypass.
 */
app.post('/content/creator-ingest', (req, res) => {
  const body = (req.body ?? {}) as {
    trackId?: string;
    title?: string;
    artist?: string;
    attestorId?: string;
    ownsOrLicensed?: boolean;
    durationMs?: number;
    bpm?: number;
    pitchHintHz?: number | null;
    claimedSourceUrl?: string | null;
    ripIntentSignals?: string[];
    declaredLicense?: string;
  };
  if (!body.trackId || !body.title || !body.artist || !body.attestorId) {
    return res.status(400).json({
      error: 'trackId, title, artist, and attestorId are required',
      honesty: {
        ripPerformed: false,
        lyricsScraped: false,
        drmCircumvented: false,
        commercialLicenseClaimed: false,
        audioBinaryStored: false,
      },
    });
  }
  const result = ingestCreatorOwnedStub({
    trackId: String(body.trackId),
    title: String(body.title),
    artist: String(body.artist),
    attestorId: String(body.attestorId),
    ownsOrLicensed: Boolean(body.ownsOrLicensed),
    durationMs: body.durationMs,
    bpm: body.bpm,
    pitchHintHz: body.pitchHintHz ?? null,
    claimedSourceUrl: body.claimedSourceUrl ?? null,
    ripIntentSignals: body.ripIntentSignals,
    declaredLicense: body.declaredLicense as
      | 'creator_owned'
      | 'creative_commons'
      | 'public_domain'
      | 'licensed_pack'
      | undefined,
  });
  return res.status(result.ok ? 200 : 422).json(result);
});

/**
 * Creator-owned local WAV binary ingest — validate/hash/BPM/chart draft.
 * Never auto-publishes. Rejects platform URLs. Does not scrape lyrics or bypass DRM.
 */
app.post('/content/creator-ingest-binary', (req, res) => {
  const body = (req.body ?? {}) as {
    trackId?: string;
    title?: string;
    artist?: string;
    attestorId?: string;
    ownsOrLicensed?: boolean;
    durationMs?: number;
    bpm?: number;
    pitchHintHz?: number | null;
    claimedSourceUrl?: string | null;
    ripIntentSignals?: string[];
    declaredLicense?: string;
    mimeType?: string;
    acknowledgeNoAutoPublish?: boolean;
    /** Base64 WAV bytes (local owned media only). */
    audioBase64?: string;
  };
  if (!body.trackId || !body.title || !body.artist || !body.attestorId) {
    return res.status(400).json({
      error: 'trackId, title, artist, and attestorId are required',
      honesty: {
        ripPerformed: false,
        lyricsScraped: false,
        drmCircumvented: false,
        commercialLicenseClaimed: false,
        audioBinaryStored: false,
        autoPublished: false,
      },
    });
  }
  if (!body.audioBase64) {
    return res.status(400).json({
      error: 'audioBase64 (PCM WAV) is required for binary ingest',
      honesty: {
        ripPerformed: false,
        lyricsScraped: false,
        drmCircumvented: false,
        commercialLicenseClaimed: false,
        audioBinaryStored: false,
        autoPublished: false,
      },
    });
  }
  let audioBytes: Uint8Array;
  try {
    audioBytes = Uint8Array.from(Buffer.from(String(body.audioBase64), 'base64'));
  } catch {
    return res.status(400).json({
      error: 'audioBase64 must be valid base64',
      honesty: {
        ripPerformed: false,
        lyricsScraped: false,
        drmCircumvented: false,
        commercialLicenseClaimed: false,
        audioBinaryStored: false,
        autoPublished: false,
      },
    });
  }
  const result = ingestCreatorOwnedBinary({
    trackId: String(body.trackId),
    title: String(body.title),
    artist: String(body.artist),
    attestorId: String(body.attestorId),
    ownsOrLicensed: Boolean(body.ownsOrLicensed),
    durationMs: body.durationMs,
    bpm: body.bpm,
    pitchHintHz: body.pitchHintHz ?? null,
    claimedSourceUrl: body.claimedSourceUrl ?? null,
    ripIntentSignals: body.ripIntentSignals,
    declaredLicense: body.declaredLicense as
      | 'creator_owned'
      | 'creative_commons'
      | 'public_domain'
      | 'licensed_pack'
      | undefined,
    mimeType: body.mimeType ?? 'audio/wav',
    acknowledgeNoAutoPublish: Boolean(body.acknowledgeNoAutoPublish),
    audioBytes,
  });
  // Never return chart note dumps larger than needed — strip to summary for HTTP.
  const { chartEditor, ...rest } = result;
  return res.status(result.ok ? 200 : 422).json({
    ...rest,
    chartEditorSummary: chartEditor
      ? {
          noteCount: chartEditor.chart.notes.length,
          confidenceGate: chartEditor.confidenceGate,
          bpm: chartEditor.chart.bpm,
          revision: chartEditor.revision,
        }
      : null,
  });
});

app.post('/rooms', (req, res) => {
  const body = (req.body ?? {}) as {
    publicOrigin?: string;
    gameMode?: GameModeId;
    difficulty?: DifficultyId;
  };
  const created = roomManager.createRoom('http-' + Date.now(), {
    publicOrigin: body.publicOrigin,
    gameMode: body.gameMode,
    difficulty: body.difficulty,
  });
  const hostSession = created.hostToken;
  const { hostToken: _hostSession, ...room } = created;
  void _hostSession;
  res.json({ code: room.code, room, party: publicParty(roomAuthority.parties.get(room.code)), hostSession });
});

app.post('/rooms/:code/join', (req, res) => {
  const result = joinRoomHttp(req.params.code);
  res.status(result.status).json(result.body);
});

app.post('/rooms/:code/disconnect', (req, res) => {
  const result = disconnectRoomHttp(req.params.code, String(req.body?.session ?? ''));
  res.status(result.status).json(result.body);
});

app.get('/rooms/:code/party', (req, res) => {
  const header = String(req.get('authorization') || '');
  const session = header.startsWith('Bearer ') ? header.slice(7) : '';
  const result = readPartyHttp(req.params.code, session);
  res.status(result.status).json(result.body);
});

app.post('/rooms/:code/end', (req, res) => {
  const hostSession = String(req.body?.hostSession ?? '');
  const result = endRoomHttp(req.params.code, hostSession);
  if (result.status === 200) roomManager.shutdownRoom(req.params.code, { hostToken: hostSession, reason: 'host_end' });
  res.status(result.status).json(result.body);
});

app.post('/game-sessions', (req, res) => {
  const body = (req.body ?? {}) as { applicationId?: string; hostSession?: string; hostId?: string };
  if (body.hostSession || body.hostId) {
    return res.status(400).json({ error: 'Host credentials are server-issued' });
  }
  const opened = openGameSessionOnRoom(String(body.applicationId ?? ''));
  if ('error' in opened) return res.status(opened.status).json({ error: opened.error });
  return res.status(200).json({
    invitation: opened.invitation,
    hostSession: opened.hostSession,
    session: opened.session,
  });
});

app.post('/game-sessions/:code/redeem', (req, res) => {
  const redeemed = redeemInvitationOnRoom(String(req.body?.invitation ?? ''));
  if ('error' in redeemed) return res.status(redeemed.status).json({ error: redeemed.error });
  if (redeemed.payload.roomCode !== req.params.code.toUpperCase()) {
    return res.status(404).json({ error: 'Invitation is for a different room' });
  }
  const visible = guestPayload(req.params.code);
  return res.status(200).json({
    memberId: redeemed.memberId,
    memberSession: redeemed.memberSession,
    payload: visible.status === 200 ? visible.payload : redeemed.payload,
  });
});

app.post('/game-sessions/:code/runtime-result', (req, res) => {
  const submitted = submitRuntimeRaceResult({
    ...(req.body ?? {}),
    roomCode: String(req.params.code || '').toUpperCase(),
  });
  if ('error' in submitted) return res.status(submitted.status).json({ error: submitted.error });
  return res.status(200).json({ result: submitted.result });
});

app.post('/game-sessions/:code/result', (req, res) => {
  const published = publishResult(String(req.body?.hostSession ?? ''), {
    runtimeDigest: typeof req.body?.runtimeDigest === 'string' ? req.body.runtimeDigest : '',
  });
  if ('error' in published) return res.status(published.status).json({ error: published.error });
  return res.status(200).json({ event: published.event });
});

app.post('/game-sessions/:code/:action', (req, res) => {
  const action = req.params.action;
  const presented = String(req.body?.session ?? '');
  const outcome =
    action === 'start' ? startGame(presented)
    : action === 'rematch' ? rematchGame(presented)
    : action === 'end' ? endGame(presented)
    : action === 'disconnect' ? disconnectGuest(presented)
    : action === 'reconnect' ? reconnectGuest(presented)
    : action === 'rematch-or-exit'
      ? publishRematchOrExit(presented, req.body?.choice === 'rematch' ? 'rematch' : 'exit')
      : null;
  if (!outcome) return res.status(404).json({ error: 'Unknown game session action' });
  if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error });
  return res.status(200).json(outcome);
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
  res.json({
    providers: getProviderAuthStatus(),
    lyrics: {
      mock: providers.lyrics.mock.id,
      public_domain: providers.lyrics.publicDomain.id,
      commercial_external: providers.lyrics.commercialExternal.id,
      commercial_external_note: 'EXTERNAL — not wired in-repo',
    },
    music_catalog: {
      mock: providers.music.mock.id,
      public_domain: providers.music.publicDomain.id,
      commercial_external: providers.music.commercialExternal.id,
      commercial_external_note: 'EXTERNAL — not wired in-repo',
    },
  });
});

app.get('/providers/lyrics/:trackId', async (req, res) => {
  const source = String(req.query.source ?? 'public_domain');
  const provider =
    source === 'mock'
      ? providers.lyrics.mock
      : source === 'commercial'
        ? providers.lyrics.commercialExternal
        : providers.lyrics.publicDomain;
  const doc = await provider.fetchLyrics(req.params.trackId);
  if (!doc) {
    return res.status(404).json({ error: 'lyrics not found', external: provider.externalCommercial });
  }
  res.json({ lyrics: doc });
});

app.get('/providers/music/search', async (req, res) => {
  const q = String(req.query.q ?? '');
  const source = String(req.query.source ?? 'public_domain');
  const provider =
    source === 'mock'
      ? providers.music.mock
      : source === 'commercial'
        ? providers.music.commercialExternal
        : providers.music.publicDomain;
  const tracks = await provider.search(q);
  res.json({ tracks, externalCommercial: provider.externalCommercial });
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

async function main() {
  const { store, backend, hydrated } = await createRoomStoreFromEnv();
  roomStoreBackend = backend;
  roomManager.replaceStore(store);
  if (backend === 'redis') {
    console.log(`[beatlink] durable room store=redis hydrated=${hydrated}`);
  }

  const httpServer = createServer(app);
  setupRealtime(httpServer, CORS_ORIGIN);

  const purgeTimer = setInterval(() => {
    roomManager.purgeExpiredRooms();
  }, 60_000);
  purgeTimer.unref?.();

  function cleanShutdown(signal: string) {
    console.log(`[beatlink] clean shutdown on ${signal}`);
    roomManager.purgeExpiredRooms(Number.MAX_SAFE_INTEGER);
    void store.flush?.();
    void store.close?.();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref?.();
  }

  process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
  process.on('SIGINT', () => cleanShutdown('SIGINT'));

  const bindHost = loopbackBindHost(process.env.BEATLINK_BIND_HOST);
  httpServer.listen(PORT, bindHost, () => {
    const lan = isPartyLanBindEnabled();
    console.log(
      `BeatLink Party server running on http://${bindHost}:${PORT} (roomStore=${roomStoreBackend}, partyLan=${lan})`,
    );
    if (lan && bindHost !== '127.0.0.1' && bindHost !== '::1') {
      console.warn(
        '[beatlink] SECURITY: BEATLINK_PARTY_LAN enabled — server reachable on local Wi-Fi. Use only on trusted private networks for phone/TV party testing. Do not expose to the public internet. See docs/LAN_PARTY_PHONE_TV.md',
      );
    }
  });
}

void main();
