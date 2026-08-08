/**
 * Digital RC packaging — digitally possible surfaces only.
 * DEV signing metadata, SBOM digest, update/rollback manifests,
 * offline bundle checklist, privacy posture. Not a claim of store
 * distribution, production HSM signing, or physical device RC.
 */

import { emitTelemetry } from '@beatlink/shared';

export const DIGITAL_RC_DISCLAIMER =
  'Digital RC packaging only — not store submission, production HSM, or physical device RC.';

export interface DigitalRcPackageManifest {
  schemaVersion: '1.0.0';
  product: 'beatlink-party';
  channel: 'digital-rc';
  versionName: string;
  versionCode: number;
  builtAtUtc: string;
  disclaimer: typeof DIGITAL_RC_DISCLAIMER;
  signing: DigitalRcSigning;
  sbom: DigitalRcSbom;
  update: DigitalRcUpdateManifest;
  rollback: DigitalRcRollbackManifest;
  offline: DigitalRcOfflineBundle;
  privacy: DigitalRcPrivacyPosture;
}

export interface DigitalRcSigning {
  mode: 'DEV';
  algorithm: 'SHA-256';
  /** DEV-only digest of package identity — not a production certificate. */
  packageDigestSha256: string;
  keyAlias: 'beatlink-digital-rc-dev';
  productionHsm: false;
  storeSubmission: false;
}

export interface DigitalRcSbomComponent {
  name: string;
  version: string;
  type: 'application' | 'library' | 'workspace';
}

export interface DigitalRcSbom {
  format: 'beatlink-sbom-lite';
  components: DigitalRcSbomComponent[];
  digestSha256: string;
}

export interface DigitalRcUpdateManifest {
  fromVersion: string;
  toVersion: string;
  strategy: 'replace_digital_bundle';
  requiresOnline: false;
  notes: string[];
}

export interface DigitalRcRollbackManifest {
  targetVersion: string;
  strategy: 'restore_prior_digital_bundle';
  dataLossRisk: 'session_ephemeral_ok';
  notes: string[];
}

export interface DigitalRcOfflineBundle {
  includesApprovedCatalog: boolean;
  includesSyntheticAnalysisAssets: boolean;
  includesMicRecording: false;
  includesPlatformSdks: false;
  joinQrWorksOffline: boolean;
  notes: string[];
}

export interface DigitalRcPrivacyPosture {
  telemetryDefault: 'session_local_no_pii';
  micRecordingDefault: 'off';
  displayNameRedaction: 'opt_in';
  retentionMsDefault: number;
  notes: string[];
}

export interface BuildDigitalRcInput {
  versionName?: string;
  versionCode?: number;
  fromVersion?: string;
  components?: DigitalRcSbomComponent[];
  nowMs?: number;
}

const DEFAULT_COMPONENTS: DigitalRcSbomComponent[] = [
  { name: 'beatlink-party', version: '0.1.0', type: 'application' },
  { name: '@beatlink/shared', version: '0.1.0', type: 'workspace' },
  { name: '@beatlink/game-engine', version: '0.1.0', type: 'workspace' },
  { name: '@beatlink/web', version: '0.1.0', type: 'workspace' },
  { name: '@beatlink/server', version: '0.1.0', type: 'workspace' },
  { name: '@beatlink/device-ux', version: '0.1.0', type: 'workspace' },
];

/** Minimal sync SHA-256 (browser + node) — DEV digests only; no node:crypto. */
function sha256Hex(message: string): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const withOne = bytes.length + 1;
  const padLen = (withOne % 64 <= 56 ? 56 : 120) - (withOne % 64);
  const total = withOne + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, bitLen >>> 0, false);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15]!, 7) ^ rotr(w[j - 15]!, 18) ^ (w[j - 15]! >>> 3);
      const s1 = rotr(w[j - 2]!, 17) ^ rotr(w[j - 2]!, 19) ^ (w[j - 2]! >>> 10);
      w[j] = (w[j - 16]! + s0 + w[j - 7]! + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j]! + w[j]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

