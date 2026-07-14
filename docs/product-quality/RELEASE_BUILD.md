# Release Build — BeatLink Party

| Field | Value |
|-------|-------|
| Package | `com.gunnchos.beatlinkparty` |
| Version name | 1.1.0 |
| Version code | 2 |
| Artifact | `build/android/beatlink-party-release.apk` |
| Gradle output | `apps/web/android/app/build/outputs/apk/release/app-release.apk` |
| SHA-256 | `d24fe09724c8c72a74a999766e1467a48913e47f65c760bb6c573b91586619b3` |
| Build | `assembleRelease` with Corretto **JDK 17** |
| `debuggable` | **false** |
| Signing | Internal-testing keystore at `~/.android/gunnchos-internal-keys/beatlink-internal-release.jks` (not committed). Set `BEATLINK_STORE_FILE`, `BEATLINK_STORE_PASSWORD`, `BEATLINK_KEY_ALIAS`, `BEATLINK_KEY_PASSWORD` at build time. |
| Cert SHA-256 | `FA:62:D4:BC:AA:35:0A:4B:0E:2E:A8:9D:9D:1C:9D:AB:73:A8:C0:4D:BF:37:A0:90:05:75:9E:8D:05:8C:65:4A` |
| Cert owner | `CN=BeatLink Internal RC` |
| Server | `node apps/server/dist/index.js` bind `0.0.0.0:3001` |
| Device-test env | `apps/web/.env.production.local` (local only — do not commit private IP) |

## Prior debug artifact (superseded for RC)

| Field | Value |
|-------|-------|
| Artifact | `build/android/beatlink-party-debug.apk` |
| SHA-256 | `afc2893f9ef1d5b36df665d19b6b08a9c661161ced29d51421ed5b4da73d0c54` |

## Browser two-client evidence

Archived under `docs/product-quality/evidence/browser-two-client/` (room AVRMA, Neon Groove, 124 taps, reconnect + end-room + reuse rejection).
