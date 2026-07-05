import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function JoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

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
