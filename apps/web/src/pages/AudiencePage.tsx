import { useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { AudienceMember, AudienceInfluenceEvent, RoomState } from '@beatlink/shared';
import { useJoinAudience, useRoomEvents, useSocket } from '../lib/socket';

const AUDIENCE_STORAGE_KEY = 'beatlink_audience';

export default function AudiencePage() {
  const { roomCode } = useParams();
  const [searchParams] = useSearchParams();
  const code = roomCode?.toUpperCase() ?? '';
  const initialName = searchParams.get('name') ?? '';

  const { socket } = useSocket();
  const joinAudience = useJoinAudience();

  const [member, setMember] = useState<AudienceMember | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [name, setName] = useState(initialName);
  const [joined, setJoined] = useState(false);
  const [lastEvent, setLastEvent] = useState<AudienceInfluenceEvent | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const memberIdRef = useRef<string | undefined>(undefined);
  memberIdRef.current = member?.id;

  const handlers = useMemo(
    () => ({
      onState: (next: RoomState) => {
        setRoom(next);
        const me = next.audience?.find((a) => a.id === memberIdRef.current);
        if (me) setMember(me);
      },
      onAudienceInfluence: (next: RoomState, event: AudienceInfluenceEvent) => {
        setRoom(next);
        if (event.audienceId === memberIdRef.current) setLastEvent(event);
      },
      onPlayerJoined: setRoom,
      onPlayerLeft: setRoom,
    }),
    [],
  );

  useRoomEvents(joined ? code : undefined, handlers);

  async function handleJoin() {
    if (!name.trim() || !code) return;
    const stored = localStorage.getItem(AUDIENCE_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    const audienceId = parsed?.roomCode === code ? parsed.audienceId : undefined;
    const audienceToken = parsed?.roomCode === code ? parsed.audienceToken : undefined;

    try {
      const result = await joinAudience(code, name.trim(), audienceId, audienceToken);
      setMember(result.audience);
      setRoom(result.room);
      setJoined(true);
      localStorage.setItem(
        AUDIENCE_STORAGE_KEY,
        JSON.stringify({
          roomCode: code,
          audienceId: result.audience.id,
          audienceToken: result.audienceToken ?? audienceToken,
        }),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Audience join failed');
    }
  }

  function sendInfluence(type: 'hype' | 'vote', choice?: string) {
    if (!member || cooldown || member.muted) return;
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 4000);
    socket.emit(
      'audience.influence',
      { code, audienceId: member.id, type, choice },
      (result?: { ok?: boolean; event?: AudienceInfluenceEvent }) => {
        if (result?.event) setLastEvent(result.event);
      },
    );
  }

  if (!joined) {
    return (
      <div className="page">
        <div className="hero">
          <h1 style={{ fontSize: '2rem' }}>Audience · {code}</h1>
          <p>Spectator seat — moderated hype/vote only</p>
        </div>
        <div className="card stack" style={{ maxWidth: 400, margin: '0 auto' }}>
          <div>
            <label className="label">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <button className="btn-primary btn-large" onClick={handleJoin}>
            Enter as Spectator
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page stack">
      <div className="card stack">
        <h2>Spectating {code}</h2>
        <p style={{ color: 'var(--muted)' }}>
          Phase: {room?.phase ?? '…'} · Crowd {room?.crowdMeter ?? 0}% · Team {room?.teamScore ?? 0}
        </p>
        {member?.muted && (
          <div className="compliance-banner">You are muted by the host.</div>
        )}
        {member?.sandboxed && (
          <div className="compliance-banner">Sandbox mode — influence is simulated only.</div>
        )}
        <div className="row">
          <button
            className="btn-primary"
            disabled={cooldown || member?.muted}
            onClick={() => sendInfluence('hype')}
          >
            Send Hype
          </button>
          <button
            className="btn-secondary"
            disabled={cooldown || member?.muted}
            onClick={() => sendInfluence('vote', 'encore')}
          >
            Vote Encore
          </button>
        </div>
        {lastEvent && (
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            Last influence: {lastEvent.accepted ? 'accepted' : `rejected (${lastEvent.reason})`} ·
            Δcrowd {lastEvent.crowdDelta}
          </p>
        )}
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Anti-grief: 4s cooldown, max 8 influences per round. You are not a scoring player.
        </p>
      </div>
    </div>
  );
}
