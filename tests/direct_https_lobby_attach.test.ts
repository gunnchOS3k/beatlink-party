import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDirectHttpsLobbyAttach,
  evaluateStartPreconditions,
  firstPartyOriginalRightsLayers,
} from '../packages/game-engine/src/index.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launchWav = join(
  __dirname,
  '../content/songs/audio/launch-pd-tap-grid.wav',
);

describe('direct HTTPS lobby attach', () => {
  const hash = createHash('sha256').update(readFileSync(launchWav)).digest('hex');
  const url = 'https://cdn.example.com/owned/launch-pd-tap-grid.wav';

  it('NEGATIVE: rights.ok + syncEligible=false refuses scored lobby attach', () => {
    const attach = buildDirectHttpsLobbyAttach({
      url,
      contentSha256: hash,
      composition: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: 'CC BY — sync not attested',
      },
      soundRecording: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        reproductionAuthorized: true,
        attributionText: 'CC BY recording',
      },
      beatGridReady: true,
      chartsReady: true,
      serverVerifiedCatalogId: 'launch-pd-tap-grid',
      title: 'Launch PD Tap Grid',
    });

    expect(attach.decision.rightsOk).toBe(true);
    expect(attach.decision.syncEligible).toBe(false);
    expect(attach.forgedCatalogAttempt).toBe(false);
    expect(attach.scoredPlayAllowed).toBe(false);
    expect(attach.selectSongId).toBeNull();
    expect(attach.linkResolve.matchedCatalogId).toBeNull();
    expect(attach.linkResolve.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(attach.message.toLowerCase()).toMatch(/scored gameplay denied|synceligible=false/);
  });

  it('authorizes scored attach when syncEligible + server-verified launch hash', () => {
    const layers = firstPartyOriginalRightsLayers();
    const attach = buildDirectHttpsLobbyAttach({
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      serverVerifiedCatalogId: 'launch-pd-tap-grid',
      title: 'Launch PD Tap Grid',
    });
    expect(attach.scoredPlayAllowed).toBe(true);
    expect(attach.selectSongId).toBe('launch-pd-tap-grid');
    expect(attach.forgedCatalogAttempt).toBe(false);
    expect(attach.linkResolve.capabilityState).toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(attach.linkResolve.playbackStatus).toBe('PLAYABLE_APPROVED');
  });

  it('NEGATIVE: client matchedCatalogId alone never authorizes scored play', () => {
    const layers = firstPartyOriginalRightsLayers();
    const attach = buildDirectHttpsLobbyAttach({
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      matchedCatalogId: 'launch-pd-tap-grid',
      // missing serverVerifiedCatalogId
    });
    expect(attach.scoredPlayAllowed).toBe(false);
    expect(attach.selectSongId).toBeNull();
    expect(attach.forgedCatalogAttempt).toBe(true);
  });

  it('NEGATIVE: forged catalog id mismatched from server hash identity is rejected', () => {
    const layers = firstPartyOriginalRightsLayers();
    const attach = buildDirectHttpsLobbyAttach({
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      matchedCatalogId: 'demo-neon-groove',
      serverVerifiedCatalogId: 'launch-pd-tap-grid',
    });
    expect(attach.forgedCatalogAttempt).toBe(true);
    expect(attach.scoredPlayAllowed).toBe(false);
    expect(attach.selectSongId).toBeNull();
    expect(attach.linkResolve.matchedCatalogId).toBeNull();
  });

  it('RoomManager attach selects catalog only when scoredPlayAllowed', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-direct');
    const layers = firstPartyOriginalRightsLayers();

    const denied = manager.attachDirectHttps(room.code, {
      url,
      contentSha256: hash,
      composition: {
        ...layers.composition,
        basis: 'creative_commons',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: 'no sync',
      },
      soundRecording: {
        ...layers.soundRecording,
        reproductionAuthorized: true,
      },
      beatGridReady: true,
      chartsReady: true,
    });
    expect(denied).not.toBeNull();
    expect(denied!.attach.scoredPlayAllowed).toBe(false);
    expect(denied!.room.selectedSongId).toBeNull();
    expect(denied!.room.linkResolveResult?.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');

    const gateDenied = evaluateStartPreconditions(denied!.room, { requireBeatmap: true });
    expect(gateDenied.ok).toBe(false);
    expect(gateDenied.blockers.some((b) => b.code === 'LINK_SYNC_DENIED' || b.code === 'NO_SONG')).toBe(
      true,
    );

    const forged = manager.attachDirectHttps(room.code, {
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      matchedCatalogId: 'demo-neon-groove',
    });
    expect(forged!.attach.forgedCatalogAttempt).toBe(true);
    expect(forged!.attach.scoredPlayAllowed).toBe(false);
    expect(forged!.room.selectedSongId).toBeNull();

    const allowed = manager.attachDirectHttps(room.code, {
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
    });
    expect(allowed).not.toBeNull();
    expect(allowed!.attach.scoredPlayAllowed).toBe(true);
    expect(allowed!.room.selectedSongId).toBe('launch-pd-tap-grid');
    expect(allowed!.room.phase).toBe('song_select');
    expect(manager.getRoom(room.code)?.beatmap).not.toBeNull();
    expect(allowed!.room.privateMedia).toBeNull();
  });
});
