import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCrossDeviceContract, CONTRACT_VERSION, GAME_ID } from '../gate1/cross_device/contractProvider.ts';

describe('Wave001 cross-device contract (beatlink)', () => {
  it('builds contract with multiplayer and scoring probes', () => {
    const doc = buildCrossDeviceContract({ platform: 'node' });
    expect(doc.contract_version).toBe(CONTRACT_VERSION);
    expect(doc.game_id).toBe(GAME_ID);
    expect(doc.probes.multiplayer.status).toBe('pass');
    expect(doc.probes.score.status).toBe('pass');
    expect(doc.probes.save_roundtrip.status).toBe('pass');

    const out = join(process.cwd(), 'gate1/evidence/out/cross_device_contract.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  });
});
