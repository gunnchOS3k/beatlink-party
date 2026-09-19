#!/usr/bin/env node
/**
 * Optional offline vendor for Stage Energy OFL fonts.
 * Usage: node scripts/vendor_stage_energy_fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/public/fonts');
const files = {
  'space-grotesk-latin-700.woff2':
    'https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@5.2.8/latin-700-normal.woff2',
  'outfit-latin-400.woff2':
    'https://cdn.jsdelivr.net/fontsource/fonts/outfit@5.2.6/latin-400-normal.woff2',
  'outfit-latin-700.woff2':
    'https://cdn.jsdelivr.net/fontsource/fonts/outfit@5.2.6/latin-700-normal.woff2',
};

await mkdir(out, { recursive: true });
for (const [name, url] of Object.entries(files)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  await writeFile(join(out, name), Buffer.from(await res.arrayBuffer()));
  console.log('vendored', name);
}
