# Acceptance Checklist — BeatLink Party

| Gate | Status |
|------|--------|
| Stable server (no watch loop) | **Verified** — `server:device` + health OK |
| Create Room UI | **Implemented** — not device-tested |
| Two-client multiplayer round | **Not started** |
| Release/debug APK | **Missing** — AAPT2/disk blocked |
| Cleartext LAN (debug) | **Implemented** — debug manifest overlay |
| `device:test:android` script | **Created** — not run end-to-end |
| PR | **No** |

## Server health evidence

```json
{"status":"ok","service":"beatlink-party"}
```

Command: `node --import tsx src/index.ts` → `curl http://127.0.0.1:3001/health`
