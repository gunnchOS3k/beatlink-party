# Provider credentials — exact blockers (BeatLink Party)

GitHub authentication does **not** provide music-provider credentials.

BeatLink never downloads or rips platform audio. Official embeds / SDKs / deep links only.

## Credential matrix

| Provider | Credential | Why required | Where user obtains it | Secure environment variable | Work completed without it |
| -------- | ---------- | ------------ | --------------------- | --------------------------- | ------------------------- |
| YouTube | YouTube Data API key **or** OAuth client ID | Unlocks `PLAYABLE_AUTHORIZED_PLATFORM` status flip; richer Data API metadata when oEmbed is insufficient | [Google Cloud Console](https://console.cloud.google.com/) → YouTube Data API | `YOUTUBE_API_KEY` or `YOUTUBE_CLIENT_ID` | Link parse, public oEmbed metadata, official iframe embed preview, catalog match, calibration, metronome rounds |
| Spotify | Client ID (+ later Client Secret + user OAuth for Web Playback SDK) | Status flip; Spotify Web Playback SDK needs user auth for synchronized controller audio | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) | `SPOTIFY_CLIENT_ID` (secret stays server-only when SDK lands) | Track/URI parse, public oEmbed metadata, official iframe embed preview, catalog match, calibration |
| Apple Music | MusicKit developer token (JWT minted server-side from private key) | In-web MusicKit JS playback + richer metadata | [Apple Developer](https://developer.apple.com/) MusicKit keys; mint JWT on a secure backend | `APPLE_MUSIC_DEVELOPER_TOKEN` (never commit Apple private key) | Song URL / slug / `?i=` parse, best-effort path title, legal deep-link CTA, calibration/room hooks |
| *(signing)* | Release keystore | Signed non-debug RC APK | Local `~/.android/gunnchos-internal-keys/` | `BEATLINK_STORE_FILE`, `BEATLINK_STORE_PASSWORD`, `BEATLINK_KEY_ALIAS`, `BEATLINK_KEY_PASSWORD` | Debug builds, web/dev flow |

## Do not commit

- Apple private key / MusicKit secret
- Spotify client secret / refresh tokens
- YouTube OAuth client secret
- Signed developer tokens in the repo
- Private LAN IPs in committed env files

## Runtime reality (this branch)

| Path | Status |
| --- | --- |
| Paste → metadata (YT/Spotify oEmbed) | Implemented |
| Official YT/Spotify **iframe preview** without secrets | Implemented (host hearing / preview) |
| Synchronized multiplayer scoring from platform audio | **Blocked** without SDK + user auth (or catalog metronome match) |
| Apple MusicKit in-app playback | **Blocked** without `APPLE_MUSIC_DEVELOPER_TOKEN` |

Catalog metronome rounds remain the compliant playable path when links match the approved catalog.
