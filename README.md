# beatlink-party

Browser-based rhythm/karaoke **party** game — host on a big screen, players join by room code from phones (no app store install).

> **Current release/state:** `INTEGRATED` MVP — compliance-safe demo catalog; link paste is metadata-only (no audio rip).

Ecosystem portal: [gunnchos-research-portal](https://github.com/gunnchOS3k/gunnchos-research-portal) · Product charter: [gunnchOS3k_PRODUCT_CHARTER.md](https://github.com/gunnchOS3k/gunnchos-7gc-ai-ran-field-kit/blob/main/program/charter/gunnchOS3k_PRODUCT_CHARTER.md)

## What is this?

pnpm monorepo: React host/player UI, Express+Socket.IO server, shared game engine, demo songs/beatmaps.

## Why does it exist?

Social music play for gunnchOS3k gatherings without claiming licensed streaming playback.

## Where does it fit?

Product Charter **layer 9**. Lab packaging optional; repo ≠ Lab production runtime PASS.

## What is real today?

- Host/player flows with Socket.IO
- Approved royalty-free demo catalog
- Vitest coverage for rooms/scoring/state

## What is simulated / modelled?

- Demo beatmaps / generated tracks
- Link resolver eligibility messaging without audio download

## What is physical / external pending?

- Broader music catalog under compliant licenses
- Device Lab production-runtime earn where applicable

## Try / inspect in 5 minutes

```bash
# Node 20+, pnpm 9+
pnpm install
pnpm dev
# Host http://localhost:5173 → Create Room; players /join with code
pnpm test
```

## Architecture

`apps/web`, `apps/server`, `packages/shared`, `packages/game-engine`, `content/`.

## Repo map

| Path | Role |
|---|---|
| `apps/web` | Host + player UI |
| `apps/server` | API + Socket.IO |
| `packages/shared` | Types/schema |
| `packages/game-engine` | Scoring/state |
| `content/` | Demo songs/beatmaps |
| `docs/` | GDD/PRD/compliance |

## Interfaces

HTTP + Socket.IO; optional Redis durable rooms. Music links = metadata only.

## Tests

```bash
pnpm test
pnpm typecheck
```

## Evidence

CI + Vitest; compliance note in [docs/MUSIC_COMPLIANCE.md](docs/MUSIC_COMPLIANCE.md).

## Known gaps

Licensed catalog expansion; polish; Lab runtime tokens.

## Beginner path

One TV host + phones = party — use demo songs first.

## Intern path

Add a test around scoring grades; keep compliance docs intact.

## Expert path

Room store durability + compliance firewall for links.

## Contribution path

UI/engine/tests. Never add audio ripping.

## Current release / state

**INTEGRATED** MVP. `game_repo_not_lab_runtime_proof`.

## Claim boundary

No commercial 6G · no audio rip from streaming links · Cursor DRAFT-only.

---

## Retained detail (post–Cycle 3A front door)

Full prior README: [docs/history/README_PRE_WP012.md](docs/history/README_PRE_WP012.md).
