/**
 * Full direct-HTTPS production path (beyond BL-LINK-005 attach-only):
 * paste URL → classify → rights (composition ≠ recording) → validate bytes →
 * hash/grid/charts → full-song scored play → results → rematch → cleanup.
 * Unauthorized paths stay blocked.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  assessRightsLayers,
  defaultCreatorDraftStore,
  evaluateDirectHttpsMedia,
  firstPartyOriginalRightsLayers,
  ingestCreatorOwnedBinary,
  synthesizeCreatorTestWav,
  validateDirectHttpsMediaBytes,
  validateDirectHttpsUrlPolicy,
} from '../packages/game-engine/src/index.js';
import { resolveLink } from '../apps/server/src/music/linkResolver.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

describe('direct HTTPS full scored path', () => {
  beforeEach(() => {
    defaultCreatorDraftStore.resetForTests();
  });

  it('authorized paste→classify→rights→bytes→hash/grid→score→results→rematch cleanup', async () => {
    const wav = synthesizeCreatorTestWav({ bpm: 118, durationMs: 4000, sampleRate: 22050 });
    const sha = createHash('sha256').update(wav).digest('hex');
    const pasteUrl = `https://cdn.example.com/owned/full-path-${sha.slice(0, 8)}.wav`;

    // 1) Paste URL policy + classify
    const policy = validateDirectHttpsUrlPolicy(pasteUrl);
    expect(policy.ok).toBe(true);
    const classified = await resolveLink(pasteUrl);
    expect(classified.platform).toBe('direct_https');
    // URL alone does not grant gameplay sync.
    expect(classified.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');

    // 2) Rights layers: composition ≠ recording (both required; sync separate)
    const layers = firstPartyOriginalRightsLayers();
    // Composition sync/adaptation are distinct from sound-recording reproduction.
    expect(layers.composition).toHaveProperty('syncAuthorized');
    expect(layers.soundRecording).toHaveProperty('reproductionAuthorized');
    expect('reproductionAuthorized' in layers.composition).toBe(false);
    expect('syncAuthorized' in layers.soundRecording).toBe(false);
    const rights = assessRightsLayers({
      composition: layers.composition,
      soundRecording: layers.soundRecording,
    });
    expect(rights.ok).toBe(true);
    expect(rights.syncEligible).toBe(true);

    // Composition without sync stays distinct from recording playback.
    const playbackOnly = assessRightsLayers({
      composition: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: 'CC BY — no sync',
      },
      soundRecording: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        reproductionAuthorized: true,
        attributionText: 'CC BY recording',
      },
    });
    expect(playbackOnly.ok).toBe(true);
    expect(playbackOnly.syncEligible).toBe(false);

    // 3) Validate bytes (magic + size)
    const bytesGate = validateDirectHttpsMediaBytes(wav, 'audio/wav');
    expect(bytesGate.ok).toBe(true);
    expect(bytesGate.magic).toBe('wav');

    // 4) Ingest → hash/grid/charts private draft
    const ingest = ingestCreatorOwnedBinary({
      trackId: `full-path-${sha.slice(0, 10)}`,
      title: 'Full Path Fixture',
      artist: 'BeatLink Test',
      attestorId: 'host-full-path',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
      declaredLicense: 'creator_owned',
      bpm: 118,
    });
    expect(ingest.ok).toBe(true);
    expect(ingest.sha256).toBe(sha);
    const draft = defaultCreatorDraftStore.saveFromIngest(
      ingest,
      'host-full-path',
      Date.now(),
      wav,
    )!;
    expect(draft.chartEditor?.chart.notes.length).toBeGreaterThan(0);

    const decision = evaluateDirectHttpsMedia({
      url: pasteUrl,
      contentSha256: sha,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      contentBytes: wav,
      mimeType: 'audio/wav',
    });
    expect(decision.capabilityState).toBe('GAMEPLAY_SYNC_AUTHORIZED');

    // 5) Full-song scored play
    const manager = new RoomManager();
    const created = manager.createRoom('host-full-path');
    const joined = manager.joinRoom(created.code, 'p1', 'Tapper')!;
    manager.setRole(created.code, joined.player.id, 'beat_tapper');
    manager.setReady(created.code, joined.player.id, true);

    const attached = manager.attachDirectHttps(created.code, {
      url: pasteUrl,
      contentSha256: sha,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      title: 'Full Path Fixture',
    });
    expect(attached!.attach.scoredPlayAllowed).toBe(true);
    expect(attached!.attach.privateDraft).toBe(true);
    expect(attached!.room.privateMedia?.contentSha256).toBe(sha);

    const live = manager.getRoom(created.code)!;
    live.gameDurationMs = 2500;
    if (live.beatmap) live.beatmap = { ...live.beatmap, durationMs: 2500 };

    expect(manager.startCalibration(created.code)?.phase).toBe('calibrating');
    expect(manager.submitCalibration(created.code, 0)?.calibrationOffsetMs).toBe(0);
    expect(manager.startCountdown(created.code)?.phase).toBe('countdown');
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    expect(manager.tickCountdown(created.code)?.phase).toBe('playing');

    const internal = manager.getRoom(created.code)!;
    const note = internal.beatmap!.notes[0]!;
    internal.gameStartTime = Date.now() - note.timeMs;
    const scored = manager.processInput(created.code, {
      playerId: joined.player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: note.id,
      event_id: 'full-path-tap-0',
      idempotency_key: 'full-path-tap-0',
    });
    expect(scored!.scoreEvent!.points).toBeGreaterThan(0);

    // 6) Results
    const results = manager.endGame(created.code)!;
    expect(results.players[0]?.score).toBeGreaterThan(0);
    expect(results.ledgerChecksum).toBeTruthy();
    expect(manager.getRoom(created.code)!.phase).toBe('results');
    expect(manager.getRoom(created.code)!.privateMedia?.contentSha256).toBe(sha);

    // 7) Rematch cleanup — private media / selection cleared; draft store retained until withdraw
    const rematch = manager.rematch(created.code)!;
    expect(rematch.phase).toBe('lobby');
    expect(rematch.privateMedia ?? null).toBeNull();
    expect(rematch.selectedSongId ?? null).toBeNull();
    expect(rematch.beatmap ?? null).toBeNull();
    expect(rematch.linkResolveResult ?? null).toBeNull();
    expect(rematch.pastedLinkUrl ?? null).toBeNull();
    expect(rematch.rematchRound).toBe(1);
    expect(defaultCreatorDraftStore.findBySha256(sha)?.draftId).toBe(draft.draftId);

    // Explicit withdraw cleanup of durable draft bytes
    const withdrawn = defaultCreatorDraftStore.withdraw(draft.draftId, 'host-full-path');
    expect(withdrawn?.status).toBe('withdrawn');
    expect(defaultCreatorDraftStore.findBySha256(sha)).toBeNull();
  });

  it('NEGATIVE: unauthorized paste (syncEligible=false) never scores or selects', async () => {
    const wav = synthesizeCreatorTestWav({ bpm: 90, durationMs: 1500 });
    const sha = createHash('sha256').update(wav).digest('hex');
    const ingest = ingestCreatorOwnedBinary({
      trackId: `unauth-${sha.slice(0, 8)}`,
      title: 'Unauthorized Sync',
      artist: 'Test',
      attestorId: 'host-unauth',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
      declaredLicense: 'creator_owned',
    });
    defaultCreatorDraftStore.saveFromIngest(ingest, 'host-unauth', Date.now(), wav);

    const manager = new RoomManager();
    const room = manager.createRoom('host-unauth');
    const attached = manager.attachDirectHttps(room.code, {
      url: 'https://cdn.example.com/owned/unauth.wav',
      contentSha256: sha,
      composition: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: 'no sync',
      },
      soundRecording: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        reproductionAuthorized: true,
        attributionText: 'recording ok',
      },
      beatGridReady: true,
      chartsReady: true,
    });
    expect(attached!.attach.decision.rightsOk).toBe(true);
    expect(attached!.attach.decision.syncEligible).toBe(false);
    expect(attached!.attach.scoredPlayAllowed).toBe(false);
    expect(attached!.room.selectedSongId).toBeNull();
    expect(attached!.room.privateMedia).toBeNull();
  });
});
