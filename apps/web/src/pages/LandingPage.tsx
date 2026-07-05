import { useNavigate } from 'react-router-dom';
import { useCreateRoom } from '../lib/socket';

export default function LandingPage() {
  const navigate = useNavigate();
  const createRoom = useCreateRoom();

  async function handleCreate() {
    const code = await createRoom();
    navigate(`/host/${code}`);
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>BeatLink Party</h1>
        <p>
          Rhythm + karaoke party game. Host on the big screen, play from your phone. No app
          download required.
        </p>
        <div className="stack" style={{ maxWidth: 400, margin: '0 auto' }}>
          <button className="btn-primary btn-large" onClick={handleCreate}>
            Create Room (Host)
          </button>
          <button className="btn-secondary btn-large" onClick={() => navigate('/join')}>
            Join with Code (Player)
          </button>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 700, margin: '2rem auto' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>How to play</h3>
        <ol style={{ paddingLeft: '1.25rem', color: 'var(--muted)', lineHeight: 1.8 }}>
          <li>Host creates a room and displays the code on a TV or laptop.</li>
          <li>Players join at <strong>/join</strong> with the room code.</li>
          <li>Pick a role: Beat Tapper, Vocalist, or Hype Captain.</li>
          <li>Host selects an approved demo song and starts the round.</li>
          <li>Perform from your phone — score awards at the end!</li>
        </ol>
        <div className="compliance-banner" style={{ marginTop: '1rem' }}>
          Music compliance: pasted YouTube/Spotify/Apple links are metadata-only. No audio is
          downloaded. Use approved demo songs for gameplay.
        </div>
      </div>
    </div>
  );
}
