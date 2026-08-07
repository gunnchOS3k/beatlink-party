import type { DeviceRoleId } from '@beatlink/shared';
import { DEVICE_ROLE_PROFILES, type DeviceRoleProfile } from './profiles.js';

const STORAGE_KEY = 'beatlink_device_role';

export function getDeviceRoleProfile(id: DeviceRoleId): DeviceRoleProfile {
  return DEVICE_ROLE_PROFILES[id];
}

export function loadSelectedDeviceRole(): DeviceRoleId | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && raw in DEVICE_ROLE_PROFILES) return raw as DeviceRoleId;
  return null;
}

export function saveSelectedDeviceRole(id: DeviceRoleId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Heuristic device-role detection for web clients.
 * Prefer explicit user selection when present.
 */
export function detectDeviceRole(opts?: {
  userAgent?: string;
  maxTouchPoints?: number;
  innerWidth?: number;
  preferHost?: boolean;
}): DeviceRoleId {
  const stored = loadSelectedDeviceRole();
  if (stored) return stored;

  if (opts?.preferHost) return 'docked';

  const ua = (opts?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase();
  const width =
    opts?.innerWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const touch =
    opts?.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0);

  if (/ring|ble-peripheral/i.test(ua)) return 'edge_io_rings';
  if (touch > 0 && width < 900) return 'handheld_hybrid';
  if (width >= 1400) return 'student_14_5';
  if (width >= 1100) return 'ds_xl_coder';
  if (touch > 0) return 'handheld_hybrid';
  return 'student_14_5';
}

export function applyDeviceRoleToDocument(role: DeviceRoleId): DeviceRoleProfile {
  const profile = getDeviceRoleProfile(role);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const id of Object.keys(DEVICE_ROLE_PROFILES)) {
      root.classList.remove(DEVICE_ROLE_PROFILES[id as DeviceRoleId].cssClass);
    }
    root.classList.add(profile.cssClass);
    root.dataset.deviceRole = profile.id;
    root.dataset.deviceInput = profile.input;
    root.dataset.deviceLayout = profile.layout;
    root.dataset.deviceAudio = profile.audio;
    root.style.setProperty('--hit-target-scale', String(profile.hitTargetScale));
  }
  return profile;
}
