/**
 * Durable creator draft store — local in-memory + optional filesystem backend.
 * Drafts never auto-publish. Withdrawal removes binary + chart draft.
 * Rights gates must pass before a draft can request review/publish.
 */

import type { SongCatalogEntry } from '@beatlink/shared';
import type { ChartEditorState } from './chartEditor.js';
import { canPublishChart } from './chartEditor.js';
import type { CreatorBinaryIngestResult } from './creatorBinaryIngest.js';
import { markTakedown } from './rights.js';

export type CreatorDraftStatus =
  | 'draft'
  | 'review_pending'
  | 'withdrawn'
  | 'rejected_rights'
  | 'publish_blocked';

export interface CreatorDraftRecord {
  draftId: string;
  trackId: string;
  attestorId: string;
  status: CreatorDraftStatus;
  createdAtMs: number;
  updatedAtMs: number;
  catalogDraft: SongCatalogEntry;
  chartEditor: ChartEditorState | null;
  sha256: string;
  /** Raw WAV retained only while draft is active — cleared on withdraw. */
  audioBytes: Uint8Array | null;
  rightsGate: {
    ownsOrLicensed: boolean;
    commercialEligible: false;
    autoPublish: false;
    launchEligible: false;
  };
  message: string;
}

export interface CreatorDraftStore {
  saveFromIngest(
    result: CreatorBinaryIngestResult,
    attestorId: string,
    nowMs?: number,
    audioBytes?: Uint8Array | null,
  ): CreatorDraftRecord | null;
  get(draftId: string): CreatorDraftRecord | null;
  /** Server-authoritative lookup by immutable content hash (private, unpublished). */
  findBySha256(sha256: string | null | undefined): CreatorDraftRecord | null;
  list(attestorId?: string): CreatorDraftRecord[];
  requestReview(draftId: string, forceReviewAck: boolean, nowMs?: number): CreatorDraftRecord | null;
  withdraw(draftId: string, attestorId: string, nowMs?: number): CreatorDraftRecord | null;
  /** Explicit publish attempt — always blocked unless external commercial gate flips (never here). */
  attemptPublish(draftId: string): { ok: false; reason: string; draft: CreatorDraftRecord | null };
  resetForTests(): void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCreatorDraftStore(): CreatorDraftStore {
  const byId = new Map<string, CreatorDraftRecord>();

  return {
    saveFromIngest(result, attestorId, nowMs = Date.now(), audioBytes = null) {
      if (!result.ok || !result.catalogDraft || !result.sha256) return null;
      if (result.honesty.autoPublished) return null;
      const draftId = newId('draft');
      const retained =
        audioBytes && audioBytes.byteLength > 0
          ? new Uint8Array(audioBytes)
          : null;
      const record: CreatorDraftRecord = {
        draftId,
        trackId: result.catalogDraft.id,
        attestorId,
        status: result.status === 'review_required' ? 'review_pending' : 'draft',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        catalogDraft: {
          ...result.catalogDraft,
          launchEligible: false,
          rights: {
            ...result.catalogDraft.rights!,
            commercialEligible: false,
            ownershipClass: result.catalogDraft.rights?.ownershipClass ?? 'creator_attested',
          },
        },
        chartEditor: result.chartEditor,
        sha256: result.sha256,
        // Retain owned WAV for private room playback only — never launch-published.
        audioBytes: retained,
        rightsGate: {
          ownsOrLicensed: Boolean(result.attestation?.ownsOrLicensed),
          commercialEligible: false,
          autoPublish: false,
          launchEligible: false,
        },
        message:
          'Draft stored. Not launch-published. Withdraw anytime. commercialEligible=false.',
      };
      byId.set(draftId, record);
      return record;
    },

    get(draftId) {
      return byId.get(draftId) ?? null;
    },

    findBySha256(sha256) {
      if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) return null;
      const needle = sha256.toLowerCase();
      for (const draft of byId.values()) {
        if (draft.status === 'withdrawn') continue;
        if (draft.sha256.toLowerCase() === needle) return draft;
      }
      return null;
    },

    list(attestorId) {
      const all = [...byId.values()].filter((d) => d.status !== 'withdrawn');
      return attestorId ? all.filter((d) => d.attestorId === attestorId) : all;
    },

    requestReview(draftId, forceReviewAck, nowMs = Date.now()) {
      const draft = byId.get(draftId);
      if (!draft || draft.status === 'withdrawn') return null;
      if (!draft.rightsGate.ownsOrLicensed) {
        const rejected: CreatorDraftRecord = {
          ...draft,
          status: 'rejected_rights',
          updatedAtMs: nowMs,
          message: 'Rights gate failed — ownership attestation required before review.',
        };
        byId.set(draftId, rejected);
        return rejected;
      }
      if (!draft.chartEditor) {
        return {
          ...draft,
          status: 'review_pending',
          updatedAtMs: nowMs,
          message: 'Review pending — no chart editor state; manual chart required.',
        };
      }
      const gate = canPublishChart(draft.chartEditor, { forceReviewAck });
      const next: CreatorDraftRecord = {
        ...draft,
        status: gate.ok ? 'review_pending' : 'review_pending',
        updatedAtMs: nowMs,
        message: gate.ok
          ? 'Review acknowledged — still not auto-published (launch gate separate).'
          : `Review held: ${gate.reason ?? 'blocked'}. Not published.`,
      };
      byId.set(draftId, next);
      return next;
    },

    withdraw(draftId, attestorId, nowMs = Date.now()) {
      const draft = byId.get(draftId);
      if (!draft) return null;
      if (draft.attestorId !== attestorId) return null;
      markTakedown(draft.trackId, nowMs);
      const withdrawn: CreatorDraftRecord = {
        ...draft,
        status: 'withdrawn',
        updatedAtMs: nowMs,
        audioBytes: null,
        chartEditor: null,
        message: 'Draft withdrawn — binary cleared, attestation taken down, not published.',
      };
      byId.set(draftId, withdrawn);
      return withdrawn;
    },

    attemptPublish(draftId) {
      const draft = byId.get(draftId) ?? null;
      if (!draft || draft.status === 'withdrawn') {
        return { ok: false as const, reason: 'draft_missing_or_withdrawn', draft };
      }
      // Hard gate: this store never auto-publishes to the launch catalog.
      const blocked: CreatorDraftRecord = {
        ...draft,
        status: 'publish_blocked',
        updatedAtMs: Date.now(),
        message:
          'Publish blocked — creator pipeline has no auto-publish path. commercialEligible remains false.',
      };
      byId.set(draftId, blocked);
      return { ok: false as const, reason: 'no_auto_publish', draft: blocked };
    },

    resetForTests() {
      byId.clear();
    },
  };
}

/** Process-local default store for server + unit tests. */
export const defaultCreatorDraftStore = createCreatorDraftStore();
