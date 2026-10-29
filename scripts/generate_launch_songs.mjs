#!/usr/bin/env node
/**
 * Generate first-party launch song WAV beds + honest rights records.
 *
 * Production quality (not duration padding): section structure, motif melody,
 * diatonic harmony, stereo mix, soft-knee master, phrase/chart pitch sync.
 *
 * Rights honesty: never claim public_domain merely via metadata. Original
 * BeatLink procedural beds are first_party_original. CC labels only when the
 * studio deliberately releases under a CC deed. commercialEligible stays false
 * until verified human attribution / commercial review.
 *
 * No ripping, DRM bypass, or lyric scrape.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const audioDir = join(root, 'content/songs/audio');
const rightsDir = join(root, 'content/songs/rights');
mkdirSync(audioDir, { recursive: true });
mkdirSync(rightsDir, { recursive: true });

/** Broadcast-friendly rate; stereo PCM16. */
const SAMPLE_RATE = 44100;

function encodeStereoWav(left, right, sampleRate) {
  const n = Math.min(left.length, right.length);
  const dataSize = n * 4;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 2, true); // stereo
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const L = Math.max(-1, Math.min(1, left[i]));
    const R = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(o, (L * 32767) | 0, true);
    view.setInt16(o + 2, (R * 32767) | 0, true);
    o += 4;
  }
  return Buffer.from(buffer);
}

function softClip(x) {
  // Soft-knee tanh master — preserves punch without hard brickwall.
  return Math.tanh(x * 1.15) * 0.92;
}

function envADSR(t, a, d, s, r, gate) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < gate) return s;
  const releaseT = t - gate;
  if (releaseT >= r) return 0;
  return s * (1 - releaseT / r);
}

/** Map section progress → musical role. */
function sectionOf(progress) {
  if (progress < 0.1) return 'intro';
  if (progress < 0.32) return 'verse';
  if (progress < 0.4) return 'pre';
  if (progress < 0.62) return 'chorus';
  if (progress < 0.74) return 'bridge';
  if (progress < 0.9) return 'chorus';
  return 'outro';
}

function sectionGain(section) {
  switch (section) {
    case 'intro':
      return 0.55;
    case 'verse':
      return 0.78;
    case 'pre':
      return 0.9;
    case 'chorus':
      return 1.12;
    case 'bridge':
      return 0.85;
    case 'outro':
      return 0.5;
    default:
      return 0.8;
  }
}

function difficultyDensity(difficulty) {
  // Chart sync guidance baked into composition recipe (generator / tests).
  switch (difficulty) {
    case 'beginner':
      return 0.5;
    case 'casual':
      return 1;
    case 'pro':
      return 2;
    case 'nightmare':
      return 2.5;
    default:
      return 1;
  }
}

/**
 * Multi-layer song bed: kick/hat, bass root fifth, pad triad, lead motif
 * synced to phrase pitch targets, stereo width by section.
 */
