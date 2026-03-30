import {
    BENCHMARK_MODE_OPTIONS,
    COMPUTE_OPTIONS,
    DEFAULT_CONFIG,
    INSTANCE_OPTIONS,
    MESH_OPTIONS,
    RENDERER_OPTIONS,
    SCALE_OPTIONS,
    STRESS_LEVEL_OPTIONS,
} from '../config/options';
import type { SelectOption } from '../contracts/types';
import type { AppElements } from './types';

const APP_TEMPLATE = `
  <main class="app-shell">
    <section class="panel controls">
      <div class="title-row">
        <div>
          <h1>Render Test Demo</h1>
          <p class="subtitle">
            对比 WebGL / WebGPU 渲染，以及 TypeScript / WebAssembly 3D 网格实例仿真逻辑，
            可直接在手机浏览器中切换并观察 FPS。
          </p>
        </div>
        <div class="badge">Mesh Benchmark</div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="benchmarkModeSelect">测试模式</label>
          <select id="benchmarkModeSelect"></select>
        </div>
        <div class="field">
          <label for="rendererSelect">渲染后端</label>
          <select id="rendererSelect"></select>
        </div>
        <div class="field">
          <label for="computeSelect">计算实现</label>
          <select id="computeSelect"></select>
        </div>
        <div class="field">
          <label for="meshSelect">网格复杂度</label>
          <select id="meshSelect"></select>
        </div>
        <div class="field">
          <label for="instanceSelect">实例数量</label>
          <select id="instanceSelect"></select>
        </div>
        <div class="field">
          <label for="stressSelect">压力等级</label>
          <select id="stressSelect"></select>
        </div>
        <div class="field">
          <label for="scaleSelect">实例缩放</label>
          <select id="scaleSelect"></select>
        </div>
      </div>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">FPS</div>
          <div class="stat-value" id="fpsValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Frame</div>
          <div class="stat-value" id="frameValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Update</div>
          <div class="stat-value" id="updateValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Render</div>
          <div class="stat-value" id="renderValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">DrawCalls</div>
          <div class="stat-value" id="drawCallsValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Upload</div>
          <div class="stat-value" id="uploadValue">--</div>
        </div>
      </div>

      <details class="code-panel" id="codePanel">
        <summary>关键代码（当前案例）</summary>
        <p class="code-intro" id="codeIntro">当前面板会展示本次案例真正相关的关键代码片段。</p>
        <div class="code-notes hidden" id="codeNotes"></div>
        <div class="code-sections" id="codeSections"></div>
      </details>

      <div class="action-row">
        <button class="ghost-btn" id="toggleLogsBtn" type="button">显示日志</button>
        <button class="ghost-btn" id="copyErrorBtn" type="button">复制错误</button>
        <button class="ghost-btn" id="clearLogsBtn" type="button">清空日志</button>
      </div>

      <div class="error-box hidden" id="errorBox">
        <div class="error-title">最近错误</div>
        <pre id="errorText">暂无</pre>
      </div>

      <details class="log-panel" id="logPanel">
        <summary>调试日志（可展开查看页面内 console）</summary>
        <pre id="logOutput">暂无日志</pre>
      </details>

      <div class="footer-note">
        这版 benchmark 已统一 WebGL / WebGPU 的视觉语义，并把关键实现片段直接展示在面板里，方便对照每个案例到底运行了什么。
      </div>
    </section>

    <section class="panel canvas-wrap">
      <div id="canvasHost" class="canvas-host"></div>
      <div class="status-bar">
        <div class="chip" id="modeChip">模式：--</div>
        <div class="chip" id="rendererChip">实际渲染：--</div>
        <div class="chip" id="meshChip">网格：--</div>
        <div class="chip" id="supportChip">WebGPU 支持：检测中</div>
        <div class="chip" id="statusChip">状态：初始化中</div>
      </div>
    </section>
  </main>
`;

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function populateSelectOptions<T extends string | number>(
  select: HTMLSelectElement,
  options: ReadonlyArray<SelectOption<T>>,
): void {
  select.innerHTML = '';
  for (const option of options) {
    const optionElement = document.createElement('option');
    optionElement.value = String(option.value);
    optionElement.textContent = option.label;
    select.append(optionElement);
  }
}

function populateNumberOptions(
  select: HTMLSelectElement,
  values: readonly number[],
  formatValue: (value: number) => string,
): void {
  select.innerHTML = '';
  for (const value of values) {
    const optionElement = document.createElement('option');
    optionElement.value = String(value);
    optionElement.textContent = formatValue(value);
    select.append(optionElement);
  }
}

