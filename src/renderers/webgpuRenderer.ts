import { CAMERA_CENTER, CAMERA_EYE, CAMERA_UP, CLEAR_COLOR } from '../contracts/renderSpec';
import type { GeometryData, Renderer, UploadMode } from '../contracts/types';
import { lookAt, multiplyMat4, perspective } from '../math/matrix';
import shaderSource from './shaders/webgpu.wgsl?raw';

type GPUWithOptionalPreferredFormat = GPU & {
  getPreferredCanvasFormat?: () => GPUTextureFormat;
};

function toGpuFloat32View(source: Float32Array): Float32Array<ArrayBuffer> {
  return source.buffer instanceof ArrayBuffer ? (source as Float32Array<ArrayBuffer>) : new Float32Array(source);
}

function toGpuUint32View(source: Uint32Array): Uint32Array<ArrayBuffer> {
  return source.buffer instanceof ArrayBuffer ? (source as Uint32Array<ArrayBuffer>) : new Uint32Array(source);
}

function createGpuBuffer(device: GPUDevice, size: number, usage: number): GPUBuffer {
  return device.createBuffer({
    size: Math.max(4, size),
    usage,
  });
}

const MODEL_VIEW_PROJECTION_FLOATS = 16;
const TIME_FLOAT_OFFSET = MODEL_VIEW_PROJECTION_FLOATS;
const UNIFORM_FLOAT_COUNT = 20;
const UNIFORM_BUFFER_SIZE = UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;

export class WebGPURenderer implements Renderer {
  static async create(canvas: HTMLCanvasElement, geometry: GeometryData): Promise<WebGPURenderer> {
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
    return new WebGPURenderer(canvas, geometry, context, device);
  }

  readonly type = 'WebGPU' as const;

  private readonly format: GPUTextureFormat;
  private readonly mvp = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS);
  private readonly proj = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS);
  private readonly view = new Float32Array(MODEL_VIEW_PROJECTION_FLOATS);
  private readonly uniformPayload = new Float32Array(UNIFORM_FLOAT_COUNT);
  private readonly vertexBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly uniformBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly pipeline: GPURenderPipeline;
  private instanceBuffer: GPUBuffer;
  private instanceBufferCapacity = 5 * Float32Array.BYTES_PER_ELEMENT;
  private instanceCount = 0;
  private depthTexture: GPUTexture | null = null;
  private depthWidth = 0;
  private depthHeight = 0;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly geometry: GeometryData,
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
  ) {
    const gpu = navigator.gpu as GPUWithOptionalPreferredFormat;
    this.format = gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
    this.context.configure({
      device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.vertexBuffer = createGpuBuffer(device, geometry.interleaved.byteLength, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      toGpuFloat32View(geometry.interleaved) as unknown as GPUAllowSharedBufferSource,
    );
    this.indexBuffer = createGpuBuffer(device, geometry.indices.byteLength, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(
      this.indexBuffer,
      0,
      toGpuUint32View(geometry.indices) as unknown as GPUAllowSharedBufferSource,
    );
    this.instanceBuffer = createGpuBuffer(device, this.instanceBufferCapacity, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    this.uniformBuffer = createGpuBuffer(device, UNIFORM_BUFFER_SIZE, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    const shaderModule = device.createShaderModule({ code: shaderSource });
    const bindGroupEntries = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' as GPUBufferBindingType, minBindingSize: UNIFORM_BUFFER_SIZE },
      },
    ] satisfies GPUBindGroupLayoutEntry[];
    const bindGroupLayout = device.createBindGroupLayout({
      entries: bindGroupEntries,
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const vertexBuffers = [
      {
        arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
        stepMode: 'vertex' as GPUVertexStepMode,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' as GPUVertexFormat },
          {
            shaderLocation: 1,
            offset: 3 * Float32Array.BYTES_PER_ELEMENT,
            format: 'float32x3' as GPUVertexFormat,
          },
        ],
      },
      {
        arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
        stepMode: 'instance' as GPUVertexStepMode,
        attributes: [
          { shaderLocation: 2, offset: 0, format: 'float32x3' as GPUVertexFormat },
          {
            shaderLocation: 3,
            offset: 3 * Float32Array.BYTES_PER_ELEMENT,
            format: 'float32' as GPUVertexFormat,
          },
          {
            shaderLocation: 4,
            offset: 4 * Float32Array.BYTES_PER_ELEMENT,
            format: 'float32' as GPUVertexFormat,
          },
        ],
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
        cullMode: 'none',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

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
  }

  setInstanceData(instanceData: Float32Array, _uploadMode: UploadMode = 'dynamic'): void {
    this.ensureInstanceBuffer(instanceData.byteLength);
    this.instanceCount = instanceData.length / 5;
    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      toGpuFloat32View(instanceData) as unknown as GPUAllowSharedBufferSource,
    );
  }

  render(width: number, height: number, time: number): void {
    this.ensureDepthTexture(width, height);
    perspective(this.proj, Math.PI / 4, width / height, 0.1, 100);
    lookAt(this.view, CAMERA_EYE, CAMERA_CENTER, CAMERA_UP);
    multiplyMat4(this.mvp, this.proj, this.view);

    this.uniformPayload.fill(0);
    this.uniformPayload.set(this.mvp, 0);
    this.uniformPayload[TIME_FLOAT_OFFSET] = time;
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformPayload as unknown as GPUAllowSharedBufferSource,
    );

    const commandEncoder = this.device.createCommandEncoder();
    const colorAttachments = [
      {
        view: this.context.getCurrentTexture().createView(),
        clearValue: {
          r: CLEAR_COLOR.r,
          g: CLEAR_COLOR.g,
          b: CLEAR_COLOR.b,
          a: CLEAR_COLOR.a,
        },
        loadOp: 'clear' as GPULoadOp,
        storeOp: 'store' as GPUStoreOp,
      },
    ] satisfies GPURenderPassColorAttachment[];
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments,
      depthStencilAttachment: {
        view: this.depthTexture!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setVertexBuffer(1, this.instanceBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
    renderPass.drawIndexed(this.geometry.indices.length, this.instanceCount);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  destroy(): void {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
    this.instanceBuffer.destroy();
    this.uniformBuffer.destroy();
    this.depthTexture?.destroy();
  }

  private ensureInstanceBuffer(byteLength: number): void {
    if (this.instanceBufferCapacity >= byteLength) {
      return;
    }

    this.instanceBuffer.destroy();
    this.instanceBufferCapacity = byteLength;
    this.instanceBuffer = createGpuBuffer(
      this.device,
      this.instanceBufferCapacity,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
  }

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
  }
}
