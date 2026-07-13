# Acceptance Checklist — BeatLink Party

**Updated:** 2026-07-13

| Gate | Status | Evidence |
|------|--------|----------|
| Stable server without watch | **PASS** | `PORT=3001 node dist/index.js` → `/health` ok |
| Create Room loading feedback | **PASS** | Button shows “Creating room…” |
| Host lobby + room code + QR | **PASS** | Room `CQ9V5` + QR in browser screenshot |
| Two-client join | **PASS** | PixelPlayer joined host lobby |
| Role + ready | **PASS** | Beat Tapper · Ready |
| Demo track select + countdown | **PASS** | Neon Groove → LIVE |
| Synchronized play | **PASS** | Player TAP UI while host LIVE |
| Server-authoritative scores | **PASS** | Score 300 · Accuracy 75% · streak 2 |
| Results on host + player | **PASS** | Round Complete + Your Results screenshots |
| Disconnect / reconnect | **PASS** | Socket test room `2XWWD`: same player id after reconnect |
| End room + reject reuse | **PASS** | `room.end` ok; rejoin → `Room not found or full` |
| Android APK + Pixel | **NOT STARTED** | Pixel ADB absent at session start |
| PR | **No** | Gates remaining |

## Browser round (CQ9V5)

- Host: `http://127.0.0.1:5173/host/CQ9V5`
- Player: `http://127.0.0.1:5173/play/CQ9V5?name=PixelPlayer`
- Track: Neon Groove (demo)
- Results: team 300, crowd 52%, MVP + Best Beat → PixelPlayer

## Fixes applied this pass

- Stable `handlersRef` socket listeners (stop missed `game.started` / `game.ended`)
- Player `onEnded` / `onStarted` update `room` phase
- Reconnect stores `playerToken`
- Host `End Room` + server `room.end`
- Song items are real `<button>` elements
