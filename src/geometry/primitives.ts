import type { GeometryBounds, GeometryData, MeshLevel } from '../contracts/types';

type Vec3 = [number, number, number];

export interface BoxGeometryConfig {
  width: number;
  height: number;
  depth: number;
}

export interface SphereGeometryConfig {
  latitude: number;
  longitude: number;
  radiusX: number;
  radiusY?: number;
  radiusZ?: number;
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function computeBounds(positions: Float32Array): GeometryBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  let radiusSquared = 0;

  for (let index = 0; index < positions.length; index += 3) {
    const dx = positions[index] - centerX;
    const dy = positions[index + 1] - centerY;
    const dz = positions[index + 2] - centerZ;
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [centerX, centerY, centerZ],
    radius: Math.sqrt(radiusSquared),
  };
}

function createIndexData(indices: readonly number[], vertexCount: number): GeometryData['indices'] {
  return vertexCount <= 0xffff ? new Uint16Array(indices) : new Uint32Array(indices);
}

export function createGeometry(positions: number[], normals: number[], indices: number[]): GeometryData {
  const positionsArray = new Float32Array(positions);
  const normalsArray = new Float32Array(normals);
  const interleaved = new Float32Array((positionsArray.length / 3) * 6);
  const vertexCount = positionsArray.length / 3;

  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < positionsArray.length; sourceIndex += 3, targetIndex += 6) {
    interleaved[targetIndex] = positionsArray[sourceIndex];
    interleaved[targetIndex + 1] = positionsArray[sourceIndex + 1];
    interleaved[targetIndex + 2] = positionsArray[sourceIndex + 2];
    interleaved[targetIndex + 3] = normalsArray[sourceIndex];
    interleaved[targetIndex + 4] = normalsArray[sourceIndex + 1];
    interleaved[targetIndex + 5] = normalsArray[sourceIndex + 2];
  }

  const indexData = createIndexData(indices, vertexCount);

  return {
    positions: positionsArray,
    normals: normalsArray,
    interleaved,
    indices: indexData,
    indexFormat: indexData instanceof Uint16Array ? 'uint16' : 'uint32',
    vertexCount,
    triangleCount: indices.length / 3,
    bounds: computeBounds(positionsArray),
  };
}

export function createBoxGeometry({ width, height, depth }: BoxGeometryConfig): GeometryData {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const faces: Array<{ normal: Vec3; corners: [Vec3, Vec3, Vec3, Vec3] }> = [
    {
      normal: [0, 0, 1],
      corners: [
        [-halfWidth, -halfHeight, halfDepth],
        [halfWidth, -halfHeight, halfDepth],
        [halfWidth, halfHeight, halfDepth],
        [-halfWidth, halfHeight, halfDepth],
      ],
    },
    {
      normal: [0, 0, -1],
      corners: [
        [halfWidth, -halfHeight, -halfDepth],
        [-halfWidth, -halfHeight, -halfDepth],
        [-halfWidth, halfHeight, -halfDepth],
        [halfWidth, halfHeight, -halfDepth],
      ],
    },
    {
      normal: [0, 1, 0],
      corners: [
        [-halfWidth, halfHeight, halfDepth],
        [halfWidth, halfHeight, halfDepth],
        [halfWidth, halfHeight, -halfDepth],
        [-halfWidth, halfHeight, -halfDepth],
      ],
    },
    {
      normal: [0, -1, 0],
      corners: [
        [-halfWidth, -halfHeight, -halfDepth],
        [halfWidth, -halfHeight, -halfDepth],
        [halfWidth, -halfHeight, halfDepth],
        [-halfWidth, -halfHeight, halfDepth],
      ],
    },
    {
      normal: [1, 0, 0],
      corners: [
        [halfWidth, -halfHeight, halfDepth],
        [halfWidth, -halfHeight, -halfDepth],
        [halfWidth, halfHeight, -halfDepth],
        [halfWidth, halfHeight, halfDepth],
      ],
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [-halfWidth, -halfHeight, -halfDepth],
        [-halfWidth, -halfHeight, halfDepth],
        [-halfWidth, halfHeight, halfDepth],
        [-halfWidth, halfHeight, -halfDepth],
      ],
    },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  faces.forEach((face, faceIndex) => {
    const vertexStart = faceIndex * 4;
    for (const corner of face.corners) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    indices.push(vertexStart, vertexStart + 1, vertexStart + 2, vertexStart, vertexStart + 2, vertexStart + 3);
  });

  return createGeometry(positions, normals, indices);
}

export function createCubeGeometry(size = 1.9): GeometryData {
  return createBoxGeometry({ width: size, height: size, depth: size });
}

export function getSphereGeometryConfig(level: MeshLevel): SphereGeometryConfig {
  if (level === 'medium') {
    return { latitude: 14, longitude: 18, radiusX: 1.05 };
  }
  if (level === 'ultra') {
    return { latitude: 24, longitude: 32, radiusX: 1.12 };
  }

  return { latitude: 18, longitude: 24, radiusX: 1.08 };
}

export function createSphereGeometryFromConfig(config: SphereGeometryConfig): GeometryData {
  const latitude = Math.max(6, Math.round(config.latitude));
  const longitude = Math.max(8, Math.round(config.longitude));
  const radiusX = config.radiusX;
  const radiusY = config.radiusY ?? radiusX;
  const radiusZ = config.radiusZ ?? radiusX;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let latIndex = 0; latIndex <= latitude; latIndex += 1) {
    const v = latIndex / latitude;
    const theta = v * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lonIndex = 0; lonIndex <= longitude; lonIndex += 1) {
      const u = lonIndex / longitude;
      const phi = u * Math.PI * 2;
      const unitX = Math.cos(phi) * sinTheta;
      const unitY = cosTheta;
      const unitZ = Math.sin(phi) * sinTheta;
      const normal = normalize([unitX / radiusX, unitY / radiusY, unitZ / radiusZ]);

      positions.push(unitX * radiusX, unitY * radiusY, unitZ * radiusZ);
      normals.push(normal[0], normal[1], normal[2]);
    }
  }

  for (let latIndex = 0; latIndex < latitude; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < longitude; lonIndex += 1) {
      const first = latIndex * (longitude + 1) + lonIndex;
      const second = first + longitude + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return createGeometry(positions, normals, indices);
}

export function createSphereGeometry(level: MeshLevel): GeometryData {
  return createSphereGeometryFromConfig(getSphereGeometryConfig(level));
}
