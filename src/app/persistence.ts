import {
  BENCHMARK_MODE_OPTIONS,
  COMPUTE_OPTIONS,
  CULLING_MODE_OPTIONS,
  DEFAULT_CONFIG,
  INSTANCES_PER_MODEL_RANGE,
  MESH_OPTIONS,
  OPTIMIZATION_PATH_OPTIONS,
  RENDERER_OPTIONS,
  SCALE_OPTIONS,
  SCENE_PRESET_OPTIONS,
  STORAGE_KEY,
  STRESS_LEVEL_OPTIONS,
  UNIQUE_MODEL_COUNT_RANGE,
  VISIBILITY_STRATEGY_OPTIONS,
} from '../config/options';
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
import type { AppConfig, ConfigControls } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function includesOptionValue<T extends string | number>(
  options: ReadonlyArray<SelectOption<T>>,
  candidate: unknown,
): candidate is T {
  return options.some((option) => option.value === candidate);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(resolved)));
}

function resolveLegacyScenePreset(candidate: unknown): ScenePreset {
  if (candidate === 'static-dynamic-mix') {
    return 'static-dynamic-mix';
  }

  return 'draw-call-stress';
}

function resolveSliderPairFromTotal(totalEntities: number, preferredUniqueModels = 1): {
  uniqueModelCount: number;
  instancesPerModel: number;
} {
  const normalizedTotal = Math.max(1, Math.round(totalEntities));
  const uniqueModelCount = clampInteger(
    Math.max(preferredUniqueModels, Math.ceil(normalizedTotal / INSTANCES_PER_MODEL_RANGE.max)),
    UNIQUE_MODEL_COUNT_RANGE.min,
    UNIQUE_MODEL_COUNT_RANGE.max,
    DEFAULT_CONFIG.uniqueModelCount,
  );
  const instancesPerModel = clampInteger(
    Math.ceil(normalizedTotal / uniqueModelCount),
    INSTANCES_PER_MODEL_RANGE.min,
    INSTANCES_PER_MODEL_RANGE.max,
    DEFAULT_CONFIG.instancesPerModel,
  );

  return { uniqueModelCount, instancesPerModel };
}

