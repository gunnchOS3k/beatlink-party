import type { ReactNode } from 'react';
import type { PlayerRole } from '@beatlink/shared';

type GlyphProps = {
  size?: number;
  className?: string;
  title?: string;
};

function SvgShell({
  size = 28,
  className,
  title,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={`glyph ${className ?? ''}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Original Stage Energy glyph — beat pulse / tap pad */
export function GlyphBeat({ size, className, title = 'Beat Tapper' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="3" opacity="0.35" />
      <circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="3" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M24 6v4M24 38v4M6 24h4M38 24h4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

/** Original Stage Energy glyph — phrase cue / vocal window (not a mic claim) */
export function GlyphVocal({ size, className, title = 'Vocalist' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path
        d="M10 30c4-8 8-12 14-12s10 4 14 12"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M14 34c3.5-5.5 6.5-8 10-8s6.5 2.5 10 8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <rect x="20" y="10" width="8" height="12" rx="4" stroke="currentColor" strokeWidth="3" />
      <path d="M18 38h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

/** Original Stage Energy glyph — crowd boost / hype */
export function GlyphHype({ size, className, title = 'Hype Captain' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path
        d="M24 8l3.2 9.2H37l-7.6 5.6 2.9 9.2L24 26.8l-8.3 5.2 2.9-9.2L11 17.2h9.8L24 8z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="36" r="3" fill="currentColor" />
      <circle cx="24" cy="40" r="3" fill="currentColor" />
      <circle cx="36" cy="36" r="3" fill="currentColor" />
    </SvgShell>
  );
}

export function GlyphCheer({ size = 28, className, title = 'Cheer' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path d="M16 34V18l8-8 8 8v16" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 34h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 22h8M20 28h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </SvgShell>
  );
}

export function GlyphLights({ size = 28, className, title = 'Lights' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path d="M24 8v6M24 34v6M8 24h6M34 24h6M12 12l4 4M32 32l4 4M36 12l-4 4M16 32l-4 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="3" />
    </SvgShell>
  );
}

export function GlyphBoost({ size = 28, className, title = 'Boost' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path d="M14 30l10-20 4 10 6-4-10 20-4-10-6 4z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </SvgShell>
  );
}

export function GlyphCombo({ size = 28, className, title = 'Combo Save' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path d="M24 8l4 12h12l-10 7 4 12-10-7-10 7 4-12-10-7h12z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </SvgShell>
  );
}

export function GlyphLink({ size = 22, className, title = 'Link' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path d="M18 30l-2 2a8 8 0 0011 0l6-6a8 8 0 00-11-11l-1.5 1.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M30 18l2-2a8 8 0 00-11 0l-6 6a8 8 0 0011 11l1.5-1.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

export function GlyphNetwork({ size = 22, className, title = 'Network' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M12 24a12 12 0 0124 0M8 24a16 16 0 0132 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

export function GlyphParty({ size = 28, className, title = 'Create a Party' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <path
        d="M8 36c4-12 8-20 16-24 8 4 12 12 16 24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="20" r="2.5" fill="currentColor" />
      <circle cx="24" cy="14" r="2.5" fill="currentColor" />
      <circle cx="32" cy="20" r="2.5" fill="currentColor" />
    </SvgShell>
  );
}

export function GlyphJoin({ size = 28, className, title = 'Join a Party' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <circle cx="18" cy="16" r="6" stroke="currentColor" strokeWidth="3" />
      <path d="M6 38c0-6 5-10 12-10s12 4 12 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M34 18v12M28 24h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

export function GlyphCopy({ size = 22, className, title = 'Copy' }: GlyphProps) {
  return (
    <SvgShell size={size} className={className} title={title}>
      <rect x="16" y="16" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="3" />
      <path d="M12 30V14a4 4 0 014-4h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </SvgShell>
  );
}

export function roleGlyph(role: PlayerRole | null | undefined, size = 32) {
  if (role === 'beat_tapper') return <GlyphBeat size={size} />;
  if (role === 'vocalist') return <GlyphVocal size={size} />;
  if (role === 'hype_captain') return <GlyphHype size={size} />;
  return null;
}
