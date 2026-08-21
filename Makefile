# BeatLink Party — Wave007 evidence gate (authoritative)
.PHONY: wave007 verify test

wave007:
	pnpm --filter @beatlink/shared build
	pnpm --filter @beatlink/game-engine build
	@mkdir -p artifacts/engineering_wave007
	bash scripts/engineering_wave007/run_browser_e2e_ci.sh
	pnpm vitest run tests/engineering_wave007/wave007_party_loop.test.ts
	@test -f artifacts/engineering_wave007/WAVE007_RESULT.json
	@test -f artifacts/engineering_wave007/BROWSER_E2E_RESULT.json
	@test -f artifacts/engineering_wave007/REQUIREMENT_RESULTS.json
	@test -f artifacts/engineering_wave007/REQUIREMENT_EVALUATOR_MATRIX.json
	@test -f artifacts/engineering_wave007/EVALUATOR_INTEGRITY_RESULT.json
	@test -f artifacts/engineering_wave007/CLAIM_BOUNDARIES.json
	@test -f artifacts/engineering_wave007/BEHAVIORAL_NEGATIVE_CONTROL_RESULT.json
	@test -f artifacts/engineering_wave007/COMPLETION_GATE_NEGATIVE_CONTROL_RESULT.json
	@test -f artifacts/engineering_wave007/CREATE_ROOM_BROWSER_RESULT.json
	@test -f artifacts/engineering_wave007/MULTICLIENT_BROWSER_RESULT.json
	@test -f artifacts/engineering_wave007/SCORING_LEDGER_REPLAY_RESULT.json
	@test -f artifacts/engineering_wave007/SESSION_RESUME_A_B_C_RESULT.json
	@test -f artifacts/engineering_wave007/SONG_SOURCE_RIGHTS_RESULT.json
	@test -f artifacts/engineering_wave007/DEVICE_TIMING_PROFILE_RESULT.json
	@test -f artifacts/engineering_wave007/AUDIENCE_INFLUENCE_SPAM_CAP_RESULT.json
	@test -f artifacts/engineering_wave007/NETWORK_FAILURE_RESULT.json
	@test -f artifacts/engineering_wave007/SECURITY_ABUSE_RESULT.json
	@test -f artifacts/engineering_wave007/VIEWPORT_RESPONSIVE_RESULT.json
	@test -f artifacts/engineering_wave007/EVENT_IDEMPOTENCY_RESULT.json
	@test -f artifacts/engineering_wave007/DEAD_CONTROL_RESULT.json
	@python3 -c "import json; r=json.load(open('artifacts/engineering_wave007/BROWSER_E2E_RESULT.json')); assert r.get('playwright_ran') is True; assert r.get('playwright_skipped') is False"
	@python3 -c "import json; r=json.load(open('artifacts/engineering_wave007/WAVE007_RESULT.json')); assert r.get('UNCONDITIONAL_TRUE_CLASSIFIERS',1)==0; assert r.get('UNCONDITIONAL_TRUE_CLASSIFIERS_COMPUTED') is True; assert r.get('BEHAVIORAL_NEGATIVE_CONTROLS_PASS') is True; assert r['claim_flags']['COMMERCIAL_MEDIA_RIPPED'] is False; assert r['claim_flags']['LINK_EQUALS_RIP_PERMISSION'] is False; assert r['OS_PLATFORM_020_UNTOUCHED'] is True; assert r['BASELINE_COUNTS_UPDATED'] is False; assert r.get('PLAYWRIGHT_SKIPPED') is False"

verify:
	pnpm verify

test:
	pnpm test
