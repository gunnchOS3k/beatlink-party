# VXP-5.1 Human Path Repro

## Parent verification
- PR #28 live head: `3bef89875f2736f371ef46b6c674d52bb0358288`
- Claimed observed: `99d29fb...` (ancestor; one chore commit behind live head)
- Stacked FROM live PR #28 head; PR #28 not mutated.

## Before (blocker)
1. Host Create Party → room code
2. Player Jordan joins, role, Ready
3. Second device/browser joins as Ghost, leaves without Ready
4. Host selects approved demo track
5. **Start stays disabled forever** — client required every seat ready, including disconnected Ghost
6. No reason text; host cannot tell why

Evidence: `HUMAN_PATH_BLOCKER_CASES.json` case B.

## After
1. Same ghost disconnect path
2. Start enables (connected-only gate) with reason UI
3. Host Start Game → Skip Calibration → countdown → playing → tap/swipe
4. Multicontent E2E PASS: `E2E_HUMAN_START_RESULT.json`
