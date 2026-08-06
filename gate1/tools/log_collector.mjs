#!/usr/bin/env node
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'gate1/evidence/out/runtime_logs.jsonl');
mkdirSync(dirname(OUT), { recursive: true });
const entry = {
  game: 'beatlink-party',
  evidence_type: 'log_collector',
  timestamp: new Date().toISOString(),
  source: process.argv[2] || 'stdin-summary',
  message: process.argv.slice(3).join(' ') || 'log collector invoked',
};
appendFileSync(OUT, JSON.stringify(entry) + '\n');
console.log(OUT);
