/**
 * Lyrics + music catalog provider interfaces.
 * Mock + public-domain paths ship in-repo.
 * Commercial providers remain EXTERNAL (credentials / licensed APIs out of band).
 */

export type LyricsProviderKind = 'mock' | 'public_domain' | 'commercial_external';
export type MusicProviderKind = 'mock' | 'public_domain' | 'commercial_external';

export interface LyricLine {
  tMs: number;
  text: string;
}

export interface LyricsDocument {
  trackId: string;
  title: string;
  artist: string;
  license: 'mock' | 'public_domain' | 'licensed_external';
  lines: LyricLine[];
  source: LyricsProviderKind;
}

export interface MusicTrackRef {
  trackId: string;
  title: string;
  artist: string;
  durationMs: number;
  license: 'mock' | 'public_domain' | 'licensed_external';
  /** Playback URL only for mock/PD local assets — never a rip of commercial audio. */
  playbackUrl: string | null;
  source: MusicProviderKind;
}

export interface LyricsProvider {
  readonly kind: LyricsProviderKind;
  readonly id: string;
  /** Commercial adapters must stay EXTERNAL — this flag documents that boundary. */
  readonly externalCommercial: boolean;
  fetchLyrics(trackId: string): Promise<LyricsDocument | null>;
}

export interface MusicCatalogProvider {
  readonly kind: MusicProviderKind;
  readonly id: string;
  readonly externalCommercial: boolean;
  search(query: string): Promise<MusicTrackRef[]>;
  getTrack(trackId: string): Promise<MusicTrackRef | null>;
}

/** Deterministic mock lyrics for CI / demos. */
export class MockLyricsProvider implements LyricsProvider {
  readonly kind = 'mock' as const;
  readonly id = 'mock_lyrics';
  readonly externalCommercial = false;

  async fetchLyrics(trackId: string): Promise<LyricsDocument | null> {
    return {
      trackId,
      title: `Mock Track ${trackId}`,
      artist: 'BeatLink Mock',
      license: 'mock',
      source: 'mock',
      lines: [
        { tMs: 0, text: 'Clap on the beat' },
        { tMs: 2000, text: 'Sing the hook loud' },
        { tMs: 4000, text: 'Hold the last note' },
      ],
    };
  }
}

/** Public-domain lyric seed — no commercial catalog claims. */
export class PublicDomainLyricsProvider implements LyricsProvider {
  readonly kind = 'public_domain' as const;
  readonly id = 'public_domain_lyrics';
  readonly externalCommercial = false;

  private catalog: Record<string, LyricsDocument> = {
    'pd-row-row': {
      trackId: 'pd-row-row',
      title: 'Row, Row, Row Your Boat',
      artist: 'Traditional',
      license: 'public_domain',
      source: 'public_domain',
      lines: [
        { tMs: 0, text: 'Row, row, row your boat' },
        { tMs: 3000, text: 'Gently down the stream' },
        { tMs: 6000, text: 'Merrily, merrily, merrily, merrily' },
        { tMs: 9000, text: 'Life is but a dream' },
      ],
    },
  };

  async fetchLyrics(trackId: string): Promise<LyricsDocument | null> {
    return this.catalog[trackId] ?? null;
  }
}

/**
 * Commercial lyric providers (Musixmatch, LyricFind, etc.) — EXTERNAL only.
 * Instantiating this does not call network; fetch always refuses without out-of-band wiring.
 */
export class CommercialExternalLyricsProvider implements LyricsProvider {
  readonly kind = 'commercial_external' as const;
  readonly id = 'commercial_lyrics_external';
  readonly externalCommercial = true;

  async fetchLyrics(_trackId: string): Promise<LyricsDocument | null> {
    return null;
  }
}

export class MockMusicCatalogProvider implements MusicCatalogProvider {
  readonly kind = 'mock' as const;
  readonly id = 'mock_music';
  readonly externalCommercial = false;

  async search(query: string): Promise<MusicTrackRef[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [
      {
        trackId: `mock-${q.replace(/\s+/g, '-')}`,
        title: `Mock: ${query}`,
        artist: 'BeatLink Mock',
        durationMs: 45000,
        license: 'mock',
        playbackUrl: null,
        source: 'mock',
      },
    ];
  }

  async getTrack(trackId: string): Promise<MusicTrackRef | null> {
    if (!trackId.startsWith('mock-')) return null;
    return {
      trackId,
      title: trackId,
      artist: 'BeatLink Mock',
      durationMs: 45000,
      license: 'mock',
      playbackUrl: null,
      source: 'mock',
    };
  }
}

export class PublicDomainMusicCatalogProvider implements MusicCatalogProvider {
  readonly kind = 'public_domain' as const;
  readonly id = 'public_domain_music';
  readonly externalCommercial = false;

  private tracks: MusicTrackRef[] = [
    {
      trackId: 'pd-row-row',
      title: 'Row, Row, Row Your Boat',
      artist: 'Traditional',
      durationMs: 30000,
      license: 'public_domain',
      playbackUrl: null,
      source: 'public_domain',
    },
    {
      trackId: 'pd-twinkle',
      title: 'Twinkle Twinkle Little Star',
      artist: 'Traditional',
      durationMs: 28000,
      license: 'public_domain',
      playbackUrl: null,
      source: 'public_domain',
    },
  ];

  async search(query: string): Promise<MusicTrackRef[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [...this.tracks];
    return this.tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
    );
  }

  async getTrack(trackId: string): Promise<MusicTrackRef | null> {
    return this.tracks.find((t) => t.trackId === trackId) ?? null;
  }
}

/** Spotify/Apple/YouTube commercial catalog — EXTERNAL; no in-repo API calls. */
export class CommercialExternalMusicCatalogProvider implements MusicCatalogProvider {
  readonly kind = 'commercial_external' as const;
  readonly id = 'commercial_music_external';
  readonly externalCommercial = true;

  async search(_query: string): Promise<MusicTrackRef[]> {
    return [];
  }

  async getTrack(_trackId: string): Promise<MusicTrackRef | null> {
    return null;
  }
}

export function createDefaultProviderBundle() {
  return {
    lyrics: {
      mock: new MockLyricsProvider(),
      publicDomain: new PublicDomainLyricsProvider(),
      commercialExternal: new CommercialExternalLyricsProvider(),
    },
    music: {
      mock: new MockMusicCatalogProvider(),
      publicDomain: new PublicDomainMusicCatalogProvider(),
      commercialExternal: new CommercialExternalMusicCatalogProvider(),
    },
  };
}
