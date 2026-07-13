# Release Build — BeatLink Party

| Field | Value |
|-------|-------|
| Package | `com.gunnchos.beatlinkparty` |
| Version name | 1.1.0 |
| Version code | 2 |
| Artifact | `build/android/beatlink-party-debug.apk` |
| Also at | `apps/web/android/app/build/outputs/apk/debug/app-debug.apk` |
| SHA-256 | `afc2893f9ef1d5b36df665d19b6b08a9c661161ced29d51421ed5b4da73d0c54` |
| Build | `assembleDebug` with Corretto **JDK 17** |
| Server | `node dist/index.js` bind `0.0.0.0:3001` |
| Device-test env | `apps/web/.env.production.local` (local only — do not commit) |

Release (`assembleRelease`, `debuggable=false`) not yet built this pass.
