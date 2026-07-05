# Test Plan — BeatLink Party

## Automated Tests (Vitest)

| Test File | Coverage |
|-----------|----------|
| `tests/rooms.test.ts` | Room creation, join, full room, countdown, input scoring |
| `tests/linkResolver.test.ts` | YouTube/Spotify/Apple/unknown URLs, compliance statuses |
| `tests/beatmap.test.ts` | Schema validation for all demo beatmaps |
| `tests/scoring.test.ts` | Timing grades, scoring, awards, state machine |

Run: `pnpm test`

## Manual Test Checklist

### Room Flow
- [ ] Host creates room; code displays large and readable
- [ ] Player joins within 5 seconds on same network
- [ ] Second player can join same room
- [ ] Player disconnect and reconnect preserves identity (localStorage)

### Roles & Ready
- [ ] Each role can be selected
- [ ] Ready state syncs to host lobby

### Song Selection
- [ ] All 3 demo songs selectable
- [ ] YouTube URL → METADATA_ONLY banner
- [ ] Spotify URL → METADATA_ONLY banner
- [ ] No audio downloaded (verify network tab)

### Gameplay
- [ ] Countdown 3-2-1 syncs on host and phones
- [ ] Beat Tapper: tap produces score feedback
- [ ] Vocalist: phrase prompt + perform button scores
- [ ] Hype Captain: buttons work with cooldown
- [ ] Team score and crowd meter update on host

### Results
- [ ] Round ends after song duration
- [ ] Individual scores, team score, awards display
- [ ] Replay resets lobby

### Devices
- [ ] Desktop Chrome (host)
- [ ] Mobile Safari / Chrome (player) — or browser dev tools mobile mode
- [ ] TV-size host display (1080p window)

## CI Pipeline

GitHub Actions runs: install → lint → typecheck → test → build

## Performance Targets (MVP)

| Metric | Target |
|--------|--------|
| Room join | < 5s |
| Input round-trip | < 100ms on LAN |
| Host animations | 60 FPS |

## Accessibility Smoke Test

- [ ] Large tap targets on phone
- [ ] Readable contrast on host stage
- [ ] Non-vocal roles playable without mic
