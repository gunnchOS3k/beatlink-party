# Known Limitations — BeatLink Party

**Updated:** 2026-07-14

- Capacitor device build uses `https://localhost` origin with `allowMixedContent` for LAN `ws://` — production should use WSS / hosted origin.
- Host QR “join at” shows `https://localhost/join` on device; room **code** + AcceptNav / manual join remain the workable Pixel paths.
- AcceptNav (`ACCEPT_NAV` + `js_b64`) is an RC harness; not a substitute for finger-only product UX claims.
- Reuse/invalid-code screens often remain on Enter Lobby until the join attempt fails — capture alert/toast wording more clearly next pass.
- Direction A Pixel-host rounds have one scoring player (Mac); host UI does not submit TAP input.
- Cold Node module load on Documents path can take minutes — keep the device server process alive.
- Gradle requires **JDK 17**.
- Independent acceptance-verifier not re-run after this evidence refresh; **no PR** yet.
