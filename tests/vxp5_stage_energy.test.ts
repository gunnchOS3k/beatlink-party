import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  catalogEligibility,
  linkEligibility,
  MUSIC_COMPLIANCE_SUMMARY,
} from '../apps/web/src/brand/complianceLabels';
import type { LinkResolveResult, SongCatalogEntry } from '@beatlink/shared';

const ROOT = join(__dirname, '..');

describe('VXP-5 Stage Energy digital gates', () => {
  it('keeps host and player surface class contracts distinct', () => {
    const css = readFileSync(join(ROOT, 'apps/web/src/styles/stage-energy.css'), 'utf8');
    expect(css).toMatch(/\.page-host/);
    expect(css).toMatch(/\.page-player/);
    expect(css).toMatch(/--se-hot-magenta/);
    expect(css).toMatch(/--se-electric-cyan/);
    expect(css).toMatch(/--se-pulse-violet/);
    expect(css).toMatch(/a11y-reduce-motion/);
    expect(css).toMatch(/a11y-high-contrast/);
    expect(css).toMatch(/room-code-hero/);
  });

  it('exposes room-code hero class for TV-readable codes', () => {
    const host = readFileSync(join(ROOT, 'apps/web/src/pages/HostPage.tsx'), 'utf8');
    expect(host).toMatch(/room-code-hero/);
    expect(host).toMatch(/data-testid="host-room-code"/);
    expect(host).toMatch(/data-testid="copy-room-code"/);
    expect(host).not.toMatch(/socket\.id/);
  });

  it('keeps player UI free of raw socket IDs and production emoji controls', () => {
    const player = readFileSync(join(ROOT, 'apps/web/src/pages/PlayerPage.tsx'), 'utf8');
    expect(player).not.toMatch(/socket\.id/);
    expect(player).not.toMatch(/🎉|💡|🚀|⚡/);
    expect(player).toMatch(/GlyphCheer/);
    expect(player).toMatch(/controller-hype-captain/);
    expect(player).toMatch(/VOCAL_PROMPT_TIMING_MODE/);
    expect(player).toMatch(/MICROPHONE_PITCH_ANALYSIS=false/);
  });

  it('labels compliance states truthfully', () => {
    const song = {
      id: 'demo-1',
      title: 'Demo',
      artist: 'BeatLink',
      durationMs: 60000,
      bpm: 120,
      license: 'approved-demo',
    } as SongCatalogEntry;
    expect(catalogEligibility(song).label).toBe('PLAYABLE NOW');

    const meta = {
      playbackStatus: 'METADATA_ONLY',
      platform: 'spotify',
      message: 'metadata only',
      fallbackOptions: [],
    } as unknown as LinkResolveResult;
    expect(linkEligibility(meta).label).toBe('METADATA ONLY');

    const blocked = {
      playbackStatus: 'BLOCKED_BY_POLICY',
      platform: 'youtube',
      message: 'blocked',
      fallbackOptions: [],
    } as unknown as LinkResolveResult;
    expect(linkEligibility(blocked).label).toBe('NOT ELIGIBLE');
    expect(MUSIC_COMPLIANCE_SUMMARY).toMatch(/metadata-only/i);
  });

  it('landing leads with Create a Party / Join a Party', () => {
    const landing = readFileSync(join(ROOT, 'apps/web/src/pages/LandingPage.tsx'), 'utf8');
    expect(landing).toMatch(/Create a Party/);
    expect(landing).toMatch(/Join a Party/);
    expect(landing).toMatch(/PartyLoop|party-loop/);
    expect(landing.indexOf('Create a Party')).toBeLessThan(landing.indexOf('Join a Party'));
    expect(landing).toMatch(/HowToPlay/);
  });

  it('uses original role glyphs module', () => {
    const glyphs = readFileSync(join(ROOT, 'apps/web/src/brand/glyphs.tsx'), 'utf8');
    expect(glyphs).toMatch(/GlyphBeat/);
    expect(glyphs).toMatch(/GlyphVocal/);
    expect(glyphs).toMatch(/GlyphHype/);
    expect(glyphs).toMatch(/roleGlyph/);
  });

  it('network banner omits stack traces and socket dumps', () => {
    const net = readFileSync(join(ROOT, 'apps/web/src/components/NetworkStatus.tsx'), 'utf8');
    expect(net).toMatch(/Reconnecting/);
    expect(net).not.toMatch(/Error\.stack|stackTrace|socket\.id/);
    expect(net).toMatch(/socket IDs/);
  });

  it('capture manifest schema is present after runtime capture or documents required fields', () => {
    const manifestPath = join(ROOT, 'artifacts/vxp5/manifests/VXP5_RUNTIME_CAPTURE_MANIFEST.json');
    if (!existsSync(manifestPath)) {
      // Pre-capture: schema contract still documented by capture spec.
      const spec = readFileSync(
        join(ROOT, 'tests/e2e/vxp5_stage_energy_capture.playwright.spec.ts'),
        'utf8',
      );
      expect(spec).toMatch(/REAL_RUNTIME_MULTICLIENT_CAPTURE/);
      expect(spec).toMatch(/sha256/);
      expect(spec).toMatch(/evidence_class/);
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      evidence_class_default: string;
      wan_carrier_claimed: boolean;
      entries: Array<{
        id: string;
        path: string;
        surface: string;
        client_type: string;
        room_state: string;
        viewport: { width: number; height: number };
        evidence_class: string;
        source_sha: string;
        sha256: string;
        width: number;
        height: number;
      }>;
    };
    expect(manifest.wan_carrier_claimed).toBe(false);
    expect(manifest.evidence_class_default).toBe('REAL_RUNTIME_MULTICLIENT_CAPTURE');
    expect(manifest.entries.length).toBeGreaterThan(0);
    for (const e of manifest.entries) {
      expect(e.id).toBeTruthy();
      expect(e.path).toMatch(/^artifacts\/vxp5\//);
      expect(e.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(e.source_sha).toBeTruthy();
      expect(e.width).toBeGreaterThan(0);
      expect(e.height).toBeGreaterThan(0);
    }
  });
});
