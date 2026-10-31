/**
 * Build a room beatmap from a private creator draft chart.
 * Drafts stay unpublished — this never writes to the launch catalog.
 */

import type { Beatmap, BeatmapNote } from '@beatlink/shared';
import type { CreatorDraftRecord } from './creatorDraftStore.js';

export function beatmapFromPrivateDraft(draft: CreatorDraftRecord): Beatmap | null {
  if (!draft.chartEditor?.chart?.notes?.length) return null;
  const chart = draft.chartEditor.chart;
  const durationMs = Math.max(
    draft.catalogDraft.durationMs,
    ...(chart.notes.map((n) => n.timeMs + (n.type === 'hold' ? 400 : 0)) as number[]),
  );
  const notes: BeatmapNote[] = chart.notes.map((n, i) => ({
    id: n.id || `draft-note-${i}`,
    timeMs: n.timeMs,
    type: n.type === 'hold' ? 'hold' : i % 5 === 0 ? 'swipe' : 'tap',
    role: 'beat_tapper',
    ...(n.type === 'hold' ? { durationMs: 400 } : {}),
  }));

  return {
    id: `private-${draft.draftId}-r${draft.chartEditor.revision}`,
    songId: draft.trackId,
    version: `private-draft-r${draft.chartEditor.revision}`,
    bpm: chart.bpm || draft.catalogDraft.bpm,
    offsetMs: chart.offsetMs ?? 0,
    durationMs,
    difficulty: 'casual',
    licenseStatus: 'creator_private_draft',
    sections: [
      {
        id: 'draft-full',
        label: 'Private draft',
        startMs: 0,
        endMs: durationMs,
      },
    ],
    notes,
    vocalPrompts: [],
    hypeEvents: [],
  };
}
