import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import { InMemoryRoomStore } from '../apps/server/src/rooms/store/index.js';
import type { GameModeId, PlayerInputEvent, PlayerRole } from '../packages/shared/src/types.js';

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(1_000_000); });
afterEach(() => { vi.restoreAllMocks(); });

function party(roles: PlayerRole[] = ['vocalist', 'vocalist', 'vocalist'], mode: GameModeId = 'KaraokePerformance') {
  const store = new InMemoryRoomStore(); const manager = new RoomManager(store);
  const created = manager.createRoom('host-pitch');
  const singers = ['Ari', 'Bea', 'Cam'].map((name) => manager.joinRoom(created.code, `sock-${name}`, name)!);
  singers.forEach((singer, index) => { manager.setRole(created.code, singer.player.id, roles[index] ?? 'vocalist'); manager.setReady(created.code, singer.player.id, true); });
  manager.setGameMode(created.code, mode);
  manager.selectSong(created.code, 'demo-neon-groove');
  expect(manager.startCalibration(created.code)?.phase).toBe('calibrating');
  manager.submitCalibration(created.code, 0); manager.startCountdown(created.code);
  manager.tickCountdown(created.code); manager.tickCountdown(created.code); manager.tickCountdown(created.code);
  expect(manager.getRoom(created.code)?.phase).toBe('playing');
  return { store, manager, code: created.code, singers };
}

function sing(p: ReturnType<typeof party>, singer: number, promptIndex = 0, patch: Partial<PlayerInputEvent> = {}) {
  const room = p.manager.getRoom(p.code)!; const prompt = room.beatmap!.vocalPrompts[promptIndex]!;
  expect(prompt).toBeTruthy();
  room.gameStartTime = Date.now() - prompt.timeMs - prompt.durationMs / 2;
  return p.manager.processInput(p.code, { playerId: p.singers[singer]!.player.id, type: 'vocal_phrase',
    promptId: prompt.id, clientTimeMs: Date.now(), event_id: `${singer}:${prompt.id}:${JSON.stringify(patch)}`,
    pitchAnalysisActive: true, pitchMatch: 1, voicedCoverage: 1, phraseFrames: 20, ...patch });
}
function pitch(result: ReturnType<typeof sing>) { return result?.scoreEvent?.message === 'Phrase + pitch hit'; }

