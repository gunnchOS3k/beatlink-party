# Acceptance vs production — round duration

## Production default

Rooms use the selected beatmap’s `durationMs`. When a beatmap is missing duration,
the server falls back to **45000 ms (45 s)** (`RoomManager` `gameDurationMs`).

This fallback is the **shipped default**, not a silent acceptance override.

## Device / acceptance practice

Pixel + browser acceptance for this pass uses the **demo beatmaps as shipped**
(typically ~45 s). Operators may temporarily shorten rounds only via an explicit
local environment or server flag **outside** committed production defaults.

**Do not** commit a shortened device-test duration as the production default.

## Separation checklist

| Mode | Duration source | Committed as production? |
|------|-----------------|--------------------------|
| Production | Beatmap `durationMs` (fallback 45s) | Yes |
| Acceptance on Pixel | Same demo beatmaps / same fallback | Uses production code path |
| Local-only short round | Optional operator env (if introduced) | Must remain uncommitted |

Updated: 2026-07-14
