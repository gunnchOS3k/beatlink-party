import { describe, it, expect } from 'vitest';
import {
  DEVICE_ROLE_IDS,
  DEVICE_ROLE_PROFILES,
  detectDeviceRole,
  getDeviceRoleProfile,
} from '@beatlink/device-ux';
import {
  accessibilityClassList,
  comboFromStreak,
  DEFAULT_ACCESSIBILITY,
} from '@beatlink/shared';
import {
  buildComboState,
  buildKaraokePromptState,
  buildTimelineSync,
  calibratedGameTimeMs,
  resolveMediaDescriptor,
  ProceduralMetronomeProvider,
} from '@beatlink/game-engine';

describe('device role runtime', () => {
  it('exposes field-kit roles plus docked', () => {
    expect(DEVICE_ROLE_IDS).toContain('student_14_5');
    expect(DEVICE_ROLE_IDS).toContain('handheld_hybrid');
    expect(DEVICE_ROLE_IDS).toContain('ds_xl_coder');
    expect(DEVICE_ROLE_IDS).toContain('edge_io_rings');
    expect(DEVICE_ROLE_IDS).toContain('docked');
  });

  it('loads layout/input/audio profiles', () => {
    const student = getDeviceRoleProfile('student_14_5');
    expect(student.layout).toBe('landscape_classroom');
    expect(student.input).toBe('keyboard_trackpad');
    expect(student.audio).toBe('procedural_metronome');
    expect(DEVICE_ROLE_PROFILES.edge_io_rings.audio).toBe('none');
  });

  it('detects handheld for small touch devices', () => {
    expect(
      detectDeviceRole({
        userAgent: 'iPhone',
        maxTouchPoints: 5,
        innerWidth: 390,
      }),
    ).toBe('handheld_hybrid');
  });

  it('prefers docked when host flag set', () => {
    expect(detectDeviceRole({ preferHost: true, innerWidth: 800 })).toBe('docked');
  });
});

describe('accessibility helpers', () => {
  it('maps settings to CSS classes', () => {
    expect(accessibilityClassList(DEFAULT_ACCESSIBILITY)).toEqual([
      'a11y-captions',
      'a11y-screen-reader',
    ]);
    expect(
      accessibilityClassList({
        reduceMotion: true,
        highContrast: true,
        largerHitTargets: true,
        captions: false,
        colorBlindSafe: true,
        screenReaderHints: false,
      }),
    ).toEqual(['a11y-reduce-motion', 'a11y-high-contrast', 'a11y-large-targets', 'a11y-color-blind']);
  });
});

describe('timeline + karaoke + media + combo', () => {
  it('applies calibration to game time', () => {
    expect(calibratedGameTimeMs(1000, 40)).toBe(960);
  });

  it('builds timeline sync snapshot', () => {
    const snap = buildTimelineSync(
      { bpm: 120, offsetMs: 0, durationMs: 60000 },
      1000,
      0,
    );
    expect(snap.beatIndex).toBeGreaterThanOrEqual(1);
    expect(snap.progress).toBeGreaterThan(0);
  });

  it('structures karaoke prompt phases', () => {
    const prompts = [{ id: 'v1', timeMs: 2000, text: 'Sing!', durationMs: 2000 }];
    const upcoming = buildKaraokePromptState(prompts, 1500);
    expect(upcoming.phase).toBe('upcoming');
    const active = buildKaraokePromptState(prompts, 2500);
    expect(active.phase).toBe('active');
    expect(active.progress).toBeGreaterThan(0);
  });

  it('resolves procedural metronome media without ripping', () => {
    const provider = new ProceduralMetronomeProvider();
    const desc = provider.resolve({
      catalogEntry: {
        id: 'demo',
        title: 'Demo',
        artist: 'BeatLink',
        durationMs: 45000,
        bpm: 120,
        beatmapId: 'bm',
        license: 'demo_generated',
        description: 'demo',
      },
    });
    expect(desc.kind).toBe('procedural_metronome');
    expect(desc.playbackStatus).toBe('PLAYABLE_APPROVED');

    const meta = resolveMediaDescriptor({
      linkResult: {
        platform: 'spotify',
        sourceId: 'track:abc',
        title: 'X',
        artist: 'Y',
        album: null,
        artworkUrl: null,
        durationMs: 1000,
        playbackStatus: 'METADATA_ONLY',
        analysisEligible: false,
        lyricsEligible: false,
        matchedCatalogId: null,
        message: 'metadata',
        fallbackOptions: [],
      },
    });
    expect(meta.kind).toBe('metadata_only');
    expect(meta.embed?.sourceId).toBe('track:abc');
  });

  it('exposes combo from streak', () => {
    expect(comboFromStreak(0)).toBe(1);
    expect(comboFromStreak(5)).toBe(2);
    expect(comboFromStreak(10)).toBe(3);
    expect(buildComboState(10, 5).combo).toBe(3);
  });
});
