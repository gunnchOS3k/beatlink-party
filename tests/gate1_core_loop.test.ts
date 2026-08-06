import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBeatlinkCoreLoop, writeEvidence } from '../gate1/tools/core_loop_runner.ts';

const REQUIRED = [
  'game', 'build_id', 'commit', 'platform', 'session_id',
  'step', 'timestamp', 'result', 'state_checksum', 'evidence_type',
];

describe('Gate 1 Beat Link core loop', () => {
  it('completes required steps and emits schema-compatible events', () => {
    const { events, ok } = runBeatlinkCoreLoop();
    writeEvidence(events, ok);
    expect(ok).toBe(true);
    const steps = [
      'launch','create_room','join_participant','select_local_fixture_song',
      'calibrate_timing','assign_active_role','assign_audience_role',
      'complete_round','score','results','rematch_room',
    ];
    for (const s of steps) {
      expect(events.some((e) => e.step === s && e.result === 'pass')).toBe(true);
    }
    for (const e of events) {
      for (const k of REQUIRED) expect(e[k as keyof typeof e]).toBeTruthy();
      expect(String(e.state_checksum).length).toBeGreaterThanOrEqual(8);
      expect(String(e.commit).length).toBeGreaterThanOrEqual(7);
    }
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), 'gate1/contracts/game_core_loop.schema.json'), 'utf8'),
    );
    expect(schema.required).toEqual(expect.arrayContaining(REQUIRED));
  });
});
