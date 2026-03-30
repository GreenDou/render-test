import { CANVAS_DPR_CAP } from '../contracts/renderSpec';
import type { ComputeMode, GeometryData, InstanceSystem, Renderer, RendererMode } from '../contracts/types';
import { createTorusKnotGeometry } from '../geometry/torusKnot';
import { WebGLRenderer } from '../renderers/webglRenderer';
import { WebGPURenderer } from '../renderers/webgpuRenderer';
import { JSInstanceSystem } from '../systems/jsInstanceSystem';
import { WasmInstanceSystem } from '../systems/wasmInstanceSystem';
import { getCodePanelData } from '../ui/codeCases';
import { createFreshCanvas } from './dom';
import {
    escapeHtml,
    formatDurationMs,
    formatError,
    formatFpsWithJitter,
    formatUploadBytes,
    safeStringify,
} from './formatting';
import { applySavedConfig, persistConfig, readConfigFromElements } from './persistence';
import { createInitialState, type AppElements, type AppState } from './types';

const LOG_LIMIT = 100;

export class AppController {
  private readonly state: AppState = createInitialState();
  private readonly nativeConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  private readonly tickFrame = (timestamp: number): void => {
    this.tick(timestamp);
  };

  private readonly triggerRebuild = (): void => {
    void this.rebuildScene();
  };

  private readonly handleResize = (): void => {
    if (!this.state.running || !this.state.canvas || this.state.benchmarkMode === 'compute') {
      return;
    }

    this.getCanvasSize();
  };

  private readonly handleWindowError = (event: ErrorEvent): void => {
    const text = formatError(event.error || event.message, 'window.error');
    this.setLastError(text);
    console.error(text);
  };

