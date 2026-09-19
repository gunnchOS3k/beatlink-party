import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateRoom, useSocket } from '../lib/socket';
import { isBackendConfigured } from '../lib/api';
import { GlyphJoin, GlyphParty } from '../brand/glyphs';
import {
  BrandMark,
  HowToPlay,
  PartyLoop,
  PRODUCT_NAME,
  SurfaceShell,
} from '../components/StageChrome';

export default function LandingPage() {
  const navigate = useNavigate();
  const createRoom = useCreateRoom();
  const { connected } = useSocket();
  const backendReady = isBackendConfigured();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!backendReady) {
      setError(
        'BeatLink could not reach the room server. Configure VITE_API_URL and VITE_WS_URL at build time, or run the dev server on your network.',
      );
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { code } = await createRoom();
      navigate(`/host/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  return (
    <SurfaceShell
      surface="host"
      connected={connected || creating}
      backendReady={backendReady}
      preferHost
      networkCompact={connected}
    >
      <header className="hero">
        <BrandMark as="h1" />
        <p className="brand-sub">
          Festival energy on the big screen. Friends on phones. One room code — then the stage takes
          over.
        </p>
        <p className="sr-only">{PRODUCT_NAME} party loop</p>

        {error && (
          <div
            className="compliance-banner"
            style={{ marginBottom: '1rem', borderColor: 'var(--danger)', textAlign: 'left' }}
          >
            <strong>Could not create party.</strong> {error}
          </div>
        )}

        <div className="cta-stack">
          <button
            className="btn-primary btn-large"
            onClick={handleCreate}
            disabled={!backendReady || creating}
            data-testid="create-room"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
              <GlyphParty size={22} />
              {creating ? 'Opening stage…' : 'Create a Party'}
            </span>
          </button>
          <button
            className="btn-secondary btn-large"
            onClick={() => navigate('/join')}
            data-testid="join-party"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
              <GlyphJoin size={22} />
              Join a Party
            </span>
          </button>
          <button
            className="btn-ghost"
            onClick={() => navigate('/join?seat=audience')}
            data-testid="watch-audience"
          >
            Watch as Audience
          </button>
        </div>

        <PartyLoop />
      </header>

      <HowToPlay />
    </SurfaceShell>
  );
}
