import {
  BENCHMARK_MODE_OPTIONS,
  COMPUTE_OPTIONS,
  CULLING_MODE_OPTIONS,
  DEFAULT_CONFIG,
  FIELD_HELP,
  INSTANCES_PER_MODEL_RANGE,
  MESH_OPTIONS,
  OPTIMIZATION_PATH_OPTIONS,
  RENDERER_OPTIONS,
  SCALE_OPTIONS,
  SCENE_PRESET_OPTIONS,
  STRESS_LEVEL_OPTIONS,
  TOGGLE_OPTION_HELP,
  UNIQUE_MODEL_COUNT_RANGE,
  VISIBILITY_STRATEGY_OPTIONS,
  findOptionByValue,
  type ControlFieldKey,
} from '../config/options';
import type { ScenePreset, SelectOption } from '../contracts/types';
import type { AppElements } from './types';

function renderFieldHeading(controlId: string, fieldKey: ControlFieldKey): string {
  const definition = FIELD_HELP[fieldKey];
  return `
    <div class="field-heading">
      <label for="${controlId}">${definition.label}</label>
      <span class="field-help" tabindex="0" aria-label="${definition.label} 说明">
        ?
        <span class="field-help-tooltip">${definition.description}</span>
      </span>
    </div>
  `;
}

function renderOptionNote(fieldKey: ControlFieldKey): string {
  return `<div class="field-note field-selection-note" data-option-note="${fieldKey}">--</div>`;
}

function renderRangeField(
  controlId: string,
  valueId: string,
  fieldKey: ControlFieldKey,
  min: number,
  max: number,
): string {
  return `
    <div class="field field-range">
      ${renderFieldHeading(controlId, fieldKey)}
      <div class="range-control">
        <input id="${controlId}" type="range" min="${min}" max="${max}" step="1" />
        <div class="range-meta">
          <div class="range-value" id="${valueId}">--</div>
          <div class="range-limit">${min.toLocaleString('zh-CN')} - ${max.toLocaleString('zh-CN')}</div>
        </div>
      </div>
      ${renderOptionNote(fieldKey)}
    </div>
  `;
}

function renderStaticFieldHeading(fieldKey: ControlFieldKey): string {
  const definition = FIELD_HELP[fieldKey];
  return `
    <div class="field-heading">
      <div class="field-heading-text">${definition.label}</div>
      <span class="field-help" tabindex="0" aria-label="${definition.label} 说明">
        ?
        <span class="field-help-tooltip">${definition.description}</span>
      </span>
    </div>
  `;
}

