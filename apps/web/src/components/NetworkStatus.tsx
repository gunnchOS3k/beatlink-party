import type { ReactNode } from 'react';
import { GlyphNetwork } from '../brand/glyphs';

type Props = {
  connected: boolean;
  backendReady?: boolean;
  /** Never surface socket IDs or stack traces here */
  message?: string;
  compact?: boolean;
};

/**
 * Branded network / reconnect status for host + player surfaces.
 * Deliberately omits socket IDs, transport dumps, and stack traces.
 */
export function NetworkStatus({
  connected,
  backendReady = true,
  message,
  compact = false,
}: Props) {
  if (!backendReady) {
    return (
      <div
        className="network-banner offline"
        role="status"
        data-testid="network-status"
        data-state="setup"
      >
        <GlyphNetwork size={22} />
        <div>
          <strong>Room server not configured.</strong>
          {!compact && (
            <p style={{ marginTop: '0.25rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
              {message ??
                'Set VITE_API_URL and VITE_WS_URL, or run the local party server. Join flow stays browseable offline.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (connected) {
    if (compact) return null;
    return (
      <div
        className="network-banner online"
        role="status"
        data-testid="network-status"
        data-state="online"
      >
        <GlyphNetwork size={22} />
        <span>Connected to party server</span>
      </div>
    );
  }

  return (
    <div
      className="network-banner connecting"
      role="status"
      data-testid="network-status"
      data-state="reconnecting"
    >
      <GlyphNetwork size={22} />
      <div>
        <strong>Reconnecting to the party…</strong>
        {!compact && (
          <p style={{ marginTop: '0.25rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            {message ?? 'Stay on this screen — your room code and role are kept when the link returns.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function SettingsDrawer({ children }: { children: ReactNode }) {
  return (
    <details className="settings-drawer" data-testid="settings-drawer">
      <summary>Settings & accessibility</summary>
      <div className="stack" style={{ marginTop: '0.85rem' }}>
        {children}
      </div>
    </details>
  );
}
