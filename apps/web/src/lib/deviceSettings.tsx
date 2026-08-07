import { useEffect, useState } from 'react';
import type { AccessibilitySettings, DeviceRoleId } from '@beatlink/shared';
import {
  applyAccessibilityToDocument,
  loadAccessibilitySettings,
  saveAccessibilitySettings,
} from '@beatlink/shared';
import {
  applyDeviceRoleToDocument,
  detectDeviceRole,
  DEVICE_ROLE_IDS,
  DEVICE_ROLE_PROFILES,
  saveSelectedDeviceRole,
  type DeviceRoleProfile,
} from '@beatlink/device-ux';

export function useDeviceRole(preferHost = false): {
  role: DeviceRoleId;
  profile: DeviceRoleProfile;
  setRole: (id: DeviceRoleId) => void;
  roles: DeviceRoleId[];
} {
  const [role, setRoleState] = useState<DeviceRoleId>(() =>
    detectDeviceRole({ preferHost }),
  );

  useEffect(() => {
    applyDeviceRoleToDocument(role);
  }, [role]);

  function setRole(id: DeviceRoleId) {
    saveSelectedDeviceRole(id);
    setRoleState(id);
  }

  return {
    role,
    profile: DEVICE_ROLE_PROFILES[role],
    setRole,
    roles: DEVICE_ROLE_IDS,
  };
}

export function useAccessibility(): {
  settings: AccessibilitySettings;
  update: (patch: Partial<AccessibilitySettings>) => void;
} {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    loadAccessibilitySettings(),
  );

  useEffect(() => {
    applyAccessibilityToDocument(settings);
    saveAccessibilitySettings(settings);
  }, [settings]);

  return {
    settings,
    update: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
  };
}

export function DeviceRolePicker({
  role,
  roles,
  onChange,
}: {
  role: DeviceRoleId;
  roles: DeviceRoleId[];
  onChange: (id: DeviceRoleId) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label">Device role</span>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as DeviceRoleId)}
        style={{ width: '100%' }}
      >
        {roles.map((id) => (
          <option key={id} value={id}>
            {DEVICE_ROLE_PROFILES[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AccessibilityPanel({
  settings,
  update,
}: {
  settings: AccessibilitySettings;
  update: (patch: Partial<AccessibilitySettings>) => void;
}) {
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <p className="label">Accessibility</p>
      <label className="row" style={{ gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={settings.reduceMotion}
          onChange={(e) => update({ reduceMotion: e.target.checked })}
        />
        Reduce motion
      </label>
      <label className="row" style={{ gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={settings.highContrast}
          onChange={(e) => update({ highContrast: e.target.checked })}
        />
        High contrast
      </label>
      <label className="row" style={{ gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={settings.largerHitTargets}
          onChange={(e) => update({ largerHitTargets: e.target.checked })}
        />
        Larger hit targets
      </label>
    </div>
  );
}
