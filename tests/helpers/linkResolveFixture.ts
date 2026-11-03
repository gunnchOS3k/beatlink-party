import type { LinkResolveResult } from '@beatlink/shared';
import {
  deriveCapabilityFromLegacy,
  mediaClassificationForCapability,
} from '../../packages/game-engine/src/linkCapability.js';

/** Build a LinkResolveResult for tests — fills capability fields honestly. */
export function linkResolveFixture(
  partial: Partial<LinkResolveResult> &
    Pick<LinkResolveResult, 'platform' | 'playbackStatus'> & {
      sourceId?: string | null;
      matchedCatalogId?: string | null;
    },
): LinkResolveResult {
  const sourceId = partial.sourceId ?? null;
  const matchedCatalogId = partial.matchedCatalogId ?? null;
  const capabilityState =
    partial.capabilityState ??
    deriveCapabilityFromLegacy({
      playbackStatus: partial.playbackStatus,
      matchedCatalogId,
      platform: partial.platform,
      sourceId,
    });
  return {
    platform: partial.platform,
    sourceId,
    title: partial.title ?? null,
    artist: partial.artist ?? null,
    album: partial.album ?? null,
    artworkUrl: partial.artworkUrl ?? null,
    durationMs: partial.durationMs ?? null,
    playbackStatus: partial.playbackStatus,
    capabilityState,
    mediaClassification:
      partial.mediaClassification ?? mediaClassificationForCapability(capabilityState, partial.platform),
    providerCredentialsPresent: partial.providerCredentialsPresent ?? false,
    analysisEligible: partial.analysisEligible ?? capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED',
    lyricsEligible: partial.lyricsEligible ?? false,
    matchedCatalogId,
    message: partial.message ?? 'test fixture',
    fallbackOptions: partial.fallbackOptions ?? [],
  };
}
