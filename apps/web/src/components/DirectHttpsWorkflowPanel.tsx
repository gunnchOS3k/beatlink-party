/**
 * Authorized direct HTTPS workflow — import/hash/rights/analysis/charts/preview gate.
 * No auto-publish. URL redirects refused server-side. syncEligible required for gameplay.
 */
import { useState } from 'react';
import { evaluateDirectHttps, ingestCreatorBinary } from '../lib/api';

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export type DirectHttpsAttachPayload = {
  url: string;
  mimeType?: string | null;
  contentSha256?: string | null;
  composition: {
    basis: 'creator_attested';
    syncAuthorized: boolean;
    adaptationAuthorized: boolean;
    attributionText: string;
  };
  soundRecording: {
    basis: 'creator_attested';
    reproductionAuthorized: boolean;
    attributionText: string;
  };
  beatGridReady: boolean;
  chartsReady: boolean;
};

export function DirectHttpsWorkflowPanel(props: {
  /** When provided, host can attach the evaluation to the live lobby. */
  onAttachToLobby?: (payload: DirectHttpsAttachPayload) => Promise<{
    scoredPlayAllowed: boolean;
    message: string;
  } | null>;
  attachEnabled?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [hash, setHash] = useState('');
  const [syncAuthorized, setSyncAuthorized] = useState(true);
  const [adaptationAuthorized, setAdaptationAuthorized] = useState(true);
  const [reproductionAuthorized, setReproductionAuthorized] = useState(true);
  const [beatGridReady, setBeatGridReady] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [ingestResult, setIngestResult] = useState<Record<string, unknown> | null>(null);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);

  async function onPickFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setIngestResult(null);
    try {
      const buf = await file.arrayBuffer();
      const digest = await sha256Hex(buf);
      setHash(digest);
      const audioBase64 = await fileToBase64(file);
      const ingested = await ingestCreatorBinary({
        trackId: `local-${digest.slice(0, 12)}`,
        title: file.name.replace(/\.[^.]+$/, '') || 'Creator track',
        artist: 'Creator (local)',
        attestorId: 'host-local',
        ownsOrLicensed: true,
        acknowledgeNoAutoPublish: true,
        audioBase64,
        mimeType: file.type || 'audio/wav',
        declaredLicense: 'creator_owned',
      });
      setIngestResult(ingested);
      setBeatGridReady(Boolean(ingested.ok));
      setChartsReady(Boolean((ingested.chartEditorSummary as { noteCount?: number } | null)?.noteCount));
    } catch (err) {
      setIngestResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function buildAttachPayload(): DirectHttpsAttachPayload {
    return {
      url: url || 'https://cdn.example.com/owned/track.wav',
      contentSha256: hash || null,
      composition: {
        basis: 'creator_attested',
        syncAuthorized,
        adaptationAuthorized,
        attributionText: 'Host-attested composition',
      },
      soundRecording: {
        basis: 'creator_attested',
        reproductionAuthorized,
        attributionText: 'Host-attested sound recording',
      },
      beatGridReady,
      chartsReady,
    };
  }

  async function onEvaluate() {
    setBusy(true);
    setResult(null);
    setAttachMessage(null);
    try {
      const decision = await evaluateDirectHttps({
        ...buildAttachPayload(),
        probe: Boolean(url),
      });
      setResult(decision);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function onAttach() {
    if (!props.onAttachToLobby) return;
    setBusy(true);
    setAttachMessage(null);
    try {
      // Re-evaluate so attach uses current attestation; server re-checks syncEligible.
      // evaluateDirectHttps returns HTTP 422 bodies without throwing — gate here.
      const decision = await evaluateDirectHttps({
        ...buildAttachPayload(),
        probe: Boolean(url),
      });
      setResult(decision);
      const evalOk = decision.ok === true;
      const probeOk = decision.probe == null || (decision.probe as { ok?: boolean }).ok !== false;
      const gameplayOk = decision.gameplaySyncAuthorized === true;
      if (!evalOk || !probeOk) {
        setAttachMessage(
          String(
            decision.message ??
              decision.error ??
              'Evaluation rejected — lobby attach refused (server must also enforce).',
          ),
        );
        return;
      }
      // Preview-only path may still attach when rights cleared but sync denied;
      // scored selection is independently enforced on the socket/server.
      if (!gameplayOk && decision.capabilityState !== 'DIRECT_AUDIO_RIGHTS_VERIFIED') {
        setAttachMessage(
          String(
            decision.message ??
              'Evaluation not playback-cleared — lobby attach refused.',
          ),
        );
        return;
      }
      const attached = await props.onAttachToLobby(buildAttachPayload());
      if (!attached) {
        setAttachMessage('Could not attach to lobby (host/room required).');
      } else if (!attached.scoredPlayAllowed) {
        setAttachMessage(
          attached.message ||
            'Attached for preview only — scored gameplay denied (syncEligible/hash/catalog gate).',
        );
      } else {
        setAttachMessage(attached.message || 'Attached for scored lobby play.');
      }
    } catch (err) {
      setAttachMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel stack" data-testid="direct-https-workflow">
      <h3>Direct HTTPS / creator workflow</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
        Preferred gameplay route: import → hash → decode → rights → analysis → charts → preview →
        scored play. <code>syncEligible</code> required for gameplay (not playback alone). No
        auto-publish. Redirects refused.
      </p>

      <label className="label">Local WAV (creator-owned)</label>
      <input
        type="file"
        accept="audio/wav,audio/wave,.wav"
        disabled={busy}
        onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
        data-testid="direct-https-file"
      />

      <label className="label">Direct HTTPS URL (optional probe)</label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/owned-track.wav"
        data-testid="direct-https-url"
      />

      <label className="label">Content SHA-256</label>
      <input
        type="text"
        value={hash}
        onChange={(e) => setHash(e.target.value)}
        placeholder="64-char hex from import"
        data-testid="direct-https-hash"
      />

      <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        <label>
          <input
            type="checkbox"
            checked={reproductionAuthorized}
            onChange={(e) => setReproductionAuthorized(e.target.checked)}
          />{' '}
          reproductionAuthorized
        </label>
        <label>
          <input
            type="checkbox"
            checked={syncAuthorized}
            onChange={(e) => setSyncAuthorized(e.target.checked)}
          />{' '}
          syncAuthorized
        </label>
        <label>
          <input
            type="checkbox"
            checked={adaptationAuthorized}
            onChange={(e) => setAdaptationAuthorized(e.target.checked)}
          />{' '}
          adaptationAuthorized
        </label>
        <label>
          <input
            type="checkbox"
            checked={beatGridReady}
            onChange={(e) => setBeatGridReady(e.target.checked)}
          />{' '}
          beatGridReady
        </label>
        <label>
          <input
            type="checkbox"
            checked={chartsReady}
            onChange={(e) => setChartsReady(e.target.checked)}
          />{' '}
          chartsReady
        </label>
      </div>

      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void onEvaluate()}
          data-testid="direct-https-evaluate"
        >
          {busy ? 'Working…' : 'Evaluate (rights + hash + grid/charts)'}
        </button>
        {props.onAttachToLobby ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || props.attachEnabled === false}
            onClick={() => void onAttach()}
            data-testid="direct-https-attach-lobby"
          >
            Attach to lobby
          </button>
        ) : null}
      </div>
      {attachMessage ? (
        <p
          data-testid="direct-https-attach-message"
          style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}
        >
          {attachMessage}
        </p>
      ) : null}

      {ingestResult ? (
        <pre
          data-testid="direct-https-ingest-result"
          style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: 160 }}
        >
          {JSON.stringify(
            {
              ok: ingestResult.ok,
              draftId: ingestResult.draftId,
              draftStatus: ingestResult.draftStatus,
              sha256: ingestResult.sha256,
              chartEditorSummary: ingestResult.chartEditorSummary,
              message: ingestResult.message ?? ingestResult.error,
              autoPublish: false,
            },
            null,
            2,
          )}
        </pre>
      ) : null}

      {result ? (
        <pre
          data-testid="direct-https-eval-result"
          style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: 200 }}
        >
          {JSON.stringify(
            {
              capabilityState: result.capabilityState,
              rightsOk: result.rightsOk,
              syncEligible: result.syncEligible,
              gameplaySyncAuthorized: result.gameplaySyncAuthorized,
              blockers: result.blockers,
              message: result.message ?? result.error,
              autoPublish: false,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </div>
  );
}
