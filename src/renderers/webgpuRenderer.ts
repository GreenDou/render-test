// WebGPU 渲染器：负责将高层的渲染批次（RenderBatch）转换为 GPU 资源，
// 并提交命令到 GPU 以完成渲染。此文件对 WebGPU 的资源管理、渲染流程、
// 以及 render bundle 的生成做了封装。
import { CAMERA_CENTER, CAMERA_EYE, CAMERA_UP, CLEAR_COLOR, RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
import type { GeometryData, RenderBatch, Renderer, RenderOptions } from '../contracts/types';
import { lookAt, multiplyMat4, perspective } from '../math/matrix';
import shaderSource from './shaders/webgpu.wgsl?raw';

// 不同浏览器/实现上，获取 canvas 首选格式的方法名可能存在差异。
// 这里扩展了全局 `GPU` 类型，表示可能存在 `getPreferredCanvasFormat` 方法。
type GPUWithOptionalPreferredFormat = GPU & {
  getPreferredCanvasFormat?: () => GPUTextureFormat;
};

// 每个渲染批次对应的 GPU 资源集合。
// - geometry: 源于 CPU 端的几何信息（顶点/索引/interleaved buffer）
// - vertexBuffer/indexBuffer: 存放几何数据的 GPU buffer
// - instanceBuffer: 存放实例化数据（每个实例的位置/大小/其它属性）
// - instanceBufferCapacity: 当前 instanceBuffer 的字节容量，用于按需扩容
// - instanceCount: 当前要绘制的实例数量
// - staticUploaded: 标记此批次是否使用静态上传模式（无需每帧重新上传）
interface BatchResources {
  geometry: RenderBatch['geometry'];
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexFormat: GPUIndexFormat;
  instanceBuffer: GPUBuffer;
  instanceBufferCapacity: number;
  instanceCount: number;
  staticUploaded: boolean;
}

// WebGPU 的 writeBuffer 等 API 接受 ArrayBufferSource（如 ArrayBuffer、TypedArray 等），
// 但为了兼容不同的运行时和 TypedArray 的内部表示，这里确保传给 GPU 的数据具有
// 合适的 ArrayBuffer backing。若传入的 TypedArray 已有底层 ArrayBuffer，则直接返回；
// 否则通过复制创建一个新的 TypedArray，使其有连续的 ArrayBuffer。
function toGpuFloat32View(source: Float32Array): Float32Array<ArrayBuffer> {
  return source.buffer instanceof ArrayBuffer ? (source as Float32Array<ArrayBuffer>) : new Float32Array(source);
}

function toGpuIndexView(source: GeometryData['indices']): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  if (source.buffer instanceof ArrayBuffer) {
    return source as Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
  }

  return source instanceof Uint16Array ? new Uint16Array(source) : new Uint32Array(source);
}

// 封装创建 GPUBuffer 的逻辑，并保证至少分配 4 字节（某些实现不允许 size 为 0）。
function createGpuBuffer(device: GPUDevice, size: number, usage: number): GPUBuffer {
  return device.createBuffer({
    size: Math.max(4, size),
    usage,
  });
}

// Uniform buffer 布局与偏移说明：
// - 前 16 个 float 用于存放 4x4 的 MVP 矩阵（按列或按行顺序取决于 shader）
// - 接着一个 float 存储时间戳
// - 再接一个 float 作为 lightingEnabled 的开关
// - 为了对齐与未来扩展，统一使用 20 个 float 的缓冲区
const MODEL_VIEW_PROJECTION_FLOATS = 16;
const TIME_FLOAT_OFFSET = MODEL_VIEW_PROJECTION_FLOATS;
const LIGHTING_FLOAT_OFFSET = TIME_FLOAT_OFFSET + 1;
const UNIFORM_FLOAT_COUNT = 20;
const UNIFORM_BUFFER_SIZE = UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;

// 渲染器配置：继承自通用 RenderOptions，额外支持是否使用 render bundle
export interface WebGPURendererOptions extends RenderOptions {
  useRenderBundles?: boolean;
}

