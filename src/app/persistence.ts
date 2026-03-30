import {
    BENCHMARK_MODE_OPTIONS,
    COMPUTE_OPTIONS,
    INSTANCE_OPTIONS,
    MESH_OPTIONS,
    RENDERER_OPTIONS,
    SCALE_OPTIONS,
    STORAGE_KEY,
    STRESS_LEVEL_OPTIONS,
} from '../config/options';
import type { BenchmarkMode, ComputeMode, MeshLevel, RendererMode } from '../contracts/types';
import type { AppConfig, ConfigControls } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function includesNumber(values: readonly number[], candidate: unknown): candidate is number {
  return typeof candidate === 'number' && values.includes(candidate);
}

export function readConfigFromElements(elements: ConfigControls): AppConfig {
  return {
    benchmarkMode: elements.benchmarkModeSelect.value as BenchmarkMode,
    requestedRenderer: elements.rendererSelect.value as RendererMode,
    computeMode: elements.computeSelect.value as ComputeMode,
    meshLevel: elements.meshSelect.value as MeshLevel,
    instanceCount: Number(elements.instanceSelect.value),
    stressLevel: Number(elements.stressSelect.value),
    instanceScale: Number(elements.scaleSelect.value),
  };
}

export function applySavedConfig(elements: ConfigControls): void {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) {
      return;
    }

    const benchmarkMode = parsedValue.benchmarkMode;
    const renderer = parsedValue.requestedRenderer ?? parsedValue.renderer;
    const computeMode = parsedValue.computeMode ?? parsedValue.compute;
    const meshLevel = parsedValue.meshLevel ?? parsedValue.mesh;
    const instanceCount = parsedValue.instanceCount ?? parsedValue.instances;
    const stressLevel = parsedValue.stressLevel ?? parsedValue.stress;
    const instanceScale = parsedValue.instanceScale ?? parsedValue.scale;

    if (typeof benchmarkMode === 'string' && BENCHMARK_MODE_OPTIONS.some((option) => option.value === benchmarkMode)) {
      elements.benchmarkModeSelect.value = benchmarkMode;
    }
    if (typeof renderer === 'string' && RENDERER_OPTIONS.some((option) => option.value === renderer)) {
      elements.rendererSelect.value = renderer;
    }
    if (typeof computeMode === 'string' && COMPUTE_OPTIONS.some((option) => option.value === computeMode)) {
      elements.computeSelect.value = computeMode;
    }
    if (typeof meshLevel === 'string' && MESH_OPTIONS.some((option) => option.value === meshLevel)) {
      elements.meshSelect.value = meshLevel;
    }
    if (includesNumber(INSTANCE_OPTIONS, instanceCount)) {
      elements.instanceSelect.value = String(instanceCount);
    }
    if (includesNumber(STRESS_LEVEL_OPTIONS, stressLevel)) {
      elements.stressSelect.value = String(stressLevel);
    }
    if (includesNumber(SCALE_OPTIONS, instanceScale)) {
      elements.scaleSelect.value = String(instanceScale);
    }
  } catch (error) {
    console.warn('load saved config failed', error);
  }
}

export function persistConfig(elements: ConfigControls): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readConfigFromElements(elements)));
  } catch (error) {
    console.warn('save config failed', error);
  }
}
