export type BenchmarkMode = 'combined' | 'render' | 'compute';
export type RendererMode = 'webgl' | 'webgpu';
export type ComputeMode = 'js' | 'wasm';
export type MeshLevel = 'medium' | 'high' | 'ultra';
export type ActualRenderer = 'WebGL' | 'WebGPU';
export type UploadMode = 'static' | 'dynamic';

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

export interface MeshConfig {
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
}

export interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  interleaved: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

export interface InstanceSystem {
  update(dt: number, time: number): void;
  getRenderData(): Float32Array;
  destroy?(): void;
}

export interface Renderer {
  readonly type: ActualRenderer;
  setInstanceData(instanceData: Float32Array, uploadMode?: UploadMode): void;
  render(width: number, height: number, time: number): void;
  destroy(): void;
}
