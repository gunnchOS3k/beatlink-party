import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateRoom, useSocket } from '../lib/socket';
import { isBackendConfigured } from '../lib/api';
import {
  AccessibilityPanel,
  DeviceRolePicker,
  useAccessibility,
  useDeviceRole,
} from '../lib/deviceSettings';

export default function LandingPage() {
  const navigate = useNavigate();
  const createRoom = useCreateRoom();
  const { connected } = useSocket();
  const backendReady = isBackendConfigured();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { role, setRole, roles, profile } = useDeviceRole(false);
  const { settings, update } = useAccessibility();

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
    <div className="page">
      <div className="hero">
        <h1>BeatLink Party</h1>
        <p>
          Rhythm + karaoke party game. Host on the big screen, play from your phone — or spectate as
          audience.
        </p>
        {!backendReady && (
          <div className="compliance-banner" style={{ marginBottom: '1rem' }}>
            <strong>Setup required.</strong> This install does not include a hosted room server.
            Configure <code>VITE_API_URL</code> and <code>VITE_WS_URL</code> at build time, or run
            the dev server on your network. You can still browse Join and read the how-to flow
            offline.
          </div>
        )}
        {error && (
          <div
            className="compliance-banner"
            style={{ marginBottom: '1rem', borderColor: 'var(--accent)' }}
          >
            <strong>Could not create room.</strong> {error}
          </div>
        )}
        {backendReady && !connected && !creating && (
          <div className="compliance-banner" style={{ marginBottom: '1rem' }}>
            Connecting to room server…
          </div>
        )}
        <div className="stack" style={{ maxWidth: 400, margin: '0 auto' }}>
          <button
            className="btn-primary btn-large"
            onClick={handleCreate}
            disabled={!backendReady || creating}
          >
            {creating ? 'Creating room…' : 'Create Room (Host)'}
          </button>
          <button className="btn-secondary btn-large" onClick={() => navigate('/join')}>
            Join with Code (Player)
          </button>
          <button
            className="btn-secondary btn-large"
            onClick={() => navigate('/join?seat=audience')}
          >
            Watch as Audience
          </button>
        </div>
      </div>
      <div className="card stack" style={{ maxWidth: 700, margin: '2rem auto' }}>
        <h3>How to play</h3>
        <ol style={{ paddingLeft: '1.25rem', color: 'var(--muted)', lineHeight: 1.8 }}>
          <li>Host creates a room and displays the code on a TV or laptop.</li>
          <li>Players join at <strong>/join</strong> with the room code.</li>
          <li>Audience can spectate and send moderated hype/votes (rate-limited).</li>
          <li>Pick a role: Beat Tapper, Vocalist, or Hype Captain.</li>
          <li>Host selects an approved demo song and starts the round.</li>
          <li>Perform from your phone — score awards at the end!</li>
        </ol>
        <div className="compliance-banner">
          Music compliance: pasted YouTube/Spotify/Apple links are metadata-only. No audio is
          downloaded. Use approved demo songs for gameplay.
        </div>
        <DeviceRolePicker role={role} roles={roles} onChange={setRole} />
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{profile.hints.join(' · ')}</p>
        <AccessibilityPanel settings={settings} update={update} />
      </div>
    </div>
  );
}
