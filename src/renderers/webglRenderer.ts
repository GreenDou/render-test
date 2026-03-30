import { CAMERA_CENTER, CAMERA_EYE, CAMERA_UP, CLEAR_COLOR } from '../contracts/renderSpec';
import type { GeometryData, Renderer, UploadMode } from '../contracts/types';
import { lookAt, multiplyMat4, perspective } from '../math/matrix';
import fragmentShaderSource from './shaders/webgl.frag.glsl?raw';
import vertexShaderSource from './shaders/webgl.vert.glsl?raw';

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
  private readonly vao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly normalBuffer: WebGLBuffer;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly uViewProj: WebGLUniformLocation;
  private readonly uTime: WebGLUniformLocation;
  private instanceCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly geometry: GeometryData,
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
    this.vao = requireResource(gl.createVertexArray(), '创建 WebGL VAO 失败');
    this.positionBuffer = requireResource(gl.createBuffer(), '创建 WebGL position buffer 失败');
    this.normalBuffer = requireResource(gl.createBuffer(), '创建 WebGL normal buffer 失败');
    this.instanceBuffer = requireResource(gl.createBuffer(), '创建 WebGL instance buffer 失败');
    this.indexBuffer = requireResource(gl.createBuffer(), '创建 WebGL index buffer 失败');

    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  setInstanceData(instanceData: Float32Array, uploadMode: UploadMode = 'dynamic'): void {
    const gl = this.gl;
    this.instanceCount = instanceData.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, uploadMode === 'static' ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
  }

  render(width: number, height: number, time: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);

    perspective(this.proj, Math.PI / 4, width / height, 0.1, 100);
    lookAt(this.view, CAMERA_EYE, CAMERA_CENTER, CAMERA_UP);
    multiplyMat4(this.mvp, this.proj, this.view);

    gl.clearColor(CLEAR_COLOR.r, CLEAR_COLOR.g, CLEAR_COLOR.b, CLEAR_COLOR.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProj, false, this.mvp);
    gl.uniform1f(this.uTime, time);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.geometry.indices.length, gl.UNSIGNED_INT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.normalBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
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
