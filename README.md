# BeatLink Party

**BeatLink Party** is a browser-based rhythm and karaoke party game. One host runs the main stage on a TV, laptop, or projector; players join from their phones with a room code. No app download required.

> **Demo GIF placeholder** — Record a session with host + 2 phone browsers to add here.

> **Screenshot placeholder** — Host lobby with room code and player list.

## MVP Features

- Host web app: create room, lobby, song selection, link paste, gameplay, results
- Player web app: join by code, role selection, phone controller, results
- Real-time multiplayer via Socket.IO
- Three roles: **Beat Tapper**, **Vocalist**, **Hype Captain**
- Approved demo catalog (3 royalty-free generated tracks)
- Beatmap JSON schema with generated demo beatmaps
- Link resolver for YouTube / Spotify / Apple Music (**metadata only** — no audio ripping)
- Scoring engine with timing grades and end-of-round awards
- Compliance-safe fallback messaging for unplayable links

## Legal / Compliance Note

This MVP **does not download, rip, or cache** audio from YouTube, Spotify, or Apple Music. Pasted links are used for identification and eligibility status only. Gameplay uses the internal approved demo catalog or future user-owned uploads. See [docs/MUSIC_COMPLIANCE.md](docs/MUSIC_COMPLIANCE.md).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces |
| Host / Player UI | React 18 + Vite |
| Server | Express + Socket.IO |
| Shared types | TypeScript + Zod |
| Game logic | `@beatlink/game-engine` package |
| Tests | Vitest |
| CI | GitHub Actions |

## Local Setup

**Requirements:** Node.js 20+, pnpm 9+

```bash
git clone https://github.com/gunnchOS3k/beatlink-party.git
cd beatlink-party
cp .env.example .env
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run web + server concurrently |
| `pnpm dev:web` | Vite dev server (port 5173) |
| `pnpm dev:server` | API + WebSocket server (port 3001) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run Vitest test suite |
| `pnpm test:network-load` | Real Socket.IO localhost load (8×25/50/100/300) |
| `pnpm compose:redis` | Start Redis via docker compose (durable rooms) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check all packages |

Set `REDIS_URL=redis://127.0.0.1:6379` (and optionally `BEATLINK_ROOM_STORE=redis`) for durable room snapshots. Unit tests keep the in-memory store.

## How to Run Host + Player

1. Start the stack: `pnpm dev`
2. **Host:** open [http://localhost:5173](http://localhost:5173) → **Create Room**
3. Note the room code on the host screen
4. **Players:** open [http://localhost:5173/join](http://localhost:5173/join) on phones (same Wi‑Fi) or new browser tabs
5. Enter code + name, pick a role, tap **Ready**
6. Host selects a demo song → **Start Countdown**
7. Play the round; view results and **Replay**

For local phone testing, use your machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.x:5173/join`).

## Testing

```bash
pnpm test
```

Tests cover room creation, player join, link resolver, beatmap validation, scoring, and state transitions.

## Repo Structure

```text
beatlink-party/
  apps/
    web/          # React host + player UI
    server/       # Express API + Socket.IO
  packages/
    shared/       # Types, constants, beatmap schema
    game-engine/  # Scoring, timing, awards, state machine
  content/
    songs/        # Approved demo catalog
    beatmaps/     # Demo beatmap JSON files
  docs/           # GDD, PRD, compliance, API spec
  tests/          # Vitest integration tests
  .github/workflows/ci.yml
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for phased delivery beyond MVP.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `pnpm test` and `pnpm lint` before opening a PR
4. Do **not** add features that download third-party platform audio without proper licensing

## License

MIT — Demo music is generated placeholder content for development only. Commercial release requires proper music and lyric licensing.