function synthSong({ bpm, durationMs, motifHz, style, phrasePitches }) {
  const n = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const motif = motifHz;
  const phraseHz = phrasePitches?.length ? phrasePitches : motif;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / (durationMs / 1000);
    const section = sectionOf(progress);
    const sGain = sectionGain(section);
    const beat = Math.floor(t / beatSec);
    const phase = (t % beatSec) / beatSec;
    const bar = Math.floor(t / barSec);
    const root = motif[bar % motif.length];
    // Phrase-synced lead: advance through phrase pitches across song body.
    const phraseIdx = Math.min(
      phraseHz.length - 1,
      Math.max(0, Math.floor((progress - 0.08) / (0.84 / phraseHz.length))),
    );
    const leadHz = phraseHz[phraseIdx] ?? root;

    // Kick — tight exponential, style-dependent weight
    const kickAmt = style === 'stomp' ? 0.62 : style === 'pulse' ? 0.48 : 0.38;
    const kick =
      Math.exp(-phase * (style === 'stomp' ? 22 : 30)) *
      kickAmt *
      Math.sin(2 * Math.PI * (48 + phase * 18) * t);

    // Closed hat on offbeats + open on chorus (deterministic noise — stable SHA)
    const noise = ((Math.sin(i * 12.9898 + bar * 78.233) * 43758.5453) % 1) * 2 - 1;
    let hat = 0;
    if (phase > 0.48 && phase < 0.54) {
      hat = noise * 0.07 * Math.exp(-(phase - 0.48) * 80);
    }
    if (section === 'chorus' && phase > 0.22 && phase < 0.28) {
      hat += noise * 0.05 * Math.exp(-(phase - 0.22) * 40);
    }

    // Bass: root + fifth under verse/chorus
    const bassHz = root / 2;
    const bassEnv = envADSR(phase * beatSec, 0.01, 0.08, 0.55, 0.12, beatSec * 0.85);
    const bass =
      Math.sin(2 * Math.PI * bassHz * t) * 0.34 * bassEnv +
      Math.sin(2 * Math.PI * bassHz * 2 * t) * 0.08 * bassEnv;

    // Pad triad (root, major third ≈ 5/4, fifth 3/2) — warm / sparkle variants
    const third = root * (style === 'warm' || style === 'call' ? 1.25 : 1.25992);
    const fifth = root * 1.5;
    const padAmp = section === 'intro' || section === 'outro' ? 0.14 : 0.2;
    const pad =
      (Math.sin(2 * Math.PI * root * t) * 0.45 +
        Math.sin(2 * Math.PI * third * t) * 0.28 +
        Math.sin(2 * Math.PI * fifth * t) * 0.22) *
      padAmp *
      sGain;

    // Lead motif — mild vibrato, gated per beat in chorus for sync feel
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t);
    const leadGate =
      section === 'chorus' || section === 'pre'
        ? envADSR(phase * beatSec, 0.02, 0.05, 0.7, 0.1, beatSec * 0.7)
        : 0.55 + 0.2 * Math.sin(2 * Math.PI * (bpm / 60) * t);
    const lead =
      Math.sin(2 * Math.PI * leadHz * vib * t) * 0.22 * leadGate * sGain +
      Math.sin(2 * Math.PI * leadHz * 2 * vib * t) * 0.06 * leadGate * sGain;

    // Sparkle noise bed (high shelf substitute)
    const sparkle =
      style === 'sparkle' || section === 'chorus'
        ? (Math.sin(i * 12.9898 + bar) * 43758.5453) % 1 * 0.018 * sGain
        : 0;

    // Call/response ducking on alternate bars for Call Mirror
    const callDuck = style === 'call' && bar % 2 === 1 ? 0.65 : 1;

    let mono =
      (kick + hat + bass * callDuck + pad + lead * callDuck + sparkle) * 0.9 * sGain;

    // Stereo: pad/lead width, kick/bass centered
    const width = section === 'chorus' ? 0.22 : section === 'bridge' ? 0.18 : 0.12;
    const side = (pad * 0.35 + lead * 0.4 + sparkle) * width;
    let L = softClip(mono + side);
    let R = softClip(mono - side);

    // Fade edges
    const fadeIn = Math.min(1, t / 0.35);
    const fadeOut = Math.min(1, (durationMs / 1000 - t) / 0.6);
    L *= fadeIn * fadeOut;
    R *= fadeIn * fadeOut;

    left[i] = L;
    right[i] = R;
  }
  return { left, right };
}

