import { DEFAULT_CONFIG, type ControlFieldKey } from '../config/options';
import type {
    BenchmarkMode,
    ComputeMode,
    CullingMode,
    MeshLevel,
    OptimizationPath,
    Renderer,
    RendererMode,
    ScenePreset,
    VisibilityStrategy,
} from '../contracts/types';
import type { SceneRuntime } from '../scenes/sceneFactory';

export type DisplayRenderer = 'WebGL' | 'WebGPU' | 'N/A' | '--' | '初始化失败';

export interface AppConfig {
  scenePreset: ScenePreset;
  benchmarkMode: BenchmarkMode;
  optimizationPath: OptimizationPath;
  visibilityStrategy: VisibilityStrategy;
  requestedRenderer: RendererMode;
  computeMode: ComputeMode;
  meshLevel: MeshLevel;
  uniqueModelCount: number;
  instancesPerModel: number;
  stressLevel: number;
  instanceScale: number;
  useRenderBundles: boolean;
  lightingEnabled: boolean;
  cullingMode: CullingMode;
}

export interface AppElements {
  appShell: HTMLElement;
  canvasHost: HTMLDivElement;
  scenePresetSelect: HTMLSelectElement;
  canvasOnlyToggleBtn: HTMLButtonElement;
  exitCanvasOnlyBtn: HTMLButtonElement;
  settingsToggleBtn: HTMLButtonElement;
  closeSettingsBtn: HTMLButtonElement;
  settingsLayer: HTMLDivElement;
  benchmarkModeSelect: HTMLSelectElement;
  optimizationPathSelect: HTMLSelectElement;
  visibilityStrategySelect: HTMLSelectElement;
  rendererSelect: HTMLSelectElement;
  renderBundleToggle: HTMLInputElement;
  computeSelect: HTMLSelectElement;
  lightingToggle: HTMLInputElement;
  cullingSelect: HTMLSelectElement;
  meshSelect: HTMLSelectElement;
  uniqueModelCountRange: HTMLInputElement;
  uniqueModelCountValue: HTMLDivElement;
  instancesPerModelRange: HTMLInputElement;
  instancesPerModelValue: HTMLDivElement;
  stressSelect: HTMLSelectElement;
  scaleSelect: HTMLSelectElement;
  fieldOptionNotes: Record<ControlFieldKey, HTMLDivElement>;
  fpsChart: HTMLCanvasElement;
  fpsValue: HTMLSpanElement;
  drawCallsValue: HTMLSpanElement;
  modeChip: HTMLDivElement;
  rendererChip: HTMLDivElement;
  meshChip: HTMLDivElement;
  supportChip: HTMLDivElement;
  statusChip: HTMLDivElement;
  logPanel: HTMLDetailsElement;
  logOutput: HTMLPreElement;
  errorBox: HTMLDivElement;
  errorText: HTMLPreElement;
  toggleLogsBtn: HTMLButtonElement;
  copyErrorBtn: HTMLButtonElement;
  clearLogsBtn: HTMLButtonElement;
  codePanel: HTMLDetailsElement;
  codeIntro: HTMLParagraphElement;
  codeNotes: HTMLDivElement;
  codeSections: HTMLDivElement;
}

export type ConfigControls = Pick<
  AppElements,
  | 'scenePresetSelect'
  | 'benchmarkModeSelect'
  | 'optimizationPathSelect'
  | 'visibilityStrategySelect'
  | 'rendererSelect'
  | 'renderBundleToggle'
  | 'computeSelect'
  | 'lightingToggle'
  | 'cullingSelect'
  | 'meshSelect'
  | 'uniqueModelCountRange'
  | 'instancesPerModelRange'
  | 'stressSelect'
  | 'scaleSelect'
>;

export interface AppState extends AppConfig {
  canvas: HTMLCanvasElement | null;
  actualRenderer: DisplayRenderer;
  renderer: Renderer | null;
  scene: SceneRuntime | null;
  animationFrame: number;
  lastTimestamp: number;
  elapsedTime: number;
  fpsFrames: number;
  fpsTime: number;
  framePaceSamples: number[];
  metricWindowTime: number;
  metricWindowFrames: number;
  metricWindowFrameCost: number;
  metricWindowUpdateCost: number;
  metricWindowRenderCost: number;
  metricWindowDrawCalls: number;
  metricWindowUploadBytes: number;
  running: boolean;
  webGpuAvailable: boolean;
  logs: string[];
  lastErrorText: string;
}

export function createInitialState(): AppState {
  return {
    canvas: null,
    ...DEFAULT_CONFIG,
    actualRenderer: '--',
    renderer: null,
    scene: null,
    animationFrame: 0,
    lastTimestamp: 0,
    elapsedTime: 0,
    fpsFrames: 0,
    fpsTime: 0,
    framePaceSamples: [],
    metricWindowTime: 0,
    metricWindowFrames: 0,
    metricWindowFrameCost: 0,
    metricWindowUpdateCost: 0,
    metricWindowRenderCost: 0,
    metricWindowDrawCalls: 0,
    metricWindowUploadBytes: 0,
    running: false,
    webGpuAvailable: 'gpu' in navigator,
    logs: [],
    lastErrorText: '',
  };
}
