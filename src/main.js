import './style.css';

const PARTICLE_OPTIONS = [1000, 5000, 15000, 30000];
const POINT_SIZE_OPTIONS = [2, 3, 4, 5];
const RENDERER_OPTIONS = [
  { value: 'webgl', label: 'WebGL' },
  { value: 'webgpu', label: 'WebGPU' },
];
const COMPUTE_OPTIONS = [
  { value: 'js', label: 'JavaScript' },
  { value: 'wasm', label: 'WebAssembly' },
];

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="app-shell">
    <section class="panel controls">
      <div class="title-row">
        <div>
          <h1>Render Test Demo</h1>
          <p class="subtitle">
            对比 WebGL / WebGPU 渲染，以及 JavaScript / WebAssembly 粒子更新逻辑，
            可直接在手机浏览器中切换并观察 FPS。
          </p>
        </div>
        <div class="badge">Mobile Friendly</div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="rendererSelect">渲染后端</label>
          <select id="rendererSelect"></select>
        </div>
        <div class="field">
          <label for="computeSelect">计算实现</label>
          <select id="computeSelect"></select>
        </div>
        <div class="field">
          <label for="particleSelect">粒子数量</label>
          <select id="particleSelect"></select>
        </div>
        <div class="field">
          <label for="pointSizeSelect">粒子尺寸</label>
          <select id="pointSizeSelect"></select>
        </div>
      </div>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">FPS</div>
          <div class="stat-value" id="fpsValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Frame</div>
          <div class="stat-value" id="frameValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Update</div>
          <div class="stat-value" id="updateValue">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Render</div>
          <div class="stat-value" id="renderValue">--</div>
        </div>
      </div>
      <div class="footer-note">
        建议在同一台设备上依次切换不同组合进行对比；如果浏览器暂不支持 WebGPU，会自动回退到 WebGL。
      </div>
    </section>

    <section class="panel canvas-wrap">
      <canvas id="canvas"></canvas>
      <div class="status-bar">
        <div class="chip" id="modeChip">模式：--</div>
        <div class="chip" id="rendererChip">实际渲染：--</div>
        <div class="chip" id="particleChip">粒子：--</div>
        <div class="chip" id="supportChip">WebGPU 支持：检测中</div>
        <div class="chip" id="statusChip">状态：初始化中</div>
      </div>
    </section>
  </main>
