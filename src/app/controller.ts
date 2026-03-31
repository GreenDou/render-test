import {
  BENCHMARK_MODE_OPTIONS,
  CULLING_MODE_OPTIONS,
  OPTIMIZATION_PATH_OPTIONS,
  SCENE_PRESET_OPTIONS,
  VISIBILITY_STRATEGY_OPTIONS,
} from '../config/options';
import { CAMERA_CENTER, CAMERA_EYE, CAMERA_UP, CANVAS_DPR_CAP, RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
import type { ComputeMode, InstanceSystem, RenderBatch, Renderer, RendererMode } from '../contracts/types';
import { extractFrustumPlanes, lookAt, multiplyMat4, perspective, sphereIntersectsFrustum } from '../math/matrix';
import { WebGLRenderer } from '../renderers/webglRenderer';
import { WebGPURenderer } from '../renderers/webgpuRenderer';
import {
  buildSceneBatches,
  createSceneRuntime,
  transformRenderData,
  type SceneBatchRuntime,
  type SceneRuntime,
} from '../scenes/sceneFactory';
import { JSInstanceSystem } from '../systems/jsInstanceSystem';
import { WasmInstanceSystem } from '../systems/wasmInstanceSystem';
import { getCodePanelData } from '../ui/codeCases';
import { createFreshCanvas, syncFieldOptionNotes } from './dom';
import {
  escapeHtml,
  formatError,
  formatFpsWithJitter,
} from './formatting';
import { drawFramePaceChart, pushFramePaceSample, summarizeFramePace } from './framePace';
import { applySavedConfig, persistConfig, readConfigFromElements } from './persistence';
import { createInitialState, type AppElements, type AppState } from './types';

const MIN_FRAME_MS = 1000 / 240;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const MAX_LOG_ENTRIES = 120;
const EMPTY_INSTANCE_DATA = new Float32Array(0);

export class AppController {
  private readonly state: AppState = createInitialState();
  private readonly visibilityView = new Float32Array(16);
  private readonly visibilityProjection = new Float32Array(16);
  private readonly visibilityViewProjection = new Float32Array(16);
  private readonly visibilityFrustumPlanes = new Float32Array(24);

  private rebuildToken = 0;
  private canvasOnlyMode = false;
  private settingsPanelOpen = false;
  private visibilityProjectionAspect = Number.NaN;
  private submittedBatchCount = 0;
  private submittedInstanceCount = 0;
  private totalSceneInstanceCount = 0;
  private submittedUploadBytes = 0;

  public constructor(private readonly elements: AppElements) {
    lookAt(this.visibilityView, CAMERA_EYE, CAMERA_CENTER, CAMERA_UP);
    applySavedConfig(this.elements);
    this.readConfigIntoState();
    this.bindEvents();
    this.syncControlAvailability();
    this.updateSupportChip();
    this.updateChrome();
    this.renderLogs();
    this.clearError();
    this.syncCanvasOnlyUI();
    this.syncSettingsPanelUI();
    this.renderCodePanel();
    this.syncMetricsHud();
  }

  public start(): void {
    void this.rebuildScene();
  }

  private bindEvents(): void {
    const rebuildControls = [
      this.elements.scenePresetSelect,
      this.elements.benchmarkModeSelect,
      this.elements.optimizationPathSelect,
      this.elements.visibilityStrategySelect,
      this.elements.rendererSelect,
      this.elements.renderBundleToggle,
      this.elements.computeSelect,
      this.elements.lightingToggle,
      this.elements.cullingSelect,
      this.elements.meshSelect,
      this.elements.uniqueModelCountRange,
      this.elements.instancesPerModelRange,
      this.elements.stressSelect,
      this.elements.scaleSelect,
    ] as const;

    const liveRangeControls = [
      this.elements.uniqueModelCountRange,
      this.elements.instancesPerModelRange,
    ] as const;

    for (const control of liveRangeControls) {
      control.addEventListener('input', () => {
        this.readConfigIntoState();
        this.updateChrome();
        this.renderCodePanel();
      });
    }

    for (const control of rebuildControls) {
      control.addEventListener('change', () => {
        persistConfig(this.elements);
        this.readConfigIntoState();
        this.syncControlAvailability();
        this.updateSupportChip();
        this.updateChrome();
        this.renderCodePanel();
        void this.rebuildScene();
      });
    }

    this.elements.logPanel.addEventListener('toggle', () => {
      this.updateLogToggleButton();
    });

    this.elements.settingsToggleBtn.addEventListener('click', () => {
      this.toggleSettingsPanel();
    });

    this.elements.canvasOnlyToggleBtn.addEventListener('click', () => {
      this.toggleCanvasOnlyMode();
    });

    this.elements.exitCanvasOnlyBtn.addEventListener('click', () => {
      this.setCanvasOnlyMode(false);
    });

    this.elements.closeSettingsBtn.addEventListener('click', () => {
      this.closeSettingsPanel();
    });

    this.elements.toggleLogsBtn.addEventListener('click', () => {
      this.elements.logPanel.open = !this.elements.logPanel.open;
      this.updateLogToggleButton();
    });

    this.elements.clearLogsBtn.addEventListener('click', () => {
      this.state.logs = [];
      this.renderLogs();
      this.log('页面内日志已清空。');
    });

    this.elements.copyErrorBtn.addEventListener('click', async () => {
      if (!this.state.lastErrorText) {
        this.log('当前没有可复制的错误。');
        return;
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error('当前环境不支持剪贴板写入');
        }
        await navigator.clipboard.writeText(this.state.lastErrorText);
        this.log('最近错误已复制到剪贴板。');
      } catch (error) {
        const errorText = formatError(error, 'copy-error');
        this.showError(errorText);
        this.log(errorText);
      }
    });

    window.addEventListener('resize', () => {
      if (this.state.renderer && this.shouldUseCpuFrustumCulling()) {
        this.state.renderer.setSceneBatches(this.collectSceneBatches());
      }

      if (!this.canvasOnlyMode) {
        this.syncMetricsHud();
      }
      this.renderCurrentFrame();
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.settingsPanelOpen) {
        this.closeSettingsPanel();
        return;
      }

      if (event.key === 'Escape' && this.canvasOnlyMode) {
        this.setCanvasOnlyMode(false);
      }
    });
  }

  private syncCanvasOnlyUI(): void {
    this.elements.appShell.classList.toggle('canvas-only-mode', this.canvasOnlyMode);
    this.elements.exitCanvasOnlyBtn.classList.toggle('hidden', !this.canvasOnlyMode);
    this.elements.canvasOnlyToggleBtn.textContent = this.canvasOnlyMode ? '退出纯 Canvas' : '纯 Canvas';
    this.elements.canvasOnlyToggleBtn.setAttribute('aria-pressed', this.canvasOnlyMode ? 'true' : 'false');
    this.elements.exitCanvasOnlyBtn.setAttribute('aria-hidden', this.canvasOnlyMode ? 'false' : 'true');
  }

  private setCanvasOnlyMode(enabled: boolean): void {
    if (this.canvasOnlyMode === enabled) {
      return;
    }

    this.canvasOnlyMode = enabled;
    if (enabled) {
      this.closeSettingsPanel();
    }

    this.syncCanvasOnlyUI();
    if (!enabled) {
      this.syncMetricsHud();
    }
    this.renderCurrentFrame();
  }

  private toggleCanvasOnlyMode(): void {
    this.setCanvasOnlyMode(!this.canvasOnlyMode);
  }

  private syncSettingsPanelUI(): void {
    this.elements.settingsLayer.classList.toggle('hidden', !this.settingsPanelOpen);
    this.elements.settingsToggleBtn.textContent = this.settingsPanelOpen ? '关闭选项' : '渲染选项';
    this.elements.settingsToggleBtn.setAttribute('aria-expanded', this.settingsPanelOpen ? 'true' : 'false');
  }

  private openSettingsPanel(): void {
    if (this.canvasOnlyMode) {
      this.setCanvasOnlyMode(false);
    }

    if (this.settingsPanelOpen) {
      return;
    }

    this.settingsPanelOpen = true;
    this.syncSettingsPanelUI();
  }

  private closeSettingsPanel(): void {
    if (!this.settingsPanelOpen) {
      return;
    }

    this.settingsPanelOpen = false;
    this.syncSettingsPanelUI();
  }

  private toggleSettingsPanel(): void {
    this.settingsPanelOpen = !this.settingsPanelOpen;
    this.syncSettingsPanelUI();
  }

  private readConfigIntoState(): void {
    Object.assign(this.state, readConfigFromElements(this.elements));
    syncFieldOptionNotes(this.elements);
  }

  private shouldUseCpuFrustumCulling(): boolean {
    return this.state.optimizationPath === 'optimized'
      && this.state.visibilityStrategy === 'cpu-frustum'
      && this.state.benchmarkMode !== 'compute';
  }

  private getSceneLabel(): string {
    return SCENE_PRESET_OPTIONS.find((option) => option.value === this.state.scenePreset)?.label ?? this.state.scenePreset;
  }

  private getModeLabel(): string {
    return BENCHMARK_MODE_OPTIONS.find((option) => option.value === this.state.benchmarkMode)?.label ?? this.state.benchmarkMode;
  }

  private getCullingLabel(): string {
    return CULLING_MODE_OPTIONS.find((option) => option.value === this.state.cullingMode)?.label ?? this.state.cullingMode;
  }

  private getOptimizationPathLabel(): string {
    return OPTIMIZATION_PATH_OPTIONS.find((option) => option.value === this.state.optimizationPath)?.label ?? this.state.optimizationPath;
  }

  private getVisibilityStrategyLabel(): string {
    return VISIBILITY_STRATEGY_OPTIONS.find((option) => option.value === this.state.visibilityStrategy)?.label ?? this.state.visibilityStrategy;
  }

  private getRequestedTotalEntities(): number {
    return this.state.uniqueModelCount * this.state.instancesPerModel;
  }

  private syncSceneChip(sceneLabel = this.getSceneLabel()): void {
    const totalEntities = this.getRequestedTotalEntities();
    const details = this.state.scenePreset === 'static-dynamic-mix'
      ? [
          `场景：${sceneLabel}`,
          this.state.meshLevel,
          `预算 ${this.state.uniqueModelCount.toLocaleString('zh-CN')} × ${this.state.instancesPerModel.toLocaleString('zh-CN')}`,
          `${totalEntities.toLocaleString('zh-CN')} 实体`,
        ]
      : [
          `场景：${sceneLabel}`,
          this.state.meshLevel,
          `${this.state.uniqueModelCount.toLocaleString('zh-CN')} 唯一模型`,
          `${this.state.instancesPerModel.toLocaleString('zh-CN')} / 模型`,
          `${totalEntities.toLocaleString('zh-CN')} 实体`,
        ];

    if (this.shouldUseCpuFrustumCulling() && this.totalSceneInstanceCount > 0) {
      details.push(`可见 ${this.submittedInstanceCount.toLocaleString('zh-CN')}/${this.totalSceneInstanceCount.toLocaleString('zh-CN')}`);
    }

    this.elements.meshChip.textContent = details.join(' · ');
  }

  private syncControlAvailability(): void {
    const renderActive = this.state.benchmarkMode !== 'compute';
    const renderBundleActive = renderActive && this.state.requestedRenderer === 'webgpu';
    const visibilityStrategyActive = renderActive && this.state.optimizationPath === 'optimized';

    this.setFieldDisabled(this.elements.renderBundleToggle, !renderBundleActive);
    this.setFieldDisabled(this.elements.visibilityStrategySelect, !visibilityStrategyActive);
    this.setFieldDisabled(this.elements.lightingToggle, !renderActive);
    this.setFieldDisabled(this.elements.cullingSelect, !renderActive);

    this.elements.renderBundleToggle.disabled = !renderBundleActive;
    this.elements.visibilityStrategySelect.disabled = !visibilityStrategyActive;
    this.elements.lightingToggle.disabled = !renderActive;
    this.elements.cullingSelect.disabled = !renderActive;

    if (!renderBundleActive) {
      this.elements.fieldOptionNotes.useRenderBundles.textContent =
        '当前配置下该选项不生效：仅 WebGPU 渲染路径会真正录制并复用 RenderBundle。';
    }

    if (this.state.benchmarkMode === 'compute') {
      this.elements.fieldOptionNotes.optimizationPath.textContent =
        '当前处于纯计算模式：这一轮的优化路径还不会改变 update() 语义，主要作为后续实验路径的对照开关。';
    } else if (this.state.optimizationPath === 'optimized') {
      this.elements.fieldOptionNotes.optimizationPath.textContent =
        '当前走优化路径：允许在保留 benchmark 对照关系的前提下接入额外提交优化。';
    }

    if (!visibilityStrategyActive) {
      this.elements.fieldOptionNotes.visibilityStrategy.textContent = renderActive
        ? '当前仍在原始基线路径，可见性策略暂不介入提交；切到“优化路径”后才会生效。'
        : '当前处于纯计算模式，不会提交绘制命令，因此可见性策略暂不生效。';
    } else if (this.state.visibilityStrategy === 'cpu-frustum') {
      this.elements.fieldOptionNotes.visibilityStrategy.textContent =
        '当前会在提交前用 CPU 测试实例包围球是否落在视锥内；它会减少上传和绘制，但不会减少前面的 update() 计算。';
    } else {
      this.elements.fieldOptionNotes.visibilityStrategy.textContent =
        '当前已切到优化路径，但还没有启用具体的可见性过滤；这相当于 optimized 路径下的空策略基线。';
    }

    if (!renderActive) {
      const renderDisabledText = '当前处于纯计算模式，不会提交绘制命令，因此这个渲染选项暂不生效。';
      this.elements.fieldOptionNotes.lightingEnabled.textContent = renderDisabledText;
      this.elements.fieldOptionNotes.cullingMode.textContent = renderDisabledText;
    }
  }

  private setFieldDisabled(control: HTMLElement, disabled: boolean): void {
    control.closest('.field')?.classList.toggle('field-disabled', disabled);
  }

  private updateSupportChip(): void {
    this.state.webGpuAvailable = 'gpu' in navigator;
    const bundlePart = this.state.requestedRenderer === 'webgpu'
      ? ` · Bundle ${this.state.useRenderBundles ? 'On' : 'Off'}`
      : '';
    const supportText = this.state.webGpuAvailable
      ? `支持：WebGPU 可用${bundlePart}`
      : `支持：WebGPU 不可用${this.state.requestedRenderer === 'webgpu' ? ' · 将回退 WebGL' : ''}`;

    this.elements.supportChip.textContent = supportText;
    this.elements.supportChip.classList.toggle(
      'warn',
      this.state.requestedRenderer === 'webgpu' && !this.state.webGpuAvailable,
    );
  }

  private updateChrome(statusText = '状态：准备中', statusWarn = false): void {
    const sceneLabel = this.getSceneLabel();
    const modeLabel = this.getModeLabel();
    const cullingLabel = this.getCullingLabel();
    const optimizationPathLabel = this.getOptimizationPathLabel();
    const visibilityStrategyLabel = this.getVisibilityStrategyLabel();

    const modeParts = [`模式：${modeLabel}`, `计算 ${this.state.computeMode.toUpperCase()}`, `路径 ${optimizationPathLabel}`];
    if (this.state.benchmarkMode !== 'compute' && this.state.optimizationPath === 'optimized') {
      modeParts.push(`可见性 ${visibilityStrategyLabel}`);
    }

    this.elements.modeChip.textContent = modeParts.join(' · ');
    this.syncSceneChip(sceneLabel);

    const rendererDetail: string[] = [];
    if (this.state.actualRenderer === 'WebGPU') {
      rendererDetail.push(`Bundle ${this.state.useRenderBundles ? 'On' : 'Off'}`);
    }
    if (this.state.actualRenderer === 'WebGL' || this.state.actualRenderer === 'WebGPU') {
      rendererDetail.push(`Light ${this.state.lightingEnabled ? 'On' : 'Off'}`);
      rendererDetail.push(`Cull ${cullingLabel}`);
    }

    const rendererLabel =
      this.state.actualRenderer === '--'
        ? '等待初始化'
        : this.state.actualRenderer === 'N/A'
          ? '无渲染'
          : this.state.actualRenderer;
    this.elements.rendererChip.textContent =
      `实际渲染：${rendererLabel}${rendererDetail.length > 0 ? ` · ${rendererDetail.join(' · ')}` : ''}`;

    this.elements.statusChip.textContent = statusText;
    this.elements.statusChip.classList.toggle('warn', statusWarn);
  }

  private updateLogToggleButton(): void {
    this.elements.toggleLogsBtn.textContent = this.elements.logPanel.open ? '隐藏日志' : '显示日志';
  }

  private renderLogs(): void {
    this.elements.logOutput.textContent = this.state.logs.length > 0 ? this.state.logs.join('\n') : '暂无日志';
    this.updateLogToggleButton();
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.state.logs.unshift(`[${timestamp}] ${message}`);
    this.state.logs = this.state.logs.slice(0, MAX_LOG_ENTRIES);
    this.renderLogs();
  }

  private clearError(): void {
    this.state.lastErrorText = '';
    this.elements.errorText.textContent = '暂无';
    this.elements.errorBox.classList.add('hidden');
  }

  private showError(errorText: string): void {
    this.state.lastErrorText = errorText;
    this.elements.errorText.textContent = errorText;
    this.elements.errorBox.classList.remove('hidden');
    this.openSettingsPanel();
  }

  private renderCodePanel(): void {
    const data = getCodePanelData({
      benchmarkMode: this.state.benchmarkMode,
      requestedRenderer: this.state.requestedRenderer,
      actualRenderer: this.state.actualRenderer,
      computeMode: this.state.computeMode,
      useRenderBundles: this.state.useRenderBundles,
      scenePreset: this.state.scenePreset,
      uniqueModelCount: this.state.uniqueModelCount,
      instancesPerModel: this.state.instancesPerModel,
      optimizationPath: this.state.optimizationPath,
      visibilityStrategy: this.state.visibilityStrategy,
      lightingEnabled: this.state.lightingEnabled,
      cullingMode: this.state.cullingMode,
    });

    this.elements.codeIntro.textContent = data.intro;
    this.elements.codeNotes.innerHTML = data.notes
      .map((note) => `<div class="code-note">${escapeHtml(note)}</div>`)
      .join('');
    this.elements.codeNotes.classList.toggle('hidden', data.notes.length === 0);

    if (data.sections.length === 0) {
      this.elements.codeSections.innerHTML = '<div class="code-empty">当前案例没有额外的关键代码片段可展示。</div>';
    } else {
      this.elements.codeSections.innerHTML = data.sections
        .map(
          (section) => `
            <article class="code-card">
              <div class="code-card-header">
                <div>
                  <div class="code-card-title">${escapeHtml(section.title)}</div>
                  <div class="code-card-source">${escapeHtml(section.sourceLabel)}</div>
                </div>
                <div class="code-card-lang">${escapeHtml(section.language.toUpperCase())}</div>
              </div>
              <p class="code-card-description">${escapeHtml(section.description)}</p>
              <pre class="code-snippet"><code>${escapeHtml(section.code)}</code></pre>
            </article>
          `,
        )
        .join('');
    }

    const codePanelWarn =
      this.state.actualRenderer === '初始化失败' ||
      (this.state.requestedRenderer === 'webgpu' && this.state.actualRenderer === 'WebGL');
    this.elements.codePanel.classList.toggle('warn', codePanelWarn);
  }

  private destroyScene(scene: SceneRuntime | null): void {
    if (!scene) {
      return;
    }

    for (const batch of scene.batches) {
      batch.system?.destroy?.();
    }
  }

  private disposeRuntime(): void {
    if (this.state.animationFrame !== 0) {
      cancelAnimationFrame(this.state.animationFrame);
      this.state.animationFrame = 0;
    }

    this.state.running = false;
    this.state.lastTimestamp = 0;
    this.state.elapsedTime = 0;
    this.state.framePaceSamples = [];
    this.state.metricWindowTime = 0;
    this.state.metricWindowFrames = 0;
    this.state.metricWindowFrameCost = 0;
    this.state.metricWindowUpdateCost = 0;
    this.state.metricWindowRenderCost = 0;
    this.state.metricWindowDrawCalls = 0;
    this.state.metricWindowUploadBytes = 0;
    this.submittedBatchCount = 0;
    this.submittedInstanceCount = 0;
    this.totalSceneInstanceCount = 0;
    this.submittedUploadBytes = 0;
    this.visibilityProjectionAspect = Number.NaN;

    this.state.renderer?.destroy();
    this.state.renderer = null;
    this.state.canvas = null;
    this.destroyScene(this.state.scene);
    this.state.scene = null;
    this.state.actualRenderer = '--';
  }

  private async createInstanceSystem(mode: ComputeMode, count: number, scaleBase: number): Promise<InstanceSystem> {
    if (mode === 'wasm') {
      return WasmInstanceSystem.create(count, scaleBase);
    }

    return new JSInstanceSystem(count, scaleBase);
  }

  private async createRenderer(mode: RendererMode, canvas: HTMLCanvasElement): Promise<Renderer> {
    if (mode === 'webgpu') {
      return WebGPURenderer.create(canvas, {
        useRenderBundles: this.state.useRenderBundles,
        lightingEnabled: this.state.lightingEnabled,
        cullingMode: this.state.cullingMode,
      });
    }

    return new WebGLRenderer(canvas, {
      lightingEnabled: this.state.lightingEnabled,
      cullingMode: this.state.cullingMode,
    });
  }

  private async createBestRenderer(canvas: HTMLCanvasElement): Promise<{ renderer: Renderer | null; warning: string }> {
    if (this.state.requestedRenderer === 'webgpu') {
      try {
        const renderer = await this.createRenderer('webgpu', canvas);
        return { renderer, warning: '' };
      } catch (error) {
        const message = formatError(error, 'webgpu-init');
        this.log(message);

        try {
          const renderer = await this.createRenderer('webgl', canvas);
          return {
            renderer,
            warning: '请求的 WebGPU 不可用，已自动回退到 WebGL。',
          };
        } catch (fallbackError) {
          const fallbackMessage = formatError(fallbackError, 'webgl-fallback-init');
          this.log(fallbackMessage);
          this.showError(`${message}\n\n${fallbackMessage}`);
          return {
            renderer: null,
            warning: 'WebGPU / WebGL 初始化都失败了，当前无法执行渲染。',
          };
        }
      }
    }

    try {
      const renderer = await this.createRenderer('webgl', canvas);
      return { renderer, warning: '' };
    } catch (error) {
      const message = formatError(error, 'webgl-init');
      this.log(message);
      this.showError(message);
      return {
        renderer: null,
        warning: 'WebGL 初始化失败，当前无法执行渲染。',
      };
    }
  }

  private showCanvasPlaceholder(message: string): void {
    this.elements.canvasHost.innerHTML = `<div class="canvas-placeholder">${escapeHtml(message)}</div>`;
  }

  private refreshSceneBatch(batch: SceneBatchRuntime): void {
    const source = batch.system ? batch.system.getRenderData() : batch.sourceStaticData;
    if (!source) {
      return;
    }

    transformRenderData(source, batch.renderData, batch.offset, batch.scaleMultiplier);
  }

  private getCanvasAspectRatio(): number | null {
    const rect = this.elements.canvasHost.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : (this.state.canvas?.clientWidth ?? this.state.canvas?.width ?? 0);
    const height = rect.height > 0 ? rect.height : (this.state.canvas?.clientHeight ?? this.state.canvas?.height ?? 0);

    if (width <= 0 || height <= 0) {
      return null;
    }

    return width / height;
  }

  private ensureVisibilityFrustum(): boolean {
    const aspect = this.getCanvasAspectRatio();
    if (!aspect || !Number.isFinite(aspect)) {
      return false;
    }

    if (this.visibilityProjectionAspect === aspect) {
      return true;
    }

    perspective(this.visibilityProjection, Math.PI / 4, aspect, 0.1, 100);
    multiplyMat4(this.visibilityViewProjection, this.visibilityProjection, this.visibilityView);
    extractFrustumPlanes(this.visibilityFrustumPlanes, this.visibilityViewProjection);
    this.visibilityProjectionAspect = aspect;
    return true;
  }

  private updateSubmissionStats(batches: readonly RenderBatch[], totalInstanceCount: number): void {
    this.submittedBatchCount = 0;
    this.submittedInstanceCount = 0;
    this.submittedUploadBytes = 0;
    this.totalSceneInstanceCount = totalInstanceCount;

    for (const batch of batches) {
      const instanceCount = batch.instanceData.length / RENDER_INSTANCE_STRIDE;
      this.submittedInstanceCount += instanceCount;
      if (instanceCount > 0) {
        this.submittedBatchCount += 1;
      }
      if (this.state.benchmarkMode !== 'render' && batch.uploadMode === 'dynamic') {
        this.submittedUploadBytes += batch.instanceData.byteLength;
      }
    }
  }

  // @panel-start cpu-frustum-visibility
  private filterBatchInstanceData(batch: SceneBatchRuntime, source: Float32Array): Float32Array {
    const geometryCenter = batch.geometry.bounds.center;
    const geometryRadius = batch.geometry.bounds.radius;
    if (source.length === 0 || geometryRadius <= 0) {
      return source;
    }

    let scratch = batch.visibilityScratchData;
    if (!scratch || scratch.length < source.length) {
      scratch = new Float32Array(source.length);
      batch.visibilityScratchData = scratch;
    }

    let copiedToScratch = false;
    let visibleInstanceCount = 0;

    for (let index = 0; index < source.length; index += RENDER_INSTANCE_STRIDE) {
      const scale = Math.abs(source[index + 4]);
      const visible = sphereIntersectsFrustum(
        this.visibilityFrustumPlanes,
        source[index] + geometryCenter[0] * scale,
        source[index + 1] + geometryCenter[1] * scale,
        source[index + 2] + geometryCenter[2] * scale,
        geometryRadius * scale,
      );

      if (!visible) {
        if (!copiedToScratch) {
          copiedToScratch = true;
          if (index > 0) {
            scratch.set(source.subarray(0, index), 0);
          }
        }
        continue;
      }

      if (copiedToScratch) {
        scratch.set(source.subarray(index, index + RENDER_INSTANCE_STRIDE), visibleInstanceCount * RENDER_INSTANCE_STRIDE);
      }
      visibleInstanceCount += 1;
    }

    if (!copiedToScratch) {
      return source;
    }

    return visibleInstanceCount > 0
      ? scratch.subarray(0, visibleInstanceCount * RENDER_INSTANCE_STRIDE)
      : EMPTY_INSTANCE_DATA;
  }
  // @panel-end cpu-frustum-visibility

  private collectSceneBatches(): ReturnType<typeof buildSceneBatches> {
    if (!this.state.scene) {
      this.updateSubmissionStats([], 0);
      return [];
    }

    const runtimeBatches = this.state.scene.batches;
    for (const batch of runtimeBatches) {
      this.refreshSceneBatch(batch);
    }

    const batches = buildSceneBatches(this.state.scene, this.state.benchmarkMode);
    const totalInstanceCount = batches.reduce(
      (sum, batch) => sum + batch.instanceData.length / RENDER_INSTANCE_STRIDE,
      0,
    );

    if (!this.shouldUseCpuFrustumCulling() || !this.ensureVisibilityFrustum()) {
      this.updateSubmissionStats(batches, totalInstanceCount);
      return batches;
    }

    const filteredBatches = batches.map((batch, batchIndex) => ({
      ...batch,
      instanceData: this.filterBatchInstanceData(runtimeBatches[batchIndex], batch.instanceData),
    }));

    this.updateSubmissionStats(filteredBatches, totalInstanceCount);
    return filteredBatches;
  }

  private syncMetricsHud(): void {
    drawFramePaceChart(this.elements.fpsChart, this.state.framePaceSamples);
    const summary = summarizeFramePace(this.state.framePaceSamples);

    this.elements.fpsValue.textContent =
      summary.sampleCount > 0 ? formatFpsWithJitter(summary.averageFps) : '--';
    this.elements.drawCallsValue.textContent = `${this.state.metricWindowDrawCalls}`;
  }

  private updateMetrics(frameMs: number, computeMs: number, renderMs: number): void {
    this.state.metricWindowFrameCost = frameMs;
    this.state.metricWindowUpdateCost = computeMs;
    this.state.metricWindowRenderCost = renderMs;
    this.state.metricWindowDrawCalls = this.state.renderer ? this.submittedBatchCount : 0;
    this.state.metricWindowUploadBytes =
      this.state.renderer && this.state.benchmarkMode !== 'render' ? this.submittedUploadBytes : 0;

    pushFramePaceSample(this.state.framePaceSamples, frameMs);

    if (this.canvasOnlyMode) {
      return;
    }

    this.syncMetricsHud();
  }

  private ensureCanvasSize(): { width: number; height: number } | null {
    if (!this.state.canvas) {
      return null;
    }

    const rect = this.elements.canvasHost.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (this.state.canvas.width !== width || this.state.canvas.height !== height) {
      this.state.canvas.width = width;
      this.state.canvas.height = height;
    }

    return { width, height };
  }

  private renderCurrentFrame(): void {
    if (!this.state.renderer || !this.state.canvas) {
      return;
    }

    const size = this.ensureCanvasSize();
    if (!size) {
      return;
    }

    this.state.renderer.render(size.width, size.height, this.state.elapsedTime);
  }

  private async rebuildScene(): Promise<void> {
    const rebuildToken = ++this.rebuildToken;
    this.disposeRuntime();
    this.clearError();
    this.readConfigIntoState();
    this.syncControlAvailability();
    this.updateSupportChip();
    this.updateChrome('状态：正在创建场景…');
    this.renderCodePanel();

    try {
      const scene = await createSceneRuntime({
        preset: this.state.scenePreset,
        benchmarkMode: this.state.benchmarkMode,
        meshLevel: this.state.meshLevel,
        uniqueModelCount: this.state.uniqueModelCount,
        instancesPerModel: this.state.instancesPerModel,
        instanceScale: this.state.instanceScale,
        computeMode: this.state.computeMode,
        createInstanceSystem: (mode, count, scaleBase) => this.createInstanceSystem(mode, count, scaleBase),
      });

      if (rebuildToken !== this.rebuildToken) {
        this.destroyScene(scene);
        return;
      }

      this.state.scene = scene;
      this.log(`场景就绪：${scene.title}（${scene.batches.length} 个批次）`);

      let warning = '';
      if (this.state.benchmarkMode !== 'compute') {
        const canvas = createFreshCanvas(this.elements.canvasHost);
        this.state.canvas = canvas;

        const { renderer, warning: rendererWarning } = await this.createBestRenderer(canvas);
        if (rebuildToken !== this.rebuildToken) {
          renderer?.destroy();
          this.destroyScene(scene);
          return;
        }

        warning = rendererWarning;
        this.state.renderer = renderer;
        this.state.actualRenderer = renderer?.type ?? '初始化失败';

        if (renderer) {
          renderer.setSceneBatches(this.collectSceneBatches());
          this.renderCurrentFrame();
        } else {
          this.showCanvasPlaceholder('当前环境无法创建渲染器，请查看下方错误与日志信息。');
        }
      } else {
        this.state.actualRenderer = 'N/A';
        this.showCanvasPlaceholder('当前是纯计算模式：只统计实例更新，不提交任何绘制命令。');
      }

      this.updateChrome(
        warning ? `状态：已运行（${warning}）` : '状态：运行中',
        Boolean(warning),
      );
      this.renderCodePanel();
      this.updateMetrics(0, 0, 0);

      this.state.running = true;
      this.state.animationFrame = requestAnimationFrame((timestamp) => this.tick(timestamp));
    } catch (error) {
      const errorText = formatError(error, 'rebuild-scene');
      this.showError(errorText);
      this.log(errorText);
      this.state.actualRenderer = '初始化失败';
      this.updateChrome('状态：场景创建失败', true);
      this.renderCodePanel();
      this.showCanvasPlaceholder('场景初始化失败，请展开错误与日志查看具体原因。');
    }
  }

  private tick(timestamp: number): void {
    if (!this.state.running || !this.state.scene) {
      return;
    }

    try {
      if (this.state.lastTimestamp === 0) {
        this.state.lastTimestamp = timestamp;
      }

      const rawFrameMs = Math.max(MIN_FRAME_MS, timestamp - this.state.lastTimestamp);
      const deltaSeconds = Math.min(rawFrameMs / 1000, MAX_FRAME_DELTA_SECONDS);
      const previousElapsed = this.state.elapsedTime;
      this.state.lastTimestamp = timestamp;
      this.state.elapsedTime += deltaSeconds;

      const computeStart = performance.now();
      if (this.state.benchmarkMode !== 'render') {
        const subSteps = Math.max(1, Math.round(this.state.stressLevel));
        const subStepDt = deltaSeconds / subSteps;
        for (let stepIndex = 0; stepIndex < subSteps; stepIndex += 1) {
          const stepTime = previousElapsed + subStepDt * (stepIndex + 1);
          for (const batch of this.state.scene.batches) {
            batch.system?.update(subStepDt, stepTime);
          }
        }
      }
      const computeMs = performance.now() - computeStart;

      const renderStart = performance.now();
      if (this.state.renderer) {
        if (this.state.benchmarkMode !== 'render') {
          this.state.renderer.setSceneBatches(this.collectSceneBatches());
        }
        const size = this.ensureCanvasSize();
        if (size) {
          this.state.renderer.render(size.width, size.height, this.state.elapsedTime);
        }
      }
      const renderMs = performance.now() - renderStart;

      this.updateMetrics(rawFrameMs, computeMs, renderMs);
      this.state.animationFrame = requestAnimationFrame((nextTimestamp) => this.tick(nextTimestamp));
    } catch (error) {
      const errorText = formatError(error, 'tick');
      this.showError(errorText);
      this.log(errorText);
      this.state.running = false;
      this.state.animationFrame = 0;
      this.state.actualRenderer = '初始化失败';
      this.updateChrome('状态：运行时错误', true);
      this.renderCodePanel();
    }
  }
}
