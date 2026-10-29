# Music Compliance — BeatLink Party

## Why the MVP Does Not Rip Platform Audio

BeatLink Party's core idea involves popular music, but **copyright and platform Terms of Service prohibit** downloading, separating, or caching audio from YouTube, Spotify, or Apple Music without explicit authorization.

The MVP is intentionally built to:

- **Never download** audio from pasted URLs
- **Never separate** YouTube audio from video
- **Never cache** third-party platform audio on our servers
- **Never scrape** lyrics from the web
- **Never present** copyrighted lyrics without a license

## What the Link Resolver Does

When a host pastes a YouTube, Spotify, or Apple Music URL, the resolver:

1. Detects the platform and extracts a source ID from the URL string
2. Parses available metadata from the URL path (title hints only)
3. Attempts to match against the **internal approved catalog**
4. Returns an **eligibility status** and human-readable message
5. Suggests **fallback options** when the track is not playable

The link resolver does **not**:

- Fetch or stream audio from the platform
- Call undocumented ripping APIs
- Store platform audio files
- Imply partnership with YouTube, Spotify, or Apple

## Approved Music Paths

| Path | MVP | Notes |
|------|-----|-------|
| Internal approved catalog | Yes | Demo / synthetic song bed synced to chart notes |
| Creator-owned uploads | Stub | `POST /content/creator-ingest` — attestation metadata only |
| Licensed music packs | Future | Requires label deals |
| Official platform playback | Future | Per-platform SDK + license |
| Public-domain / royalty-free | Yes | Offline launch catalog + song beds |

LAN phone/TV bind (local-dev only): see [LAN_PARTY_PHONE_TV.md](LAN_PARTY_PHONE_TV.md).

## Source eligibility router (A–F)

Implemented by `resolveSourceEligibilityRouter` in `packages/game-engine/src/contentPaths.ts`.
**Link recognition alone is not full gameplay.** Unsupported / metadata-only links must offer lawful catalog alternatives.

| Letter | Meaning | Playable performance? |
|--------|---------|------------------------|
| **A** | Approved catalog (PD / RF / synthetic / demo / CC) | Yes — catalog audio + versioned beatmap cache |
| **B** | Creator-attested upload | Yes when attestation is valid |
| **C** | Licensed music pack | Yes when pack gate passes |
| **D** | Link matched to approved catalog | Yes — play **catalog** audio only, never the pasted stream |
| **E** | Platform metadata / official embed reference | No — YouTube/Spotify/Apple are not rip permission |
| **F** | Unsupported or blocked | No — return catalog alternatives |

YouTube may only be used under official player/embed rules when explicitly authorized; embed ≠ rhythm-sync or audio-extraction rights. Spotify is never a game-streaming content path under this policy.

## Playback Status Values

- `PLAYABLE_APPROVED` — matched to internal catalog; safe to play
- `PLAYABLE_AUTHORIZED_PLATFORM` — future; official SDK playback
- `METADATA_ONLY` — link recognized; no legal playback path
- `NEEDS_USER_UPLOAD` — user must provide owned audio
- `NEEDS_LICENSE` — commercial license required
- `UNSUPPORTED` — URL format not recognized
- `BLOCKED_BY_POLICY` — blocked by platform or policy rules

## Lyrics Policy

MVP uses **safe placeholder prompts** only (e.g. "Sing the hook!"). No copyrighted lyric text is displayed without:

- Creator-provided lyrics for owned tracks
- Public-domain lyrics
- Licensed lyric provider integration

## Future Work for Commercial Release

1. **Music licensing** — mechanical, sync, and performance rights
2. **Lyric licensing** — e.g. LyricFind, Musixmatch partnerships
3. **Platform API approvals** — YouTube, Spotify, Apple developer programs
4. **DMCA takedown process** — for user-uploaded content
5. **Creator rights workflow** — upload attestation, ISRC metadata, opt-in publishing
6. **Privacy** — mic data handling, GDPR/CCPA compliance
7. **Regional restrictions** — geo-licensed catalogs

## Developer Guidelines

- Do not add dependencies that download or convert platform streams
- All new music features must declare `playbackStatus` and `analysisEligible`
- UI must show compliance messaging when status is not `PLAYABLE_APPROVED`
- Code review checklist: "Does this touch third-party audio? If yes, stop."
