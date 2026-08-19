#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCrossDeviceContract } from '../cross_device/contractProvider.ts';

const out = join(process.cwd(), 'gate1/evidence/out/cross_device_contract.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(buildCrossDeviceContract({ platform: process.env.PLATFORM ?? 'node' }), null, 2)}\n`);
console.log('cross_device_contract written:', out);
