import type {
    BenchmarkMode,
    ComputeMode,
    CullingMode,
    MeshLevel,
    OptimizationPath,
    RendererMode,
    ScenePreset,
    SelectOption,
    VisibilityStrategy,
} from '../contracts/types';

export type ControlFieldKey =
  | 'scenePreset'
  | 'meshLevel'
  | 'uniqueModelCount'
  | 'instancesPerModel'
  | 'stressLevel'
  | 'instanceScale'
  | 'benchmarkMode'
  | 'optimizationPath'
  | 'visibilityStrategy'
  | 'requestedRenderer'
  | 'computeMode'
  | 'useRenderBundles'
  | 'lightingEnabled'
  | 'cullingMode';

export interface FieldHelpDefinition {
  label: string;
  description: string;
}

export const FIELD_HELP: Record<ControlFieldKey, FieldHelpDefinition> = {
  scenePreset: {
    label: '测试场景',
    description: '在“唯一模型 / DrawCall 压力”和“静态 + 动态混合”两个场景之间切换：前者主打大量唯一几何与 draw call，后者保留旧的上传策略对照。',
  },
  meshLevel: {
    label: '主模型复杂度',
    description: '控制场景主模型的顶点/三角形复杂度，复杂度越高，单次 draw 的顶点着色负担越重。',
  },
  uniqueModelCount: {
    label: '唯一模型数',
    description: '决定要生成多少份严格唯一的 GeometryData。在主场景里，它基本等价于 draw call 数量上限。',
  },
  instancesPerModel: {
    label: '每模型实例数',
    description: '决定每个唯一模型会带多少实例。它会和“唯一模型数”相乘，直接推高总实体数与 combined 模式下的 update 成本。',
  },
  stressLevel: {
    label: '计算压力',
    description: '每帧把 update 逻辑重复执行多次，用来放大 CPU / WASM 仿真路径的差异。',
  },
  instanceScale: {
    label: '实体缩放',
    description: '控制场景内实体的平均尺寸，既影响视觉密度，也会影响遮挡和 overdraw 感受。',
  },
  benchmarkMode: {
    label: '测试模式',
    description: '决定当前更偏向“综合”“纯渲染”还是“纯计算”，从而放大不同路径的性能差异。',
  },
  optimizationPath: {
    label: '路径策略',
    description: '区分“原始 benchmark 基线”与“允许额外提交优化”的实验路径，避免把不同语义混在一起。',
  },
  visibilityStrategy: {
    label: '可见性策略',
    description: '不同于背面剔除；它会在提交前额外判断哪些实例值得送去渲染。当前 CPU 视锥只能减少上传和绘制，不会自动减少 update 计算。',
  },
  requestedRenderer: {
    label: '渲染后端',
    description: '切换 WebGL 与 WebGPU，比较不同图形 API 在同一场景与同一逻辑下的表现。',
  },
  computeMode: {
    label: '计算实现',
    description: '切换 TypeScript / JS 与 WebAssembly 的实例更新路径，比较 CPU 端仿真的执行差异。',
  },
  useRenderBundles: {
    label: 'RenderBundle',
    description: '仅对 WebGPU 生效。开启后会预录制 draw / bind 等命令；但在极端超大批次数场景下，渲染器会自动回退到逐帧编码以避免反向退化。',
  },
  lightingEnabled: {
    label: '光照着色',
    description: '切换光照计算。关闭后更接近纯色输出，可更直接观察几何与提交开销。',
  },
  cullingMode: {
    label: '剔除模式',
    description: '切换是否进行背面剔除。它会影响片元压力，也可能改变不同后端的默认行为差异。',
  },
};

export const SCENE_PRESET_OPTIONS: ReadonlyArray<SelectOption<ScenePreset>> = [
  {
    value: 'draw-call-stress',
    label: '唯一模型 / DrawCall 压力',
    description: '统一主场景：生成大量严格唯一的 GeometryData，并用“唯一模型数 × 每模型实例数”控制 draw call 和综合压力。',
  },
  {
    value: 'static-dynamic-mix',
    label: '静态 + 动态混合',
    description: '保留旧的旁路场景：静态批次和动态批次同时存在，双滑条的乘积会被当成总实体预算来拆分。',
  },
];

