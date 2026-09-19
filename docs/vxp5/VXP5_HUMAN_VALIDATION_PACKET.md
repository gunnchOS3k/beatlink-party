# VXP-5 Human Validation Packet — BeatLink Party

**Digital gates only.** All human gates below are **FALSE** until a human session is run.

## Questions (12)
1. Does the landing read as “start a party” within 3 seconds on a TV?
2. Is the room code readable from ~3 meters on a 1080p display?
3. Can a new player join + pick a role + ready without host coaching?
4. Do role cards feel meaningfully different without implying new mechanics?
5. Is song eligibility (playable / metadata / not eligible) understood without reading docs?
6. Does countdown feel tied to the real round start (not decorative)?
7. Does host gameplay feel like a stage spectator board (not a debug console)?
8. Is Beat Tapper’s tap target comfortable one-handed on a phone?
9. Is Vocalist copy honest (no fake pitch implied)?
10. Are Hype Captain targets large enough and glyph-clear without emoji?
11. Does reconnect feel calm rather than broken?
12. Do results + Play Again feel like a celebration loop you want to repeat?

## Gate flags
| Gate | Status |
| --- | --- |
| HUMAN_VISUAL_VALIDATION_PASS | **false** |
| HUMAN_FUN_VALIDATION_PASS | **false** |
| HUMAN_A11Y_VALIDATION_PASS | **false** |
| PIXEL_PHYSICAL_CAPTURE_PASS | **false** (not authorized) |

## Network honesty for human sessions
Local LAN / loopback only unless separately instrumented. Do not claim WAN / carrier performance from this packet.
