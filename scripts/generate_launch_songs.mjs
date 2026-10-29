#!/usr/bin/env node
/**
 * Generate original / PD / CC launch song WAV beds + rights records.
 * No ripping, DRM bypass, or lyric scrape — procedural compositions only.
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

const SAMPLE_RATE = 22050;

function encodeMonoWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
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
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, (v * 32767) | 0, true);
    o += 2;
  }
  return Buffer.from(buffer);
}

function synthSong({ bpm, durationMs, motifHz, style }) {
  const n = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(n);
  const beatSec = 60 / bpm;
  const motif = motifHz;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = Math.floor(t / beatSec);
    const phase = (t % beatSec) / beatSec;
    const bar = Math.floor(beat / 4);
    const root = motif[bar % motif.length];
    const section = t / (durationMs / 1000);
    let amp = 0.18;
    if (section < 0.12) amp *= 0.55; // intro
    else if (section > 0.85) amp *= 0.45; // outro
    else if (section > 0.4 && section < 0.68) amp *= 1.15; // chorus lift

    // Kick on beats
    const kick = Math.exp(-phase * 28) * (style === 'stomp' ? 0.55 : 0.35);
    // Melodic triad bed
    const mel =
      Math.sin(2 * Math.PI * root * t) * 0.45 +
      Math.sin(2 * Math.PI * root * 1.5 * t) * 0.22 +
      Math.sin(2 * Math.PI * root * 2 * t) * 0.12;
    // Soft noise bed for sparkle tracks
    const noise = style === 'sparkle' ? (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.02 : 0;
    // Hi-hat tick
    const hat = phase > 0.48 && phase < 0.55 ? 0.08 : 0;
    out[i] = (kick * Math.sin(2 * Math.PI * 55 * t) + mel * amp + noise + hat) * 0.85;
  }
  return out;
}

const SONGS = [
  {
    id: 'launch-pd-tap-grid',
    title: 'Public Domain Tap Grid',
    artist: 'BeatLink Public Domain Desk',
    bpm: 120,
    durationMs: 96000,
    motifHz: [196, 220, 247, 262, 294, 262, 247, 220],
    style: 'grid',
    license: 'public_domain',
    licenseVersion: 'PD-original-arrangement',
    sourceKind: 'public_domain',
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
  },
  {
    id: 'launch-cc-karaoke-warm',
    title: 'Warm CC Karaoke',
    artist: 'BeatLink CC Desk',
    bpm: 96,
    durationMs: 108000,
    motifHz: [196, 220, 233, 262, 294, 262, 233, 220],
    style: 'warm',
    license: 'creative_commons',
    licenseVersion: 'CC0-1.0',
    sourceKind: 'creative_commons',
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
  },
  {
    id: 'launch-pd-predict-pulse',
    title: 'Prediction Pulse PD',
    artist: 'BeatLink Public Domain Desk',
    bpm: 130,
    durationMs: 90000,
    motifHz: [165, 196, 220, 247, 294, 247, 220],
    style: 'pulse',
    license: 'public_domain',
    licenseVersion: 'PD-original-arrangement',
    sourceKind: 'public_domain',
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

function buildPhrases(songId, durationMs) {
  const rows = phraseSets[songId] ?? [];
  const usable = durationMs - 10000;
  const step = usable / (rows.length + 1);
  return rows.map(([text, hz], i) => ({
    id: `ph-${i}`,
    text,
    startMs: Math.round(5000 + step * (i + 1)),
    durationMs: Math.min(4800, Math.max(2400, Math.round(step * 0.5))),
    targetPitchHz: hz,
  }));
}

const catalogSongs = [];
const manifest = { generated_at_utc: new Date().toISOString(), songs: [] };

for (const song of SONGS) {
  const pcm = synthSong(song);
  const wav = encodeMonoWav(pcm, SAMPLE_RATE);
  const audioRel = `songs/audio/${song.id}.wav`;
  const audioPath = join(root, 'content', audioRel);
  writeFileSync(audioPath, wav);
  const sha = createHash('sha256').update(wav).digest('hex');
  const compositionSha = createHash('sha256')
    .update(JSON.stringify({ id: song.id, bpm: song.bpm, motif: song.motifHz, style: song.style, durationMs: song.durationMs }))
    .digest('hex');

  const phrases = buildPhrases(song.id, song.durationMs);
  const rightsRel = `songs/rights/${song.id}.json`;
  const rights = {
    schema: 'beatlink.asset_rights.v1',
    trackId: song.id,
    title: song.title,
    artist: song.artist,
    author: song.artist,
    license: song.license,
    licenseVersion: song.licenseVersion,
    sourceKind: song.sourceKind,
    attribution: `${song.artist} — ${song.licenseVersion}`,
    ownershipEvidence: `Original procedural composition authored for BeatLink launch; sha256=${sha}`,
    ripForbidden: true,
    drmBypassForbidden: true,
    ccDeedUrl: song.ccDeedUrl ?? null,
    audioAssetPath: audioRel,
    assetSha256: sha,
    compositionSha256: compositionSha,
    sampleRate: SAMPLE_RATE,
    channels: 1,
    durationMs: song.durationMs,
    bpm: song.bpm,
    generatedBy: 'scripts/generate_launch_songs.mjs',
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
    beatmapId: song.id.replace(/^launch-/, 'launch-') + '-' + song.bpm,
    license: song.license,
    description: `Full-length original/authorized launch song (${Math.round(song.durationMs / 1000)}s) — procedural WAV + note/phrase charts. No commercial rip.`,
    modes: modesById[song.id],
    difficulties: ['beginner', 'casual', 'pro', 'nightmare'],
    analysisEligible: true,
    launchEligible: true,
    audioAssetPath: audioRel,
    assetSha256: sha,
    compositionSha256: compositionSha,
    chart: {
      beatmapId: `${song.id.includes('tap') ? 'launch-pd-tap-120' : song.id.includes('call') ? 'launch-orig-call-100' : song.id.includes('karaoke') ? 'launch-cc-karaoke-96' : song.id.includes('band') ? 'launch-creator-band-126' : song.id.includes('predict') ? 'launch-pd-predict-130' : 'launch-cc-multi-118'}`,
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
    },
  });

  manifest.songs.push({
    id: song.id,
    audioAssetPath: audioRel,
    assetSha256: sha,
    durationMs: song.durationMs,
    bpm: song.bpm,
  });
}

// Fix beatmap IDs to match prior catalog (tests / caches may key on them)
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
  schema_version: '1.1.0',
  purpose:
    'Offline legal launch catalog — original / public-domain / Creative Commons / creator-owned full playable songs with rights records + hashes. No ripping, no DRM bypass, no copyrighted commercial lyrics.',
  rip_forbidden: true,
  drm_bypass_forbidden: true,
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
      minDurationSec: Math.min(...catalogSongs.map((s) => s.durationMs)) / 1000,
      maxDurationSec: Math.max(...catalogSongs.map((s) => s.durationMs)) / 1000,
    },
    null,
    2,
  ),
);
