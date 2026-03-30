import type { DisplayRenderer } from '../app/types';
import type { BenchmarkMode, ComputeMode, RendererMode } from '../contracts/types';
import jsInstanceSystemSource from '../systems/jsInstanceSystem.ts?raw';
import wasmInstanceUpdateSource from '../wasm/instance-update.wat?raw';
import webglRendererSource from '../renderers/shaders/webgl.vert.glsl?raw';
import webgpuRendererSource from '../renderers/shaders/webgpu.wgsl?raw';
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

const renderSections = {
  webgl: {
    title: 'Render Path · WebGL',
    sourceLabel: 'src/renderers/shaders/webgl.vert.glsl',
    language: 'glsl' as const,
    description: 'WebGL 顶点着色器直接按统一规范计算旋转与动态颜色，和 WebGPU 使用同一套视觉语义。',
    code: extractSnippet(webglRendererSource, 'webgl-render'),
  },
  webgpu: {
    title: 'Render Path · WebGPU',
    sourceLabel: 'src/renderers/shaders/webgpu.wgsl',
    language: 'wgsl' as const,
    description: 'WebGPU 现在和 WebGL 使用同一套旋转函数、颜色公式与实例数据布局，保证渲染效果一致。',
    code: extractSnippet(webgpuRendererSource, 'webgpu-render'),
  },
};

const computeSections = {
  js: {
    title: 'Compute Path · TypeScript / JS',
    sourceLabel: 'src/systems/jsInstanceSystem.ts',
    language: 'ts' as const,
    description: 'TypeScript 版本在 CPU 上更新实例状态，并按统一公式生成可供渲染上传的实例数据。',
    code: extractSnippet(jsInstanceSystemSource, 'js-update'),
  },
  wasm: {
    title: 'Compute Path · WebAssembly',
    sourceLabel: 'src/wasm/instance-update.wat',
    language: 'wat' as const,
    description: 'WAT 源文件编译为 WASM，更新公式与 TypeScript 版本对齐，只替换执行路径而不改变行为。',
    code: extractSnippet(wasmInstanceUpdateSource, 'wasm-update'),
  },
};

function getRenderMode(context: CodePanelContext): RendererMode {
  if (context.actualRenderer === 'WebGPU') {
    return 'webgpu';
  }

  if (context.actualRenderer === 'WebGL') {
    return 'webgl';
  }

  return context.requestedRenderer;
}

export function getCodePanelData(context: CodePanelContext): CodePanelData {
  const sections: CodePanelSection[] = [];
  const notes: string[] = [];

  if (context.benchmarkMode !== 'compute') {
    sections.push(renderSections[getRenderMode(context)]);
  }

  if (context.benchmarkMode !== 'render') {
    sections.push(computeSections[context.computeMode]);
  }

  if (context.benchmarkMode === 'render') {
    notes.push('纯渲染模式会复用静态实例数据，因此这里只展示渲染路径。');
  }

  if (context.benchmarkMode === 'compute') {
    notes.push('纯计算模式不会绘制 torus knot 网格，因此这里只展示计算路径。');
  }

  if (context.requestedRenderer === 'webgpu' && context.actualRenderer === 'WebGL') {
    notes.push('当前环境请求了 WebGPU，但已回退到 WebGL；下面展示的是实际执行的关键代码。');
  }

  if (context.actualRenderer === '初始化失败') {
    notes.push('当前案例初始化失败，下面展示请求路径的关键代码，方便继续定位问题。');
  }

  return {
    intro: '当前面板展示的是本次案例真正相关的关键代码片段，帮助你直接看清渲染路径和计算路径有什么不同。',
    notes,
    sections,
  };
}
