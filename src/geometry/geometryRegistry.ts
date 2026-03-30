import type { GeometryData, MeshLevel } from '../contracts/types';
import {
    createBoxGeometry,
    createSphereGeometryFromConfig,
    getSphereGeometryConfig,
} from './primitives';
import {
    createTorusKnotGeometryFromConfig,
    getMeshConfig as getTorusKnotConfig,
} from './torusKnot';

export interface GeometryCatalogEntry {
  id: string;
  label: string;
  family: 'torus-knot' | 'ellipsoid' | 'box';
  geometry: GeometryData;
}

const geometryCatalogCache = new Map<MeshLevel, GeometryCatalogEntry[]>();

function hash32(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1 ^ salt);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

function hash01(index: number, salt: number): number {
  return hash32(index, salt) / 0xffffffff;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    [left, right] = [right, left % right];
  }
  return left || 1;
}

function createTorusVariant(meshLevel: MeshLevel, index: number): GeometryData {
  const base = getTorusKnotConfig(meshLevel);
  const tubularVariance = meshLevel === 'medium' ? 18 : meshLevel === 'ultra' ? 34 : 26;
  const radialVariance = meshLevel === 'medium' ? 6 : meshLevel === 'ultra' ? 10 : 8;
  const epsilon = (index + 1) * 0.00001;
  const p = 2 + (index % 7);
  let q = 3 + ((index * 5) % 11);
  while (gcd(p, q) !== 1) {
    q += 1;
  }

  return createTorusKnotGeometryFromConfig({
    tubularSegments: clampInt(
      base.tubularSegments + ((index * 11) % (tubularVariance * 2 + 1)) - tubularVariance,
      Math.max(48, base.tubularSegments - tubularVariance),
      base.tubularSegments + tubularVariance,
    ),
    radialSegments: clampInt(
      base.radialSegments + ((index * 7) % (radialVariance * 2 + 1)) - radialVariance,
      Math.max(10, base.radialSegments - radialVariance),
      base.radialSegments + radialVariance,
    ),
    p,
    q,
    radius: base.radius + hash01(index, 17) * 0.52 + epsilon,
    tubeRadius: (base.tubeRadius ?? 0.24) * (0.74 + hash01(index, 19) * 0.9) + epsilon * 0.4,
    heightScale: (base.heightScale ?? 1) * (0.72 + hash01(index, 23) * 0.74),
    phaseOffset: hash01(index, 29) * Math.PI * 2,
  });
}

function createEllipsoidVariant(meshLevel: MeshLevel, index: number): GeometryData {
  const base = getSphereGeometryConfig(meshLevel);
  const latitudeVariance = meshLevel === 'medium' ? 4 : meshLevel === 'ultra' ? 7 : 5;
  const longitudeVariance = meshLevel === 'medium' ? 6 : meshLevel === 'ultra' ? 9 : 7;
  const epsilon = (index + 1) * 0.00001;

  return createSphereGeometryFromConfig({
    latitude: clampInt(
      base.latitude + ((index * 13) % (latitudeVariance * 2 + 1)) - latitudeVariance,
      10,
      base.latitude + latitudeVariance,
    ),
    longitude: clampInt(
      base.longitude + ((index * 17) % (longitudeVariance * 2 + 1)) - longitudeVariance,
      12,
      base.longitude + longitudeVariance,
    ),
    radiusX: base.radiusX * (0.82 + hash01(index, 31) * 0.88) + epsilon,
    radiusY: base.radiusX * (0.78 + hash01(index, 37) * 0.94) + epsilon * 0.7,
    radiusZ: base.radiusX * (0.76 + hash01(index, 41) * 0.98) + epsilon * 0.5,
  });
}

function createBoxVariant(index: number): GeometryData {
  const epsilon = (index + 1) * 0.00001;
  return createBoxGeometry({
    width: 0.92 + hash01(index, 43) * 1.36 + epsilon,
    height: 0.82 + hash01(index, 47) * 1.24 + epsilon * 0.8,
    depth: 0.86 + hash01(index, 53) * 1.3 + epsilon * 0.6,
  });
}

function createGeometryCatalogEntry(meshLevel: MeshLevel, index: number): GeometryCatalogEntry {
  const familyIndex = index % 3;

  if (familyIndex === 0) {
    return {
      id: `torus-${meshLevel}-${index}`,
      label: `Torus Knot #${index + 1}`,
      family: 'torus-knot',
      geometry: createTorusVariant(meshLevel, index),
    };
  }

  if (familyIndex === 1) {
    return {
      id: `ellipsoid-${meshLevel}-${index}`,
      label: `Ellipsoid #${index + 1}`,
      family: 'ellipsoid',
      geometry: createEllipsoidVariant(meshLevel, index),
    };
  }

  return {
    id: `box-${meshLevel}-${index}`,
    label: `Box #${index + 1}`,
    family: 'box',
    geometry: createBoxVariant(index),
  };
}

function ensureGeometryCatalog(meshLevel: MeshLevel, count: number): GeometryCatalogEntry[] {
  const cachedEntries = geometryCatalogCache.get(meshLevel) ?? [];
  while (cachedEntries.length < count) {
    cachedEntries.push(createGeometryCatalogEntry(meshLevel, cachedEntries.length));
  }

  geometryCatalogCache.set(meshLevel, cachedEntries);
  return cachedEntries;
}

export function getUniqueGeometryCatalog(meshLevel: MeshLevel, count: number): readonly GeometryCatalogEntry[] {
  return ensureGeometryCatalog(meshLevel, count).slice(0, count);
}