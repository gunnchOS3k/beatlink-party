# Product Requirements — BeatLink Party

## 1. Purpose

Build a browser-based multiplayer rhythm and karaoke party game where a host runs the main game screen and players join from their phones.

## 2. Non-Negotiables

- No downloading or ripping third-party platform audio
- Phone-first multiplayer with room codes
- Host screen as shared stage
- Music source fallback when links are not playable
- Latency calibration (future production hardening)

## 3. MVP User Stories

### Host
- Create room, display code, select song, paste link, start/pause round, view results

### Player
- Join by code, enter name, choose role, play rhythm/vocal/hype inputs, view score

### Creator (future)
- Upload original music, provide lyrics, edit beatmaps

## 4. Functional Requirements (MVP)

| Area | Status |
|------|--------|
| Room system (create, join, ready, sync) | Implemented |
| Host application (lobby → gameplay → results) | Implemented |
| Player controller (role-specific UI) | Implemented |
| Link resolver (metadata only) | Implemented |
| Approved catalog (3 demo tracks) | Implemented |
| Beatmap schema + demo beatmaps | Implemented |
| Scoring + awards | Implemented |
| Audio upload / BPM detection | Planned Phase 3 |
| Beatmap editor | Planned Phase 5 |

## 5. Technical Requirements

- TypeScript monorepo (pnpm)
- React + Vite web apps
- Express + Socket.IO server
- In-memory room state (MVP)
- Redis/Postgres noted for production

## 6. APIs

See [API_SPEC.md](./API_SPEC.md)

## 7. Definition of Done

Feature is done when it works on host and phone, has tests, clear error states, respects music compliance, and is documented.

## 8. First Playable Demo Goal

Host on laptop/TV, four players on phones, approved song, three roles, awards at end — no manual required.
