/**
 * Five-mode musical continuity gate — authorized audio kinds only.
 * Mode coverage ≠ commercial clearance; pitchAnalysisClaim stays honest.
 */

import type { GameModeId } from '@beatlink/shared';
import { GAME_MODE_IDS } from '@beatlink/shared';
import type { ModePlayableSession, PlayableAudioKind } from './modePlayableSession.js';

const AUTHORIZED_AUDIO: ReadonlySet<PlayableAudioKind> = new Set([
  'procedural_song_bed',
  'procedural_metronome_fallback',
  'creator_attested_stub',
]);

export interface MusicalModeContinuityRow {
  modeId: GameModeId;
  audioKind: PlayableAudioKind;
  noteCueCount: number;
  commercialClaim: boolean;
  pitchAnalysisClaim: boolean;
  ok: boolean;
  reason: string | null;
}

export interface MusicalModeContinuityReport {
  complete: boolean;
  rows: MusicalModeContinuityRow[];
  missingModes: GameModeId[];
  /** Always false — digital continuity ≠ commercial license review. */
  commercialClearanceClaimed: false;
  honestyBanner: string;
}

export const MUSICAL_MODE_CONTINUITY_HONESTY =
  'Five-mode digital continuity with authorized audio kinds ≠ commercial clearance or HUMAN musical taste sign-off.';

export function assessMusicalModeContinuity(
  sessions: Iterable<ModePlayableSession>,
): MusicalModeContinuityReport {
  const byMode = new Map<GameModeId, ModePlayableSession>();
  for (const s of sessions) byMode.set(s.modeId, s);

  const rows: MusicalModeContinuityRow[] = [];
  const missingModes: GameModeId[] = [];
  for (const modeId of GAME_MODE_IDS) {
    const s = byMode.get(modeId);
    if (!s) {
      missingModes.push(modeId);
      rows.push({
        modeId,
        audioKind: 'blocked',
        noteCueCount: 0,
        commercialClaim: false,
        pitchAnalysisClaim: false,
        ok: false,
        reason: 'missing_session',
      });
      continue;
    }
    const authorized = AUTHORIZED_AUDIO.has(s.audioKind) && s.audioKind !== 'blocked';
    const notesOk = s.noteCues.length > 0;
    const commercialOk = s.rightsHonest.commercialClaim === false;
    const ok = authorized && notesOk && commercialOk;
    rows.push({
      modeId,
      audioKind: s.audioKind,
      noteCueCount: s.noteCues.length,
      commercialClaim: s.rightsHonest.commercialClaim,
      pitchAnalysisClaim: s.rightsHonest.pitchAnalysisClaim,
      ok,
      reason: !authorized
        ? 'unauthorized_or_blocked_audio'
        : !notesOk
          ? 'no_note_cues'
          : !commercialOk
            ? 'commercial_claim_true'
            : null,
    });
  }

  const complete = missingModes.length === 0 && rows.every((r) => r.ok);
  return {
    complete,
    rows,
    missingModes,
    commercialClearanceClaimed: false,
    honestyBanner: `MUSICAL_MODE_CONTINUITY complete=${complete} modes=${rows.filter((r) => r.ok).length}/${GAME_MODE_IDS.length} · commercial_clearance=false · ${MUSICAL_MODE_CONTINUITY_HONESTY}`,
  };
}
