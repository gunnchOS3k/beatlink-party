# Acceptance Checklist — BeatLink Party

**Updated:** 2026-07-14

| Gate | Status | Evidence |
|------|--------|----------|
| Stable server (no watch) | **PASS** | `node` on `:3001` health OK at `<LAN_HOST>` |
| Test vs production duration | **PASS** | `ACCEPTANCE_TEST_DURATION.md` — demo beatmaps / 45s fallback; not a silent production override |
| Signed RC + `debuggable=false` | **PASS** | `build/android/beatlink-party-release.apk` 1.1.1 (3) SHA `cdfa3409331e913a6fafad4741906014d2730870a8280fcf3066d72cd0490490` · cert `fa62d4bc…654a` |
| Pixel Direction B (Mac hosts) | **PASS** | Room `Y7QM9` · both Ready · Round Complete team **10050** · End Room · `evidence/pixel-multiplayer/direction-b/` |
| Pixel Direction A (Pixel hosts) | **PASS** | Room `3KB67` · MacGuest Ready · Round Complete team **7400** · End Room · `evidence/pixel-multiplayer/direction-a/` |
| Reconnect / background | **PARTIAL** | Dir B Pixel HOME+resume; Dir A Mac offline/online |
| Invalid / reuse | **PARTIAL** | Invalid-code + reuse screens captured; reject UX often stays on Enter Lobby until join fails |
| PR | **No** | Awaiting independent verifier + Edmund |

## APK metadata

- Package: `com.gunnchos.beatlinkparty`
- Version: **1.1.1** · versionCode **3**
- Path: `build/android/beatlink-party-release.apk`
- SHA-256: `cdfa3409331e913a6fafad4741906014d2730870a8280fcf3066d72cd0490490`
- Signer: CN=BeatLink Internal RC · cert SHA-256 `fa62d4bcaa350a4b0e2ea89d9d1c9dab73a8c04dbf37a09005759e8d058c654a`

## Evidence roots

- `docs/product-quality/evidence/pixel-multiplayer/direction-b/` (incl. `beatlink-direction-b.mp4`, results host/player)
- `docs/product-quality/evidence/pixel-multiplayer/direction-a/` (incl. `beatlink-direction-a.mp4`)
- `docs/product-quality/evidence/pixel-multiplayer/SUMMARY.json`
- `docs/product-quality/ACCEPTANCE_TEST_DURATION.md`
