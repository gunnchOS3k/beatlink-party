# GAME-RC-002 — Beat Link Party

Finite packet: complete party-session playthrough/content/achievement/RC-gate contracts plus a real offline achievement runtime.

- Session: launch → create/join → audience → roles → local/open catalog media → calibration → five modes → audience influence → score → pause/resume → disconnect/reconnect → host migration → results/awards → achievements → rematch → new session → leave.
- Verifier topology is live Socket.IO server + clients, not a static page.
- Provider auth is **EXTERNAL_PENDING** without credentials. No DRM bypass / ripped streams.
- Achievements: 12 catalog entries. Unlocks fire from RoomManager gameplay. No cheat unlock API.
- Critic class: **ALPHA**. `POLISHED_RELEASE_CANDIDATE=false`, `FEATURE_COMPLETE_RC=false`, `HUMAN_PLAYTEST_VALIDATED=false`.
- VISUAL_MODEL_REVIEW: **HISTORICAL_CAPTURES_ONLY** (no new live framebuffer).
- S0=0, S1=0 (this packet's digital scope). S2 first-fun / public join / licensed catalog remain OPEN.
- Cursor does not merge.