`;

const elements = {
  canvas: document.querySelector('#canvas'),
  rendererSelect: document.querySelector('#rendererSelect'),
  computeSelect: document.querySelector('#computeSelect'),
  particleSelect: document.querySelector('#particleSelect'),
  pointSizeSelect: document.querySelector('#pointSizeSelect'),
  fpsValue: document.querySelector('#fpsValue'),
  frameValue: document.querySelector('#frameValue'),
  updateValue: document.querySelector('#updateValue'),
  renderValue: document.querySelector('#renderValue'),
  modeChip: document.querySelector('#modeChip'),
  rendererChip: document.querySelector('#rendererChip'),
  particleChip: document.querySelector('#particleChip'),
  supportChip: document.querySelector('#supportChip'),
  statusChip: document.querySelector('#statusChip'),
};

for (const option of RENDERER_OPTIONS) {
  elements.rendererSelect.insertAdjacentHTML(
    'beforeend',
    `<option value="${option.value}">${option.label}</option>`,
  );
}
for (const option of COMPUTE_OPTIONS) {
  elements.computeSelect.insertAdjacentHTML(
    'beforeend',
    `<option value="${option.value}">${option.label}</option>`,
  );
}
for (const option of PARTICLE_OPTIONS) {
  elements.particleSelect.insertAdjacentHTML(
    'beforeend',
    `<option value="${option}">${option.toLocaleString()}</option>`,
  );
}
for (const option of POINT_SIZE_OPTIONS) {
  elements.pointSizeSelect.insertAdjacentHTML(
    'beforeend',
    `<option value="${option}">${option}px</option>`,
  );
}

elements.rendererSelect.value = 'webgl';
elements.computeSelect.value = 'js';
elements.particleSelect.value = '15000';
elements.pointSizeSelect.value = '3';
applySavedConfig();

const STORAGE_KEY = 'render-test-config-v1';

const state = {
  requestedRenderer: 'webgl',
  computeMode: 'js',
  particleCount: 15000,
  pointSize: 3,
  actualRenderer: '--',
  renderer: null,
  system: null,
  animationFrame: 0,
  lastTimestamp: 0,
  fpsFrames: 0,
  fpsTime: 0,
  running: false,
  webGpuAvailable: 'gpu' in navigator,
};

function setStatus(message, warn = false) {
  elements.statusChip.textContent = `状态：${message}`;
  elements.statusChip.classList.toggle('warn', warn);
}

function applySavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.renderer && RENDERER_OPTIONS.some((item) => item.value === saved.renderer)) {
      elements.rendererSelect.value = saved.renderer;
    }
    if (saved.compute && COMPUTE_OPTIONS.some((item) => item.value === saved.compute)) {
      elements.computeSelect.value = saved.compute;
    }
    if (saved.particles && PARTICLE_OPTIONS.includes(saved.particles)) {
      elements.particleSelect.value = String(saved.particles);
    }
    if (saved.pointSize && POINT_SIZE_OPTIONS.includes(saved.pointSize)) {
      elements.pointSizeSelect.value = String(saved.pointSize);
    }
  } catch (error) {
    console.warn('load saved config failed', error);
  }
}

function persistConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        renderer: elements.rendererSelect.value,
        compute: elements.computeSelect.value,
        particles: Number(elements.particleSelect.value),
        pointSize: Number(elements.pointSizeSelect.value),
      }),
    );
  } catch (error) {
    console.warn('save config failed', error);
  }
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticleState(count, width, height) {
  const rand = mulberry32(20260329 + count);
  const array = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    array[base] = rand() * width;
    array[base + 1] = rand() * height;
    array[base + 2] = (rand() * 2 - 1) * 42;
    array[base + 3] = (rand() * 2 - 1) * 42;
  }
  return array;
}

function updateParticlesJS(buffer, count, dt, width, height) {
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    let x = buffer[base] + buffer[base + 2] * dt;
    let y = buffer[base + 1] + buffer[base + 3] * dt;
    let vx = buffer[base + 2];
    let vy = buffer[base + 3];

    if (x < 0) {
      x = 0;
      vx = -vx;
    } else if (x > width) {
      x = width;
      vx = -vx;
    }

    if (y < 0) {
      y = 0;
      vy = -vy;
    } else if (y > height) {
      y = height;
      vy = -vy;
    }

    buffer[base] = x;
    buffer[base + 1] = y;
    buffer[base + 2] = vx;
    buffer[base + 3] = vy;
  }
}

class JSParticleSystem {
  constructor(count, width, height) {
    this.count = count;
    this.state = createParticleState(count, width, height);
    this.positions = new Float32Array(count * 2);
  }

  update(dt, width, height) {
    updateParticlesJS(this.state, this.count, dt, width, height);
  }

  getPositions() {
    for (let i = 0; i < this.count; i += 1) {
      const src = i * 4;
      const dst = i * 2;
      this.positions[dst] = this.state[src];
      this.positions[dst + 1] = this.state[src + 1];
    }
    return this.positions;
  }
}

class WasmParticleSystem {
  static async create(count, width, height) {
    const url = new URL('./wasm/particle-update.wasm', import.meta.url);
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new WasmParticleSystem(instance, count, width, height);
  }

  constructor(instance, count, width, height) {
    this.instance = instance;
    this.count = count;
    this.ptr = 0;
    this.positions = new Float32Array(count * 2);
    const initial = createParticleState(count, width, height);
    const memory = new Float32Array(this.instance.exports.memory.buffer, this.ptr, initial.length);
    memory.set(initial);
    this.state = memory;
  }

  update(dt, width, height) {
    this.instance.exports.update(this.ptr, this.count, dt, width, height);
  }

  getPositions() {
    for (let i = 0; i < this.count; i += 1) {
      const src = i * 4;
      const dst = i * 2;
      this.positions[dst] = this.state[src];
      this.positions[dst + 1] = this.state[src + 1];
    }
    return this.positions;
  }
}

class WebGLRenderer {
  constructor(canvas) {
    this.type = 'WebGL';
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) {
      throw new Error('当前浏览器不支持 WebGL2');
    }
    this.gl = gl;
    this.canvas = canvas;
    this.pointSize = 3;
    this.count = 0;
    this.resolution = { width: 1, height: 1 };

    const vertexSource = `#version 300 es
      precision highp float;
      layout(location = 0) in vec2 aCorner;
      layout(location = 1) in vec2 aPosition;
      uniform vec2 uResolution;
      uniform float uPointSize;
      void main() {
        vec2 pixel = aPosition + aCorner * uPointSize;
        vec2 clip = (pixel / uResolution) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      }
    `;
    const fragmentSource = `#version 300 es
      precision highp float;
      out vec4 outColor;
      void main() {
        outColor = vec4(0.45, 0.83, 1.0, 1.0);
      }
    `;

    this.program = this.createProgram(vertexSource, fragmentSource);
    this.uResolution = gl.getUniformLocation(this.program, 'uResolution');
    this.uPointSize = gl.getUniformLocation(this.program, 'uPointSize');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -0.5, -0.5,
        0.5, -0.5,
        -0.5, 0.5,
        -0.5, 0.5,
        0.5, -0.5,
        0.5, 0.5,
      ]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || 'Shader compile failed');
    }
    return shader;
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, this.createShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, this.createShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
    }
    return program;
  }

  resize(width, height) {
    this.resolution.width = width;
    this.resolution.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(positions, width, height, pointSize) {
    const gl = this.gl;
    this.resize(width, height);
    this.pointSize = pointSize;
    this.count = positions.length / 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.clearColor(0.03, 0.05, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, width, height);
    gl.uniform1f(this.uPointSize, pointSize);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

class WebGPURenderer {
  static async create(canvas) {
    if (!('gpu' in navigator)) {
      throw new Error('当前浏览器不支持 WebGPU');
    }
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('当前环境无法创建 WebGPU canvas context');
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('无法获取 WebGPU adapter');
    }
    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, device, context);
  }

  constructor(canvas, device, context) {
    this.type = 'WebGPU';
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.quadVertexCount = 6;
    this.resolution = { width: 1, height: 1 };
    this.quadBuffer = device.createBuffer({
      label: 'quad vertices',
      size: 6 * 2 * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.quadBuffer.getMappedRange()).set([
      -0.5, -0.5,
      0.5, -0.5,
      -0.5, 0.5,
      -0.5, 0.5,
      0.5, -0.5,
      0.5, 0.5,
    ]);
    this.quadBuffer.unmap();

    this.uniformBuffer = device.createBuffer({
      label: 'render uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = device.createShaderModule({
      code: `
        struct Uniforms {
          resolution : vec2<f32>,
          pointSize : f32,
          pad : f32,
        };

        @group(0) @binding(0) var<uniform> uniforms : Uniforms;

        struct VertexIn {
          @location(0) corner : vec2<f32>,
          @location(1) position : vec2<f32>,
        };

        struct VertexOut {
          @builtin(position) position : vec4<f32>,
          @location(0) tint : vec3<f32>,
        };

        @vertex
        fn vsMain(input : VertexIn) -> VertexOut {
          let pixel = input.position + input.corner * uniforms.pointSize;
          let clip = pixel / uniforms.resolution * vec2<f32>(2.0, 2.0) - vec2<f32>(1.0, 1.0);
          var out : VertexOut;
          out.position = vec4<f32>(clip.x, -clip.y, 0.0, 1.0);
          out.tint = vec3<f32>(0.45, 0.83, 1.0);
          return out;
        }

        @fragment
        fn fsMain(input : VertexOut) -> @location(0) vec4<f32> {
          return vec4<f32>(input.tint, 1.0);
        }
      `,
    });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
          {
            arrayStride: 8,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.positionBuffer = null;
    this.positionCapacity = 0;
  }

  resize(width, height) {
    this.resolution.width = width;
    this.resolution.height = height;
  }

  ensurePositionBuffer(byteLength) {
    if (this.positionBuffer && this.positionCapacity >= byteLength) {
      return;
    }
    this.positionBuffer?.destroy();
    this.positionCapacity = Math.max(byteLength, 8);
    this.positionBuffer = this.device.createBuffer({
      label: 'particle positions',
      size: this.positionCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  render(positions, width, height, pointSize) {
    this.resize(width, height);
    this.ensurePositionBuffer(positions.byteLength);
    this.device.queue.writeBuffer(this.positionBuffer, 0, positions);
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([width, height, pointSize, 0]),
    );

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.03, g: 0.05, b: 0.09, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.positionBuffer);
    pass.draw(this.quadVertexCount, positions.length / 2);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy() {
    this.positionBuffer?.destroy();
    this.uniformBuffer.destroy();
    this.quadBuffer.destroy();
  }
}

elements.supportChip.textContent = `WebGPU 支持：${state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持'}`;
if (!state.webGpuAvailable) {
  elements.supportChip.classList.add('warn');
}

function getCanvasSize() {
  const rect = elements.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;
  }
  return { width, height };
}

