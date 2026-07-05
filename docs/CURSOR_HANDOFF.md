# Cursor Handoff — BeatLink Party

## Project Summary

BeatLink Party is a TypeScript monorepo for a Jackbox-style rhythm/karaoke party game. Host runs at `/host/:code`, players at `/join` → `/play/:code`.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

- Web: http://localhost:5173
- Server: http://localhost:3001

## Architecture

```text
apps/web       → React + Vite (host + player routes)
apps/server    → Express REST + Socket.IO realtime
packages/shared       → Types, Zod beatmap schema, constants
packages/game-engine  → Scoring, timing, awards, state machine
content/       → Demo catalog + beatmap JSON
```

## Critical Rules

1. **Never rip platform audio** — link resolver is metadata-only
2. **Placeholder lyrics only** — no copyrighted lyric text
3. **In-memory rooms** — MVP uses `RoomManager` Map; no Redis yet
4. **Server-authoritative game clock** — `gameStartTime` on room state

## Key Files

| File | Purpose |
|------|---------|
| `apps/server/src/rooms/RoomManager.ts` | Room lifecycle, scoring orchestration |
| `apps/server/src/music/linkResolver.ts` | URL parsing + eligibility |
| `apps/server/src/realtime/socket.ts` | Socket.IO event handlers |
| `packages/game-engine/src/scoring.ts` | Timing grades and points |
| `apps/web/src/pages/HostPage.tsx` | Host UI flow |
| `apps/web/src/pages/PlayerPage.tsx` | Phone controller UI |

## Common Tasks

### Add a demo song

1. Add entry to `content/songs/approved-demo-catalog.json`
2. Add `content/beatmaps/{beatmapId}.json` (or rely on generator in `store.ts`)
3. Run beatmap validation test

### Add a WebSocket event

1. Handle in `apps/server/src/realtime/socket.ts`
2. Add client listener in `apps/web/src/lib/socket.ts`
3. Update `docs/API_SPEC.md`

### Extend scoring

1. Edit `packages/game-engine/src/scoring.ts`
2. Wire in `RoomManager.processInput`
3. Add tests in `tests/scoring.test.ts`

## Testing

```bash
pnpm test        # all tests
pnpm typecheck   # TS across packages
pnpm lint        # ESLint
pnpm build       # production build
```

## Known MVP Limitations

- Host refresh requires `room.subscribe` (no persistent host token)
- No actual audio playback (visual/rhythm sync only)
- No upload pipeline yet
- Pitch detection not implemented
- 6 player max, 2-hour room TTL

## Next Recommended Features

1. Web Audio playback for approved catalog (local files)
2. Latency calibration screen
3. User upload with signed URLs
4. Redis-backed room persistence
5. Beatmap editor admin page

## Compliance Reminder

Before any music feature: read `docs/MUSIC_COMPLIANCE.md` and confirm `playbackStatus` is set correctly. When in doubt, return `METADATA_ONLY`.