const SONGS = [
  {
    id: 'launch-pd-tap-grid',
    title: 'Tap Grid Original',
    artist: 'BeatLink Original Studio',
    bpm: 120,
    durationMs: 96000,
    motifHz: [196, 220, 247, 262, 294, 262, 247, 220],
    style: 'grid',
    // Was falsely labeled public_domain — this is first-party procedural original.
    license: 'synthetic_original',
    licenseVersion: 'original-v1',
    sourceKind: 'original',
    ownershipClass: 'first_party_original',
    licenseLabel: 'BeatLink original (synthetic_original)',
    commercialEligible: false,
    attributionVerified: true,
    thirdPartyLicense: null,
  },
  {
    id: 'launch-orig-call-mirror',
    title: 'Call Mirror',
    artist: 'BeatLink Original Studio',
    bpm: 100,
    durationMs: 102000,
    motifHz: [220, 247, 277, 330, 277, 247],
    style: 'call',
    license: 'synthetic_original',
    licenseVersion: 'original-v1',
    sourceKind: 'original',
    ownershipClass: 'first_party_original',
    licenseLabel: 'BeatLink original (synthetic_original)',
    commercialEligible: false,
    attributionVerified: true,
    thirdPartyLicense: null,
  },
  {
    id: 'launch-cc-karaoke-warm',
    title: 'Warm CC Karaoke',
    artist: 'BeatLink CC Desk',
    bpm: 96,
    durationMs: 108000,
    motifHz: [196, 220, 233, 262, 294, 262, 233, 220],
    style: 'warm',
    // First-party work deliberately released under CC0 — not a third-party scrape.
    license: 'creative_commons',
    licenseVersion: 'CC0-1.0',
    sourceKind: 'creative_commons',
    ownershipClass: 'first_party_original',
    licenseLabel: 'CC0-1.0 (first-party dedication)',
    commercialEligible: false,
    attributionVerified: true,
    thirdPartyLicense: {
      kind: 'creative_commons',
      version: 'CC0-1.0',
      deedUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      owner: 'BeatLink CC Desk',
    },
    ccDeedUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'launch-creator-band-stomp',
    title: 'Creator Band Stomp',
    artist: 'BeatLink Creator Attestation Desk',
    bpm: 126,
    durationMs: 99000,
    motifHz: [180, 220, 240, 270, 240, 220],
    style: 'stomp',
    license: 'creator_owned',
    licenseVersion: 'creator-attested-v1',
    sourceKind: 'creator_owned',
    ownershipClass: 'creator_attested',
    licenseLabel: 'Creator-owned (attested; not auto-published third-party)',
    commercialEligible: false,
    attributionVerified: false,
    thirdPartyLicense: null,
  },
  {
    id: 'launch-pd-predict-pulse',
    title: 'Prediction Pulse Original',
    artist: 'BeatLink Original Studio',
    bpm: 130,
    durationMs: 90000,
    motifHz: [165, 196, 220, 247, 294, 247, 220],
    style: 'pulse',
    license: 'synthetic_original',
    licenseVersion: 'original-v1',
    sourceKind: 'original',
    ownershipClass: 'first_party_original',
    licenseLabel: 'BeatLink original (synthetic_original)',
    commercialEligible: false,
    attributionVerified: true,
    thirdPartyLicense: null,
  },
  {
    id: 'launch-cc-multi-party',
    title: 'CC Multi-Mode Party',
    artist: 'BeatLink CC Desk',
    bpm: 118,
    durationMs: 114000,
    motifHz: [208, 233, 262, 311, 349, 311, 262, 233],
    style: 'sparkle',
    license: 'creative_commons',
    licenseVersion: 'CC-BY-4.0',
    sourceKind: 'creative_commons',
    ownershipClass: 'first_party_original',
    licenseLabel: 'CC-BY-4.0 (first-party release; attribution required)',
    commercialEligible: false,
    attributionVerified: true,
    thirdPartyLicense: {
      kind: 'creative_commons',
      version: 'CC-BY-4.0',
      deedUrl: 'https://creativecommons.org/licenses/by/4.0/',
      owner: 'BeatLink CC Desk',
    },
    ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
];

const phraseSets = {
  'launch-pd-tap-grid': [
    ['Tap the pulse!', 196],
    ['Keep the grid!', 220],
    ['Stay on beat!', 247],
    ['Lock the downbeat!', 262],
    ['Ride the eighths!', 294],
    ['Close the loop!', 247],
  ],
  'launch-orig-call-mirror': [
    ['Echo the call!', 220],
    ['Answer the host!', 247],
    ['Mirror the phrase!', 277],
    ['Hold the reply!', 330],
    ['Trade the motif!', 277],
    ['Land together!', 247],
  ],
  'launch-cc-karaoke-warm': [
    ['Sing the warm-up!', 196],
    ['Hold the vowel!', 220],
    ['Soft chorus cue!', 233],
    ['Lift the phrase!', 262],
    ['Breathe and return!', 294],
    ['Gentle landing!', 220],
  ],
  'launch-creator-band-stomp': [
    ['Band hit!', 180],
    ['Hype the drop!', 220],
    ['Hold the stomp!', 240],
    ['Kick with the floor!', 270],
    ['Stack the chord!', 240],
    ['Ride the outro!', 220],
  ],
  'launch-pd-predict-pulse': [
    ['Predict the drop!', 165],
    ['Call the section!', 196],
    ['Vote the fill!', 220],
    ['Lock your pick!', 247],
    ['Watch the rise!', 294],
    ['Confirm the hit!', 220],
  ],
  'launch-cc-multi-party': [
    ['Party sparkle!', 208],
    ['All-mode cue!', 233],
    ['Crowd cheer!', 262],
    ['Swap the role!', 311],
    ['Lift the room!', 349],
    ['Finale glow!', 262],
  ],
};

function buildPhrases(songId, durationMs, bpm) {
  const rows = phraseSets[songId] ?? [];
  const beatMs = (60 / bpm) * 1000;
  // Align phrase starts to bar boundaries inside the playable body.
  const bodyStart = Math.round(beatMs * 8); // after 2 bars intro
  const bodyEnd = durationMs - Math.round(beatMs * 8);
  const span = bodyEnd - bodyStart;
  const step = span / rows.length;
  return rows.map(([text, hz], i) => {
    const raw = bodyStart + step * i;
    const quantized = Math.round(raw / beatMs) * beatMs;
    return {
      id: `ph-${i}`,
      text,
      startMs: Math.max(bodyStart, Math.min(bodyEnd - 2400, quantized)),
      durationMs: Math.round(beatMs * 4), // one bar window
      targetPitchHz: hz,
    };
  });
}

const catalogSongs = [];
const manifest = {
  generated_at_utc: new Date().toISOString(),
  sampleRate: SAMPLE_RATE,
  channels: 2,
  mastering: 'soft_knee_tanh_v2',
  songs: [],
};

for (const song of SONGS) {
  const phrases = buildPhrases(song.id, song.durationMs, song.bpm);
  const phrasePitches = phrases.map((p) => p.targetPitchHz);
  const pcm = synthSong({ ...song, phrasePitches });
  const wav = encodeStereoWav(pcm.left, pcm.right, SAMPLE_RATE);
  const audioRel = `songs/audio/${song.id}.wav`;
  const audioPath = join(root, 'content', audioRel);
  writeFileSync(audioPath, wav);
  const sha = createHash('sha256').update(wav).digest('hex');
  const compositionSha = createHash('sha256')
    .update(
      JSON.stringify({
        id: song.id,
        bpm: song.bpm,
        motif: song.motifHz,
        style: song.style,
        durationMs: song.durationMs,
        sampleRate: SAMPLE_RATE,
        channels: 2,
        phrasePitches,
        difficultyDensity: {
          beginner: difficultyDensity('beginner'),
          casual: difficultyDensity('casual'),
          pro: difficultyDensity('pro'),
          nightmare: difficultyDensity('nightmare'),
        },
        structure: ['intro', 'verse', 'pre', 'chorus', 'bridge', 'chorus', 'outro'],
      }),
    )
    .digest('hex');

  const rightsRel = `songs/rights/${song.id}.json`;
  const rights = {
    schema: 'beatlink.asset_rights.v2',
    trackId: song.id,
    title: song.title,
    artist: song.artist,
    author: song.artist,
    license: song.license,
    licenseVersion: song.licenseVersion,
    licenseLabel: song.licenseLabel,
    sourceKind: song.sourceKind,
    ownershipClass: song.ownershipClass,
    attribution: `${song.artist} — ${song.licenseVersion}`,
    attributionVerified: song.attributionVerified,
    commercialEligible: false,
    commercialEligibilityNote:
      'false until verified human attribution + commercial review — metadata alone never grants commercial',
    thirdPartyLicense: song.thirdPartyLicense,
    ownershipEvidence: `First-party procedural composition (BeatLink studio generator v2); assetSha256=${sha}; ownershipClass=${song.ownershipClass}. Not a third-party PD scrape.`,
    ripForbidden: true,
    drmBypassForbidden: true,
    ccDeedUrl: song.ccDeedUrl ?? null,
    audioAssetPath: audioRel,
    assetSha256: sha,
    compositionSha256: compositionSha,
    sampleRate: SAMPLE_RATE,
    channels: 2,
    durationMs: song.durationMs,
    bpm: song.bpm,
    generatedBy: 'scripts/generate_launch_songs.mjs',
    productionNotes: {
      structure: ['intro', 'verse', 'pre', 'chorus', 'bridge', 'chorus', 'outro'],
      layers: ['kick', 'hat', 'bass', 'pad_triad', 'lead_phrase_sync', 'sparkle'],
      mix: 'stereo_width_by_section',
      master: 'soft_knee_tanh_v2',
      chartSync: 'phrase_pitch_and_bar_quantized_windows',
    },
  };
  writeFileSync(join(root, 'content', rightsRel), JSON.stringify(rights, null, 2) + '\n');

  const modesById = {
    'launch-pd-tap-grid': ['BeatTap'],
    'launch-orig-call-mirror': ['CallAndResponse'],
    'launch-cc-karaoke-warm': ['KaraokePerformance'],
    'launch-creator-band-stomp': ['BandRoles'],
    'launch-pd-predict-pulse': ['PredictionTrivia'],
    'launch-cc-multi-party': [
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ],
  };

  catalogSongs.push({
    id: song.id,
    title: song.title,
    artist: song.artist,
    durationMs: song.durationMs,
    bpm: song.bpm,
    beatmapId: song.id,
    license: song.license,
    description: `Full-length first-party launch song (${Math.round(song.durationMs / 1000)}s) — structured stereo WAV, phrase-synced charts. License=${song.licenseLabel}. Not a commercial rip. commercialEligible=false.`,
    modes: modesById[song.id],
    difficulties: ['beginner', 'casual', 'pro', 'nightmare'],
    analysisEligible: true,
    launchEligible: true,
    audioAssetPath: audioRel,
    assetSha256: sha,
    compositionSha256: compositionSha,
    chart: {
      beatmapId: 'placeholder',
      difficulties: ['beginner', 'casual', 'pro', 'nightmare'],
      noteRoles:
        song.id.includes('karaoke')
          ? ['vocalist']
          : song.id.includes('band')
            ? ['beat_tapper', 'vocalist', 'hype_captain']
            : song.id.includes('predict')
              ? ['hype_captain']
              : song.id.includes('call')
                ? ['beat_tapper', 'vocalist']
                : song.id.includes('multi')
                  ? ['beat_tapper', 'vocalist', 'hype_captain']
                  : ['beat_tapper'],
    },
    karaokeMeta: {
      prompts: phrases.map((p) => p.text),
      noRecording: true,
      pitchHintHz: phrases[0]?.targetPitchHz ?? 220,
      language: 'en',
      phrases,
    },
    rights: {
      license: song.license,
      attribution: rights.attribution,
      ripForbidden: true,
      drmBypassForbidden: true,
      sourceKind: song.sourceKind,
      ccDeedUrl: song.ccDeedUrl ?? null,
      licenseVersion: song.licenseVersion,
      author: song.artist,
      ownershipEvidence: rights.ownershipEvidence,
      rightsRecordPath: rightsRel,
      ownershipClass: song.ownershipClass,
      licenseLabel: song.licenseLabel,
      commercialEligible: false,
      attributionVerified: song.attributionVerified,
      thirdPartyLicense: song.thirdPartyLicense,
    },
  });

  manifest.songs.push({
    id: song.id,
    audioAssetPath: audioRel,
    assetSha256: sha,
    durationMs: song.durationMs,
    bpm: song.bpm,
    sampleRate: SAMPLE_RATE,
    channels: 2,
    ownershipClass: song.ownershipClass,
    license: song.license,
    commercialEligible: false,
  });
}

const beatmapIds = {
  'launch-pd-tap-grid': 'launch-pd-tap-120',
  'launch-orig-call-mirror': 'launch-orig-call-100',
  'launch-cc-karaoke-warm': 'launch-cc-karaoke-96',
  'launch-creator-band-stomp': 'launch-creator-band-126',
  'launch-pd-predict-pulse': 'launch-pd-predict-130',
  'launch-cc-multi-party': 'launch-cc-multi-118',
};
for (const s of catalogSongs) {
  s.beatmapId = beatmapIds[s.id];
  s.chart.beatmapId = beatmapIds[s.id];
}

const catalog = {
  schema_version: '1.2.0',
  purpose:
    'Offline legal launch catalog — first-party original / CC-released / creator-attested full playable songs with honest ownership vs license separation + hashes. No ripping, no DRM bypass, no copyrighted commercial lyrics. commercialEligible remains false.',
  rip_forbidden: true,
  drm_bypass_forbidden: true,
  rights_honesty: {
    public_domain_requires: 'verified_third_party_pd_source_or_explicit_dedication_deed',
    metadata_alone_never_grants_pd_or_commercial: true,
    ownership_vs_license_separated: true,
  },
  songs: catalogSongs,
};

writeFileSync(
  join(root, 'content/songs/offline-launch-catalog.json'),
  JSON.stringify(catalog, null, 2) + '\n',
);
writeFileSync(
  join(root, 'content/songs/LAUNCH_AUDIO_MANIFEST.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      songs: catalogSongs.length,
      sampleRate: SAMPLE_RATE,
      channels: 2,
      minDurationSec: Math.min(...catalogSongs.map((s) => s.durationMs)) / 1000,
      maxDurationSec: Math.max(...catalogSongs.map((s) => s.durationMs)) / 1000,
      licenses: [...new Set(catalogSongs.map((s) => s.license))],
      commercialEligibleAny: catalogSongs.some((s) => s.rights?.commercialEligible === true),
    },
    null,
    2,
  ),
);
