#!/usr/bin/env node
/**
 * BeatLink Party — Pixel device test orchestration (stable server, no tsx watch).
 * Writes apps/web/.env.production.local locally (not committed).
 */
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'apps/web');
const androidDir = path.join(webDir, 'android');
const envLocal = path.join(webDir, '.env.production.local');

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  execSync(`${cmd} ${args.map((a) => JSON.stringify(a)).join(' ')}`, { stdio: 'inherit', cwd });
}

function detectLanIp() {
  try {
    const out = execSync('ipconfig getifaddr en0 || ipconfig getifaddr en1', { encoding: 'utf8' }).trim();
    if (out) return out;
  } catch {
    /* fall through */
  }
  return null;
}

async function promptIp(defaultIp) {
  if (process.env.BEATLINK_LAN_IP) return process.env.BEATLINK_LAN_IP;
  if (defaultIp) return defaultIp;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter Mac LAN IP for Pixel to reach BeatLink server: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function waitForHealth(baseUrl, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const out = execSync(`curl -sf ${baseUrl}/health`, { encoding: 'utf8' });
      const json = JSON.parse(out);
      if (json.status === 'ok') {
        console.log('Health check OK:', json);
        return;
      }
    } catch {
      /* retry */
    }
    execSync('sleep 1');
  }
  throw new Error(`Server health check failed for ${baseUrl}`);
}

console.log('=== BeatLink device:test:android ===');

try {
  execSync('adb devices', { stdio: 'inherit' });
} catch (e) {
  console.warn('ADB not available:', e.message);
}

const lanIp = await promptIp(detectLanIp());
if (!lanIp) {
  console.error('LAN IP required.');
  process.exit(1);
}

const apiBase = `http://${lanIp}:3001`;
writeFileSync(envLocal, `VITE_API_URL=${apiBase}\nVITE_WS_URL=${apiBase}\n`, 'utf8');
console.log(`Wrote ${envLocal} (local only)`);

run('pnpm', ['--filter', '@beatlink/server', 'build']);

const server = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
  cwd: path.join(root, 'apps/server'),
  env: { ...process.env, PORT: '3001', CORS_ORIGIN: '*' },
  stdio: 'inherit',
});

const shutdown = () => {
  server.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  waitForHealth(apiBase);
  run('pnpm', ['--filter', '@beatlink/web', 'build']);
  run('npx', ['cap', 'sync', 'android'], webDir);
  const gradlew = path.join(androidDir, 'gradlew');
  if (!existsSync(gradlew)) throw new Error('Android project missing');
  run('./gradlew', ['assembleDebug', '--no-daemon'], androidDir);
  const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  run('adb', ['install', '-r', apk]);
  run('adb', ['shell', 'am', 'start', '-n', 'com.gunnchos.beatlinkparty/.MainActivity']);
  console.log(`\nServer listening at ${apiBase}`);
  console.log('Mac can join via browser. Ctrl+C stops the server.');
  await new Promise(() => {});
} catch (err) {
  server.kill('SIGTERM');
  console.error(err);
  process.exit(1);
}
