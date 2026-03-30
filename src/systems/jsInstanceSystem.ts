import {
    FORCE_BASE,
    FORCE_BIAS,
    FORCE_CAP,
    INSTANCE_BOUNDS,
    INSTANCE_STRIDE,
    PHASE_SPEED,
    RENDER_INSTANCE_STRIDE,
    SWIRL_STRENGTH,
    VELOCITY_DAMPING,
    VERTICAL_WAVE_STRENGTH,
    computeVerticalWave,
    wrapPhase,
} from '../contracts/renderSpec';
import type { InstanceSystem } from '../contracts/types';

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createInstanceState(count: number, scaleBase: number): Float32Array {
  const random = mulberry32(20260329 + count);
  const data = new Float32Array(count * INSTANCE_STRIDE);

  for (let index = 0; index < count; index += 1) {
    const base = index * INSTANCE_STRIDE;
    const radius = 2.6 + random() * 3.6;
    const theta = random() * Math.PI * 2;
    const phi = random() * Math.PI * 2;

    data[base] = Math.cos(theta) * Math.sin(phi) * radius;
    data[base + 1] = Math.cos(phi) * radius * 0.65;
    data[base + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    data[base + 3] = (random() * 2 - 1) * 0.8;
    data[base + 4] = (random() * 2 - 1) * 0.8;
    data[base + 5] = (random() * 2 - 1) * 0.8;
    data[base + 6] = random() * Math.PI * 2;
    data[base + 7] = scaleBase * (0.65 + random() * 0.9);
  }

  return data;
}

export function packRenderData(
  source: Float32Array,
  count: number,
  target: Float32Array = new Float32Array(count * RENDER_INSTANCE_STRIDE),
): Float32Array {
  for (let index = 0; index < count; index += 1) {
    const sourceBase = index * INSTANCE_STRIDE;
    const targetBase = index * RENDER_INSTANCE_STRIDE;
    target[targetBase] = source[sourceBase];
    target[targetBase + 1] = source[sourceBase + 1];
    target[targetBase + 2] = source[sourceBase + 2];
    target[targetBase + 3] = source[sourceBase + 6];
    target[targetBase + 4] = source[sourceBase + 7];
  }

  return target;
}

export function updateInstancesJS(
  buffer: Float32Array,
  count: number,
  dt: number,
  _time: number,
  bounds = INSTANCE_BOUNDS,
): void {
  for (let index = 0; index < count; index += 1) {
    const base = index * INSTANCE_STRIDE;
    let x = buffer[base];
    let y = buffer[base + 1];
    let z = buffer[base + 2];
    let vx = buffer[base + 3];
    let vy = buffer[base + 4];
    let vz = buffer[base + 5];
    let phase = buffer[base + 6];

    // @panel-start js-update
    const dx = -x;
    const dy = -y;
    const dz = -z;
    const distanceSquared = dx * dx + dy * dy + dz * dz + FORCE_BIAS;
    const inverseDistance = 1 / Math.sqrt(distanceSquared);
    const clampedForce = Math.min(FORCE_CAP, FORCE_BASE / distanceSquared);
    const wave = computeVerticalWave(phase);

    vx += (dx * inverseDistance * clampedForce + dz * SWIRL_STRENGTH) * dt;
    vy += (dy * inverseDistance * clampedForce + wave * VERTICAL_WAVE_STRENGTH) * dt;
    vz += (dz * inverseDistance * clampedForce - dx * SWIRL_STRENGTH) * dt;

    vx *= VELOCITY_DAMPING;
    vy *= VELOCITY_DAMPING;
    vz *= VELOCITY_DAMPING;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    phase = wrapPhase(phase + dt * PHASE_SPEED);
    // @panel-end js-update

    if (Math.abs(x) > bounds) vx = -vx;
    if (Math.abs(y) > bounds) vy = -vy;
    if (Math.abs(z) > bounds) vz = -vz;

    buffer[base] = x;
    buffer[base + 1] = y;
    buffer[base + 2] = z;
    buffer[base + 3] = vx;
    buffer[base + 4] = vy;
    buffer[base + 5] = vz;
    buffer[base + 6] = phase;
  }
}

export class JSInstanceSystem implements InstanceSystem {
  private readonly state: Float32Array;
  private readonly renderData: Float32Array;

  constructor(private readonly count: number, scaleBase: number) {
    this.state = createInstanceState(count, scaleBase);
    this.renderData = new Float32Array(count * RENDER_INSTANCE_STRIDE);
  }

  update(dt: number, time: number): void {
    updateInstancesJS(this.state, this.count, dt, time);
  }

  getRenderData(): Float32Array {
    return packRenderData(this.state, this.count, this.renderData);
  }
}
