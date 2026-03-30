import { CAMERA_CENTER, CAMERA_EYE, CAMERA_UP, CLEAR_COLOR, RENDER_INSTANCE_STRIDE } from '../contracts/renderSpec';
import type { GeometryData, RenderBatch, Renderer, RenderOptions } from '../contracts/types';
import { lookAt, multiplyMat4, perspective } from '../math/matrix';
import fragmentShaderSource from './shaders/webgl.frag.glsl?raw';
import vertexShaderSource from './shaders/webgl.vert.glsl?raw';

interface BatchResources {
  geometry: GeometryData;
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  instanceBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexType: number;
  instanceCount: number;
  staticUploaded: boolean;
}

export interface WebGLRendererOptions extends RenderOptions {}

function requireResource<T>(resource: T | null, message: string): T {
  if (!resource) {
    throw new Error(message);
  }

  return resource;
}

export class WebGLRenderer implements Renderer {
  readonly type = 'WebGL' as const;
  readonly gl: WebGL2RenderingContext;

  private readonly mvp = new Float32Array(16);
  private readonly proj = new Float32Array(16);
  private readonly view = new Float32Array(16);
  private readonly program: WebGLProgram;
  private readonly uViewProj: WebGLUniformLocation;
  private readonly uTime: WebGLUniformLocation;
  private readonly uLightingEnabled: WebGLUniformLocation;
  private readonly batchResources = new Map<string, BatchResources>();
  private batchOrder: string[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WebGLRendererOptions,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
    });

    if (!gl) {
      throw new Error('当前浏览器不支持 WebGL2');
    }

    this.gl = gl;
    this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
    this.uViewProj = requireResource(gl.getUniformLocation(this.program, 'uViewProj'), '找不到 WebGL uniform: uViewProj');
    this.uTime = requireResource(gl.getUniformLocation(this.program, 'uTime'), '找不到 WebGL uniform: uTime');
    this.uLightingEnabled = requireResource(
      gl.getUniformLocation(this.program, 'uLightingEnabled'),
      '找不到 WebGL uniform: uLightingEnabled',
    );

    gl.enable(gl.DEPTH_TEST);
  }

  setSceneBatches(batches: readonly RenderBatch[]): void {
    const nextOrder = batches.map((batch) => batch.id);
    this.syncBatchResources(batches);
    this.batchOrder = nextOrder;

    for (const batch of batches) {
      const resources = this.batchResources.get(batch.id);
      if (!resources) {
        continue;
      }

      const nextInstanceCount = batch.instanceData.length / RENDER_INSTANCE_STRIDE;
      if (batch.uploadMode === 'static' && resources.staticUploaded && resources.instanceCount === nextInstanceCount) {
        continue;
      }

      resources.instanceCount = nextInstanceCount;
      resources.staticUploaded = batch.uploadMode === 'static';
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, resources.instanceBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        batch.instanceData,
        batch.uploadMode === 'static' ? this.gl.STATIC_DRAW : this.gl.DYNAMIC_DRAW,
      );
    }
  }

  render(width: number, height: number, time: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);

    perspective(this.proj, Math.PI / 4, width / height, 0.1, 100);
    lookAt(this.view, CAMERA_EYE, CAMERA_CENTER, CAMERA_UP);
    multiplyMat4(this.mvp, this.proj, this.view);

    if (this.options.cullingMode === 'back') {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    } else {
      gl.disable(gl.CULL_FACE);
    }

    gl.clearColor(CLEAR_COLOR.r, CLEAR_COLOR.g, CLEAR_COLOR.b, CLEAR_COLOR.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProj, false, this.mvp);
    gl.uniform1f(this.uTime, time);
    gl.uniform1f(this.uLightingEnabled, this.options.lightingEnabled ? 1 : 0);

    for (const batchId of this.batchOrder) {
      const resources = this.batchResources.get(batchId);
      if (!resources || resources.instanceCount === 0) {
        continue;
      }

      gl.bindVertexArray(resources.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, resources.geometry.indices.length, resources.indexType, 0, resources.instanceCount);
    }

    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    this.batchResources.forEach((resources) => {
      gl.deleteBuffer(resources.positionBuffer);
      gl.deleteBuffer(resources.normalBuffer);
      gl.deleteBuffer(resources.instanceBuffer);
      gl.deleteBuffer(resources.indexBuffer);
      gl.deleteVertexArray(resources.vao);
    });
    this.batchResources.clear();
    gl.deleteProgram(this.program);
  }

  private syncBatchResources(batches: readonly RenderBatch[]): void {
    const nextIds = new Set(batches.map((batch) => batch.id));

    this.batchResources.forEach((resources, batchId) => {
      if (nextIds.has(batchId)) {
        return;
      }

      this.destroyBatchResources(resources);
      this.batchResources.delete(batchId);
    });

    for (const batch of batches) {
      const existingResources = this.batchResources.get(batch.id);
      if (existingResources && existingResources.geometry === batch.geometry) {
        continue;
      }

      if (existingResources) {
        this.destroyBatchResources(existingResources);
      }

      this.batchResources.set(batch.id, this.createBatchResources(batch.geometry));
    }
  }

  private createBatchResources(geometry: GeometryData): BatchResources {
    const gl = this.gl;
    const vao = requireResource(gl.createVertexArray(), '创建 WebGL VAO 失败');
    const positionBuffer = requireResource(gl.createBuffer(), '创建 WebGL position buffer 失败');
    const normalBuffer = requireResource(gl.createBuffer(), '创建 WebGL normal buffer 失败');
    const instanceBuffer = requireResource(gl.createBuffer(), '创建 WebGL instance buffer 失败');
    const indexBuffer = requireResource(gl.createBuffer(), '创建 WebGL index buffer 失败');

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, RENDER_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
    const stride = RENDER_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    return {
      geometry,
      vao,
      positionBuffer,
      normalBuffer,
      instanceBuffer,
      indexBuffer,
      indexType: geometry.indexFormat === 'uint16' ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
      instanceCount: 0,
      staticUploaded: false,
    };
  }

  private destroyBatchResources(resources: BatchResources): void {
    const gl = this.gl;
    gl.deleteBuffer(resources.positionBuffer);
    gl.deleteBuffer(resources.normalBuffer);
    gl.deleteBuffer(resources.instanceBuffer);
    gl.deleteBuffer(resources.indexBuffer);
    gl.deleteVertexArray(resources.vao);
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = requireResource(gl.createShader(type), '创建 WebGL shader 失败');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'WebGL shader 编译失败';
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const program = requireResource(gl.createProgram(), '创建 WebGL program 失败');
    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'WebGL program 链接失败';
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }
}
