export const INSTANCE_STRIDE = 8;
export const RENDER_INSTANCE_STRIDE = 5;
export const INSTANCE_BOUNDS = 8;

export const CANVAS_DPR_CAP = 1.5;

export const CLEAR_COLOR = {
  r: 0.03,
  g: 0.05,
  b: 0.09,
  a: 1,
} as const;

export const CAMERA_EYE = [0, 0, 16] as const;
export const CAMERA_CENTER = [0, 0, 0] as const;
export const CAMERA_UP = [0, 1, 0] as const;
export const LIGHT_DIRECTION = [0.5, 0.7, 0.8] as const;

export const FORCE_BIAS = 0.05;
export const FORCE_BASE = 18;
export const FORCE_CAP = 24;
export const SWIRL_STRENGTH = 0.35;
export const VELOCITY_DAMPING = 0.992;

export const PHASE_SPEED = 0.8;
export const PI = Math.PI;
export const HALF_PI = Math.PI * 0.5;
export const PHASE_WRAP = Math.PI * 2;
export const VERTICAL_WAVE_STRENGTH = 0.45;

export const ROTATION_SPEED = 0.8;
export const ROTATION_TILT_RATIO = 0.7;
export const COLOR_OFFSETS = [0, 2.1, 4.2] as const;
export const COLOR_TIME_SPEED = 0.2;

export function wrapPhase(phase: number): number {
  return phase >= PHASE_WRAP ? phase - PHASE_WRAP : phase;
}

export function computeVerticalWave(phase: number): number {
  return (PI - Math.abs(phase - PI)) - HALF_PI;
}
