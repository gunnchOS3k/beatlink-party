/**
 * BL-LINK-005 new-media path: ingest project-owned WAV absent from launch catalog →
 * server hash → durable private draft + chart → scored room selection → play those
 * bytes → input/scoring → durable result identity after endGame.
 * Never substitutes a launch song.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  beatmapFromPrivateDraft,
  defaultCreatorDraftStore,
  firstPartyOriginalRightsLayers,
  ingestCreatorOwnedBinary,
  synthesizeCreatorTestWav,
} from '../packages/game-engine/src/index.js';
import { findSongIdByAssetSha256 } from '../apps/server/src/beatmaps/store.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

describe('direct HTTPS private-draft new-media gameplay', () => {
  beforeEach(() => {
    defaultCreatorDraftStore.resetForTests();
  });

  it('plays newly ingested draft bytes — not a launch catalog substitute', () => {
    const wav = synthesizeCreatorTestWav({ bpm: 110, durationMs: 3500, sampleRate: 22050 });
    const hash = createHash('sha256').update(wav).digest('hex');

    // Absent from launch/demo catalog.
    expect(findSongIdByAssetSha256(hash)).toBeNull();

    const ingest = ingestCreatorOwnedBinary({
      trackId: `s1-new-media-${hash.slice(0, 10)}`,
      title: 'S1 Closeout New Media Fixture',
      artist: 'BeatLink Test (project-owned)',
      attestorId: 'host-s1-closeout',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
      declaredLicense: 'creator_owned',
      bpm: 110,
    });
    expect(ingest.ok).toBe(true);
    expect(ingest.sha256).toBe(hash);
    expect(ingest.honesty.autoPublished).toBe(false);
    expect(ingest.catalogDraft?.launchEligible).toBe(false);

    const draft = defaultCreatorDraftStore.saveFromIngest(
      ingest,
      'host-s1-closeout',
      Date.now(),
      wav,
    );
    expect(draft).not.toBeNull();
    expect(draft!.audioBytes?.byteLength).toBe(wav.byteLength);
    expect(draft!.chartEditor?.chart.notes.length).toBeGreaterThan(0);
    expect(beatmapFromPrivateDraft(draft!)?.notes.length).toBeGreaterThan(0);

    // Still not in launch catalog after ingest.
    expect(findSongIdByAssetSha256(hash)).toBeNull();
    expect(defaultCreatorDraftStore.findBySha256(hash)?.draftId).toBe(draft!.draftId);

    const layers = firstPartyOriginalRightsLayers();
    const manager = new RoomManager();
    const created = manager.createRoom('host-new-media');
    const joined = manager.joinRoom(created.code, 'p1', 'Tapper');
    expect(joined).not.toBeNull();
    manager.setRole(created.code, joined!.player.id, 'beat_tapper');
    manager.setReady(created.code, joined!.player.id, true);

    const attached = manager.attachDirectHttps(created.code, {
      url: 'https://cdn.example.com/owned/s1-closeout-new-media.wav',
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      title: 'S1 Closeout New Media Fixture',
    });

    expect(attached).not.toBeNull();
    expect(attached!.attach.scoredPlayAllowed).toBe(true);
    expect(attached!.attach.privateDraft).toBe(true);
    expect(attached!.attach.privateDraftId).toBe(draft!.draftId);
    expect(attached!.room.selectedSongId).toBe(draft!.trackId);
    expect(attached!.room.selectedSongId).not.toBe('launch-pd-tap-grid');
    expect(attached!.room.privateMedia?.draftId).toBe(draft!.draftId);
    expect(attached!.room.privateMedia?.contentSha256).toBe(hash);
    expect(attached!.room.privateMedia?.audioPath).toBe(
      `/content/creator-drafts/${draft!.draftId}/audio`,
    );
    const selectedInternal = manager.getRoom(created.code)!;
    expect(selectedInternal.beatmap?.version).toMatch(/private-draft/);
    expect(selectedInternal.beatmap?.songId).toBe(draft!.trackId);

    const live = selectedInternal;
    live.gameDurationMs = 2000;
    if (live.beatmap) {
      live.beatmap = { ...live.beatmap, durationMs: 2000 };
    }

    expect(manager.startCalibration(created.code)?.phase).toBe('calibrating');
    expect(manager.submitCalibration(created.code, 0)?.calibrationOffsetMs).toBe(0);
    expect(manager.startCountdown(created.code)?.phase).toBe('countdown');
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    const playing = manager.tickCountdown(created.code);
    expect(playing?.phase).toBe('playing');

    const internal = manager.getRoom(created.code)!;
    const note = internal.beatmap!.notes[0]!;
    internal.gameStartTime = Date.now() - note.timeMs;
    const scored = manager.processInput(created.code, {
      playerId: joined!.player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: note.id,
      event_id: 's1-new-media-tap-0',
      idempotency_key: 's1-new-media-tap-0',
    });
    expect(scored).not.toBeNull();
    expect(scored!.scoreEvent).not.toBeNull();
    expect(scored!.scoreEvent!.points).toBeGreaterThan(0);

    const results = manager.endGame(created.code);
    expect(results).not.toBeNull();
    expect(results!.players[0]?.score).toBeGreaterThan(0);
    expect(results!.ledgerChecksum).toBeTruthy();

    const after = manager.getRoom(created.code)!;
    expect(after.phase).toBe('results');
    expect(after.privateMedia?.contentSha256).toBe(hash);
    expect(after.beatmap?.id).toContain(draft!.draftId);
    expect(after.linkResolveResult?.sourceId).toBe(hash);
    expect(after.privateMedia?.chartRevision).toBe(draft!.chartEditor?.revision ?? 0);

    // "Reload" — re-read room + draft store; media/chart/result identities still present.
    const reloadedDraft = defaultCreatorDraftStore.get(draft!.draftId);
    expect(reloadedDraft?.sha256).toBe(hash);
    expect(reloadedDraft?.audioBytes?.byteLength).toBe(wav.byteLength);
    const reloadedRoom = manager.getRoom(created.code);
    expect(reloadedRoom?.privateMedia?.contentSha256).toBe(hash);
    expect(reloadedRoom?.beatmap?.version).toBe(after.beatmap?.version);
    expect(results!.ledgerChecksum).toBeTruthy();
  });

  it('NEGATIVE: stale / missing draft audio after hash match denies scored attach', () => {
    const wav = synthesizeCreatorTestWav({ bpm: 100, durationMs: 2000 });
    const hash = createHash('sha256').update(wav).digest('hex');
    const ingest = ingestCreatorOwnedBinary({
      trackId: `stale-${hash.slice(0, 8)}`,
      title: 'Stale Draft',
      artist: 'Test',
      attestorId: 'host',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
      declaredLicense: 'creator_owned',
    });
    // Save without retaining audio bytes — simulates stale/missing durable blob.
    const draft = defaultCreatorDraftStore.saveFromIngest(ingest, 'host', Date.now(), null);
    expect(draft?.audioBytes).toBeNull();

    const layers = firstPartyOriginalRightsLayers();
    const manager = new RoomManager();
    const room = manager.createRoom('host-stale');
    const attached = manager.attachDirectHttps(room.code, {
      url: 'https://cdn.example.com/owned/stale.wav',
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
    });
    expect(attached!.attach.scoredPlayAllowed).toBe(false);
    expect(attached!.room.selectedSongId).toBeNull();
    expect(attached!.room.privateMedia).toBeNull();
  });
});
