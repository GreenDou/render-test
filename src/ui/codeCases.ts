import appControllerSource from '../app/controller.ts?raw';
import type { DisplayRenderer } from '../app/types';
import type {
    BenchmarkMode,
    ComputeMode,
    CullingMode,
    OptimizationPath,
    RendererMode,
    ScenePreset,
    VisibilityStrategy,
} from '../contracts/types';
import webglRendererSource from '../renderers/shaders/webgl.vert.glsl?raw';
import webgpuRendererSource from '../renderers/shaders/webgpu.wgsl?raw';
import webgpuRendererImplSource from '../renderers/webgpuRenderer.ts?raw';
import sceneFactorySource from '../scenes/sceneFactory.ts?raw';
import jsInstanceSystemSource from '../systems/jsInstanceSystem.ts?raw';
import wasmInstanceUpdateSource from '../wasm/instance-update.wat?raw';

export type CodeLanguage = 'glsl' | 'wgsl' | 'ts' | 'wat';

export interface CodePanelSection {
  title: string;
  sourceLabel: string;
  language: CodeLanguage;
  description: string;
  code: string;
}

export interface CodePanelData {
  intro: string;
  notes: string[];
  sections: CodePanelSection[];
}

export interface CodePanelContext {
  benchmarkMode: BenchmarkMode;
  requestedRenderer: RendererMode;
  actualRenderer: DisplayRenderer;
  computeMode: ComputeMode;
  useRenderBundles: boolean;
  scenePreset: ScenePreset;
  uniqueModelCount: number;
  instancesPerModel: number;
  optimizationPath: OptimizationPath;
  visibilityStrategy: VisibilityStrategy;
  lightingEnabled: boolean;
  cullingMode: CullingMode;
}

function extractSnippet(source: string, marker: string): string {
  const startMarker = `@panel-start ${marker}`;
  const endMarker = `@panel-end ${marker}`;
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return source.trim();
  }

  const snippetStart = source.indexOf('\n', startIndex);
  return source.slice(snippetStart + 1, endIndex).trim();
}

function getRenderMode(context: CodePanelContext): RendererMode {
  if (context.actualRenderer === 'WebGPU') {
    return 'webgpu';
  }

  if (context.actualRenderer === 'WebGL') {
    return 'webgl';
  }

  return context.requestedRenderer;
}

function getSceneTitle(scenePreset: ScenePreset): string {
  switch (scenePreset) {
    case 'static-dynamic-mix':
      return '场景组织 · 静态 + 动态混合';
    default:
      return '场景组织 · 唯一模型 / DrawCall 压力';
  }
}

function getSceneDescription(context: CodePanelContext): string {
  switch (context.scenePreset) {
    case 'static-dynamic-mix':
      return `当前案例保留静态背景批次和动态主批次；双滑条的乘积 ${context.uniqueModelCount.toLocaleString('zh-CN')} × ${context.instancesPerModel.toLocaleString('zh-CN')} 会被当成总实体预算。`;
    default:
      return `当前案例会生成 ${context.uniqueModelCount.toLocaleString('zh-CN')} 个严格唯一的 GeometryData，每个模型 ${context.instancesPerModel.toLocaleString('zh-CN')} 个实例，重点观察大量 draw call 下的批次组织与提交成本。`;
  }
}

const sceneSections = {
  preset: {
    sourceLabel: 'src/scenes/sceneFactory.ts',
    language: 'ts' as const,
    code: extractSnippet(sceneFactorySource, 'scene-preset'),
  },
  batchTransform: {
    title: '场景批次变换 · 实例偏移/缩放',
    sourceLabel: 'src/scenes/sceneFactory.ts',
    language: 'ts' as const,
    description: '多批次场景会在共享实例布局上附加偏移与缩放，让不同模型组共享同一套实例数据格式，但仍呈现不同的空间分布。',
    code: extractSnippet(sceneFactorySource, 'scene-batch-transform'),
  },
};

