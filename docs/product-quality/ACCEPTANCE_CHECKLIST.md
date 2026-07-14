# Acceptance Checklist — BeatLink Party

**Verified evidence audit:** 2026-07-13 (resume)

## Requirement classification

| Gate | Status | Direct evidence in-repo | Notes |
|------|--------|-------------------------|-------|
| Stable server without watch | **PASS** | Scripts + prior session notes | `server:device` → `node dist/index.js` |
| Create Room loading feedback | **PARTIAL** | Documented; no retained screenshot file | Checkbox narrative only |
| Host lobby + room code + QR | **PARTIAL** | Room `CQ9V5` documented; **no** `evidence/browser-host-*.png` | Screenshot not archived under `docs/product-quality/evidence/` |
| Two-client browser join | **PARTIAL** | Narrative + room URLs | No retained host/player browser PNG pair |
| Role + ready | **PARTIAL** | Narrative | Same |
| Demo track + countdown | **PARTIAL** | Narrative (Neon Groove) | Same |
| Synchronized play | **PARTIAL** | Narrative | Same |
| Server-authoritative scores | **PARTIAL** | Score 300 / 75% recorded in docs | No saved server log file |
| Results on host + player | **PARTIAL** | Claimed screenshots; **not found on disk** | Do not treat as fully evidenced |
| Disconnect / reconnect | **PASS** | Documented socket room `2XWWD` | Code paths present; no log artifact file |
| End room + reject reuse | **PASS** | Documented `room.end` → rejoin fail | Same |
| Pixel create → Mac join round | **PASS** | `evidence/pixel-*.png` (startup, connected, host+Mac, round) | Room `KJRFW`, score 300 / 50% |
| Mac create → Pixel join round | **NOT TESTED** | Explicitly incomplete in `PIXEL_6A_TEST.md` | Reverse Flow B not re-recorded |
| Screen recording | **NOT TESTED** | No `.mp4` / `.webm` in evidence | — |
| Browser console log artifact | **NOT TESTED** | No saved console dump | — |
| Server / WebSocket log artifact | **NOT TESTED** | No saved log file | — |
| Debug APK path + SHA-256 | **PASS** | `build/android/beatlink-party-debug.apk` | SHA matches `afc2893f…0c54` (re-hashed) |
| Package / version | **PASS** | `RELEASE_BUILD.md` + `PIXEL_6A_TEST.md` | `com.gunnchos.beatlinkparty` 1.1.0 code 2 |
| Signed release `debuggable=false` | **NOT TESTED** | Debug APK only | — |
| Pixel reconnect / back / pause net | **PARTIAL** | Mixed-content create+round covered | Dedicated reconnect UI not evidenced |
| PR | **No** | — | Gates remaining |

## Artifact inventory

**Present**

- Pixel screenshots under `docs/product-quality/evidence/`
- `docs/product-quality/PIXEL_6A_TEST.md`
- `docs/product-quality/RELEASE_BUILD.md`
- APK: `build/android/beatlink-party-debug.apk` (SHA verified)

**Missing (do not invent PASS)**

- Host/player browser screenshots archived in evidence/
- Screen recording
- Saved server / WebSocket / browser console logs
- Flow B Pixel-join full round evidence
- Signed release APK

## Honest overall

| Milestone | Status |
|-----------|--------|
| Browser two-client round | **PARTIAL** — implementation worked in session; retained file evidence incomplete |
| Pixel host → Mac join | **PASS** — PNG evidence present |
| Release readiness | **PARTIAL** — debug APK only |

Prior ADB absence does not erase Pixel PNG evidence. Browser PASS is downgraded to **PARTIAL** until host/player screenshots and logs are archived or the flow is re-run with capture.
