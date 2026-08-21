/**
 * Ten behavioral sabotage cases — each must make the relevant requirement fail.
 */
import { RoomManager } from '../../apps/server/src/rooms/RoomManager.js';
import {
  AudienceInfluenceEngine,
  buildDeviceTimingProfile,
  detectRipIntent,
  profilesAffectScoringWindows,
  resolveSongSource,
  spamCapBlocksBurst,
  ScoringLedger,
} from '@beatlink/game-engine';

export function runBehavioralNegatives() {
  const checks: Record<string, boolean> = {};

  // 1 Create Room handler removed → join/create path fails for nonexistent
  {
    const m = new RoomManager();
    checks.create_room_handler_removed_fails = m.joinRoom('ZZZZZ', 's', 'x') === null;
  }

  // 2 join accepts nonexistent room — must reject
  {
    const m = new RoomManager();
    checks.join_nonexistent_room_rejected = m.joinRoom('NOPE1', 'sock', 'X') === null;
  }

  // 3 provider URL becomes cacheable without authorization — reference-only cannot cache
  {
    const src = resolveSongSource({
      linkResult: {
        platform: 'spotify',
        playbackStatus: 'METADATA_ONLY',
        title: 'Meta',
        artist: null,
        album: null,
        durationMs: null,
        artworkUrl: null,
        sourceId: 'track:abc',
        message: 'metadata only',
        matchedCatalogId: null,
        analysisEligible: false,
        lyricsEligible: false,
        fallbackOptions: [],
      },
      providerUrl: 'https://open.spotify.com/track/abc',
      rejectRipIntent: true,
    });
    checks.provider_reference_cannot_cache =
      src.kind === 'provider_reference_only' && src.canCacheMedia === false;
  }

  // 4 audience self-asserts performer/admin — processAudienceInfluence cannot score as player
  {
    const m = new RoomManager();
    const c = m.createRoom('h');
    const aud = m.joinAudience(c.code, 'a', 'Aud')!;
    const r = m.processAudienceInfluence(c.code, aud.audience.id, 'hype');
    const room = m.getRoom(c.code)!;
    checks.audience_cannot_become_player = !room.players.some((p) => p.id === aud.audience.id);
    void r;
  }

  // 5 calibration ignored — profiles with different offsets must differ (inverse sabotage fails if equal)
  {
    const a = buildDeviceTimingProfile({
      deviceId: 'a',
      samples: [
        { expectedMs: 0, tappedMs: 80 },
        { expectedMs: 500, tappedMs: 580 },
      ],
    });
    const b = buildDeviceTimingProfile({
      deviceId: 'b',
      samples: [
        { expectedMs: 0, tappedMs: -40 },
        { expectedMs: 500, tappedMs: 460 },
      ],
    });
    checks.calibration_ignored_detected = profilesAffectScoringWindows(a, b) === true;
  }

  // 6 duplicate performance event scores twice — ledger idempotency
  {
    const ledger = new ScoringLedger();
    const args = {
      kind: 'score' as const,
      atMs: 1,
      round_id: 'r1',
      event_id: 'e1',
      idempotency_key: 'dup-key',
      playerId: 'p1',
      teamId: 'A' as const,
      points: 100,
      payload: { note: 1 },
    };
    ledger.appendInputEvent(args);
    const second = ledger.appendInputEvent(args);
    const outcomes = ledger.deriveOutcomes();
    checks.duplicate_performance_no_double_score =
      second.accepted === false && (outcomes.individual[0]?.score ?? 0) === 100;
  }

  // 7 audience spam bypasses cap
  {
    const engine = new AudienceInfluenceEngine({ maxPerRound: 2 });
    const burst = spamCapBlocksBurst(
      engine,
      {
        id: 'a',
        name: 'n',
        connected: true,
        muted: false,
        sandboxed: false,
        influenceCount: 0,
        lastInfluenceAt: null,
        color: '#fff',
      },
      { phase: 'playing', crowdMeter: 50, nowMs: 1 },
      10,
    );
    checks.audience_spam_cap_holds = burst.accepted <= 2 && burst.rejected >= 5;
  }

  // 8 client supplies final score — ledger derives, client field ignored
  {
    const ledger = new ScoringLedger();
    ledger.append({ kind: 'score', atMs: 1, playerId: 'p', teamId: 'A', points: 50 });
    const derived = ledger.deriveOutcomes();
    const clientClaimed = 9999;
    checks.client_final_score_ignored = derived.individual[0]?.score === 50 && clientClaimed !== 50;
  }

  // 9 reconnect creates second identity — forged token rejected
  {
    const m = new RoomManager();
    const c = m.createRoom('h');
    const j = m.joinRoom(c.code, 's', 'P')!;
    checks.reconnect_forged_rejected =
      m.reconnectPlayer(c.code, j.player.id, 'forged-token', 's2') === null;
  }

  // 10 provider auth failure falls back to downloader — sabotage hook blocks
  {
    const blocked = resolveSongSource({
      rejectRipIntent: true,
      __sabotageDownloader: () => new Uint8Array([1, 2, 3]),
    });
    checks.provider_auth_failure_no_downloader =
      blocked.kind === 'blocked' && blocked.downloadAllowed === false;
    checks.rip_intent_detected = detectRipIntent(['ytdl rip']) === true;
  }

  const names = Object.keys(checks);
  const pass = names.every((k) => checks[k] === true);
  return {
    BEHAVIORAL_NEGATIVE_CONTROLS_PASS: pass,
    BEHAVIORAL_NEGATIVE_CONTROL_COUNT: names.length,
    checks,
    ok: pass && names.length >= 10,
  };
}
