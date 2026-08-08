/**
 * Emit digital RC manifests using the game-engine builder (fixed clock for reproducibility).
 * Run: pnpm exec vitest run scripts/emit-digital-rc.test.ts
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertDigitalRcReady,
  buildDigitalRcPackage,
  planDigitalRcRollback,
  planDigitalRcUpdate,
} from '@beatlink/game-engine';

describe('emit digital RC artifacts', () => {
  it('writes package/sbom/update/rollback/ready under docs/digital-rc', () => {
    const outDir = resolve(process.cwd(), 'docs/digital-rc');
    mkdirSync(outDir, { recursive: true });
    const pkg = buildDigitalRcPackage({
      versionName: '0.2.0-digital-rc',
      versionCode: 3,
      fromVersion: '0.1.0-alpha-exit',
      nowMs: Date.parse('2026-08-08T19:00:00.000Z'),
    });
    const ready = assertDigitalRcReady(pkg);
    const update = planDigitalRcUpdate(pkg);
    const rollback = planDigitalRcRollback(pkg);

    writeFileSync(resolve(outDir, 'package-manifest.json'), JSON.stringify(pkg, null, 2) + '\n');
    writeFileSync(resolve(outDir, 'sbom-lite.json'), JSON.stringify(pkg.sbom, null, 2) + '\n');
    writeFileSync(resolve(outDir, 'update-manifest.json'), JSON.stringify(update, null, 2) + '\n');
    writeFileSync(
      resolve(outDir, 'rollback-manifest.json'),
      JSON.stringify(rollback, null, 2) + '\n',
    );
    writeFileSync(
      resolve(outDir, 'ready.json'),
      JSON.stringify(
        {
          ...ready,
          disclaimer: pkg.disclaimer,
          packageDigestSha256: pkg.signing.packageDigestSha256,
          builtAtUtc: pkg.builtAtUtc,
        },
        null,
        2,
      ) + '\n',
    );

    expect(ready.token).toBe('BEATLINK_DIGITAL_RC_READY');
  });
});
