/**
 * Lobby attach for authorized direct HTTPS — scored play only when
 * GAMEPLAY_SYNC_AUTHORIZED (requires rights.syncEligible + hash + grid + charts).
 * Playback-cleared / syncEligible=false never selects a scored beatmap.
 */

import type { LinkResolveResult } from '@beatlink/shared';
import {
  evaluateDirectHttpsMedia,
  type DirectHttpsMediaDecision,
  type DirectHttpsMediaInput,
} from './directHttpsMedia.js';

export interface DirectHttpsLobbyAttachInput extends DirectHttpsMediaInput {
  /** Optional title for peer-visible link snapshot. */
  title?: string | null;
  artist?: string | null;
  /**
   * Catalog song whose assetSha256 matches contentSha256, or an explicit
   * authorized project-owned catalog id supplied by the host after hash match.
   */
  matchedCatalogId?: string | null;
}

export interface DirectHttpsLobbyAttachResult {
  decision: DirectHttpsMediaDecision;
  linkResolve: LinkResolveResult;
  /** True only when capability is GAMEPLAY_SYNC_AUTHORIZED and a catalog id is present. */
  scoredPlayAllowed: boolean;
  /** Catalog song to selectSong() when scoredPlayAllowed. */
  selectSongId: string | null;
  message: string;
}

function playbackStatusFor(decision: DirectHttpsMediaDecision): LinkResolveResult['playbackStatus'] {
  if (decision.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED') return 'PLAYABLE_APPROVED';
  if (decision.capabilityState === 'DIRECT_AUDIO_RIGHTS_VERIFIED') {
    // Playback/preview path may be cleared; scored sync is still denied without syncEligible+grid/charts.
    return decision.rightsOk ? 'NEEDS_LICENSE' : 'BLOCKED_BY_POLICY';
  }
  if (decision.capabilityState === 'BLOCKED_OR_UNSUPPORTED') return 'BLOCKED_BY_POLICY';
  return 'UNSUPPORTED';
}

/**
 * Build the lobby attach decision from a direct-HTTPS evaluation.
 * Never elevates syncEligible=false to scored play, even with hash/grid/charts/catalog id.
 */
export function buildDirectHttpsLobbyAttach(
  input: DirectHttpsLobbyAttachInput,
): DirectHttpsLobbyAttachResult {
  const decision = evaluateDirectHttpsMedia(input);
  const catalogId =
    typeof input.matchedCatalogId === 'string' && input.matchedCatalogId.trim()
      ? input.matchedCatalogId.trim()
      : null;

  const scoredPlayAllowed =
    decision.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' &&
    decision.syncEligible &&
    Boolean(catalogId);

  const selectSongId = scoredPlayAllowed ? catalogId : null;

  let message = decision.message;
  if (decision.rightsOk && !decision.syncEligible) {
    message =
      'Playback/preview rights cleared but syncEligible=false — scored gameplay denied. Compose sync/adaptation attestation required.';
  } else if (decision.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' && !catalogId) {
    message =
      'Direct HTTPS gameplay sync authorized, but no matching approved catalog/launch asset hash was provided — cannot attach scored beatmap.';
  } else if (scoredPlayAllowed) {
    message = `Authorized direct HTTPS attached for scored play via catalog ${catalogId}.`;
  }

  const linkResolve: LinkResolveResult = {
    platform: 'direct_https',
    sourceId: input.contentSha256 ?? null,
    title: input.title ?? 'Direct HTTPS audio',
    artist: input.artist ?? null,
    album: null,
    artworkUrl: null,
    durationMs: null,
    playbackStatus: scoredPlayAllowed ? 'PLAYABLE_APPROVED' : playbackStatusFor(decision),
    capabilityState: decision.capabilityState,
    mediaClassification: decision.mediaClassification,
    providerCredentialsPresent: false,
    analysisEligible: decision.analysisEligible && decision.syncEligible,
    lyricsEligible: false,
    matchedCatalogId: selectSongId,
    message,
    fallbackOptions: scoredPlayAllowed
      ? []
      : ['Choose an approved launch/catalog song', 'Attest syncEligible + supply matching asset hash'],
  };

  return {
    decision,
    linkResolve,
    scoredPlayAllowed,
    selectSongId,
    message,
  };
}

/** Convenience: true when scored multiplayer gameplay may proceed from this attach. */
export function isDirectHttpsScoredPlayAllowed(attach: DirectHttpsLobbyAttachResult): boolean {
  return attach.scoredPlayAllowed && attach.selectSongId !== null;
}
