# BeatLink Party — Wave007 evidence gate
.PHONY: wave007 verify test

wave007:
	pnpm --filter @beatlink/shared build
	pnpm --filter @beatlink/game-engine build
	pnpm vitest run tests/engineering_wave007/wave007_party_loop.test.ts
	@test -f artifacts/engineering_wave007/WAVE007_RESULT.json
	@test -f artifacts/engineering_wave007/REQUIREMENT_RESULTS.json
	@test -f artifacts/engineering_wave007/REQUIREMENT_EVALUATOR_MATRIX.json
	@test -f artifacts/engineering_wave007/EVALUATOR_INTEGRITY_RESULT.json
	@test -f artifacts/engineering_wave007/CLAIM_BOUNDARIES.json
	@test -f artifacts/engineering_wave007/BEHAVIORAL_NEGATIVE_CONTROL_RESULT.json
	@test -f artifacts/engineering_wave007/COMPLETION_GATE_NEGATIVE_CONTROL_RESULT.json
	@test -f artifacts/engineering_wave007/E2E_MULTI_CLIENT_BROWSER_RESULT.json
	@test -f artifacts/engineering_wave007/SCORING_LEDGER_REPLAY_RESULT.json
	@test -f artifacts/engineering_wave007/SESSION_RESUME_A_B_C_RESULT.json
	@test -f artifacts/engineering_wave007/SONG_SOURCE_RIGHTS_RESULT.json
	@test -f artifacts/engineering_wave007/DEVICE_TIMING_PROFILE_RESULT.json
	@test -f artifacts/engineering_wave007/AUDIENCE_INFLUENCE_SPAM_CAP_RESULT.json
	@test -f artifacts/engineering_wave007/NETWORK_FAILURE_RESULT.json
	@test -f artifacts/engineering_wave007/SECURITY_ABUSE_RESULT.json
	@test -f artifacts/engineering_wave007/VIEWPORT_RESPONSIVE_RESULT.json
	@test -f artifacts/engineering_wave007/UML_TRACEABILITY_RESULT.json
	@python3 -c "import json; r=json.load(open('artifacts/engineering_wave007/WAVE007_RESULT.json')); assert r['summary']['validated']==10, r['summary']; assert r.get('UNCONDITIONAL_TRUE_CLASSIFIERS',1)==0; assert r.get('wave007_ok') is True; assert r['claim_flags']['COMMERCIAL_MEDIA_RIPPED'] is False; assert r['claim_flags']['LINK_EQUALS_RIP_PERMISSION'] is False; assert r['OS_PLATFORM_020_UNTOUCHED'] is True; assert r['BASELINE_COUNTS_UPDATED'] is False"

verify:
	pnpm verify

test:
	pnpm test
