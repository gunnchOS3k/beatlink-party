# API Specification — BeatLink Party (MVP)

Base URL: `http://localhost:3001`

## REST Endpoints

### `GET /health`

Health check.

**Response:** `{ "status": "ok", "service": "beatlink-party" }`

---

### `POST /rooms`

Create a room (HTTP alternative to WebSocket).

**Response:** `{ "code": "ABCDE", "room": RoomState }`

---

### `GET /rooms/:code`

Get room state by code.

**Response:** `{ "room": RoomState }`  
**404** if room not found or expired.

---

### `GET /songs`

List approved demo catalog.

**Response:** `{ "songs": SongCatalogEntry[] }`

---

### `GET /beatmaps/:songId`

Get beatmap for a catalog song ID.

**Response:** `{ "beatmap": Beatmap }`

---

### `POST /songs/resolve-link`

Resolve a music URL (metadata only).

**Body:** `{ "url": "https://..." }`

**Response:** `LinkResolveResult`

```json
{
  "platform": "youtube",
  "sourceId": "dQw4w9WgXcQ",
  "title": null,
  "artist": null,
  "playbackStatus": "METADATA_ONLY",
  "analysisEligible": false,
  "lyricsEligible": false,
  "matchedCatalogId": null,
  "message": "Metadata only — choose an approved song or upload music you own.",
  "fallbackOptions": ["Choose an approved demo song from the catalog", "..."]
}
```

## WebSocket Events (Socket.IO)

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room.create` | — | Create room |
| `room.subscribe` | `{ code }` | Subscribe to room updates (host refresh) |
| `room.join` | `{ code, name, playerId? }` | Join or reconnect |
| `room.leave` | — | Disconnect player |
| `room.set_role` | `{ code, playerId, role }` | Assign role |
| `room.ready` | `{ code, playerId, ready }` | Ready toggle |
| `room.select_song` | `{ code, songId }` | Host selects song |
| `game.start_countdown` | `{ code }` | Start 3-2-1 countdown |
| `game.input` | `{ code, input }` | Player input event |
| `game.replay` | `{ code }` | Reset to lobby |
| `game.tick` | `{ code }` | Request game time sync |

### Server → Client

| Event | Payload |
|-------|---------|
| `room.state` | `RoomState` |
| `room.player_joined` | `{ player, room }` |
| `room.player_left` | `{ room }` |
| `room.ready_changed` | `{ room, playerId }` |
| `game.countdown` | `{ room, countdown }` |
| `game.started` | `{ room, beatmap, startTime }` |
| `game.score_update` | `{ room, scoreEvent }` |
| `game.ended` | `{ room, results }` |
| `game.tick` | `{ gameTimeMs, room }` |

## Data Models

See `@beatlink/shared` types: `RoomState`, `Player`, `Beatmap`, `LinkResolveResult`, `GameResults`.

## Future Production APIs

- `POST /songs/upload` — signed URL upload flow
- `POST /beatmaps/generate` — async beatmap generation job
- `GET /sessions/:id/results` — persisted session results
- Redis-backed room persistence
- PostgreSQL for users, songs, beatmaps
