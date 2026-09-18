# Dimension matrix

| Dimension | Status | Evidence | Blocker |
|---|---|---|---|
| build | PASS | pnpm build |  |
| launch | PASS | package builds |  |
| save_load | PASS | session resume tests in wave007/vitest |  |
| menus | PARTIAL | web UI create-room flows | HUMAN_VALIDATION_REQUIRED |
| input | PARTIAL | device UX package | HUMAN_VALIDATION_REQUIRED |
| pause_resume | PARTIAL | session resume A/B/C | HUMAN_VALIDATION_REQUIRED |
| crash_recovery | PARTIAL | reconnect / network failure tests | HUMAN_VALIDATION_REQUIRED |
| persistence | PASS | session resume tests in wave007/vitest |  |
| frame_pacing | BLOCKED | device timing profile needs hardware | PHYSICAL_HARDWARE_REQUIRED |
| leaks | BLOCKED | needs soak on device | PHYSICAL_HARDWARE_REQUIRED |
| loading | PASS | package builds |  |
| asset_validation | PASS | pnpm vitest run tests/rights.test.ts |  |
| resolution | PARTIAL | viewport responsive tests in wave007 | HUMAN_VALIDATION_REQUIRED |
| audio | PARTIAL | synthetic catalog + rights gate; commercial playback not licensed | LEGAL_RIGHTS_REVIEW_REQUIRED |
| a11y | HUMAN_VALIDATION_REQUIRED | a11y not disability-validated | HUMAN_VALIDATION_REQUIRED |
| local_multiplayer | PARTIAL | multi-client browser tests | HUMAN_VALIDATION_REQUIRED |
| networking | PASS | pnpm test (full suite) + network packages |  |
| offline | PARTIAL | degraded network paths; full offline party limited | HUMAN_VALIDATION_REQUIRED |
| install_update | PARTIAL | web/server deploy | HUMAN_VALIDATION_REQUIRED |
| android | BLOCKED | no adb device | PHYSICAL_HARDWARE_REQUIRED |
