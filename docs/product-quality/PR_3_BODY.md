## Summary
- Song-link resolve (YouTube/Spotify oEmbed), calibration phase, host metronome for catalog tracks, room link persistence (branch tip `f88f3d7`).
- Defining paste → official auth/playback → calibrate → round → results is **not** complete for Spotify/Apple SDK; YouTube is best-effort embed.

## Final defining flow (target)
Paste link → metadata → official playback/auth → beat calibration → difficulty/mode → create room → lobby persistence → Pixel controller → countdown → synchronized round → results → Play Again / Another Song.

## Pixel tests
Not freshly verified on this branch for defining paste-link path. Prior catalog multiplayer Pixel evidence must not be treated as defining-gate PASS.

## APK metadata
Release APK on disk may predate this branch UI — rebuild required before claiming ship.

## Remaining limitations
- Official OAuth SDK playback incomplete
- Apple Music best-effort metadata only
- No copyrighted audio download/extraction (by design)

## Independent-verifier result
**NOT APPROVED FOR PR** — defining gate FAIL/BLOCKED (official playback, APK freshness, Pixel).

Awaiting Edmund’s final approval. Do not merge automatically.
