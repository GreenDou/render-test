import { RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
import type {
  BenchmarkMode,
  ComputeMode,
  GeometryData,
  InstanceSystem,
  MeshLevel,
  RenderBatch,
  ScenePreset,
  UploadMode,
} from '../contracts/types';
import { getUniqueGeometryCatalog } from '../geometry/geometryRegistry';
import { createCubeGeometry } from '../geometry/primitives';
import { createTorusKnotGeometry } from '../geometry/torusKnot';

export interface SceneBatchRuntime {
  id: string;
  label: string;
  geometry: GeometryData;
  dynamic: boolean;
  preferredUploadMode: UploadMode;
  system: InstanceSystem | null;
  sourceStaticData: Float32Array | null;
  renderData: Float32Array;
  visibilityScratchData: Float32Array | null;
  offset: readonly [number, number, number];
  scaleMultiplier: number;
}

export interface SceneRuntime {
  preset: ScenePreset;
  title: string;
  description: string;
  batches: SceneBatchRuntime[];
}

interface SceneFactoryOptions {
  preset: ScenePreset;
  benchmarkMode: BenchmarkMode;
  meshLevel: MeshLevel;
  uniqueModelCount: number;
  instancesPerModel: number;
  instanceScale: number;
  computeMode: ComputeMode;
  createInstanceSystem: (mode: ComputeMode, count: number, scale: number) => Promise<InstanceSystem>;
}

function createGridRenderData(count: number, scaleBase: number): Float32Array {
  const data = new Float32Array(count * RENDER_INSTANCE_STRIDE);
  const columns = Math.max(2, Math.ceil(Math.cbrt(count)));
  const rows = Math.max(2, Math.ceil(count / columns));
  const spacing = 1.55;

  for (let index = 0; index < count; index += 1) {
    const xIndex = index % columns;
    const zIndex = Math.floor(index / columns) % columns;
    const yIndex = Math.floor(index / (columns * columns));
    const base = index * RENDER_INSTANCE_STRIDE;

    data[base] = (xIndex - (columns - 1) * 0.5) * spacing;
    data[base + 1] = (yIndex - (rows - 1) * 0.2) * spacing * 0.72;
    data[base + 2] = (zIndex - (columns - 1) * 0.5) * spacing;
    data[base + 3] = (index * 0.41) % (Math.PI * 2);
    data[base + 4] = scaleBase * (0.62 + (index % 5) * 0.08);
  }

  return data;
}

function getRequestedEntityCount(options: Pick<SceneFactoryOptions, 'uniqueModelCount' | 'instancesPerModel'>): number {
  return Math.max(1, options.uniqueModelCount) * Math.max(1, options.instancesPerModel);
}

function computeBatchOffset(index: number, uniqueModelCount: number, instancesPerModel: number): readonly [number, number, number] {
  const columns = Math.max(2, Math.ceil(Math.cbrt(uniqueModelCount)));
  const layerSize = columns * columns;
  const layers = Math.max(1, Math.ceil(uniqueModelCount / layerSize));
  const xIndex = index % columns;
  const zIndex = Math.floor(index / columns) % columns;
  const yIndex = Math.floor(index / layerSize);
  const spacing = 4.25 + Math.min(3.25, Math.log2(instancesPerModel + 1) * 0.92);

  return [
    (xIndex - (columns - 1) * 0.5) * spacing,
    (yIndex - (layers - 1) * 0.5) * spacing * 0.72,
    (zIndex - (columns - 1) * 0.5) * spacing,
  ];
}

export function transformRenderData(
  source: Float32Array,
  target: Float32Array,
  offset: readonly [number, number, number],
  scaleMultiplier: number,
): Float32Array {
  // @panel-start scene-batch-transform
  for (let index = 0; index < source.length; index += RENDER_INSTANCE_STRIDE) {
    target[index] = source[index] + offset[0];
    target[index + 1] = source[index + 1] + offset[1];
    target[index + 2] = source[index + 2] + offset[2];
    target[index + 3] = source[index + 3];
    target[index + 4] = source[index + 4] * scaleMultiplier;
  }
  // @panel-end scene-batch-transform

  return target;
}

async function createDynamicBatch(
  id: string,
  label: string,
  geometry: GeometryData,
  count: number,
  scale: number,
  computeMode: ComputeMode,
  createInstanceSystem: SceneFactoryOptions['createInstanceSystem'],
  offset: readonly [number, number, number],
  scaleMultiplier: number,
): Promise<SceneBatchRuntime> {
  const system = await createInstanceSystem(computeMode, count, scale * scaleMultiplier);
  const source = system.getRenderData();
  const renderData = new Float32Array(source.length);
  transformRenderData(source, renderData, offset, 1);

  return {
    id,
    label,
    geometry,
    dynamic: true,
    preferredUploadMode: 'dynamic',
    system,
    sourceStaticData: null,
    renderData,
    visibilityScratchData: null,
    offset,
    scaleMultiplier: 1,
  };
}

function createStaticBatch(
  id: string,
  label: string,
  geometry: GeometryData,
  sourceStaticData: Float32Array,
  offset: readonly [number, number, number],
  scaleMultiplier: number,
): SceneBatchRuntime {
  const renderData = new Float32Array(sourceStaticData.length);
  transformRenderData(sourceStaticData, renderData, offset, scaleMultiplier);

  return {
    id,
    label,
    geometry,
    dynamic: false,
    preferredUploadMode: 'static',
    system: null,
    sourceStaticData,
    renderData,
    visibilityScratchData: null,
    offset,
    scaleMultiplier,
  };
}

function getSceneTitle(preset: ScenePreset): string {
  switch (preset) {
    case 'static-dynamic-mix':
      return '静态 + 动态混合';
    default:
      return '唯一模型 / DrawCall 压力';
  }
}

function getSceneDescription(options: SceneFactoryOptions): string {
  if (options.preset === 'static-dynamic-mix') {
    return `总实体预算约 ${getRequestedEntityCount(options).toLocaleString('zh-CN')}，并按静态背景批次与动态主批次拆分。`;
  }

  return `当前会生成 ${options.uniqueModelCount.toLocaleString('zh-CN')} 个唯一几何批次，每个批次 ${options.instancesPerModel.toLocaleString('zh-CN')} 个实例。`;
}

async function createDrawCallStressScene(options: SceneFactoryOptions): Promise<SceneRuntime> {
  const uniqueModelCount = Math.max(1, options.uniqueModelCount);
  const instancesPerModel = Math.max(1, options.instancesPerModel);
  const geometryCatalog = getUniqueGeometryCatalog(options.meshLevel, uniqueModelCount);
  const batches = await Promise.all(
    geometryCatalog.map((entry, index) => {
      const offset = computeBatchOffset(index, uniqueModelCount, instancesPerModel);

      if (options.benchmarkMode === 'render') {
        return Promise.resolve(
          createStaticBatch(
            `scene-unique-${index}`,
            entry.label,
            entry.geometry,
            createGridRenderData(instancesPerModel, options.instanceScale),
            offset,
            1,
          ),
        );
      }

      return createDynamicBatch(
        `scene-unique-${index}`,
        entry.label,
        entry.geometry,
        instancesPerModel,
        options.instanceScale,
        options.computeMode,
        options.createInstanceSystem,
        offset,
        1,
      );
    }),
  );

  return {
    preset: options.preset,
    title: getSceneTitle(options.preset),
    description: getSceneDescription(options),
    batches,
  };
}

export function buildSceneBatches(
  scene: SceneRuntime,
  benchmarkMode: BenchmarkMode,
): RenderBatch[] {
  return scene.batches.map((batch) => ({
    id: batch.id,
    label: batch.label,
    geometry: batch.geometry,
    instanceData: batch.renderData,
    uploadMode: batch.dynamic && benchmarkMode !== 'render' ? 'dynamic' : batch.preferredUploadMode,
  }));
}

export async function createSceneRuntime(options: SceneFactoryOptions): Promise<SceneRuntime> {
  const totalCount = getRequestedEntityCount(options);
  const baseScale = options.instanceScale;
  const torusGeometry = createTorusKnotGeometry(options.meshLevel);

  // @panel-start scene-preset
  switch (options.preset) {
    case 'static-dynamic-mix': {
      const staticCount = Math.max(32, Math.floor(totalCount * 0.45));
      const dynamicCount = Math.max(24, totalCount - staticCount);
      const staticBatch = createStaticBatch(
        'scene-static-grid',
        '静态 Cube 背景',
        createCubeGeometry(1.5),
        createGridRenderData(staticCount, baseScale * 0.72),
        [0, -3.2, -2.4],
        1,
      );
      const dynamicBatch = await createDynamicBatch(
        'scene-dynamic-torus',
        '动态 Torus Knot',
        torusGeometry,
        dynamicCount,
        baseScale,
        options.computeMode,
        options.createInstanceSystem,
        [0, 1.35, 0],
        1,
      );

      return {
        preset: options.preset,
        title: getSceneTitle(options.preset),
        description: getSceneDescription(options),
        batches: [staticBatch, dynamicBatch],
      };
    }

    default: {
      return createDrawCallStressScene(options);
    }
  }
  // @panel-end scene-preset
}
