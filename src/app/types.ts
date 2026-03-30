import { DEFAULT_CONFIG } from '../config/options';
import type {
    BenchmarkMode,
    ComputeMode,
    GeometryData,
    InstanceSystem,
    MeshLevel,
    Renderer,
    RendererMode,
} from '../contracts/types';

export type DisplayRenderer = 'WebGL' | 'WebGPU' | 'N/A' | '--' | '初始化失败';

export interface AppConfig {
  benchmarkMode: BenchmarkMode;
  requestedRenderer: RendererMode;
  computeMode: ComputeMode;
  meshLevel: MeshLevel;
  instanceCount: number;
  stressLevel: number;
  instanceScale: number;
}

export interface AppElements {
  canvasHost: HTMLDivElement;
  benchmarkModeSelect: HTMLSelectElement;
  rendererSelect: HTMLSelectElement;
  computeSelect: HTMLSelectElement;
  meshSelect: HTMLSelectElement;
  instanceSelect: HTMLSelectElement;
  stressSelect: HTMLSelectElement;
  scaleSelect: HTMLSelectElement;
  fpsValue: HTMLDivElement;
  frameValue: HTMLDivElement;
  updateValue: HTMLDivElement;
  renderValue: HTMLDivElement;
  drawCallsValue: HTMLDivElement;
  uploadValue: HTMLDivElement;
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
  | 'benchmarkModeSelect'
  | 'rendererSelect'
  | 'computeSelect'
  | 'meshSelect'
  | 'instanceSelect'
  | 'stressSelect'
  | 'scaleSelect'
>;

export interface AppState extends AppConfig {
  canvas: HTMLCanvasElement | null;
  actualRenderer: DisplayRenderer;
  renderer: Renderer | null;
  system: InstanceSystem | null;
  geometry: GeometryData | null;
  animationFrame: number;
  lastTimestamp: number;
  elapsedTime: number;
  fpsFrames: number;
  fpsTime: number;
  frameIntervalSamples: number[];
  metricWindowTime: number;
  metricWindowFrames: number;
  metricWindowFrameCost: number;
  metricWindowUpdateCost: number;
  metricWindowRenderCost: number;
  metricWindowDrawCalls: number;
  metricWindowUploadBytes: number;
  staticInstanceData: Float32Array | null;
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
    system: null,
    geometry: null,
    animationFrame: 0,
    lastTimestamp: 0,
    elapsedTime: 0,
    fpsFrames: 0,
    fpsTime: 0,
    frameIntervalSamples: [],
    metricWindowTime: 0,
    metricWindowFrames: 0,
    metricWindowFrameCost: 0,
    metricWindowUpdateCost: 0,
    metricWindowRenderCost: 0,
    metricWindowDrawCalls: 0,
    metricWindowUploadBytes: 0,
    staticInstanceData: null,
    running: false,
    webGpuAvailable: 'gpu' in navigator,
    logs: [],
    lastErrorText: '',
  };
}
