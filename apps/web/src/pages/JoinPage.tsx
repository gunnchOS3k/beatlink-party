import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const seat = searchParams.get('seat') === 'audience' ? 'audience' : 'player';
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const qCode = (searchParams.get('code') ?? '').trim().toUpperCase();
    const qName = (searchParams.get('name') ?? '').trim();
    const auto = searchParams.get('auto') === '1';
    if (qCode) setCode(qCode);
    if (qName) setName(qName);
    if (auto && qCode && qName) {
      const path =
        seat === 'audience'
          ? `/audience/${qCode}?name=${encodeURIComponent(qName)}`
          : `/play/${qCode}?name=${encodeURIComponent(qName)}`;
      navigate(path, { replace: true });
    }
  }, [navigate, searchParams, seat]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    const room = code.trim().toUpperCase();
    if (seat === 'audience') {
      navigate(`/audience/${room}?name=${encodeURIComponent(name.trim())}`);
    } else {
      navigate(`/play/${room}?name=${encodeURIComponent(name.trim())}`);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 style={{ fontSize: '2.5rem' }}>
          {seat === 'audience' ? 'Join as Audience' : 'Join Party'}
        </h1>
        <p>
          {seat === 'audience'
            ? 'Spectate and send moderated hype — you are not a scoring player'
            : 'Enter the room code from the host screen'}
        </p>
      </div>
      <form className="card stack" style={{ maxWidth: 400, margin: '0 auto' }} onSubmit={handleJoin}>
        <div>
          <label className="label">Room Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={6}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
          />
        </div>
        <button type="submit" className="btn-primary btn-large" data-testid="join-submit">
          {seat === 'audience' ? 'Enter as Spectator' : 'Join Room'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="join-toggle-seat"
          onClick={() =>
            navigate(seat === 'audience' ? '/join' : '/join?seat=audience')
          }
        >
          {seat === 'audience' ? 'Switch to Player join' : 'Join as Audience instead'}
        </button>
      </form>
    </div>
  );
}
