# Link capability states — API key ≠ music rights

Primary eligibility signal for pasted links / provider adapters.

| State | Meaning | Gameplay sync? |
|-------|---------|----------------|
| `METADATA_AVAILABLE` | Title/artist/artwork recognized | No |
| `OFFICIAL_EMBED_AVAILABLE` | Official visible embed or deep-link listen | No |
| `DIRECT_AUDIO_RIGHTS_VERIFIED` | HTTPS WAV/MP3/OGG with composition + sound-recording rights + hash | Not yet — needs beat grid + charts |
| `GAMEPLAY_SYNC_AUTHORIZED` | Catalog match **or** rights-verified direct audio + beat grid + charts | Yes |
| `BLOCKED_OR_UNSUPPORTED` | Policy block / unknown / rip / DRM | No |

## Hard rules

1. `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `APPLE_MUSIC_DEVELOPER_TOKEN` never elevate a link to `GAMEPLAY_SYNC_AUTHORIZED`.
2. Legacy `PLAYABLE_AUTHORIZED_PLATFORM` must not be assigned from credentials alone.
3. YouTube uses the official IFrame API (visible player only) — no AV separation / audio extraction.
4. Spotify / Apple Music remain metadata / embed / deep-link distinct from gameplay sync.
5. SoundCloud / Bandcamp / Vimeo / Audius are scaffolded as embed/listen-first (`embed_only`).
6. Preferred full-gameplay route: direct HTTPS WAV/MP3/OGG with rights, hash, beat grid, charts.
7. Composition rights ≠ sound-recording rights; CC sync/adaptation require explicit attestation.
8. No rip / DRM bypass / lyric scrape.

See also [MUSIC_COMPLIANCE.md](MUSIC_COMPLIANCE.md) and `artifacts/rtm/BEATLINK_LINKS_RTM.json`.