export function buildDigitalRcPackage(
  input: BuildDigitalRcInput = {},
): DigitalRcPackageManifest {
  const versionName = input.versionName ?? '0.2.0-digital-rc';
  const versionCode = input.versionCode ?? 3;
  const fromVersion = input.fromVersion ?? '0.1.0-alpha-exit';
  const builtAtUtc = new Date(input.nowMs ?? Date.now()).toISOString();
  const components = input.components ?? DEFAULT_COMPONENTS;
  const sbomBody = JSON.stringify({ format: 'beatlink-sbom-lite', components });
  const sbomDigest = sha256Hex(sbomBody);
  const packageIdentity = JSON.stringify({
    product: 'beatlink-party',
    versionName,
    versionCode,
    builtAtUtc,
    sbomDigest,
  });
  const packageDigest = sha256Hex(packageIdentity);

  const manifest: DigitalRcPackageManifest = {
    schemaVersion: '1.0.0',
    product: 'beatlink-party',
    channel: 'digital-rc',
    versionName,
    versionCode,
    builtAtUtc,
    disclaimer: DIGITAL_RC_DISCLAIMER,
    signing: {
      mode: 'DEV',
      algorithm: 'SHA-256',
      packageDigestSha256: packageDigest,
      keyAlias: 'beatlink-digital-rc-dev',
      productionHsm: false,
      storeSubmission: false,
    },
    sbom: {
      format: 'beatlink-sbom-lite',
      components,
      digestSha256: sbomDigest,
    },
    update: {
      fromVersion,
      toVersion: versionName,
      strategy: 'replace_digital_bundle',
      requiresOnline: false,
      notes: [
        'Digital bundle replace only — no forced cloud sync.',
        'In-memory rooms are ephemeral across update.',
      ],
    },
    rollback: {
      targetVersion: fromVersion,
      strategy: 'restore_prior_digital_bundle',
      dataLossRisk: 'session_ephemeral_ok',
      notes: [
        'Rollback restores prior digital bundle digest.',
        'Active socket sessions are not migrated.',
      ],
    },
    offline: {
      includesApprovedCatalog: true,
      includesSyntheticAnalysisAssets: true,
      includesMicRecording: false,
      includesPlatformSdks: false,
      joinQrWorksOffline: true,
      notes: [
        'Join QR encodes locally — no third-party QR network call.',
        'Catalog + synthetic analysis assets ship in-repo.',
      ],
    },
    privacy: {
      telemetryDefault: 'session_local_no_pii',
      micRecordingDefault: 'off',
      displayNameRedaction: 'opt_in',
      retentionMsDefault: 15 * 60 * 1000,
      notes: [
        'Telemetry sinks must redact names/tokens/URLs.',
        'Karaoke default is no-recording.',
      ],
    },
  };

  emitTelemetry('rc_packaging', 'DIGITAL_RC', {
    versionName,
    versionCode,
    sbomDigest,
    signingMode: 'DEV',
  });

  return manifest;
}

export function planDigitalRcUpdate(
  manifest: DigitalRcPackageManifest,
): DigitalRcUpdateManifest {
  emitTelemetry('rc_update', 'DIGITAL_RC', {
    from: manifest.update.fromVersion,
    to: manifest.update.toVersion,
  });
  return manifest.update;
}

export function planDigitalRcRollback(
  manifest: DigitalRcPackageManifest,
): DigitalRcRollbackManifest {
  emitTelemetry('rc_rollback', 'DIGITAL_RC', {
    target: manifest.rollback.targetVersion,
  });
  return manifest.rollback;
}

export function assertDigitalRcReady(manifest: DigitalRcPackageManifest): {
  ready: boolean;
  gaps: string[];
  token: 'BEATLINK_DIGITAL_RC_READY' | 'BEATLINK_DIGITAL_RC_NOT_READY';
} {
  const gaps: string[] = [];
  if (manifest.signing.mode !== 'DEV') gaps.push('signing_mode');
  if (manifest.signing.productionHsm) gaps.push('must_not_claim_hsm');
  if (manifest.signing.storeSubmission) gaps.push('must_not_claim_store');
  if (!manifest.sbom.digestSha256 || manifest.sbom.components.length < 3) {
    gaps.push('sbom');
  }
  if (!manifest.offline.includesApprovedCatalog) gaps.push('offline_catalog');
  if (manifest.offline.includesMicRecording) gaps.push('mic_must_stay_off');
  if (manifest.offline.includesPlatformSdks) gaps.push('no_platform_sdks_in_digital_rc');
  if (manifest.privacy.micRecordingDefault !== 'off') gaps.push('privacy_mic');
  if (manifest.privacy.telemetryDefault !== 'session_local_no_pii') {
    gaps.push('privacy_telemetry');
  }
  const ready = gaps.length === 0;
  return {
    ready,
    gaps,
    token: ready ? 'BEATLINK_DIGITAL_RC_READY' : 'BEATLINK_DIGITAL_RC_NOT_READY',
  };
}
