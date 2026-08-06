# Manual Device Runbook — Beat Link Party (Gate 1)

Statuses target: `CORE_LOOP_IMPLEMENTED` · `CORE_LOOP_AUTOMATED_EVIDENCE_PASS` · `PHYSICAL_PLAYTEST_PENDING`

## Preconditions
- Branch: `cursor/gate-1-integrated-development-platform`
- Device charged; screen recording permission granted
- Log collector ready: `gate1/tools/log_collector.*`

## Core loop (must complete — launch alone is insufficient)
1. Launch app/server pair
2. Create room
3. Join with second device or simulator
4. Select authorized LOCAL fixture song (demo catalog only)
5. Calibrate timing
6. Assign active + audience roles
7. Complete round with scoring inputs
8. View results
9. Rematch / return to room

## Pass criteria
- Every step above observed on device
- JSONL events collected (or manual checklist signed) with schema fields present
- Save/results screen captured; rematch/restart verified
- Accessibility spot-checks completed (`gate1/evidence/accessibility_checks.json`)

## Fail criteria
- Soft-lock, crash, missing results, or inability to rematch/restart
- Using copyrighted ripped audio (Beat Link) or claiming complete species coverage (Archive of Life)
