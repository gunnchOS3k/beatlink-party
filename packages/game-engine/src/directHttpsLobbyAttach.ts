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
   * Client-declared catalog id — advisory only. Never authorizes scored play.
   * Server must supply `serverVerifiedCatalogId` from hash/draft lookup.
   */
  matchedCatalogId?: string | null;
  /**
   * Server-verified catalog or private-draft track id derived from contentSha256.
   * Required for scored play. Client-supplied matchedCatalogId cannot substitute.
   */
  serverVerifiedCatalogId?: string | null;
  /**
   * When true, the verified id is a private creator draft (not launch catalog).
   * Scored play still requires GAMEPLAY_SYNC_AUTHORIZED + syncEligible.
   */
  privateDraft?: boolean;
  /** Durable private draft id when privateDraft is true. */
  privateDraftId?: string | null;
  /** Chart/source revision identity for evidence. */
  chartRevision?: number | null;
}

export interface DirectHttpsLobbyAttachResult {
  decision: DirectHttpsMediaDecision;
  linkResolve: LinkResolveResult;
  /** True only when capability is GAMEPLAY_SYNC_AUTHORIZED and a catalog id is present. */
  scoredPlayAllowed: boolean;
  /** Catalog song to selectSong() when scoredPlayAllowed. */
  selectSongId: string | null;
  /** Forge / mismatch — client declared an id the server did not verify. */
  forgedCatalogAttempt: boolean;
  privateDraft: boolean;
  privateDraftId: string | null;
  chartRevision: number | null;
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
 * Client matchedCatalogId never authorizes selection — only serverVerifiedCatalogId does.
 */
export function buildDirectHttpsLobbyAttach(
  input: DirectHttpsLobbyAttachInput,
): DirectHttpsLobbyAttachResult {
  const decision = evaluateDirectHttpsMedia(input);
  const clientDeclared =
    typeof input.matchedCatalogId === 'string' && input.matchedCatalogId.trim()
      ? input.matchedCatalogId.trim()
      : null;
  const verifiedId =
    typeof input.serverVerifiedCatalogId === 'string' && input.serverVerifiedCatalogId.trim()
      ? input.serverVerifiedCatalogId.trim()
      : null;

  const forgedCatalogAttempt = Boolean(
    clientDeclared && (!verifiedId || clientDeclared !== verifiedId),
  );

  const catalogId = forgedCatalogAttempt ? null : verifiedId;
  const privateDraft = Boolean(input.privateDraft && catalogId);
  const privateDraftId =
    privateDraft && typeof input.privateDraftId === 'string' ? input.privateDraftId : null;
  const chartRevision =
    typeof input.chartRevision === 'number' && Number.isFinite(input.chartRevision)
      ? input.chartRevision
      : null;

  const scoredPlayAllowed =
    !forgedCatalogAttempt &&
    decision.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' &&
    decision.syncEligible &&
    Boolean(catalogId);

  const selectSongId = scoredPlayAllowed ? catalogId : null;

  let message = decision.message;
  if (forgedCatalogAttempt) {
    message =
      'Forged or mismatched catalog id rejected — scored selection requires server-verified asset hash identity.';
  } else if (decision.rightsOk && !decision.syncEligible) {
    message =
      'Playback/preview rights cleared but syncEligible=false — scored gameplay denied. Compose sync/adaptation attestation required.';
  } else if (decision.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' && !catalogId) {
    message =
      'Direct HTTPS gameplay sync authorized, but no matching approved catalog/launch or private-draft asset hash was verified — cannot attach scored beatmap.';
  } else if (scoredPlayAllowed && privateDraft) {
    message = `Authorized direct HTTPS attached for scored private-draft play via ${catalogId} (unpublished).`;
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
    capabilityState: forgedCatalogAttempt
      ? 'BLOCKED_OR_UNSUPPORTED'
      : decision.capabilityState,
    mediaClassification: forgedCatalogAttempt
      ? 'blocked'
      : decision.mediaClassification,
    providerCredentialsPresent: false,
    analysisEligible: decision.analysisEligible && decision.syncEligible && !forgedCatalogAttempt,
    lyricsEligible: false,
    matchedCatalogId: selectSongId,
    message,
    fallbackOptions: scoredPlayAllowed
      ? []
      : [
          'Choose an approved launch/catalog song or ingest a private draft',
          'Attest syncEligible + supply matching asset hash',
        ],
  };

  return {
    decision,
    linkResolve,
    scoredPlayAllowed,
    selectSongId,
    forgedCatalogAttempt,
    privateDraft,
    privateDraftId,
    chartRevision,
    message,
  };
}

/** Convenience: true when scored multiplayer gameplay may proceed from this attach. */
export function isDirectHttpsScoredPlayAllowed(attach: DirectHttpsLobbyAttachResult): boolean {
  return attach.scoredPlayAllowed && attach.selectSongId !== null;
}
