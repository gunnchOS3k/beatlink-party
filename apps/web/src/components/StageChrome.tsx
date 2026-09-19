import { useState, type ReactNode } from 'react';
import { GlyphCopy, GlyphParty } from '../brand/glyphs';
import { NetworkStatus, SettingsDrawer } from './NetworkStatus';
import {
  AccessibilityPanel,
  DeviceRolePicker,
  useAccessibility,
  useDeviceRole,
} from '../lib/deviceSettings';

/** Player-facing product name — Stage Energy is an internal design label only. */
export const PRODUCT_NAME = 'BeatLink Party';

export function BrandMark({ as = 'p', size = 'lg' }: { as?: 'p' | 'h1'; size?: 'sm' | 'lg' }) {
  const Tag = as;
  return (
    <Tag
      className={`brand-mark${size === 'sm' ? ' brand-mark-sm' : ''}`}
      data-testid="stage-brand"
    >
      {PRODUCT_NAME}
    </Tag>
  );
}

export function PartyLoop() {
  const steps = ['Party', 'People', 'Music', 'Role', 'Play', 'Reaction', 'Celebration'] as const;
  return (
    <nav className="party-loop" aria-label="Party loop">
      {steps.map((step) => (
        <span key={step}>{step}</span>
      ))}
    </nav>
  );
}

export function HowToPlay() {
  return (
    <details className="settings-drawer" data-testid="how-to-play" style={{ marginTop: '1.5rem' }}>
      <summary>How to play</summary>
      <ol style={{ paddingLeft: '1.2rem', color: 'var(--muted)', lineHeight: 1.7, marginTop: '0.75rem' }}>
        <li>Host opens a party on the big screen and shares the room code.</li>
        <li>Friends join on phones with the code, pick a role, and ready up.</li>
        <li>Host picks a playable catalog song, calibrates, then starts the round.</li>
        <li>Perform from your phone — celebrate awards, then play again.</li>
      </ol>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
        Music compliance: pasted YouTube / Spotify / Apple links are metadata-only unless an
        authorized platform path is configured. No third-party streams are ripped or downloaded.
      </p>
    </details>
  );
}

export function DemotedSettings({ preferHost = false }: { preferHost?: boolean }) {
  const { role, setRole, roles, profile } = useDeviceRole(preferHost);
  const { settings, update } = useAccessibility();
  return (
    <SettingsDrawer>
      <DeviceRolePicker role={role} roles={roles} onChange={setRole} />
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{profile.hints[0]}</p>
      <AccessibilityPanel settings={settings} update={update} />
    </SettingsDrawer>
  );
}

export function SurfaceShell({
  surface,
  children,
  connected,
  backendReady = true,
  showSettings = true,
  preferHost = false,
  networkCompact = false,
}: {
  surface: 'host' | 'player';
  children: ReactNode;
  connected?: boolean;
  backendReady?: boolean;
  showSettings?: boolean;
  preferHost?: boolean;
  networkCompact?: boolean;
}) {
  return (
    <div
      className={`page page-${surface} surface-${surface}`}
      data-surface={surface}
      data-testid={`surface-${surface}`}
    >
      {connected !== undefined ? (
        <NetworkStatus
          connected={connected}
          backendReady={backendReady}
          compact={networkCompact && connected}
        />
      ) : null}
      {children}
      {showSettings ? <DemotedSettings preferHost={preferHost || surface === 'host'} /> : null}
    </div>
  );
}

export function RoomCodeHero({
  code,
  copyable = true,
}: {
  code: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="panel" style={{ textAlign: 'center', marginBottom: '1.25rem' }} data-testid="room-code-hero">
      <p className="label">Room code — share with the room</p>
      <div className="room-code-hero" data-testid="host-room-code">
        {code}
      </div>
      {copyable ? (
        <button type="button" className="btn-secondary" onClick={copy} data-testid="copy-room-code">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <GlyphCopy size={18} />
            {copied ? 'Copied' : 'Copy code'}
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function OpeningStageMark() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)' }}>
      <GlyphParty size={20} />
      <span>Opening the stage</span>
    </div>
  );
}