describe('actual room karaoke pitch awards — one bounded contribution per phrase', () => {
  it('admits one pitch award while contending vocalists retain ordinary timing scores', () => {
    const p = party(); const a = sing(p, 0); const b = sing(p, 1); const c = sing(p, 2);
    expect([a, b, c].filter(pitch)).toHaveLength(1);
    expect(a?.scoreEvent?.points).toBe((b?.scoreEvent?.points ?? 0) + 40);
    expect(b?.scoreEvent?.points).toBeGreaterThan(0);
    expect(c?.scoreEvent?.points).toBe(b?.scoreEvent?.points);
  });

  it('keeps ordinary simultaneous Band Roles vocalist scoring unchanged', () => {
    const p = party(undefined, 'BandRoles'); const a = sing(p, 0); const b = sing(p, 1);
    expect(a?.scoreEvent?.points).toBeGreaterThan(0);
    expect(b?.scoreEvent?.points).toBe(a?.scoreEvent?.points);
    expect(b?.scoreEvent?.message).toBe(a?.scoreEvent?.message);
  });

  it('handoff on a new phrase requires that singer’s own bounded claim', () => {
    const p = party(); expect(pitch(sing(p, 0))).toBe(true);
    expect(pitch(sing(p, 1, 1, { pitchAnalysisActive: false }))).toBe(false);
    expect(pitch(sing(p, 2, 1))).toBe(true);
    expect(pitch(sing(p, 0, 1))).toBe(false);
  });

  for (const [label, patch] of [
    ['revoked client claim', { pitchAnalysisActive: false }],
    ['fallback tap with forged pitch fields', { type: 'vocal_fallback_tap' }],
    ['invalid match', { pitchMatch: Number.NaN }],
    ['insufficient voiced coverage', { voicedCoverage: 0 }],
    ['insufficient phrase frames', { phraseFrames: 1 }],
  ] as Array<[string, Partial<PlayerInputEvent>]>) {
    it(`${label} cannot consume another singer’s available pitch contribution`, () => {
      const p = party(); expect(pitch(sing(p, 0, 0, patch))).toBe(false);
      expect(pitch(sing(p, 1))).toBe(true);
      expect(pitch(sing(p, 2))).toBe(false);
    });
  }

  it('disconnected and nonvocal seats cannot consume a pitch contribution', () => {
    const p = party(['vocalist', 'beat_tapper', 'vocalist']);
    p.manager.leaveRoom('sock-Ari');
    expect(sing(p, 0)?.scoreEvent ?? null).toBeNull();
    expect(sing(p, 1)?.scoreEvent ?? null).toBeNull();
    expect(pitch(sing(p, 2))).toBe(true);
  });

  it('an audience identity with forged vocal fields cannot consume a contribution', () => {
    const p = party(); const audience = p.manager.joinAudience(p.code, 'audience-socket', 'Observer')!;
    expect(audience).toBeTruthy();
    expect(sing(p, 0, 0, { playerId: audience.audience.id })).toBeNull();
    expect(pitch(sing(p, 1))).toBe(true);
  });

  it('a claimed phrase stays claimed through snapshot JSON, hydration and reconnect', () => {
    const p = party(); const first = sing(p, 0); expect(pitch(first)).toBe(true);
    p.manager.leaveRoom('sock-Bea');
    const snapshot = JSON.parse(JSON.stringify(p.store.get(p.code)));
    const hydratedStore = new InMemoryRoomStore(); hydratedStore.set(p.code, snapshot);
    const hydrated = new RoomManager(hydratedStore);
    const restored = hydrated.reconnectPlayer(p.code, p.singers[1]!.player.id, p.singers[1]!.playerToken, 'sock-Bea-returned');
    expect(restored?.id).toBe(p.singers[1]!.player.id);
    const second = sing({ ...p, manager: hydrated, store: hydratedStore }, 1);
    expect(pitch(second)).toBe(false);
    expect(second?.scoreEvent?.points).toBe((first?.scoreEvent?.points ?? 0) - 40);
  });

  it('a legacy playing snapshot conservatively seals an already-scored phrase without inventing historical pitch data', () => {
    const p = party(); const first = sing(p, 0); expect(pitch(first)).toBe(true);
    const room = p.manager.getRoom(p.code)!; const prompt = room.beatmap!.vocalPrompts[0]!;
    const snapshot = JSON.parse(JSON.stringify(p.store.get(p.code)));
    // Pre-correction snapshots contained only individual vocal scored-targets,
    // so they cannot prove whether that historical input included pitch.
    snapshot.scoredTargets = [`${p.singers[0]!.player.id}:vocal:${prompt.id}`];
    const hydratedStore = new InMemoryRoomStore(); hydratedStore.set(p.code, snapshot);
    const hydrated = new RoomManager(hydratedStore);
    const second = sing({ ...p, manager: hydrated, store: hydratedStore }, 1);
    expect(pitch(second)).toBe(false);
    expect(second?.scoreEvent?.points).toBeGreaterThan(0);
    expect(pitch(sing({ ...p, manager: hydrated, store: hydratedStore }, 2, 1))).toBe(true);
  });

  it('rematch clears the prior phrase allocation; old-round input cannot reserve the new one', () => {
    const p = party(); expect(pitch(sing(p, 0))).toBe(true);
    const oldRound = p.manager.getRoom(p.code)!.round_id!;
    p.manager.endGame(p.code); expect(p.manager.rematch(p.code)?.phase).toBe('lobby');
    for (const singer of p.singers) p.manager.setReady(p.code, singer.player.id, true);
    p.manager.selectSong(p.code, 'demo-neon-groove'); p.manager.startCalibration(p.code); p.manager.submitCalibration(p.code, 0);
    expect(p.manager.startCountdown(p.code)?.phase).toBe('countdown');
    p.manager.tickCountdown(p.code); p.manager.tickCountdown(p.code); p.manager.tickCountdown(p.code);
    expect(sing(p, 0, 0, { round_id: oldRound })?.scoreEvent ?? null).toBeNull();
    expect(pitch(sing(p, 1))).toBe(true);
    expect(pitch(sing(p, 2))).toBe(false);
  });
});