const APP_TEMPLATE = `
  <main class="app-shell" id="appShell">
    <header class="panel menu-bar">
      <div class="menu-bar-leading">
        <div class="menu-bar-traffic" aria-hidden="true">
          <span class="traffic-dot traffic-dot-red"></span>
          <span class="traffic-dot traffic-dot-yellow"></span>
          <span class="traffic-dot traffic-dot-green"></span>
        </div>
        <div class="menu-bar-title-group">
          <h1>Render Test</h1>
        </div>
      </div>

      <div class="menu-bar-hud" aria-live="polite">
        <div class="menu-bar-metric menu-bar-metric-fps">
          <div class="menu-bar-metric-copy">
            <span class="menu-bar-metric-label">FPS</span>
            <span class="menu-bar-metric-value" id="fpsValue">--</span>
          </div>
          <canvas class="menu-bar-fps-chart" id="fpsChart" height="32" aria-label="最近帧时间图表"></canvas>
        </div>
        <div class="menu-bar-metric menu-bar-metric-drawcalls">
          <span class="menu-bar-metric-label">Draw Calls</span>
          <span class="menu-bar-metric-value" id="drawCallsValue">--</span>
        </div>
      </div>

      <div class="menu-bar-actions">
        <label class="menu-bar-field" for="scenePresetSelect">
          <span class="menu-bar-field-label">场景</span>
          <select id="scenePresetSelect"></select>
        </label>
        <button class="ghost-btn menu-bar-button" id="canvasOnlyToggleBtn" type="button">纯 Canvas</button>
        <button class="ghost-btn menu-bar-button" id="settingsToggleBtn" type="button">渲染选项</button>
      </div>
    </header>

    <section class="panel canvas-stage">
      <div id="canvasHost" class="canvas-host"></div>

      <div class="canvas-stage-toolbar" aria-live="polite">
        <button class="ghost-btn canvas-only-exit hidden" id="exitCanvasOnlyBtn" type="button">退出纯 Canvas</button>
      </div>

      <div class="hidden" aria-hidden="true">
        <div class="chip chip-compact" id="rendererChip">实际渲染：--</div>
        <div class="chip chip-compact" id="statusChip">状态：初始化中</div>
        <div class="chip chip-compact" id="modeChip">模式：--</div>
        <div class="chip chip-compact" id="meshChip">场景：--</div>
        <div class="chip chip-compact" id="supportChip">WebGPU 支持：检测中</div>
      </div>

      <div class="settings-layer hidden" id="settingsLayer">
        <section class="panel settings-panel" aria-label="渲染选项面板">
          <div class="settings-panel-header">
            <div>
              <div class="settings-panel-eyebrow">Live Controls</div>
              <h2 class="settings-panel-title">渲染选项</h2>
              <p class="settings-panel-copy">设置集中放在这里，渲染画面本身不再被性能面板遮挡。</p>
            </div>
            <button class="ghost-btn settings-close-btn" id="closeSettingsBtn" type="button">关闭</button>
          </div>

          <div class="settings-scroll">
            <section class="control-group control-group-compact">
              <div class="control-group-title">当前场景</div>
              <p class="control-group-copy">场景切换放在顶部菜单栏，这里只保留当前场景的解释说明。</p>

              <div class="field field-static">
                ${renderStaticFieldHeading('scenePreset')}
                ${renderOptionNote('scenePreset')}
              </div>
            </section>

            <section class="control-group control-group-compact">
              <div class="control-group-title">场景参数</div>
              <p class="control-group-copy">控制几何复杂度、唯一模型数量和每模型实例数，用来分别放大 draw call 压力与综合 update 压力。</p>

              <div class="field">
                ${renderFieldHeading('meshSelect', 'meshLevel')}
                <select id="meshSelect"></select>
                ${renderOptionNote('meshLevel')}
              </div>
              ${renderRangeField(
                'uniqueModelCountRange',
                'uniqueModelCountValue',
                'uniqueModelCount',
                UNIQUE_MODEL_COUNT_RANGE.min,
                UNIQUE_MODEL_COUNT_RANGE.max,
              )}
              ${renderRangeField(
                'instancesPerModelRange',
                'instancesPerModelValue',
                'instancesPerModel',
                INSTANCES_PER_MODEL_RANGE.min,
                INSTANCES_PER_MODEL_RANGE.max,
              )}
              <div class="field">
                ${renderFieldHeading('stressSelect', 'stressLevel')}
                <select id="stressSelect"></select>
                ${renderOptionNote('stressLevel')}
              </div>
              <div class="field">
                ${renderFieldHeading('scaleSelect', 'instanceScale')}
                <select id="scaleSelect"></select>
                ${renderOptionNote('instanceScale')}
              </div>
            </section>

            <section class="control-group control-group-compact">
              <div class="control-group-title">渲染路径</div>
              <p class="control-group-copy">切换渲染/计算实现和关键 GPU 状态，观察画面与 frame pacing 的变化。</p>

              <div class="field">
                ${renderFieldHeading('benchmarkModeSelect', 'benchmarkMode')}
                <select id="benchmarkModeSelect"></select>
                ${renderOptionNote('benchmarkMode')}
              </div>
              <div class="field">
                ${renderFieldHeading('optimizationPathSelect', 'optimizationPath')}
                <select id="optimizationPathSelect"></select>
                ${renderOptionNote('optimizationPath')}
              </div>
              <div class="field">
                ${renderFieldHeading('visibilityStrategySelect', 'visibilityStrategy')}
                <select id="visibilityStrategySelect"></select>
                ${renderOptionNote('visibilityStrategy')}
              </div>
              <div class="field">
                ${renderFieldHeading('rendererSelect', 'requestedRenderer')}
                <select id="rendererSelect"></select>
                ${renderOptionNote('requestedRenderer')}
              </div>
              <div class="field">
                ${renderFieldHeading('computeSelect', 'computeMode')}
                <select id="computeSelect"></select>
                ${renderOptionNote('computeMode')}
              </div>
              <div class="field field-toggle">
                ${renderFieldHeading('renderBundleToggle', 'useRenderBundles')}
                <label class="toggle-row">
                  <input id="renderBundleToggle" type="checkbox" />
                  <span>预录制 draw / bind 命令</span>
                </label>
                ${renderOptionNote('useRenderBundles')}
              </div>
              <div class="field field-toggle">
                ${renderFieldHeading('lightingToggle', 'lightingEnabled')}
                <label class="toggle-row">
                  <input id="lightingToggle" type="checkbox" />
                  <span>启用光照着色</span>
                </label>
                ${renderOptionNote('lightingEnabled')}
              </div>
              <div class="field">
                ${renderFieldHeading('cullingSelect', 'cullingMode')}
                <select id="cullingSelect"></select>
                ${renderOptionNote('cullingMode')}
              </div>
            </section>

            <details class="code-panel" id="codePanel">
              <summary>关键代码（当前案例）</summary>
              <p class="code-intro" id="codeIntro">当前面板会展示本次案例真正相关的关键代码片段。</p>
              <div class="code-notes hidden" id="codeNotes"></div>
              <div class="code-sections" id="codeSections"></div>
            </details>

            <div class="action-row action-row-compact">
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
          </div>
        </section>
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
    optionElement.title = option.description ?? option.label;
    select.append(optionElement);
  }
}

function configureRangeInput(input: HTMLInputElement, min: number, max: number, step: number): void {
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
}

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function mountApp(root: ParentNode = document): AppElements {
  const app = queryRequired<HTMLDivElement>(root, '#app');
  app.innerHTML = APP_TEMPLATE;

  const elements: AppElements = {
    appShell: queryRequired<HTMLElement>(app, '#appShell'),
    canvasHost: queryRequired<HTMLDivElement>(app, '#canvasHost'),
    scenePresetSelect: queryRequired<HTMLSelectElement>(app, '#scenePresetSelect'),
    canvasOnlyToggleBtn: queryRequired<HTMLButtonElement>(app, '#canvasOnlyToggleBtn'),
    exitCanvasOnlyBtn: queryRequired<HTMLButtonElement>(app, '#exitCanvasOnlyBtn'),
    settingsToggleBtn: queryRequired<HTMLButtonElement>(app, '#settingsToggleBtn'),
    closeSettingsBtn: queryRequired<HTMLButtonElement>(app, '#closeSettingsBtn'),
    settingsLayer: queryRequired<HTMLDivElement>(app, '#settingsLayer'),
    benchmarkModeSelect: queryRequired<HTMLSelectElement>(app, '#benchmarkModeSelect'),
    optimizationPathSelect: queryRequired<HTMLSelectElement>(app, '#optimizationPathSelect'),
    visibilityStrategySelect: queryRequired<HTMLSelectElement>(app, '#visibilityStrategySelect'),
    rendererSelect: queryRequired<HTMLSelectElement>(app, '#rendererSelect'),
    renderBundleToggle: queryRequired<HTMLInputElement>(app, '#renderBundleToggle'),
    computeSelect: queryRequired<HTMLSelectElement>(app, '#computeSelect'),
    lightingToggle: queryRequired<HTMLInputElement>(app, '#lightingToggle'),
    cullingSelect: queryRequired<HTMLSelectElement>(app, '#cullingSelect'),
    meshSelect: queryRequired<HTMLSelectElement>(app, '#meshSelect'),
    uniqueModelCountRange: queryRequired<HTMLInputElement>(app, '#uniqueModelCountRange'),
    uniqueModelCountValue: queryRequired<HTMLDivElement>(app, '#uniqueModelCountValue'),
    instancesPerModelRange: queryRequired<HTMLInputElement>(app, '#instancesPerModelRange'),
    instancesPerModelValue: queryRequired<HTMLDivElement>(app, '#instancesPerModelValue'),
    stressSelect: queryRequired<HTMLSelectElement>(app, '#stressSelect'),
    scaleSelect: queryRequired<HTMLSelectElement>(app, '#scaleSelect'),
    fieldOptionNotes: {
      scenePreset: queryRequired<HTMLDivElement>(app, '[data-option-note="scenePreset"]'),
      meshLevel: queryRequired<HTMLDivElement>(app, '[data-option-note="meshLevel"]'),
      uniqueModelCount: queryRequired<HTMLDivElement>(app, '[data-option-note="uniqueModelCount"]'),
      instancesPerModel: queryRequired<HTMLDivElement>(app, '[data-option-note="instancesPerModel"]'),
      stressLevel: queryRequired<HTMLDivElement>(app, '[data-option-note="stressLevel"]'),
      instanceScale: queryRequired<HTMLDivElement>(app, '[data-option-note="instanceScale"]'),
      benchmarkMode: queryRequired<HTMLDivElement>(app, '[data-option-note="benchmarkMode"]'),
      optimizationPath: queryRequired<HTMLDivElement>(app, '[data-option-note="optimizationPath"]'),
      visibilityStrategy: queryRequired<HTMLDivElement>(app, '[data-option-note="visibilityStrategy"]'),
      requestedRenderer: queryRequired<HTMLDivElement>(app, '[data-option-note="requestedRenderer"]'),
      computeMode: queryRequired<HTMLDivElement>(app, '[data-option-note="computeMode"]'),
      useRenderBundles: queryRequired<HTMLDivElement>(app, '[data-option-note="useRenderBundles"]'),
      lightingEnabled: queryRequired<HTMLDivElement>(app, '[data-option-note="lightingEnabled"]'),
      cullingMode: queryRequired<HTMLDivElement>(app, '[data-option-note="cullingMode"]'),
    },
    fpsChart: queryRequired<HTMLCanvasElement>(app, '#fpsChart'),
    fpsValue: queryRequired<HTMLSpanElement>(app, '#fpsValue'),
    drawCallsValue: queryRequired<HTMLSpanElement>(app, '#drawCallsValue'),
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

  populateSelectOptions(elements.scenePresetSelect, SCENE_PRESET_OPTIONS);
  populateSelectOptions(elements.benchmarkModeSelect, BENCHMARK_MODE_OPTIONS);
  populateSelectOptions(elements.optimizationPathSelect, OPTIMIZATION_PATH_OPTIONS);
  populateSelectOptions(elements.visibilityStrategySelect, VISIBILITY_STRATEGY_OPTIONS);
  populateSelectOptions(elements.rendererSelect, RENDERER_OPTIONS);
  populateSelectOptions(elements.computeSelect, COMPUTE_OPTIONS);
  populateSelectOptions(elements.cullingSelect, CULLING_MODE_OPTIONS);
  populateSelectOptions(elements.meshSelect, MESH_OPTIONS);
  populateSelectOptions(elements.stressSelect, STRESS_LEVEL_OPTIONS);
  populateSelectOptions(elements.scaleSelect, SCALE_OPTIONS);
  configureRangeInput(
    elements.uniqueModelCountRange,
    UNIQUE_MODEL_COUNT_RANGE.min,
    UNIQUE_MODEL_COUNT_RANGE.max,
    UNIQUE_MODEL_COUNT_RANGE.step,
  );
  configureRangeInput(
    elements.instancesPerModelRange,
    INSTANCES_PER_MODEL_RANGE.min,
    INSTANCES_PER_MODEL_RANGE.max,
    INSTANCES_PER_MODEL_RANGE.step,
  );

  elements.scenePresetSelect.value = DEFAULT_CONFIG.scenePreset;
  elements.benchmarkModeSelect.value = DEFAULT_CONFIG.benchmarkMode;
  elements.optimizationPathSelect.value = DEFAULT_CONFIG.optimizationPath;
  elements.visibilityStrategySelect.value = DEFAULT_CONFIG.visibilityStrategy;
  elements.rendererSelect.value = DEFAULT_CONFIG.requestedRenderer;
  elements.renderBundleToggle.checked = DEFAULT_CONFIG.useRenderBundles;
  elements.computeSelect.value = DEFAULT_CONFIG.computeMode;
  elements.lightingToggle.checked = DEFAULT_CONFIG.lightingEnabled;
  elements.cullingSelect.value = DEFAULT_CONFIG.cullingMode;
  elements.meshSelect.value = DEFAULT_CONFIG.meshLevel;
  elements.uniqueModelCountRange.value = String(DEFAULT_CONFIG.uniqueModelCount);
  elements.instancesPerModelRange.value = String(DEFAULT_CONFIG.instancesPerModel);
  elements.stressSelect.value = String(DEFAULT_CONFIG.stressLevel);
  elements.scaleSelect.value = String(DEFAULT_CONFIG.instanceScale);

  syncFieldOptionNotes(elements);

  return elements;
}

export function syncFieldOptionNotes(elements: AppElements): void {
  const setNote = (fieldKey: ControlFieldKey, value: string): void => {
    elements.fieldOptionNotes[fieldKey].textContent = value;
  };

  const scenePreset = elements.scenePresetSelect.value as ScenePreset;
  const uniqueModelCount = Number(elements.uniqueModelCountRange.value);
  const instancesPerModel = Number(elements.instancesPerModelRange.value);
  const totalEntities = uniqueModelCount * instancesPerModel;
  const drawCallWarning = uniqueModelCount >= 1000 ? '⚠️ 这个档位会明显放大 CPU 提交和命令编码成本。' : '';
  const totalEntityWarning = totalEntities >= 100000 ? '⚠️ 总实体非常高，combined 模式下 update() 也会很重。' : '';

  elements.uniqueModelCountValue.textContent = formatCount(uniqueModelCount);
  elements.instancesPerModelValue.textContent = formatCount(instancesPerModel);

  setNote(
    'scenePreset',
    findOptionByValue(SCENE_PRESET_OPTIONS, elements.scenePresetSelect.value as (typeof SCENE_PRESET_OPTIONS)[number]['value'])
      ?.description ?? '当前场景暂无说明。',
  );
  setNote(
    'benchmarkMode',
    findOptionByValue(BENCHMARK_MODE_OPTIONS, elements.benchmarkModeSelect.value as (typeof BENCHMARK_MODE_OPTIONS)[number]['value'])
      ?.description ?? '当前模式暂无说明。',
  );
  setNote(
    'optimizationPath',
    findOptionByValue(
      OPTIMIZATION_PATH_OPTIONS,
      elements.optimizationPathSelect.value as (typeof OPTIMIZATION_PATH_OPTIONS)[number]['value'],
    )?.description ?? '当前路径暂无说明。',
  );
  setNote(
    'visibilityStrategy',
    findOptionByValue(
      VISIBILITY_STRATEGY_OPTIONS,
      elements.visibilityStrategySelect.value as (typeof VISIBILITY_STRATEGY_OPTIONS)[number]['value'],
    )?.description ?? '当前可见性策略暂无说明。',
  );
  setNote(
    'requestedRenderer',
    findOptionByValue(RENDERER_OPTIONS, elements.rendererSelect.value as (typeof RENDERER_OPTIONS)[number]['value'])
      ?.description ?? '当前渲染后端暂无说明。',
  );
  setNote(
    'computeMode',
    findOptionByValue(COMPUTE_OPTIONS, elements.computeSelect.value as (typeof COMPUTE_OPTIONS)[number]['value'])
      ?.description ?? '当前计算实现暂无说明。',
  );
  setNote(
    'meshLevel',
    findOptionByValue(MESH_OPTIONS, elements.meshSelect.value as (typeof MESH_OPTIONS)[number]['value'])?.description ?? '当前网格暂无说明。',
  );
  if (scenePreset === 'static-dynamic-mix') {
    setNote(
      'uniqueModelCount',
      `当前场景会把两根滑条的乘积当成总实体预算；这根滑条主要参与推导总体规模。当前预算约为 ${formatCount(totalEntities)} 个实体。`,
    );
    setNote(
      'instancesPerModel',
      `在这个场景里，总实体会按约 45% 静态 Cube / 55% 动态 Torus 拆分。当前乘积是 ${formatCount(uniqueModelCount)} × ${formatCount(instancesPerModel)} = ${formatCount(totalEntities)}。 ${totalEntityWarning}`.trim(),
    );
  } else {
    setNote(
      'uniqueModelCount',
      `当前会生成 ${formatCount(uniqueModelCount)} 份严格唯一的 GeometryData，理论 draw call 上限约为 ${formatCount(uniqueModelCount)}。 ${drawCallWarning}`.trim(),
    );
    setNote(
      'instancesPerModel',
      `每个唯一模型当前分配 ${formatCount(instancesPerModel)} 个实例，总实体约为 ${formatCount(totalEntities)}。 ${totalEntityWarning}`.trim(),
    );
  }
  setNote(
    'stressLevel',
    findOptionByValue(STRESS_LEVEL_OPTIONS, Number(elements.stressSelect.value))?.description ?? '当前压力等级暂无说明。',
  );
  setNote(
    'instanceScale',
    findOptionByValue(SCALE_OPTIONS, Number(elements.scaleSelect.value))?.description ?? '当前缩放暂无说明。',
  );
  setNote(
    'cullingMode',
    findOptionByValue(CULLING_MODE_OPTIONS, elements.cullingSelect.value as (typeof CULLING_MODE_OPTIONS)[number]['value'])
      ?.description ?? '当前剔除模式暂无说明。',
  );
  setNote(
    'useRenderBundles',
    elements.renderBundleToggle.checked ? TOGGLE_OPTION_HELP.useRenderBundles.enabled : TOGGLE_OPTION_HELP.useRenderBundles.disabled,
  );
  setNote(
    'lightingEnabled',
    elements.lightingToggle.checked ? TOGGLE_OPTION_HELP.lightingEnabled.enabled : TOGGLE_OPTION_HELP.lightingEnabled.disabled,
  );
}

export function createFreshCanvas(canvasHost: HTMLDivElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'benchmarkCanvas';
  canvasHost.innerHTML = '';
  canvasHost.append(canvas);
  return canvas;
}