const visibilitySections = {
  cpuFrustum: {
    title: 'Visibility Strategy · CPU 视锥',
    sourceLabel: 'src/app/controller.ts',
    language: 'ts' as const,
    description: '优化路径会在提交给渲染器前，根据相机视锥和平移后的实例包围球过滤不可见实例。它能减少上传和绘制，但不会减少 update() 计算。',
    code: extractSnippet(appControllerSource, 'cpu-frustum-visibility'),
  },
};

const renderSections = {
  webgl: {
    title: 'Render Path · WebGL',
    sourceLabel: 'src/renderers/shaders/webgl.vert.glsl',
    language: 'glsl' as const,
    description: 'WebGL 顶点路径按统一规范读取实例位移、旋转与缩放，保证与 WebGPU 使用相同的几何语义。',
    code: extractSnippet(webglRendererSource, 'webgl-render'),
  },
  webgpu: {
    title: 'Render Path · WebGPU',
    sourceLabel: 'src/renderers/shaders/webgpu.wgsl',
    language: 'wgsl' as const,
    description: 'WebGPU WGSL 使用与 WebGL 对齐的实例数据布局、旋转逻辑和着色输入，确保两条渲染路径输出一致。',
    code: extractSnippet(webgpuRendererSource, 'webgpu-render'),
  },
  webgpuBundle: {
    title: 'Render Path · WebGPU RenderBundle',
    sourceLabel: 'src/renderers/webgpuRenderer.ts',
    language: 'ts' as const,
    description: '开启 RenderBundle 后，会把每个批次的 draw / bind 命令提前录制，在多批次场景里尤其适合观察命令编码抖动是否下降。',
    code: extractSnippet(webgpuRendererImplSource, 'webgpu-bundle'),
  },
};

const computeSections = {
  js: {
    title: 'Compute Path · TypeScript / JS',
    sourceLabel: 'src/systems/jsInstanceSystem.ts',
    language: 'ts' as const,
    description: 'TypeScript 版本在 CPU 上更新实例状态，再打包成统一的渲染实例格式。',
    code: extractSnippet(jsInstanceSystemSource, 'js-update'),
  },
  wasm: {
    title: 'Compute Path · WebAssembly',
    sourceLabel: 'src/wasm/instance-update.wat',
    language: 'wat' as const,
    description: 'WAT 源文件编译为 WASM，沿用同一套更新公式，只把执行路径从 JS 替换成 WebAssembly。',
    code: extractSnippet(wasmInstanceUpdateSource, 'wasm-update'),
  },
};

function getSceneNotes(context: CodePanelContext): string[] {
  const totalEntities = context.uniqueModelCount * context.instancesPerModel;

  switch (context.scenePreset) {
    case 'static-dynamic-mix':
      return [
        `当前场景会把 ${totalEntities.toLocaleString('zh-CN')} 的总实体预算拆成静态背景和动态主批次，因此更适合观察上传模式与 draw 组织的组合差异。`,
      ];
    default:
      return [
        `当前场景会生成 ${context.uniqueModelCount.toLocaleString('zh-CN')} 个唯一模型批次，因此 draw call 上限基本会跟唯一模型数同步增长。`,
        `每个唯一模型当前分配 ${context.instancesPerModel.toLocaleString('zh-CN')} 个实例，总实体约 ${totalEntities.toLocaleString('zh-CN')}。`,
      ];
  }
}