export function readConfigFromElements(elements: ConfigControls): AppConfig {
  return {
    scenePreset: elements.scenePresetSelect.value as ScenePreset,
    benchmarkMode: elements.benchmarkModeSelect.value as BenchmarkMode,
    optimizationPath: elements.optimizationPathSelect.value as OptimizationPath,
    visibilityStrategy: elements.visibilityStrategySelect.value as VisibilityStrategy,
    requestedRenderer: elements.rendererSelect.value as RendererMode,
    computeMode: elements.computeSelect.value as ComputeMode,
    lightingEnabled: elements.lightingToggle.checked,
    cullingMode: elements.cullingSelect.value as CullingMode,
    meshLevel: elements.meshSelect.value as MeshLevel,
    uniqueModelCount: Number(elements.uniqueModelCountRange.value),
    instancesPerModel: Number(elements.instancesPerModelRange.value),
    stressLevel: Number(elements.stressSelect.value),
    instanceScale: Number(elements.scaleSelect.value),
    useRenderBundles: elements.renderBundleToggle.checked,
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

    const scenePreset = parsedValue.scenePreset ?? parsedValue.scene;
    const benchmarkMode = parsedValue.benchmarkMode;
    const optimizationPath = parsedValue.optimizationPath ?? parsedValue.path;
    const visibilityStrategy = parsedValue.visibilityStrategy ?? parsedValue.visibility;
    const renderer = parsedValue.requestedRenderer ?? parsedValue.renderer;
    const computeMode = parsedValue.computeMode ?? parsedValue.compute;
    const lightingEnabled = parsedValue.lightingEnabled ?? parsedValue.lighting;
    const cullingMode = parsedValue.cullingMode ?? parsedValue.culling;
    const meshLevel = parsedValue.meshLevel ?? parsedValue.mesh;
    const uniqueModelCount = parsedValue.uniqueModelCount ?? parsedValue.uniqueModels ?? parsedValue.modelCount;
    const instancesPerModel = parsedValue.instancesPerModel ?? parsedValue.instancesEach ?? parsedValue.perModelInstances;
    const legacyInstanceCount = parsedValue.instanceCount ?? parsedValue.instances;
    const stressLevel = parsedValue.stressLevel ?? parsedValue.stress;
    const instanceScale = parsedValue.instanceScale ?? parsedValue.scale;
    const useRenderBundles = parsedValue.useRenderBundles ?? parsedValue.renderBundle;

    const resolvedScenePreset = resolveLegacyScenePreset(scenePreset);
    const legacyPreferredUniqueModels = scenePreset === 'single-instanced' ? 1 : scenePreset === 'multi-model-few-instances' ? 3 : DEFAULT_CONFIG.uniqueModelCount;
    const resolvedSliders = uniqueModelCount !== undefined || instancesPerModel !== undefined
      ? {
          uniqueModelCount: clampInteger(
            uniqueModelCount,
            UNIQUE_MODEL_COUNT_RANGE.min,
            UNIQUE_MODEL_COUNT_RANGE.max,
            DEFAULT_CONFIG.uniqueModelCount,
          ),
          instancesPerModel: clampInteger(
            instancesPerModel,
            INSTANCES_PER_MODEL_RANGE.min,
            INSTANCES_PER_MODEL_RANGE.max,
            DEFAULT_CONFIG.instancesPerModel,
          ),
        }
      : legacyInstanceCount !== undefined
        ? resolveSliderPairFromTotal(Number(legacyInstanceCount), legacyPreferredUniqueModels)
        : {
            uniqueModelCount: DEFAULT_CONFIG.uniqueModelCount,
            instancesPerModel: DEFAULT_CONFIG.instancesPerModel,
          };

    if (SCENE_PRESET_OPTIONS.some((option) => option.value === resolvedScenePreset)) {
      elements.scenePresetSelect.value = resolvedScenePreset;
    }
    if (typeof benchmarkMode === 'string' && BENCHMARK_MODE_OPTIONS.some((option) => option.value === benchmarkMode)) {
      elements.benchmarkModeSelect.value = benchmarkMode;
    }
    if (typeof optimizationPath === 'string' && OPTIMIZATION_PATH_OPTIONS.some((option) => option.value === optimizationPath)) {
      elements.optimizationPathSelect.value = optimizationPath;
    }
    if (typeof visibilityStrategy === 'string' && VISIBILITY_STRATEGY_OPTIONS.some((option) => option.value === visibilityStrategy)) {
      elements.visibilityStrategySelect.value = visibilityStrategy;
    }
    if (typeof renderer === 'string' && RENDERER_OPTIONS.some((option) => option.value === renderer)) {
      elements.rendererSelect.value = renderer;
    }
    if (typeof computeMode === 'string' && COMPUTE_OPTIONS.some((option) => option.value === computeMode)) {
      elements.computeSelect.value = computeMode;
    }
    if (typeof cullingMode === 'string' && CULLING_MODE_OPTIONS.some((option) => option.value === cullingMode)) {
      elements.cullingSelect.value = cullingMode;
    }
    if (typeof meshLevel === 'string' && MESH_OPTIONS.some((option) => option.value === meshLevel)) {
      elements.meshSelect.value = meshLevel;
    }
    elements.uniqueModelCountRange.value = String(resolvedSliders.uniqueModelCount);
    elements.instancesPerModelRange.value = String(resolvedSliders.instancesPerModel);
    if (includesOptionValue(STRESS_LEVEL_OPTIONS, stressLevel)) {
      elements.stressSelect.value = String(stressLevel);
    }
    if (includesOptionValue(SCALE_OPTIONS, instanceScale)) {
      elements.scaleSelect.value = String(instanceScale);
    }
    if (typeof useRenderBundles === 'boolean') {
      elements.renderBundleToggle.checked = useRenderBundles;
    }
    if (typeof lightingEnabled === 'boolean') {
      elements.lightingToggle.checked = lightingEnabled;
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
