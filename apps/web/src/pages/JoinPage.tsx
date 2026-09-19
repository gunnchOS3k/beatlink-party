import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark, SurfaceShell } from '../components/StageChrome';

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
    <SurfaceShell surface="player" connected showSettings={false}>
      <div className="hero" style={{ paddingBottom: '0.5rem' }}>
        <BrandMark />
        <h1 className="sr-only">
          {seat === 'audience' ? 'Join as Audience' : 'Join Party'}
        </h1>
        <p className="brand-sub">
          {seat === 'audience'
            ? 'Spectate and send moderated hype — you are not a scoring player'
            : 'Room code → name → join → pick a role → ready'}
        </p>
      </div>
      <form className="panel stack" style={{ maxWidth: 400, margin: '0 auto' }} onSubmit={handleJoin}>
        <div>
          <label className="label" htmlFor="join-code">
            Room Code
          </label>
          <input
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={6}
            autoComplete="off"
            autoFocus
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              letterSpacing: '0.2em',
              textAlign: 'center',
              fontWeight: 700,
            }}
            data-testid="join-code"
          />
        </div>
        <div>
          <label className="label" htmlFor="join-name">
            Display Name
          </label>
          <input
            id="join-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            data-testid="join-name"
          />
        </div>
        <button type="submit" className="btn-primary btn-large" data-testid="join-submit">
          {seat === 'audience' ? 'Enter as Spectator' : 'Join Room'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          data-testid="join-toggle-seat"
          onClick={() => navigate(seat === 'audience' ? '/join' : '/join?seat=audience')}
        >
          {seat === 'audience' ? 'Switch to Player join' : 'Join as Audience instead'}
        </button>
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          <Link to="/">Back to home</Link>
        </p>
      </form>
    </SurfaceShell>
  );
}
