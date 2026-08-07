import type { DeviceRoleId } from '@beatlink/shared';

export type DeviceInputProfile =
  | 'keyboard_trackpad'
  | 'gamepad'
  | 'keyboard'
  | 'ring_gesture'
  | 'touch_hybrid';

export type DeviceLayoutProfile =
  | 'landscape_classroom'
  | 'handheld'
  | 'dual_screen_debug'
  | 'peripheral_only'
  | 'docked_tv';

export type DeviceAudioProfile =
  | 'procedural_metronome'
  | 'muted_default'
  | 'none'
  | 'host_speakers';

export interface DeviceRoleProfile {
  id: DeviceRoleId;
  label: string;
  input: DeviceInputProfile;
  layout: DeviceLayoutProfile;
  audio: DeviceAudioProfile;
  /** CSS class applied to document root. */
  cssClass: string;
  /** Hit-target scale hint for controllers. */
  hitTargetScale: number;
  /** Prefer reduced motion in classroom / shared displays. */
  preferReduceMotion: boolean;
  hints: string[];
}

/** Canonical G2-C6 device UX matrix for beatlink-party (+ docked). */
export const DEVICE_ROLE_PROFILES: Record<DeviceRoleId, DeviceRoleProfile> = {
  student_14_5: {
    id: 'student_14_5',
    label: 'Student 14.5"',
    input: 'keyboard_trackpad',
    layout: 'landscape_classroom',
    audio: 'procedural_metronome',
    cssClass: 'device-student-14-5',
    hitTargetScale: 1.1,
    preferReduceMotion: true,
    hints: ['Landscape classroom layout', 'Keyboard/trackpad primary', 'Procedural metronome audio'],
  },
  handheld_hybrid: {
    id: 'handheld_hybrid',
    label: 'Handheld Hybrid',
    input: 'gamepad',
    layout: 'handheld',
    audio: 'procedural_metronome',
    cssClass: 'device-handheld-hybrid',
    hitTargetScale: 1.25,
    preferReduceMotion: false,
    hints: ['Portrait/handheld layout', 'Gamepad / large tap targets', 'Procedural metronome'],
  },
  ds_xl_coder: {
    id: 'ds_xl_coder',
    label: 'DS XL Coder',
    input: 'keyboard',
    layout: 'dual_screen_debug',
    audio: 'muted_default',
    cssClass: 'device-ds-xl-coder',
    hitTargetScale: 1,
    preferReduceMotion: false,
    hints: ['Dual-pane debug layout', 'Keyboard input', 'Audio muted by default'],
  },
  edge_io_rings: {
    id: 'edge_io_rings',
    label: 'Edge I/O Rings',
    input: 'ring_gesture',
    layout: 'peripheral_only',
    audio: 'none',
    cssClass: 'device-edge-io-rings',
    hitTargetScale: 1.4,
    preferReduceMotion: true,
    hints: ['Peripheral-only chrome', 'Ring gesture confirm', 'No local audio'],
  },
  docked: {
    id: 'docked',
    label: 'Docked / TV Host',
    input: 'touch_hybrid',
    layout: 'docked_tv',
    audio: 'host_speakers',
    cssClass: 'device-docked',
    hitTargetScale: 1.15,
    preferReduceMotion: false,
    hints: ['TV / docked host stage', 'Large UI chrome', 'Host speaker metronome'],
  },
};

export const DEVICE_ROLE_IDS = Object.keys(DEVICE_ROLE_PROFILES) as DeviceRoleId[];