export class WebGPURenderer implements Renderer {
  /**
   * create: 工厂方法，负责检查环境并创建 WebGPU 渲染器实例。
   * - 验证浏览器是否支持 WebGPU
   * - 获取 canvas 的 GPU 上下文
   * - 请求适配器与设备
   */
  static async create(
    canvas: HTMLCanvasElement,
    options: WebGPURendererOptions = { lightingEnabled: true, cullingMode: 'none' },
  ): Promise<WebGPURenderer> {
    if (!('gpu' in navigator)) {
      throw new Error('当前浏览器不支持 WebGPU');
    }

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
      throw new Error('当前环境无法创建 WebGPU canvas context');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('无法获取 WebGPU adapter');
    }

    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, context, device, options);
  }

  // 标识渲染器类型
  readonly type = 'WebGPU' as const;

  // 私有成员：渲染相关的配置、缓冲区与状态
  private readonly format: GPUTextureFormat;
  private readonly useRenderBundles: boolean;
  private readonly options: RenderOptions;
  private readonly mvp = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS); // 当前 view-projection 矩阵
  private readonly proj = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS); // 投影矩阵
  private readonly view = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS); // 视图矩阵
  private readonly frameUniformPayload = new Float32Array(2); // time + lightingEnabled
  private readonly uniformBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly pipeline: GPURenderPipeline;
  private readonly renderPassColorAttachment: GPURenderPassColorAttachment;
  private readonly renderPassDescriptor: GPURenderPassDescriptor;
  // render bundle entries 缓存（目前仅使用索引 0）
  private readonly renderBundleEntries: GPURenderBundle[] = [];
  // 管理每个批次对应的 GPU 资源
  private readonly batchResources = new Map<string, BatchResources>();
  // 保存当前批次绘制顺序（用于稳定 render bundle）
  private batchOrder: string[] = [];
  private renderBundle: GPURenderBundle | null = null;
  private renderBundleDirty = false;
  // 深度纹理及其视图，用于 depth test
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private depthWidth = 0;
  private depthHeight = 0;
  private projectionAspect = Number.NaN;

  /**
   * 构造器内部完成大量 WebGPU 的初始化工作：
   * - 配置 canvas context
   * - 创建 uniform buffer、shader module、pipeline
   * - 创建 bind group 和 render pass descriptor
   */
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    options: WebGPURendererOptions,
  ) {
    // 是否使用 render bundle（默认启用），render bundle 在多次相同绘制命令时能提升性能
    this.useRenderBundles = options.useRenderBundles ?? true;
    this.options = {
      lightingEnabled: options.lightingEnabled,
      cullingMode: options.cullingMode,
    };
    lookAt(this.view, CAMERA_EYE, CAMERA_CENTER, CAMERA_UP);

    // 获取 canvas 的首选格式（不同实现 API 名称可能不同）
    const gpu = navigator.gpu as GPUWithOptionalPreferredFormat;
    this.format = gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
    this.context.configure({
      device,
      format: this.format,
      alphaMode: 'opaque',
    });

    // 创建 uniform buffer，用于传递 MVP、时间、lighting 开关等
    this.uniformBuffer = createGpuBuffer(device, UNIFORM_BUFFER_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    // 编译 shader 并创建 pipeline
    const shaderModule = device.createShaderModule({ code: shaderSource });
    const bindGroupEntries = [
      {
        // binding 0 对应 uniform buffer
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' as GPUBufferBindingType, minBindingSize: UNIFORM_BUFFER_SIZE },
      },
    ] satisfies GPUBindGroupLayoutEntry[];
    const bindGroupLayout = device.createBindGroupLayout({ entries: bindGroupEntries });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    // 顶点属性布局：几何数据（位置、法线/颜色等）和实例化数据（位置/大小/标志）
    const geometryAttributes = [
      { shaderLocation: 0, offset: 0, format: 'float32x3' as const },
      { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: 'float32x3' as const },
    ] satisfies GPUVertexAttribute[];
    const instanceAttributes = [
      { shaderLocation: 2, offset: 0, format: 'float32x3' as const },
      { shaderLocation: 3, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: 'float32' as const },
      { shaderLocation: 4, offset: 4 * Float32Array.BYTES_PER_ELEMENT, format: 'float32' as const },
    ] satisfies GPUVertexAttribute[];
    const vertexBuffers = [
      {
        arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
        stepMode: 'vertex' as const,
        attributes: geometryAttributes,
      },
      {
        arrayStride: RENDER_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT,
        stepMode: 'instance' as const,
        attributes: instanceAttributes,
      },
    ] satisfies GPUVertexBufferLayout[];

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsMain',
        buffers: vertexBuffers,
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: this.options.cullingMode,
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    // 创建 bind group，把 uniform buffer 绑定到 binding 0
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer,
            offset: 0,
            size: UNIFORM_BUFFER_SIZE,
          },
        },
      ],
    });

    // 渲染通道的默认设置（例如 clearColor）
    this.renderPassColorAttachment = {
      view: undefined as unknown as GPUTextureView,
      clearValue: {
        r: CLEAR_COLOR.r,
        g: CLEAR_COLOR.g,
        b: CLEAR_COLOR.b,
        a: CLEAR_COLOR.a,
      },
      loadOp: 'clear',
      storeOp: 'store',
    };
    this.renderPassDescriptor = {
      colorAttachments: [this.renderPassColorAttachment],
      depthStencilAttachment: {
        view: undefined as unknown as GPUTextureView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    };

    // 初始时若开启 render bundle，则标记为 dirty，后续会录制一次
    this.renderBundleDirty = this.useRenderBundles;
  }

  /**
   * setSceneBatches：将上层场景生成的批次应用到渲染器。
   * 主要职责：
   * - 检测批次顺序或数量变化，必要时标记 render bundle 为 dirty
   * - 同步/创建/销毁对应的 GPU 资源
   * - 上传实例数据（若不是静态且发生变化则覆盖）
   */
  setSceneBatches(batches: readonly RenderBatch[]): void {
    const nextOrder = batches.map((batch) => batch.id);
    // 若批次顺序或数量有变化，需要重新生成 render bundle
    if (nextOrder.length !== this.batchOrder.length || nextOrder.some((batchId, index) => batchId !== this.batchOrder[index])) {
      this.renderBundleDirty = true;
    }
    this.syncBatchResources(batches);
    this.batchOrder = nextOrder;

    // 遍历批次，上传或更新实例数据
    for (const batch of batches) {
      const resources = this.batchResources.get(batch.id);
      if (!resources) {
        continue; // 资源尚未创建则跳过（syncBatchResources 已负责创建）
      }

      // 当前实例布局由 RENDER_INSTANCE_STRIDE 定义，因此实例数 = 总 float 数 / stride
      const nextInstanceCount = batch.instanceData.length / RENDER_INSTANCE_STRIDE;
      // 若为静态上传模式且已经上传过且实例数未变，则无需重复上传
      if (batch.uploadMode === 'static' && resources.staticUploaded && resources.instanceCount === nextInstanceCount) {
        continue;
      }

      // 确保 instance buffer 的容量足够；若不足则重分配
      this.ensureInstanceBuffer(resources, batch.instanceData.byteLength);
      if (resources.instanceCount !== nextInstanceCount) {
        resources.instanceCount = nextInstanceCount;
        this.renderBundleDirty = true; // 实例数量变化也会影响 render bundle
      }
      resources.staticUploaded = batch.uploadMode === 'static';
      // 将实例数据写入 GPU buffer
      this.device.queue.writeBuffer(
        resources.instanceBuffer,
        0,
        toGpuFloat32View(batch.instanceData) as unknown as GPUAllowSharedBufferSource,
      );
    }
  }

  /**
   * render: 每帧调用，负责设置相机矩阵、写入 uniform，编码 render pass，
   * 并提交命令到 GPU。
   * - 若启用 render bundle：尝试重用已录制的 bundle。
   * - 否则：动态设置 pipeline/bind group 并逐批 draw
   */
  render(width: number, height: number, time: number): void {
    this.ensureDepthTexture(width, height);
    this.ensureViewProjection(width / height);
    this.frameUniformPayload[0] = time;
    this.frameUniformPayload[1] = this.options.lightingEnabled ? 1 : 0;
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      TIME_FLOAT_OFFSET * Float32Array.BYTES_PER_ELEMENT,
      this.frameUniformPayload as unknown as GPUAllowSharedBufferSource,
    );

    const commandEncoder = this.device.createCommandEncoder();
    // 更新当前渲染目标 view
    this.renderPassColorAttachment.view = this.context.getCurrentTexture().createView();
    this.renderPassDescriptor.depthStencilAttachment!.view = this.depthTextureView!;
    const renderPass = commandEncoder.beginRenderPass(this.renderPassDescriptor);

    if (this.useRenderBundles) {
      // 使用 render bundle：先确保 bundle 已生成或已刷新
      this.ensureRenderBundle();
      if (this.renderBundleEntries.length > 0) {
        // 将录制好的 bundle 执行一次
        renderPass.executeBundles(this.renderBundleEntries);
      }
    } else {
      // 非 bundle 路径：逐个 batch 设置 buffer 并 draw
      renderPass.setPipeline(this.pipeline);
      renderPass.setBindGroup(0, this.bindGroup);
      for (const batchId of this.batchOrder) {
        const resources = this.batchResources.get(batchId);
        if (!resources || resources.instanceCount === 0) {
          continue;
        }
        renderPass.setVertexBuffer(0, resources.vertexBuffer);
        renderPass.setVertexBuffer(1, resources.instanceBuffer);
        renderPass.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
        // drawIndexed 的第二个参数为实例数量
        renderPass.drawIndexed(resources.geometry.indices.length, resources.instanceCount);
      }
    }
    renderPass.end();

    // 提交命令列表到 GPU
    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * destroy: 销毁所有 GPU 资源，释放内存。
   */
  destroy(): void {
    this.batchResources.forEach((resources) => {
      resources.vertexBuffer.destroy();
      resources.indexBuffer.destroy();
      resources.instanceBuffer.destroy();
    });
    this.batchResources.clear();
    this.uniformBuffer.destroy();
    this.depthTexture?.destroy();
    this.depthTextureView = null;
    this.renderBundle = null;
    this.renderBundleEntries.length = 0;
  }

  /**
   * syncBatchResources: 确保所有传入的批次都拥有对应的 GPU 资源。
   * - 删除不再需要的资源
   * - 为新的或 geometry 有变化的批次创建/替换 GPU buffer
   */
  private syncBatchResources(batches: readonly RenderBatch[]): void {
    const nextIds = new Set(batches.map((batch) => batch.id));

    // 清理不再需要的 batch 资源
    this.batchResources.forEach((resources, batchId) => {
      if (nextIds.has(batchId)) {
        return;
      }

      resources.vertexBuffer.destroy();
      resources.indexBuffer.destroy();
      resources.instanceBuffer.destroy();
      this.batchResources.delete(batchId);
      this.renderBundleDirty = true;
    });

    // 为每个 batch 创建或替换资源（当 geometry 发生变化时替换）
    for (const batch of batches) {
      const existingResources = this.batchResources.get(batch.id);
      if (existingResources && existingResources.geometry === batch.geometry) {
        continue; // geometry 未变化，无需重新上传
      }

      if (existingResources) {
        existingResources.vertexBuffer.destroy();
        existingResources.indexBuffer.destroy();
        existingResources.instanceBuffer.destroy();
      }

      // 创建并上传顶点/索引数据
      const vertexBuffer = createGpuBuffer(
        this.device,
        batch.geometry.interleaved.byteLength,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      );
      this.device.queue.writeBuffer(
        vertexBuffer,
        0,
        toGpuFloat32View(batch.geometry.interleaved) as unknown as GPUAllowSharedBufferSource,
      );

      const indexBuffer = createGpuBuffer(
        this.device,
        batch.geometry.indices.byteLength,
        GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      );
      this.device.queue.writeBuffer(
        indexBuffer,
        0,
        toGpuIndexView(batch.geometry.indices) as unknown as GPUAllowSharedBufferSource,
      );

      // 为实例数据分配 buffer（实际写入在 setSceneBatches 中完成）
      const instanceBuffer = createGpuBuffer(
        this.device,
        batch.instanceData.byteLength,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      );

      this.batchResources.set(batch.id, {
        geometry: batch.geometry,
        vertexBuffer,
        indexBuffer,
        indexFormat: batch.geometry.indexFormat,
        instanceBuffer,
        instanceBufferCapacity: batch.instanceData.byteLength,
        instanceCount: 0,
        staticUploaded: false,
      });
      this.renderBundleDirty = true; // 新增资源或 geometry 变化会令 render bundle 失效
    }
  }

  /**
   * 确保 instance buffer 的容量足够；若不足则释放旧 buffer 并分配新的
   */
  private ensureInstanceBuffer(resources: BatchResources, byteLength: number): void {
    if (resources.instanceBufferCapacity >= byteLength) {
      return;
    }

    resources.instanceBuffer.destroy();
    resources.instanceBufferCapacity = Math.max(
      byteLength,
      Math.max(RENDER_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT, resources.instanceBufferCapacity * 2),
    );
    resources.instanceBuffer = createGpuBuffer(
      this.device,
      resources.instanceBufferCapacity,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
    this.renderBundleDirty = true; // buffer 变化需要刷新 bundle
  }

  private ensureViewProjection(aspect: number): void {
    if (this.projectionAspect === aspect) {
      return;
    }

    perspective(this.proj, Math.PI / 4, aspect, 0.1, 100);
    multiplyMat4(this.mvp, this.proj, this.view);
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.mvp as unknown as GPUAllowSharedBufferSource,
    );
    this.projectionAspect = aspect;
  }

  /**
   * 管理深度纹理：当 canvas 大小变化或第一次渲染时创建或重建深度纹理
   */
  private ensureDepthTexture(width: number, height: number): void {
    if (this.depthTexture && this.depthWidth === width && this.depthHeight === height) {
      return;
    }

    this.depthTexture?.destroy();
    this.depthWidth = width;
    this.depthHeight = height;
    this.depthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTextureView = this.depthTexture.createView();
  }

  /**
   * ensureRenderBundle: 录制或刷新 render bundle，用于复用一组固定的绘制命令。
   * render bundle 对于不频繁变更的绘制序列能极大减少每帧的命令编码开销。
   */
  private ensureRenderBundle(): void {
    if (!this.useRenderBundles) {
      return;
    }

    if (!this.renderBundleDirty && this.renderBundle) {
      return; // bundle 有效且未标记脏，直接复用
    }

    const bundleEncoder = this.device.createRenderBundleEncoder({
      colorFormats: [this.format],
      depthStencilFormat: 'depth24plus',
    });

    bundleEncoder.setPipeline(this.pipeline);
    bundleEncoder.setBindGroup(0, this.bindGroup);

    // 将按 batchOrder 排序的绘制命令录制到 bundle 中
    // @panel-start webgpu-bundle
    for (const batchId of this.batchOrder) {
      const resources = this.batchResources.get(batchId);
      if (!resources || resources.instanceCount === 0) {
        continue;
      }
      bundleEncoder.setVertexBuffer(0, resources.vertexBuffer);
      bundleEncoder.setVertexBuffer(1, resources.instanceBuffer);
      bundleEncoder.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
      bundleEncoder.drawIndexed(resources.geometry.indices.length, resources.instanceCount);
    }
    // @panel-end webgpu-bundle

    this.renderBundle = bundleEncoder.finish();
    this.renderBundleEntries[0] = this.renderBundle;
    this.renderBundleDirty = false;
  }
}