export interface RangeControlConfig {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export const UNIQUE_MODEL_COUNT_RANGE: RangeControlConfig = {
  min: 1,
  max: 5000,
  step: 1,
  defaultValue: 1000,
};

export const INSTANCES_PER_MODEL_RANGE: RangeControlConfig = {
  min: 1,
  max: 100,
  step: 1,
  defaultValue: 1,
};

export const STRESS_LEVEL_OPTIONS: ReadonlyArray<SelectOption<number>> = [
  { value: 1, label: '1x', description: '每帧只更新一次，偏向真实运行路径。' },
  { value: 2, label: '2x', description: '每帧做两次 update，开始放大 CPU / WASM 差异。' },
  { value: 4, label: '4x', description: '默认压力档位，能稳定暴露仿真路径的波动。' },
  { value: 8, label: '8x', description: '极端计算压力，用来故意拉大 update 路径在整帧中的占比。' },
];

export const SCALE_OPTIONS: ReadonlyArray<SelectOption<number>> = [
  { value: 0.5, label: '0.5x', description: '更小的实体，更容易同时容纳更多模型与实例。' },
  { value: 0.8, label: '0.8x', description: '适中的实体尺寸，适合混合场景。' },
  { value: 1, label: '1x', description: '默认尺寸，便于在不同场景之间做横向比较。' },
  { value: 1.2, label: '1.2x', description: '更大的实体，能更快放大遮挡与片元覆盖差异。' },
];

export const MESH_OPTIONS: ReadonlyArray<SelectOption<MeshLevel>> = [
  { value: 'medium', label: '中等网格', description: '顶点数适中，适合在多模型场景下保持较高稳定性。' },
  { value: 'high', label: '高精度网格', description: '默认推荐复杂度，足够放大顶点阶段与缓存组织的差异。' },
  { value: 'ultra', label: '超高精度网格', description: '把单模型复杂度拉满，最容易暴露顶点处理和带宽压力。' },
];

export const RENDERER_OPTIONS: ReadonlyArray<SelectOption<RendererMode>> = [
  { value: 'webgl', label: 'WebGL', description: '成熟稳定、浏览器覆盖广，适合做兼容性与传统渲染路径基线。' },
  { value: 'webgpu', label: 'WebGPU', description: '更现代的 GPU API，能测试 RenderBundle、多批次编码与更细粒度的资源控制。' },
];

export const COMPUTE_OPTIONS: ReadonlyArray<SelectOption<ComputeMode>> = [
  { value: 'js', label: 'TypeScript / JS', description: '直接在 JS / TS 层执行实例更新，更容易读懂，也更容易受解释器和 GC 影响。' },
  { value: 'wasm', label: 'WebAssembly', description: '把实例更新放到 WASM 中执行，更适合观察纯计算内核在高压下的表现。' },
];

export const BENCHMARK_MODE_OPTIONS: ReadonlyArray<SelectOption<BenchmarkMode>> = [
  { value: 'combined', label: '综合模式', description: '同时包含 update 与 render，是最接近日常运行的完整链路。' },
  { value: 'render', label: '纯渲染模式', description: '复用静态实例数据，只放大 draw、shader 和提交组织的差异。' },
  { value: 'compute', label: '纯计算模式', description: '不绘制复杂网格，只比较实例更新路径的纯计算开销。' },
];

export const OPTIMIZATION_PATH_OPTIONS: ReadonlyArray<SelectOption<OptimizationPath>> = [
  {
    value: 'raw',
    label: '原始基线',
    description: '保持当前 benchmark 的原始提交路径，不在送入渲染器前做额外的可见性过滤。',
  },
  {
    value: 'optimized',
    label: '优化路径',
    description: '允许在保留对照关系的前提下启用额外提交优化，例如 CPU 视锥裁剪。',
  },
];

export const VISIBILITY_STRATEGY_OPTIONS: ReadonlyArray<SelectOption<VisibilityStrategy>> = [
  {
    value: 'none',
    label: '关闭',
    description: '不做额外可见性过滤，适合作为 optimized 路径下的空策略基线。',
  },
  {
    value: 'cpu-frustum',
    label: 'CPU 视锥',
    description: '提交前用 CPU + 视锥平面过滤实例包围球，只减少上传和绘制，不会减少前面的 update 计算。',
  },
];

export const CULLING_MODE_OPTIONS: ReadonlyArray<SelectOption<CullingMode>> = [
  { value: 'none', label: '关闭剔除', description: '双面都参与光栅化，更接近当前一致性基线。' },
  { value: 'back', label: '背面剔除', description: '剔除背向三角形，通常能减少片元压力，但会改变默认后端行为。' },
];

export const TOGGLE_OPTION_HELP = {
  useRenderBundles: {
    enabled: '当前已开启 RenderBundle：WebGPU 会尽量复用预录制的 draw / bind 命令。',
    disabled: '当前关闭 RenderBundle：WebGPU 走逐帧编码路径，便于直接比较 CPU 侧命令组织成本。',
  },
  lightingEnabled: {
    enabled: '当前启用光照着色：会计算法线与光线方向，画面更真实，也更贴近实际渲染负载。',
    disabled: '当前关闭光照着色：更偏向纯色输出，适合隔离几何、实例与 draw 组织成本。',
  },
} as const;

export function findOptionByValue<T extends string | number>(
  options: ReadonlyArray<SelectOption<T>>,
  value: T,
): SelectOption<T> | undefined {
  return options.find((option) => option.value === value);
}

export const STORAGE_KEY = 'render-test-mesh-config-v4';

export const DEFAULT_CONFIG = {
  scenePreset: 'draw-call-stress' as ScenePreset,
  benchmarkMode: 'combined' as BenchmarkMode,
  optimizationPath: 'raw' as OptimizationPath,
  visibilityStrategy: 'none' as VisibilityStrategy,
  requestedRenderer: 'webgl' as RendererMode,
  computeMode: 'js' as ComputeMode,
  meshLevel: 'high' as MeshLevel,
  uniqueModelCount: UNIQUE_MODEL_COUNT_RANGE.defaultValue,
  instancesPerModel: INSTANCES_PER_MODEL_RANGE.defaultValue,
  stressLevel: 4,
  instanceScale: 1,
  useRenderBundles: true,
  lightingEnabled: true,
  cullingMode: 'none' as CullingMode,
};
