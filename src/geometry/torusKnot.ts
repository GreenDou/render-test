import type { GeometryData, MeshConfig, MeshLevel } from '../contracts/types';
import { createGeometry } from './primitives';

type Vec3 = [number, number, number];

export interface TorusKnotGeometryConfig extends MeshConfig {
  radius: number;
  tubeRadius: number;
  heightScale: number;
  phaseOffset: number;
}

export function getMeshConfig(level: MeshLevel): TorusKnotGeometryConfig {
  if (level === 'medium') {
    return {
      tubularSegments: 96,
      radialSegments: 20,
      p: 2,
      q: 3,
      radius: 1.2,
      tubeRadius: 0.24,
      heightScale: 1,
      phaseOffset: 0,
    };
  }

  if (level === 'ultra') {
    return {
      tubularSegments: 220,
      radialSegments: 34,
      p: 3,
      q: 5,
      radius: 1.24,
      tubeRadius: 0.24,
      heightScale: 1,
      phaseOffset: 0,
    };
  }

  return {
    tubularSegments: 160,
    radialSegments: 28,
    p: 2,
    q: 5,
    radius: 1.22,
    tubeRadius: 0.24,
    heightScale: 1,
    phaseOffset: 0,
  };
}

function torusKnotPoint(
  u: number,
  p: number,
  q: number,
  radius = 1.2,
  heightScale = 1,
  phaseOffset = 0,
): Vec3 {
  const shiftedU = u + phaseOffset;
  const cosU = Math.cos(shiftedU);
  const sinU = Math.sin(shiftedU);
  const quOverP = (q / p) * shiftedU;
  const cosQuOverP = Math.cos(quOverP);

  return [
    radius * (2 + cosQuOverP) * 0.5 * cosU,
    radius * (2 + cosQuOverP) * 0.5 * sinU,
    radius * Math.sin(quOverP) * 0.5 * heightScale,
  ];
}

function normalize3([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(v: Vec3, scalar: number): Vec3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

export function createTorusKnotGeometryFromConfig(config: TorusKnotGeometryConfig): GeometryData {
  const tubularSegments = Math.max(48, Math.round(config.tubularSegments));
  const radialSegments = Math.max(8, Math.round(config.radialSegments));
  const p = Math.max(2, Math.round(config.p));
  const q = Math.max(3, Math.round(config.q));
  const radius = config.radius;
  const tubeRadius = config.tubeRadius;
  const heightScale = config.heightScale;
  const phaseOffset = config.phaseOffset;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i += 1) {
    const u = (i / tubularSegments) * Math.PI * 2 * p;
    const point = torusKnotPoint(u, p, q, radius, heightScale, phaseOffset);
    const nextPoint = torusKnotPoint(u + 0.01, p, q, radius, heightScale, phaseOffset);
    const tangent = normalize3(sub3(nextPoint, point));
    const normal = normalize3(add3(nextPoint, point));
    const binormal = normalize3(cross3(tangent, normal));
    const fixedNormal = normalize3(cross3(binormal, tangent));

    for (let j = 0; j <= radialSegments; j += 1) {
      const v = (j / radialSegments) * Math.PI * 2;
      const radial = add3(mul3(fixedNormal, Math.cos(v)), mul3(binormal, Math.sin(v)));
      const position = add3(point, mul3(radial, tubeRadius));
      const unitNormal = normalize3(radial);

      positions.push(position[0], position[1], position[2]);
      normals.push(unitNormal[0], unitNormal[1], unitNormal[2]);
    }
  }

  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + j + 1;
      const d = (radialSegments + 1) * i + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  return createGeometry(positions, normals, indices);
}

export function createTorusKnotGeometry(level: MeshLevel): GeometryData {
  return createTorusKnotGeometryFromConfig(getMeshConfig(level));
}
