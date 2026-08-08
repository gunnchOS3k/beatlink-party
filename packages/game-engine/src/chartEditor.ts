/**
 * Chart editor — Alpha digital depth.
 * Edit generated charts: add/move/delete notes, confidence gates, density.
 * Operates on analysis output only (synthetic / rights-cleared PCM).
 */

import type { ChartNote, GeneratedChart, AnalysisResult } from './audioAnalysis.js';
import { generateChartFromAnalysis } from './audioAnalysis.js';

/** Minimum analysis confidence required to auto-publish a chart. */
export const CHART_AUTO_PUBLISH_CONFIDENCE = 0.55;

/** Below this, editor requires manual confirmation before use. */
export const CHART_LOW_CONFIDENCE = 0.35;

export interface ChartEditorState {
  chart: GeneratedChart;
  dirty: boolean;
  confidenceGate: 'auto' | 'review_required' | 'blocked';
  revision: number;
}

export function confidenceGateFor(confidence: number): ChartEditorState['confidenceGate'] {
  if (confidence >= CHART_AUTO_PUBLISH_CONFIDENCE) return 'auto';
  if (confidence >= CHART_LOW_CONFIDENCE) return 'review_required';
  return 'blocked';
}

export function openChartEditor(
  analysis: AnalysisResult,
  density = 1,
): ChartEditorState {
  const chart = generateChartFromAnalysis(analysis, density);
  return {
    chart,
    dirty: false,
    confidenceGate: confidenceGateFor(chart.confidence),
    revision: 0,
  };
}

export function addNote(
  state: ChartEditorState,
  note: Omit<ChartNote, 'id'> & { id?: string },
): ChartEditorState {
  const id = note.id ?? `edit-${state.revision}-${state.chart.notes.length}`;
  const notes = [...state.chart.notes, { ...note, id }].sort((a, b) => a.timeMs - b.timeMs);
  return {
    ...state,
    dirty: true,
    revision: state.revision + 1,
    chart: { ...state.chart, notes },
  };
}

export function moveNote(
  state: ChartEditorState,
  noteId: string,
  timeMs: number,
): ChartEditorState {
  const notes = state.chart.notes
    .map((n) => (n.id === noteId ? { ...n, timeMs: Math.max(0, Math.round(timeMs)) } : n))
    .sort((a, b) => a.timeMs - b.timeMs);
  return {
    ...state,
    dirty: true,
    revision: state.revision + 1,
    chart: { ...state.chart, notes },
  };
}

export function deleteNote(state: ChartEditorState, noteId: string): ChartEditorState {
  return {
    ...state,
    dirty: true,
    revision: state.revision + 1,
    chart: {
      ...state.chart,
      notes: state.chart.notes.filter((n) => n.id !== noteId),
    },
  };
}

export function setChartDensity(
  state: ChartEditorState,
  analysis: AnalysisResult,
  density: number,
): ChartEditorState {
  const chart = generateChartFromAnalysis(analysis, density);
  return {
    chart,
    dirty: true,
    confidenceGate: confidenceGateFor(chart.confidence),
    revision: state.revision + 1,
  };
}

export function nudgeOffset(state: ChartEditorState, deltaMs: number): ChartEditorState {
  const notes = state.chart.notes.map((n) => ({
    ...n,
    timeMs: Math.max(0, n.timeMs + deltaMs),
  }));
  return {
    ...state,
    dirty: true,
    revision: state.revision + 1,
    chart: {
      ...state.chart,
      offsetMs: state.chart.offsetMs + deltaMs,
      notes,
    },
  };
}

export function canPublishChart(
  state: ChartEditorState,
  options: { forceReviewAck?: boolean } = {},
): { ok: boolean; reason?: string } {
  if (state.chart.notes.length === 0) {
    return { ok: false, reason: 'empty_chart' };
  }
  if (state.confidenceGate === 'blocked') {
    return { ok: false, reason: 'confidence_too_low' };
  }
  if (state.confidenceGate === 'review_required' && !options.forceReviewAck) {
    return { ok: false, reason: 'review_required' };
  }
  return { ok: true };
}

export function validateChartTiming(state: ChartEditorState): {
  valid: boolean;
  duplicates: string[];
  outOfOrder: boolean;
} {
  const times = state.chart.notes.map((n) => n.timeMs);
  const duplicates: string[] = [];
  const seen = new Set<number>();
  for (const n of state.chart.notes) {
    if (seen.has(n.timeMs)) duplicates.push(n.id);
    seen.add(n.timeMs);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const outOfOrder = times.some((t, i) => t !== sorted[i]);
  return { valid: duplicates.length === 0 && !outOfOrder, duplicates, outOfOrder };
}
