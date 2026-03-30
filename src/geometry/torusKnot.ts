import type { GeometryData, MeshConfig, MeshLevel } from '../contracts/types';

type Vec3 = [number, number, number];

export function getMeshConfig(level: MeshLevel): MeshConfig {
  if (level === 'medium') {
    return { tubularSegments: 96, radialSegments: 20, p: 2, q: 3 };
  }

  if (level === 'ultra') {
    return { tubularSegments: 220, radialSegments: 34, p: 3, q: 5 };
  }

  return { tubularSegments: 160, radialSegments: 28, p: 2, q: 5 };
}

function torusKnotPoint(u: number, p: number, q: number, radius = 1.2): Vec3 {
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const quOverP = (q / p) * u;
  const cosQuOverP = Math.cos(quOverP);

  return [
    radius * (2 + cosQuOverP) * 0.5 * cosU,
    radius * (2 + cosQuOverP) * 0.5 * sinU,
    radius * Math.sin(quOverP) * 0.5,
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

export function createTorusKnotGeometry(level: MeshLevel): GeometryData {
  const { tubularSegments, radialSegments, p, q } = getMeshConfig(level);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const tubeRadius = 0.24;

  for (let i = 0; i <= tubularSegments; i += 1) {
    const u = (i / tubularSegments) * Math.PI * 2 * p;
    const point = torusKnotPoint(u, p, q);
    const nextPoint = torusKnotPoint(u + 0.01, p, q);
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

  const positionsArray = new Float32Array(positions);
  const normalsArray = new Float32Array(normals);
  const interleaved = new Float32Array((positionsArray.length / 3) * 6);

  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < positionsArray.length; sourceIndex += 3, targetIndex += 6) {
    interleaved[targetIndex] = positionsArray[sourceIndex];
    interleaved[targetIndex + 1] = positionsArray[sourceIndex + 1];
    interleaved[targetIndex + 2] = positionsArray[sourceIndex + 2];
    interleaved[targetIndex + 3] = normalsArray[sourceIndex];
    interleaved[targetIndex + 4] = normalsArray[sourceIndex + 1];
    interleaved[targetIndex + 5] = normalsArray[sourceIndex + 2];
  }

  return {
    positions: positionsArray,
    normals: normalsArray,
    interleaved,
    indices: new Uint32Array(indices),
    vertexCount: positionsArray.length / 3,
    triangleCount: indices.length / 3,
  };
}
