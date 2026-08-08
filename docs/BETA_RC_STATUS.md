# Beat Link — Beta Event Platform + Digital RC (CONTINUATION IV)

**Date:** 2026-08-08  
**Branch:** `cursor/full-product-beatlink-beta-rc`  
**Base:** `origin/main` (`d2ef8d45bbe55790b21024b6307735c7c09979c8`) — #10+#11 merged; **not** another Alpha wave

## Tokens

| Token | Status | Notes |
|-------|--------|-------|
| `BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL` | **EARNED** when local verify passes on this branch | Five-mode depth + rights paths + event lifecycle + event-scale sim |
| `BEATLINK_EVENT_LIFECYCLE_STRESS_PASS` | Earned via `runEventLifecycleStress` (5 mode loops) | In-process |
| `BEATLINK_EVENT_SCALE_SIM_PASS` | Earned via 8 performers × 25/50/100/300 audience | **Simulation ≠ live event** |
| `BEATLINK_DIGITAL_RC_READY` | **EARNED** via DEV package/SBOM/update/rollback/offline/privacy | Digital only — not store/HSM/physical |
| `FULL_PRODUCT_FEATURE_COMPLETE` | **NOT claimed** | Redis, live mic, licensed lyrics providers, platform SDKs remain |
| Launch | **NOT claimed** | Out of scope |

## Beta digital criteria (honest)

| Area | Met? | Evidence |
|------|------|----------|
| Five modes deepened (tutorial≥5, difficulty, scoring, a11y, teams, results, replay, telemetry) | Yes | `assertModesBetaDepth` + `tests/beta_rc.test.ts` |
| Full room/event lifecycle stress | Yes | create→…→rematch→shutdown × 5 modes |
| Event-scale sim 8×25/50/100/300 + metrics | Yes | `eventScaleSim.ts` — in-process only |
| Rights paths (RF/PD/synthetic/licensed/creator attest/link match; no rip) | Yes | `contentPaths.ts` + catalog `licensed_pack` stub |
| Analysis/karaoke on rights-cleared audio | Yes | synthetic/PD/RF/licensed/attested gates |
| Digital RC packaging DEV/SBOM/update/rollback/offline/privacy | Yes | `docs/digital-rc/*` |

## Event-scale load results (in-process)

Collected by `runEventScaleSimulation` — wall times vary by host; assertions require join completeness + shutdown + host migrate.

| Tier | Performers | Audience | Notes |
|------|------------|----------|-------|
| 25 | 8 | 25 | party-adjacent |
| 50 | 8 | 50 | Alpha soft ceiling |
| 100 | 8 | 100 | `event_sim` capacity |
| 300 | 8 | 300 | `MAX_AUDIENCE_SEATS_EVENT` |

**Disclaimer:** In-process event-scale simulation only — not a live event, cloud soak, or SLA claim.

## Remaining gaps (block full feature-complete / launch)

1. In-memory rooms only — Redis/Postgres persistence still RC+/prod
2. No live `getUserMedia` pitch path (synthetic DSP only; no-recording default)
3. No licensed lyric provider / platform playback SDKs
4. Event-scale is simulation — not venue Wi-Fi / multi-host production load
5. Digital RC signing is **DEV** digest only — not production HSM or store submission
6. Localization catalogs still architecture + seed strings

## Do not merge as launch-ready

Draft PR only. Beta digital content-complete ≠ feature-complete ≠ physical RC ≠ Launch.
