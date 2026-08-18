# Human playtest packet — BeatLink Party

**Status:** `HUMAN_QA_PENDING`

Automated tests are not human playtests. Do not fabricate participant evidence. Do not call this a finished vertical slice.

## Journey to run

1. `cp .env.example .env && pnpm install && pnpm dev`
2. Host: Create Room; note 5-character code.
3. Two player tabs: Join with code, pick roles (Beat Tapper / Vocalist / Hype Captain), Ready.
4. Host: demo song → calibrate → countdown → play → results → Replay.
5. Disconnect one player; confirm reconnect / host continuity.
6. Confirm pasted YouTube/Spotify links stay metadata-only (no ripping).


## Record (no PII in public git)

Date, device, duration, crashes, unplayable steps.

Pixel 6a remains blocked until `docs/PIXEL_6A_ACCEPTANCE.md` is no longer unauthorized.
