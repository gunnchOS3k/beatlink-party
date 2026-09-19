# VXP-5 Before / After — BeatLink Party Stage Energy

## Thesis
Internal design label **Stage Energy**. Player-facing name remains **BeatLink Party**.
Music festival energy + game-show clarity + phone-party immediacy.
Hierarchy: PARTY → PEOPLE → MUSIC → ROLE → PLAY → REACTION → CELEBRATION → SETTINGS.

## Before (main @ `22a21a4`)
- Landing led with Create Room / Join / Audience, but buried first-minutes, how-to, device role, and accessibility in a stacked card below CTAs.
- Host lobby mixed room code, QR, player list, achievements, song select, link paste, and settings in dense card grids.
- Hype Captain controls used emoji (🎉💡🚀⚡).
- Network states used checkmarks / plain text; reconnect was not branded as a calm party banner.
- Compliance badges showed raw `playbackStatus` enums without PLAYABLE NOW / METADATA ONLY / NOT ELIGIBLE framing.
- Host and player shared the same `.page` max-width contract — stage vs controller separation was weak.

## After (Stage Energy)
- Landing: **Create a Party** / **Join a Party** first; party-loop strip; how-to and settings demoted.
- Host: TV-readable `room-code-hero`, copy control, join URL secondary, live lobby pulse, eligibility badges on catalog songs, demoted settings drawer.
- Player: glyph role cards, waiting-energy lobby, glyph hype targets (no emoji), truthful vocal path copy (no fake pitch).
- Network: branded reconnect banner without socket IDs or stack traces.
- Two-surface CSS: `.page-host` (to 1920) vs `.page-player` (phone controller).
- Motion: pulse / spotlight / countdown with reduce-motion preserves meaning.

## Non-claims
Does not claim Spotify playback, YouTube audio ingestion, licensed lyrics, public matchmaking, physical Pixel PASS, or human fun validation.
