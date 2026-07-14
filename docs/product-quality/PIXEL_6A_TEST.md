# Pixel 6a Test — BeatLink Party

**Date:** 2026-07-14  
**Serial:** `27211JEGR06194`  
**Package:** `com.gunnchos.beatlinkparty`  
**Version:** **1.1.1** (versionCode **3**)  
**APK:** `build/android/beatlink-party-release.apk`  
**SHA-256:** `cdfa3409331e913a6fafad4741906014d2730870a8280fcf3066d72cd0490490`  
**Signer cert SHA-256:** `fa62d4bcaa350a4b0e2ea89d9d1c9dab73a8c04dbf37a09005759e8d058c654a`  
**debuggable:** false  

Server: stable `node` on `10.0.0.113:3001` · Mac web `http://10.0.0.113:5173`  
Duration policy: `ACCEPTANCE_TEST_DURATION.md` (demo beatmaps / 45s fallback ≠ silent production change)

## Direction B — Mac hosts → Pixel joins — **PASS**

Room **Y7QM9** · PixelPlayer + MacPlayer both Ready · Neon Groove · Round Complete team **10050** (Pixel 4150 / Mac 5900, 100% accuracy) · Pixel background/resume · End Room  

Evidence: `docs/product-quality/evidence/pixel-multiplayer/direction-b/` (`beatlink-direction-b.mp4`, `11-results-host.png`, …)

## Direction A — Pixel hosts → Mac joins — **PASS**

Room **3KB67** · MacGuest Ready · Round Complete team **7400** (MacGuest) · reconnect · End Room  

Evidence: `docs/product-quality/evidence/pixel-multiplayer/direction-a/` (`beatlink-direction-a.mp4`, `09-results.png`, `10-mac-results.png`, …)

Note: Pixel host is not a scoring player; scoring client on Direction A is MacGuest.

## Automation notes

AcceptNav (`js_b64` + join autofill) used for Pixel WebView actions. Product path remains QR/manual join.
