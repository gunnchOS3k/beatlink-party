import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    const qCode = (searchParams.get('code') ?? '').trim().toUpperCase();
    const qName = (searchParams.get('name') ?? '').trim();
    const auto = searchParams.get('auto') === '1';
    if (qCode) setCode(qCode);
    if (qName) setName(qName);
    if (auto && qCode && qName) {
      navigate(`/play/${qCode}?name=${encodeURIComponent(qName)}`, { replace: true });
    }
  }, [navigate, searchParams]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    navigate(`/play/${code.trim().toUpperCase()}?name=${encodeURIComponent(name.trim())}`);
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 style={{ fontSize: '2.5rem' }}>Join Party</h1>
        <p>Enter the room code from the host screen</p>
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
        <button type="submit" className="btn-primary btn-large">
          Join Room
        </button>
      </form>
    </div>
  );
}