export function mountApp(root: ParentNode = document): AppElements {
  const app = queryRequired<HTMLDivElement>(root, '#app');
  app.innerHTML = APP_TEMPLATE;

  const elements: AppElements = {
    canvasHost: queryRequired<HTMLDivElement>(app, '#canvasHost'),
    benchmarkModeSelect: queryRequired<HTMLSelectElement>(app, '#benchmarkModeSelect'),
    rendererSelect: queryRequired<HTMLSelectElement>(app, '#rendererSelect'),
    computeSelect: queryRequired<HTMLSelectElement>(app, '#computeSelect'),
    meshSelect: queryRequired<HTMLSelectElement>(app, '#meshSelect'),
    instanceSelect: queryRequired<HTMLSelectElement>(app, '#instanceSelect'),
    stressSelect: queryRequired<HTMLSelectElement>(app, '#stressSelect'),
    scaleSelect: queryRequired<HTMLSelectElement>(app, '#scaleSelect'),
    fpsValue: queryRequired<HTMLDivElement>(app, '#fpsValue'),
    frameValue: queryRequired<HTMLDivElement>(app, '#frameValue'),
    updateValue: queryRequired<HTMLDivElement>(app, '#updateValue'),
    renderValue: queryRequired<HTMLDivElement>(app, '#renderValue'),
    drawCallsValue: queryRequired<HTMLDivElement>(app, '#drawCallsValue'),
    uploadValue: queryRequired<HTMLDivElement>(app, '#uploadValue'),
    modeChip: queryRequired<HTMLDivElement>(app, '#modeChip'),
    rendererChip: queryRequired<HTMLDivElement>(app, '#rendererChip'),
    meshChip: queryRequired<HTMLDivElement>(app, '#meshChip'),
    supportChip: queryRequired<HTMLDivElement>(app, '#supportChip'),
    statusChip: queryRequired<HTMLDivElement>(app, '#statusChip'),
    logPanel: queryRequired<HTMLDetailsElement>(app, '#logPanel'),
    logOutput: queryRequired<HTMLPreElement>(app, '#logOutput'),
    errorBox: queryRequired<HTMLDivElement>(app, '#errorBox'),
    errorText: queryRequired<HTMLPreElement>(app, '#errorText'),
    toggleLogsBtn: queryRequired<HTMLButtonElement>(app, '#toggleLogsBtn'),
    copyErrorBtn: queryRequired<HTMLButtonElement>(app, '#copyErrorBtn'),
    clearLogsBtn: queryRequired<HTMLButtonElement>(app, '#clearLogsBtn'),
    codePanel: queryRequired<HTMLDetailsElement>(app, '#codePanel'),
    codeIntro: queryRequired<HTMLParagraphElement>(app, '#codeIntro'),
    codeNotes: queryRequired<HTMLDivElement>(app, '#codeNotes'),
    codeSections: queryRequired<HTMLDivElement>(app, '#codeSections'),
  };

  populateSelectOptions(elements.benchmarkModeSelect, BENCHMARK_MODE_OPTIONS);
  populateSelectOptions(elements.rendererSelect, RENDERER_OPTIONS);
  populateSelectOptions(elements.computeSelect, COMPUTE_OPTIONS);
  populateSelectOptions(elements.meshSelect, MESH_OPTIONS);
  populateNumberOptions(elements.instanceSelect, INSTANCE_OPTIONS, (value) => value.toLocaleString('zh-CN'));
  populateNumberOptions(elements.stressSelect, STRESS_LEVEL_OPTIONS, (value) => `${value}x`);
  populateNumberOptions(elements.scaleSelect, SCALE_OPTIONS, (value) => `${value}x`);

  elements.benchmarkModeSelect.value = DEFAULT_CONFIG.benchmarkMode;
  elements.rendererSelect.value = DEFAULT_CONFIG.requestedRenderer;
  elements.computeSelect.value = DEFAULT_CONFIG.computeMode;
  elements.meshSelect.value = DEFAULT_CONFIG.meshLevel;
  elements.instanceSelect.value = String(DEFAULT_CONFIG.instanceCount);
  elements.stressSelect.value = String(DEFAULT_CONFIG.stressLevel);
  elements.scaleSelect.value = String(DEFAULT_CONFIG.instanceScale);

  return elements;
}

export function createFreshCanvas(canvasHost: HTMLDivElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'benchmarkCanvas';
  canvasHost.innerHTML = '';
  canvasHost.append(canvas);
  return canvas;
}
