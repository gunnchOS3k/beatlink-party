# Known Limitations — BeatLink Party

- Current Pixel artifact is **debug** (`assembleDebug`), not signed release
- Capacitor uses `https://localhost` with `allowMixedContent` for LAN `ws://` — production hosting should use WSS
- Host QR “join at” shows `https://localhost/join` on device (code + QR still usable)
- Cold Node module load on Documents path can take minutes; keep server process alive
- Gradle requires **JDK 17** (Java 25 fails with unsupported class file 69)
- Mac-host → Pixel-join full round not fully re-recorded after KJRFW Pixel-host round
- No independent acceptance-verifier run yet
- No PR (gated)
