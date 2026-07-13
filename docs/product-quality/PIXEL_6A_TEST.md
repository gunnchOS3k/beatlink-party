# Pixel 6a Test — BeatLink Party

**Serial:** 27211JEGR06194  
**Package:** `com.gunnchos.beatlinkparty`  
**Version:** 1.1.0 (code 2)  
**APK:** `build/android/beatlink-party-debug.apk`  
**SHA-256:** `afc2893f9ef1d5b36df665d19b6b08a9c661161ced29d51421ed5b4da73d0c54`

## Browser two-client (localhost)

- Room `CQ9V5`: complete round — score 300 / 75% accuracy
- Socket reconnect+end room `2XWWD`: PASS (reuse rejected)

## Pixel creates → Mac joins

| Step | Result |
|------|--------|
| Install + cold launch | PASS |
| Mixed-content fix (`allowMixedContent`) | PASS after rebuild |
| Create Room on Pixel | PASS — room `KJRFW` |
| Room server connected | PASS |
| Mac joins KJRFW as MacPlayer | PASS |
| Role + ready | PASS |
| Host starts round | PASS — phase `playing` |
| Synchronized TAP + results | PASS — score 300 / 50% |

## Evidence

- `docs/product-quality/evidence/pixel-connected.png`
- `docs/product-quality/evidence/pixel-tap-820.png` (host lobby KJRFW)
- `docs/product-quality/evidence/pixel-host-with-mac.png`
- `docs/product-quality/evidence/pixel-round.png`

## Not fully covered this pass

- Mac hosts → Pixel joins round (UI join path works; full reverse round not re-run after KJRFW)
- Release (`debuggable=false`) signed APK
- Independent acceptance-verifier subagent
- PR
