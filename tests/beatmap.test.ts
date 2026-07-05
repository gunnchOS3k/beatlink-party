import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBeatmap } from '../packages/shared/src/beatmapSchema.js';

describe('beatmap validation', () => {
  it('validates demo track 1', () => {
    const raw = readFileSync(join(process.cwd(), 'content/beatmaps/demo-track-1.json'), 'utf-8');
    const result = validateBeatmap(JSON.parse(raw));
    expect(result.success).toBe(true);
    expect(result.data?.notes.length).toBeGreaterThan(0);
  });

  it('validates all three demo beatmaps', () => {
    for (const id of ['demo-track-1', 'demo-track-2', 'demo-track-3']) {
      const raw = readFileSync(join(process.cwd(), `content/beatmaps/${id}.json`), 'utf-8');
      const result = validateBeatmap(JSON.parse(raw));
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid beatmap', () => {
    const result = validateBeatmap({ id: 'bad' });
    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
