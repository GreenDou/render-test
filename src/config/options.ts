import type { BenchmarkMode, ComputeMode, MeshLevel, RendererMode, SelectOption } from '../contracts/types';

export const INSTANCE_OPTIONS = [100, 300, 600, 1200, 3000, 10000] as const;
export const STRESS_LEVEL_OPTIONS = [1, 2, 4, 8] as const;
export const SCALE_OPTIONS = [0.5, 0.8, 1, 1.2] as const;

export const MESH_OPTIONS: ReadonlyArray<SelectOption<MeshLevel>> = [
  { value: 'medium', label: '中等网格' },
  { value: 'high', label: '高精度网格' },
  { value: 'ultra', label: '超高精度网格' },
];

export const RENDERER_OPTIONS: ReadonlyArray<SelectOption<RendererMode>> = [
  { value: 'webgl', label: 'WebGL' },
  { value: 'webgpu', label: 'WebGPU' },
];

export const COMPUTE_OPTIONS: ReadonlyArray<SelectOption<ComputeMode>> = [
  { value: 'js', label: 'TypeScript / JS' },
  { value: 'wasm', label: 'WebAssembly' },
];

export const BENCHMARK_MODE_OPTIONS: ReadonlyArray<SelectOption<BenchmarkMode>> = [
  { value: 'combined', label: '综合模式' },
  { value: 'render', label: '纯渲染模式' },
  { value: 'compute', label: '纯计算模式' },
];

export const STORAGE_KEY = 'render-test-mesh-config-v2';

export const DEFAULT_CONFIG = {
  benchmarkMode: 'combined' as BenchmarkMode,
  requestedRenderer: 'webgl' as RendererMode,
  computeMode: 'js' as ComputeMode,
  meshLevel: 'high' as MeshLevel,
  instanceCount: 600,
  stressLevel: 4,
  instanceScale: 1,
};
