export type BenchmarkMode = 'combined' | 'render' | 'compute';
export type ScenePreset = 'draw-call-stress' | 'static-dynamic-mix';
export type RendererMode = 'webgl' | 'webgpu';
export type ComputeMode = 'js' | 'wasm';
export type OptimizationPath = 'raw' | 'optimized';
export type VisibilityStrategy = 'none' | 'cpu-frustum';
export type MeshLevel = 'medium' | 'high' | 'ultra';
export type CullingMode = 'none' | 'back';
export type ActualRenderer = 'WebGL' | 'WebGPU';
export type UploadMode = 'static' | 'dynamic';
export type GeometryIndexFormat = 'uint16' | 'uint32';
export type GeometryIndexData = Uint16Array | Uint32Array;

export interface GeometryBounds {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  center: readonly [number, number, number];
  radius: number;
}

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
}

export interface MeshConfig {
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
  radius?: number;
  tubeRadius?: number;
  heightScale?: number;
  phaseOffset?: number;
}

export interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  interleaved: Float32Array;
  indices: GeometryIndexData;
  indexFormat: GeometryIndexFormat;
  vertexCount: number;
  triangleCount: number;
  bounds: GeometryBounds;
}

export interface InstanceSystem {
  update(dt: number, time: number): void;
  getRenderData(): Float32Array;
  destroy?(): void;
}

export interface RenderOptions {
  lightingEnabled: boolean;
  cullingMode: CullingMode;
}

export interface RenderBatch {
  id: string;
  label: string;
  geometry: GeometryData;
  instanceData: Float32Array;
  uploadMode?: UploadMode;
}

export interface Renderer {
  readonly type: ActualRenderer;
  setSceneBatches(batches: readonly RenderBatch[]): void;
  render(width: number, height: number, time: number): void;
  destroy(): void;
}