export function getCodePanelData(context: CodePanelContext): CodePanelData {
  const sections: CodePanelSection[] = [];
  const notes: string[] = [...getSceneNotes(context)];

  if (context.optimizationPath === 'raw') {
    notes.unshift('当前走 raw 基线路径：不会在提交前额外过滤实例，适合和后续优化路径做一一对照。');
  } else if (context.benchmarkMode === 'compute') {
    notes.unshift('当前已切到 optimized 路径，但处于纯计算模式，没有绘制提交可裁剪，因此可见性策略暂不生效。');
  } else if (context.visibilityStrategy === 'cpu-frustum') {
    notes.unshift('当前启用了 CPU 视锥裁剪：提交前会按实例包围球过滤不可见对象，只减少上传和绘制，不会减少前面的 update() 计算。');
  } else {
    notes.unshift('当前已切到 optimized 路径，但可见性策略仍为 none；这能作为启用高级策略前的空优化基线。');
  }

  sections.push({
    title: getSceneTitle(context.scenePreset),
    sourceLabel: sceneSections.preset.sourceLabel,
    language: sceneSections.preset.language,
    description: getSceneDescription(context),
    code: sceneSections.preset.code,
  });

  sections.push(sceneSections.batchTransform);

  if (context.optimizationPath === 'optimized' && context.benchmarkMode !== 'compute' && context.visibilityStrategy === 'cpu-frustum') {
    sections.push(visibilitySections.cpuFrustum);
  }

  if (context.benchmarkMode !== 'compute') {
    sections.push(renderSections[getRenderMode(context)]);

    if (context.actualRenderer === 'WebGPU' && context.useRenderBundles) {
      sections.push(renderSections.webgpuBundle);
    }
  }

  if (context.benchmarkMode !== 'render') {
    sections.push(computeSections[context.computeMode]);
  }

  if (context.benchmarkMode === 'render') {
    notes.push('纯渲染模式不会重复执行实例更新，重点只放在批次上传、draw 组织和着色器执行。');
  }

  if (context.benchmarkMode === 'compute') {
    notes.push('纯计算模式不会提交绘制命令，因此这里不再展示渲染阶段片段，只保留场景组织和计算路径。');
  }

  if (context.requestedRenderer === 'webgpu' && context.actualRenderer === 'WebGL') {
    notes.push('当前环境请求了 WebGPU，但实际回退到了 WebGL；下面展示的是“真实执行路径”的关键代码。');
  }

  if (context.actualRenderer === '初始化失败') {
    notes.push('当前案例初始化失败，面板仍保留请求路径的关键片段，方便你继续定位差异和错误。');
  }

  if (context.actualRenderer === 'WebGPU' && context.useRenderBundles) {
    notes.push('当前 WebGPU 已启用 RenderBundle：实例数据仍会更新，但 draw/bind 命令会尽量复用预录制结果。');
  } else if (context.actualRenderer === 'WebGPU') {
    notes.push('当前 WebGPU 关闭了 RenderBundle，适合直接观察逐帧命令编码是否带来周期性长帧。');
  }

  if (context.scenePreset === 'draw-call-stress' && context.uniqueModelCount >= 1000) {
    notes.push('当前唯一模型数已经进入 1000+ 区间，CPU 侧批次组织和命令提交会比单纯的几何着色更容易成为瓶颈。');
  }

  if (context.visibilityStrategy === 'cpu-frustum' && context.actualRenderer === 'WebGPU' && context.useRenderBundles) {
    notes.push('CPU 视锥裁剪会让每个批次的 instanceCount 更容易波动，因此 RenderBundle 更适合复用“命令结构”，未必能保持完全静态。');
  }

  notes.push(
    context.lightingEnabled
      ? '当前启用了光照着色：更接近真实渲染负载，也更容易放大片元阶段差异。'
      : '当前关闭了光照着色：更适合隔离几何处理、上传和 draw 组织带来的影响。',
  );

  notes.push(
    context.cullingMode === 'back'
      ? '当前启用了背面剔除：可能降低片元压力，但也会改变后端默认状态差异。'
      : '当前关闭了剔除：双面都会进入光栅化，更适合保持 WebGL / WebGPU 的一致性基线。',
  );

  return {
    intro: '当前面板只展示“这一次案例真正发生变化的关键代码”，先看场景组织，再看渲染/计算路径，避免你在整份源码里挖矿。',
    notes,
    sections,
  };
}