  private readonly handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const text = formatError(event.reason, 'unhandledrejection');
    this.setLastError(text);
    console.error(text);
  };

  private readonly handleToggleLogs = (): void => {
    this.elements.logPanel.open = !this.elements.logPanel.open;
    this.elements.toggleLogsBtn.textContent = this.elements.logPanel.open ? '隐藏日志' : '显示日志';
  };

  private readonly handleLogPanelToggle = (): void => {
    this.elements.toggleLogsBtn.textContent = this.elements.logPanel.open ? '隐藏日志' : '显示日志';
  };

  private readonly handleClearLogs = (): void => {
    this.state.logs = [];
    this.elements.logOutput.textContent = '暂无日志';
  };

  private readonly handleCopyError = (): void => {
    void this.copyErrorToClipboard();
  };

  constructor(private readonly elements: AppElements) {
    this.installConsoleCapture();
    applySavedConfig(this.elements);
    this.syncStateFromControls();
    this.bindEvents();
    this.updateSupportChip(this.state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持', !this.state.webGpuAvailable);
    this.updateStatusChips();
    this.renderCodePanel();
  }

  start(): void {
    console.info('app boot', {
      userAgent: navigator.userAgent,
      webGpuAvailable: this.state.webGpuAvailable,
      hasPreferredCanvasFormat: Boolean(navigator.gpu?.getPreferredCanvasFormat),
      secureContext: window.isSecureContext,
    });

    void this.rebuildScene();
  }

  private bindEvents(): void {
    for (const control of [
      this.elements.benchmarkModeSelect,
      this.elements.rendererSelect,
      this.elements.computeSelect,
      this.elements.meshSelect,
      this.elements.instanceSelect,
      this.elements.stressSelect,
      this.elements.scaleSelect,
    ]) {
      control.addEventListener('change', this.triggerRebuild);
    }

    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    window.addEventListener('resize', this.handleResize);
    this.elements.toggleLogsBtn.addEventListener('click', this.handleToggleLogs);
    this.elements.logPanel.addEventListener('toggle', this.handleLogPanelToggle);
    this.elements.clearLogsBtn.addEventListener('click', this.handleClearLogs);
    this.elements.copyErrorBtn.addEventListener('click', this.handleCopyError);
  }

  private installConsoleCapture(): void {
    console.log = (...args: unknown[]) => {
      this.pushLog('log', ...args);
      this.nativeConsole.log(...args);
    };

    console.info = (...args: unknown[]) => {
      this.pushLog('info', ...args);
      this.nativeConsole.info(...args);
    };

    console.warn = (...args: unknown[]) => {
      this.pushLog('warn', ...args);
      this.nativeConsole.warn(...args);
    };

    console.error = (...args: unknown[]) => {
      this.pushLog('error', ...args);
      this.nativeConsole.error(...args);
    };
  }

  private pushLog(level: 'log' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${level.toUpperCase()} ${args
      .map((item) => safeStringify(item))
      .join(' ')}`;

    this.state.logs.push(line);
    if (this.state.logs.length > LOG_LIMIT) {
      this.state.logs.shift();
    }

    this.elements.logOutput.textContent = this.state.logs.join('\n');
  }

  private syncStateFromControls(): void {
    Object.assign(this.state, readConfigFromElements(this.elements));
  }

  private setLastError(text: string): void {
    this.state.lastErrorText = text;
    this.elements.errorText.textContent = text || '暂无';
    this.elements.errorBox.classList.toggle('hidden', text.length === 0);
  }

  private setStatus(message: string, warn = false, detail = ''): void {
    this.elements.statusChip.textContent = `状态：${message}`;
    this.elements.statusChip.classList.toggle('warn', warn);
    if (detail) {
      this.setLastError(detail);
    }
  }

  private updateSupportChip(message: string, warn = false): void {
    this.elements.supportChip.textContent = `WebGPU 支持：${message}`;
    this.elements.supportChip.classList.toggle('warn', warn);
  }

  private updateStatusChips(): void {
    this.elements.modeChip.textContent = `模式：${this.state.benchmarkMode.toUpperCase()} · ${this.state.computeMode.toUpperCase()} + ${this.state.requestedRenderer.toUpperCase()}`;
    const dprSuffix =
      this.state.actualRenderer === 'WebGL' || this.state.actualRenderer === 'WebGPU' ? ` · DPR≤${CANVAS_DPR_CAP}` : '';
    this.elements.rendererChip.textContent = `实际渲染：${this.state.actualRenderer}${dprSuffix}`;
    this.elements.meshChip.textContent = `网格：${this.state.meshLevel} · ${this.state.instanceCount.toLocaleString('zh-CN')} 实例 · 压力 ${this.state.stressLevel}x`;
  }

  private renderCodePanel(): void {
    const panelData = getCodePanelData({
      benchmarkMode: this.state.benchmarkMode,
      requestedRenderer: this.state.requestedRenderer,
      actualRenderer: this.state.actualRenderer,
      computeMode: this.state.computeMode,
    });

    this.elements.codeIntro.textContent = panelData.intro;
    this.elements.codeNotes.classList.toggle('hidden', panelData.notes.length === 0);
    this.elements.codeNotes.innerHTML = panelData.notes
      .map((note) => `<div class="code-note">${escapeHtml(note)}</div>`)
      .join('');
    this.elements.codeSections.innerHTML = panelData.sections.length
      ? panelData.sections
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
          .join('')
      : '<div class="code-empty">当前案例暂无可展示的关键代码。</div>';

    const hasWarning =
      (this.state.requestedRenderer === 'webgpu' && this.state.actualRenderer === 'WebGL') ||
      this.state.actualRenderer === '初始化失败';
    this.elements.codePanel.classList.toggle('warn', hasWarning);
  }

  private resetMetricView(): void {
    this.elements.fpsValue.textContent = '--';
    this.elements.frameValue.textContent = '--';
    this.elements.updateValue.textContent = '--';
    this.elements.renderValue.textContent = '--';
    this.elements.drawCallsValue.textContent = '--';
    this.elements.uploadValue.textContent = '--';
  }

  private getCanvasSize(): { width: number; height: number } {
    if (!this.state.canvas) {
      throw new Error('Canvas 尚未创建');
    }

    const rect = this.state.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CANVAS_DPR_CAP);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));

    if (this.state.canvas.width !== width || this.state.canvas.height !== height) {
      this.state.canvas.width = width;
      this.state.canvas.height = height;
    }

    return { width, height };
  }

  private async createInstanceSystem(
    mode: ComputeMode,
    count: number,
    scale: number,
  ): Promise<InstanceSystem> {
    console.info('create instance system', { mode, count, scale });
    if (mode === 'wasm') {
      return WasmInstanceSystem.create(count, scale);
    }

    return new JSInstanceSystem(count, scale);
  }

  private async createRenderer(
    mode: RendererMode,
    canvas: HTMLCanvasElement,
    geometry: GeometryData,
  ): Promise<Renderer> {
    console.info('create renderer', mode);
    if (mode === 'webgpu') {
      return WebGPURenderer.create(canvas, geometry);
    }

    return new WebGLRenderer(canvas, geometry);
  }

  private resetRuntimeState(): void {
    cancelAnimationFrame(this.state.animationFrame);
    this.state.running = false;
    this.state.renderer?.destroy();
    this.state.system?.destroy?.();
    this.state.canvas = null;
    this.state.renderer = null;
    this.state.system = null;
    this.state.geometry = null;
    this.state.staticInstanceData = null;
    this.state.lastTimestamp = 0;
    this.state.elapsedTime = 0;
    this.state.fpsFrames = 0;
    this.state.fpsTime = 0;
    this.state.frameIntervalSamples = [];
    this.state.metricWindowTime = 0;
    this.state.metricWindowFrames = 0;
    this.state.metricWindowFrameCost = 0;
    this.state.metricWindowUpdateCost = 0;
    this.state.metricWindowRenderCost = 0;
    this.state.metricWindowDrawCalls = 0;
    this.state.metricWindowUploadBytes = 0;
    this.state.actualRenderer = '--';
    this.setLastError('');
    this.resetMetricView();
  }

  private async rebuildScene(): Promise<void> {
    this.resetRuntimeState();
    this.syncStateFromControls();
    persistConfig(this.elements);
    this.renderCodePanel();

    let supportMessage = this.state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持';
    let supportWarn = !this.state.webGpuAvailable;
    let statusMessage = '运行中';
    let statusWarn = false;
    let statusDetail = '';

    try {
      this.setStatus('创建 canvas / renderer ...');
      this.state.geometry = createTorusKnotGeometry(this.state.meshLevel);
      this.state.system = await this.createInstanceSystem(
        this.state.computeMode,
        this.state.instanceCount,
        this.state.instanceScale,
      );

      if (this.state.benchmarkMode !== 'compute') {
        if (this.state.requestedRenderer === 'webgpu' && !this.state.webGpuAvailable) {
          supportMessage = '当前浏览器不支持，已回退到 WebGL';
          supportWarn = true;
          statusMessage = 'WebGPU 不可用，已回退到 WebGL';
          statusWarn = true;
          const fallbackCanvas = createFreshCanvas(this.elements.canvasHost);
          this.state.canvas = fallbackCanvas;
          this.state.renderer = await this.createRenderer('webgl', fallbackCanvas, this.state.geometry);
          this.state.actualRenderer = this.state.renderer.type;
        } else {
          const canvas = createFreshCanvas(this.elements.canvasHost);
          this.state.canvas = canvas;
          try {
            this.state.renderer = await this.createRenderer(this.state.requestedRenderer, canvas, this.state.geometry);
            this.state.actualRenderer = this.state.renderer.type;
          } catch (error) {
            if (this.state.requestedRenderer !== 'webgpu') {
              throw error;
            }

            supportMessage = this.state.webGpuAvailable ? 'API 可见，但当前环境初始化失败' : '当前浏览器不支持';
            supportWarn = true;
            statusMessage = 'WebGPU 初始化失败，已回退到 WebGL';
            statusWarn = true;
            statusDetail = formatError(error, 'webgpu-init');
            const fallbackCanvas = createFreshCanvas(this.elements.canvasHost);
            this.state.canvas = fallbackCanvas;
            this.state.renderer = await this.createRenderer('webgl', fallbackCanvas, this.state.geometry);
            this.state.actualRenderer = this.state.renderer.type;
          }
        }
      } else {
        this.elements.canvasHost.innerHTML =
          '<div class="canvas-placeholder">纯计算模式：当前不进行复杂网格渲染，只统计 update 路径。</div>';
        this.state.actualRenderer = 'N/A';
      }

      this.updateSupportChip(supportMessage, supportWarn);
      this.state.staticInstanceData = new Float32Array(this.state.system.getRenderData());

      if (this.state.renderer) {
        this.state.renderer.setInstanceData(
          this.state.staticInstanceData,
          this.state.benchmarkMode === 'render' ? 'static' : 'dynamic',
        );
      }

      this.updateStatusChips();
      this.renderCodePanel();
      this.setStatus(statusMessage, statusWarn, statusDetail);
      this.state.running = true;
      this.tick(0);
    } catch (error) {
      const detail = formatError(error, 'rebuildScene');
      console.error('renderer init failed', detail);
      this.state.actualRenderer = '初始化失败';
      this.updateStatusChips();
      this.updateSupportChip(supportMessage, supportWarn);
      this.renderCodePanel();
      this.setStatus(error instanceof Error ? error.message : '初始化失败', true, detail);
    }
  }

  private tick(timestamp: number): void {
    const system = this.state.system;
    if (!this.state.running || !system) {
      return;
    }

    try {
      const renderer = this.state.renderer;
      const hasRenderer = Boolean(renderer && this.state.canvas && this.state.benchmarkMode !== 'compute');
      const { width, height } = hasRenderer ? this.getCanvasSize() : { width: 1, height: 1 };
      const dt = this.state.lastTimestamp ? Math.min((timestamp - this.state.lastTimestamp) / 1000, 0.033) : 0.016;
      this.state.lastTimestamp = timestamp;
      this.state.elapsedTime += dt;

      const frameStart = performance.now();
      const updateStart = performance.now();
      const subDt = dt / this.state.stressLevel;
      let instanceData = this.state.staticInstanceData;

      if (this.state.benchmarkMode !== 'render') {
        for (let index = 0; index < this.state.stressLevel; index += 1) {
          system.update(subDt, this.state.elapsedTime + index * subDt);
        }
        instanceData = system.getRenderData();
      }

      const renderStart = performance.now();
      if (hasRenderer && renderer && instanceData) {
        if (this.state.benchmarkMode !== 'render') {
          renderer.setInstanceData(instanceData);
        }
        renderer.render(width, height, this.state.elapsedTime);
      }
      const renderEnd = performance.now();

      const frameCost = renderEnd - frameStart;
      const updateCost = renderStart - updateStart;
      const renderCost = renderEnd - renderStart;
      const drawCalls = hasRenderer ? 1 : 0;
      const uploadBytes = hasRenderer && this.state.benchmarkMode !== 'render' && instanceData ? instanceData.byteLength : 0;

      this.state.fpsFrames += 1;
      this.state.fpsTime += dt;
      this.state.frameIntervalSamples.push(dt * 1000);
      if (this.state.frameIntervalSamples.length > 30) {
        this.state.frameIntervalSamples.shift();
      }

      this.state.metricWindowTime += dt;
      this.state.metricWindowFrames += 1;
      this.state.metricWindowFrameCost += frameCost;
      this.state.metricWindowUpdateCost += updateCost;
      this.state.metricWindowRenderCost += renderCost;
      this.state.metricWindowDrawCalls += drawCalls;
      this.state.metricWindowUploadBytes += uploadBytes;

      if (this.state.fpsTime >= 0.5) {
        this.elements.fpsValue.textContent = formatFpsWithJitter(
          this.state.fpsFrames / this.state.fpsTime,
          this.state.frameIntervalSamples,
        );
        this.state.fpsFrames = 0;
        this.state.fpsTime = 0;
      }

      if (this.state.metricWindowTime >= 0.25) {
        const denominator = Math.max(1, this.state.metricWindowFrames);
        this.elements.frameValue.textContent = formatDurationMs(this.state.metricWindowFrameCost / denominator);
        this.elements.updateValue.textContent = formatDurationMs(this.state.metricWindowUpdateCost / denominator);
        this.elements.renderValue.textContent = formatDurationMs(this.state.metricWindowRenderCost / denominator);
        this.elements.drawCallsValue.textContent = (this.state.metricWindowDrawCalls / denominator).toFixed(1);
        this.elements.uploadValue.textContent = formatUploadBytes(
          Math.round(this.state.metricWindowUploadBytes / denominator),
        );
        this.state.metricWindowTime = 0;
        this.state.metricWindowFrames = 0;
        this.state.metricWindowFrameCost = 0;
        this.state.metricWindowUpdateCost = 0;
        this.state.metricWindowRenderCost = 0;
        this.state.metricWindowDrawCalls = 0;
        this.state.metricWindowUploadBytes = 0;
      }

      this.state.animationFrame = requestAnimationFrame(this.tickFrame);
    } catch (error) {
      const detail = formatError(error, 'tick');
      this.state.running = false;
      console.error('render loop crashed', detail);
      this.setStatus('渲染过程中出错', true, detail);
    }
  }

  private async copyErrorToClipboard(): Promise<void> {
    const text = this.state.lastErrorText || '暂无错误';
    try {
      await navigator.clipboard.writeText(text);
      this.setStatus('错误详情已复制');
    } catch {
      this.setStatus('复制失败，请手动长按日志复制', true);
    }
  }
}