async function createParticleSystem(mode, count, width, height) {
  if (mode === 'wasm') {
    return WasmParticleSystem.create(count, width, height);
  }
  return new JSParticleSystem(count, width, height);
}

async function createRenderer(mode) {
  if (mode === 'webgpu') {
    return WebGPURenderer.create(elements.canvas);
  }
  return new WebGLRenderer(elements.canvas);
}

async function rebuildScene() {
  cancelAnimationFrame(state.animationFrame);
  state.running = false;
  state.renderer?.destroy?.();
  state.renderer = null;
  state.system = null;
  state.lastTimestamp = 0;
  state.fpsFrames = 0;
  state.fpsTime = 0;

  const { width, height } = getCanvasSize();
  state.requestedRenderer = elements.rendererSelect.value;
  state.computeMode = elements.computeSelect.value;
  state.particleCount = Number(elements.particleSelect.value);
  state.pointSize = Number(elements.pointSizeSelect.value);
  persistConfig();

  let rendererMode = state.requestedRenderer;
  let fallbackNotice = '';
  if (rendererMode === 'webgpu' && !state.webGpuAvailable) {
    rendererMode = 'webgl';
    fallbackNotice = 'WebGPU 不可用，已回退到 WebGL';
  }

  try {
    setStatus('创建渲染器...');
    state.renderer = await createRenderer(rendererMode);
    state.system = await createParticleSystem(state.computeMode, state.particleCount, width, height);
    state.actualRenderer = state.renderer.type;
    elements.modeChip.textContent = `模式：${state.computeMode.toUpperCase()} + ${state.requestedRenderer.toUpperCase()}`;
    elements.rendererChip.textContent = `实际渲染：${state.actualRenderer}`;
    elements.particleChip.textContent = `粒子：${state.particleCount.toLocaleString()} @ ${state.pointSize}px`;
    elements.supportChip.textContent = `WebGPU 支持：${state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持'}`;
    setStatus(fallbackNotice || '运行中', Boolean(fallbackNotice));
    state.running = true;
    tick(0);
  } catch (error) {
    console.error(error);
    if (state.requestedRenderer === 'webgpu') {
      try {
        state.renderer?.destroy?.();
        state.renderer = await createRenderer('webgl');
        state.system = await createParticleSystem(state.computeMode, state.particleCount, width, height);
        state.actualRenderer = state.renderer.type;
        elements.modeChip.textContent = `模式：${state.computeMode.toUpperCase()} + ${state.requestedRenderer.toUpperCase()}`;
        elements.rendererChip.textContent = `实际渲染：${state.actualRenderer}`;
        elements.particleChip.textContent = `粒子：${state.particleCount.toLocaleString()} @ ${state.pointSize}px`;
        elements.supportChip.textContent = 'WebGPU 支持：API 可见，但当前环境初始化失败';
        elements.supportChip.classList.add('warn');
        setStatus('WebGPU 初始化失败，已回退到 WebGL', true);
        state.running = true;
        tick(0);
        return;
      } catch (fallbackError) {
        console.error(fallbackError);
      }
    }
    setStatus(error.message || '初始化失败', true);
    elements.rendererChip.textContent = '实际渲染：初始化失败';
  }
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function tick(timestamp) {
  if (!state.running || !state.renderer || !state.system) {
    return;
  }

  const { width, height } = getCanvasSize();
  const dt = state.lastTimestamp ? Math.min((timestamp - state.lastTimestamp) / 1000, 0.033) : 0.016;
  state.lastTimestamp = timestamp;

  const frameStart = performance.now();
  const updateStart = performance.now();
  state.system.update(dt, width, height);
  const positions = state.system.getPositions();
  const updateEnd = performance.now();
  state.renderer.render(positions, width, height, state.pointSize);
  const renderEnd = performance.now();
  const frameCost = renderEnd - frameStart;
  const updateCost = updateEnd - updateStart;
  const renderCost = renderEnd - updateEnd;

  state.fpsFrames += 1;
  state.fpsTime += dt;
  if (state.fpsTime >= 0.5) {
    const fps = state.fpsFrames / state.fpsTime;
    elements.fpsValue.textContent = fps.toFixed(1);
    state.fpsFrames = 0;
    state.fpsTime = 0;
  }

  elements.frameValue.textContent = formatMs(frameCost);
  elements.updateValue.textContent = formatMs(updateCost);
  elements.renderValue.textContent = formatMs(renderCost);

  state.animationFrame = requestAnimationFrame(tick);
}

for (const control of [
  elements.rendererSelect,
  elements.computeSelect,
  elements.particleSelect,
  elements.pointSizeSelect,
]) {
  control.addEventListener('change', () => {
    rebuildScene();
  });
}

window.addEventListener('resize', () => {
  if (state.running) {
    const { width, height } = getCanvasSize();
    state.renderer?.resize?.(width, height);
  }
});

rebuildScene();
