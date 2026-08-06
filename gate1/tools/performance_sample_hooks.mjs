#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const start = process.hrtime.bigint();
let samples = 0;
for (let i = 0; i < 10000; i++) samples += Math.sin(i);
const ms = Number(process.hrtime.bigint() - start) / 1e6;
const out = {
  game: 'beatlink-party',
  evidence_type: 'performance_sample',
  timestamp: new Date().toISOString(),
  sample_ms: ms,
  hook: 'node_cpu_microbench',
  samples,
};
const path = join(ROOT, 'gate1/evidence/out/performance_sample.json');
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
