# 6G workload relevance — BeatLink Party

This product is a **game / interactive workload**, not a RAN research result.

The notes below describe **measurable latency, QoE, and traffic characteristics** a lab could observe if this client ran on an instrumented link. They are **not** a 6G dissertation contribution.


## What this client is

Browser host + phone players over Socket.IO. Timing-sensitive **party QoE**, not a cellular protocol.

## Measurable characteristics

| Quantity | Where | Notes |
|---|---|---|
| Join RTT | `tests/network_load.test.ts` | Localhost p50/p95/p99 — not a 6G air interface |
| Calibration offset | `RoomManager.submitCalibration` | Host metronome vs player |
| Input grade window | `@beatlink/game-engine` scoring | Perfect/great/good/miss |
| Room phases | `RoomPhase` in `packages/shared/src/types.ts` | lobby → … → results |
| Package | `com.gunnchos.beatlinkparty` | Distinct PWA/Android id |

QoE is “did taps land in the timing window on a LAN,” not RAN latency.

## What this is not

- Not a 6G URLLC or XR-over-NR paper result
- Never add audio ripping (`docs/MUSIC_COMPLIANCE.md`)
- Not Pixel 6a PASS while adb is unauthorized
