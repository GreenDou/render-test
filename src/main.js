import './style.css';

const INSTANCE_OPTIONS = [100, 300, 600, 1200, 3000, 10000];
const STRESS_LEVEL_OPTIONS = [1, 2, 4, 8];
const SCALE_OPTIONS = [0.5, 0.8, 1, 1.2];
const MESH_OPTIONS = [
  { value: 'medium', label: '中等网格' },
  { value: 'high', label: '高精度网格' },
  { value: 'ultra', label: '超高精度网格' },
];
const RENDERER_OPTIONS = [
  { value: 'webgl', label: 'WebGL' },
  { value: 'webgpu', label: 'WebGPU' },
];
const COMPUTE_OPTIONS = [
  { value: 'js', label: 'JavaScript' },
  { value: 'wasm', label: 'WebAssembly' },
];
const BENCHMARK_MODE_OPTIONS = [
  { value: 'combined', label: '综合模式' },
  { value: 'render', label: '纯渲染模式' },
  { value: 'compute', label: '纯计算模式' },
];
const STORAGE_KEY = 'render-test-mesh-config-v1';
const LOG_LIMIT = 100;
const INSTANCE_STRIDE = 8; // x y z vx vy vz phase scale

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="app-shell">
    <section class="panel controls">
      <div class="title-row">
        <div>
          <h1>Render Test Demo</h1>
          <p class="subtitle">
            对比 WebGL / WebGPU 渲染，以及 JavaScript / WebAssembly 3D 网格实例仿真逻辑，
            可直接在手机浏览器中切换并观察 FPS。
          </p>
        </div>
        <div class="badge">Mesh Benchmark</div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="benchmarkModeSelect">测试模式</label>
          <select id="benchmarkModeSelect"></select>
        </div>
        <div class="field">
          <label for="rendererSelect">渲染后端</label>
          <select id="rendererSelect"></select>
        </div>
        <div class="field">
          <label for="computeSelect">计算实现</label>
          <select id="computeSelect"></select>
        </div>
        <div class="field">
          <label for="meshSelect">网格复杂度</label>
          <select id="meshSelect"></select>
        </div>
        <div class="field">
          <label for="instanceSelect">实例数量</label>
          <select id="instanceSelect"></select>
        </div>
        <div class="field">
          <label for="stressSelect">压力等级</label>
          <select id="stressSelect"></select>
        </div>
        <div class="field">
          <label for="scaleSelect">实例缩放</label>
          <select id="scaleSelect"></select>
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

      <div class="action-row">
        <button class="ghost-btn" id="toggleLogsBtn" type="button">显示日志</button>
        <button class="ghost-btn" id="copyErrorBtn" type="button">复制错误</button>
        <button class="ghost-btn" id="clearLogsBtn" type="button">清空日志</button>
      </div>

      <div class="error-box hidden" id="errorBox">
        <div class="error-title">最近错误</div>
        <pre id="errorText">暂无</pre>
      </div>

      <details class="log-panel" id="logPanel">
        <summary>调试日志（可展开查看页面内 console）</summary>
        <pre id="logOutput">暂无日志</pre>
      </details>

      <div class="footer-note">
        这版 benchmark 采用复杂网格 + 大量实例化渲染，更容易放大 WebGL / WebGPU 和 JS / WASM 之间的差异。
      </div>
    </section>

    <section class="panel canvas-wrap">
      <div id="canvasHost" class="canvas-host"></div>
      <div class="status-bar">
        <div class="chip" id="modeChip">模式：--</div>
        <div class="chip" id="rendererChip">实际渲染：--</div>
        <div class="chip" id="meshChip">网格：--</div>
        <div class="chip" id="supportChip">WebGPU 支持：检测中</div>
        <div class="chip" id="statusChip">状态：初始化中</div>
      </div>
    </section>
  </main>
`;

const elements = {
  canvasHost: document.querySelector('#canvasHost'),
  benchmarkModeSelect: document.querySelector('#benchmarkModeSelect'),
  rendererSelect: document.querySelector('#rendererSelect'),
  computeSelect: document.querySelector('#computeSelect'),
  meshSelect: document.querySelector('#meshSelect'),
  instanceSelect: document.querySelector('#instanceSelect'),
  stressSelect: document.querySelector('#stressSelect'),
  scaleSelect: document.querySelector('#scaleSelect'),
  fpsValue: document.querySelector('#fpsValue'),
  frameValue: document.querySelector('#frameValue'),
  updateValue: document.querySelector('#updateValue'),
  renderValue: document.querySelector('#renderValue'),
  modeChip: document.querySelector('#modeChip'),
  rendererChip: document.querySelector('#rendererChip'),
  meshChip: document.querySelector('#meshChip'),
  supportChip: document.querySelector('#supportChip'),
  statusChip: document.querySelector('#statusChip'),
  logPanel: document.querySelector('#logPanel'),
  logOutput: document.querySelector('#logOutput'),
  errorBox: document.querySelector('#errorBox'),
  errorText: document.querySelector('#errorText'),
  toggleLogsBtn: document.querySelector('#toggleLogsBtn'),
  copyErrorBtn: document.querySelector('#copyErrorBtn'),
  clearLogsBtn: document.querySelector('#clearLogsBtn'),
};

const state = {
  canvas: null,
  benchmarkMode: 'combined',
  requestedRenderer: 'webgl',
  computeMode: 'js',
  meshLevel: 'high',
  instanceCount: 600,
  stressLevel: 4,
  instanceScale: 1,
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
  staticInstanceData: null,
  running: false,
  webGpuAvailable: 'gpu' in navigator,
  logs: [],
  lastErrorText: '',
};

function safeStringify(value) {
  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
    }
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error, context = '') {
  if (!error) return context || '未知错误';
  const prefix = context ? `[${context}] ` : '';
  if (error instanceof Error) {
    return `${prefix}${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  return `${prefix}${safeStringify(error)}`;
}

function pushLog(level, ...args) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${level.toUpperCase()} ${args
    .map((item) => safeStringify(item))
    .join(' ')}`;
  state.logs.push(line);
  if (state.logs.length > LOG_LIMIT) state.logs.shift();
  elements.logOutput.textContent = state.logs.join('\n');
}

const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

console.log = (...args) => {
  pushLog('log', ...args);
  nativeConsole.log(...args);
};
console.info = (...args) => {
  pushLog('info', ...args);
  nativeConsole.info(...args);
};
console.warn = (...args) => {
  pushLog('warn', ...args);
  nativeConsole.warn(...args);
};
console.error = (...args) => {
  pushLog('error', ...args);
  nativeConsole.error(...args);
};

window.addEventListener('error', (event) => {
  const text = formatError(event.error || event.message, 'window.error');
  setLastError(text);
  console.error(text);
});
window.addEventListener('unhandledrejection', (event) => {
  const text = formatError(event.reason, 'unhandledrejection');
  setLastError(text);
  console.error(text);
});

function setLastError(text) {
  state.lastErrorText = text || '';
  elements.errorText.textContent = state.lastErrorText || '暂无';
  elements.errorBox.classList.toggle('hidden', !state.lastErrorText);
}

function setStatus(message, warn = false, detail = '') {
  elements.statusChip.textContent = `状态：${message}`;
  elements.statusChip.classList.toggle('warn', warn);
  if (detail) setLastError(detail);
}

function updateSupportChip(message, warn = false) {
  elements.supportChip.textContent = `WebGPU 支持：${message}`;
  elements.supportChip.classList.toggle('warn', warn);
}

function applySavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.benchmarkMode && BENCHMARK_MODE_OPTIONS.some((x) => x.value === saved.benchmarkMode)) elements.benchmarkModeSelect.value = saved.benchmarkMode;
    if (saved.renderer && RENDERER_OPTIONS.some((x) => x.value === saved.renderer)) elements.rendererSelect.value = saved.renderer;
    if (saved.compute && COMPUTE_OPTIONS.some((x) => x.value === saved.compute)) elements.computeSelect.value = saved.compute;
    if (saved.mesh && MESH_OPTIONS.some((x) => x.value === saved.mesh)) elements.meshSelect.value = saved.mesh;
    if (saved.instances && INSTANCE_OPTIONS.includes(saved.instances)) elements.instanceSelect.value = String(saved.instances);
    if (saved.stress && STRESS_LEVEL_OPTIONS.includes(saved.stress)) elements.stressSelect.value = String(saved.stress);
    if (saved.scale && SCALE_OPTIONS.includes(saved.scale)) elements.scaleSelect.value = String(saved.scale);
  } catch (error) {
    console.warn('load saved config failed', error);
  }
}

function persistConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        benchmarkMode: elements.benchmarkModeSelect.value,
        renderer: elements.rendererSelect.value,
        compute: elements.computeSelect.value,
        mesh: elements.meshSelect.value,
        instances: Number(elements.instanceSelect.value),
        stress: Number(elements.stressSelect.value),
        scale: Number(elements.scaleSelect.value),
      }),
    );
  } catch (error) {
    console.warn('save config failed', error);
  }
}

for (const option of BENCHMARK_MODE_OPTIONS) elements.benchmarkModeSelect.insertAdjacentHTML('beforeend', `<option value="${option.value}">${option.label}</option>`);
for (const option of RENDERER_OPTIONS) elements.rendererSelect.insertAdjacentHTML('beforeend', `<option value="${option.value}">${option.label}</option>`);
for (const option of COMPUTE_OPTIONS) elements.computeSelect.insertAdjacentHTML('beforeend', `<option value="${option.value}">${option.label}</option>`);
for (const option of MESH_OPTIONS) elements.meshSelect.insertAdjacentHTML('beforeend', `<option value="${option.value}">${option.label}</option>`);
for (const option of INSTANCE_OPTIONS) elements.instanceSelect.insertAdjacentHTML('beforeend', `<option value="${option}">${option.toLocaleString()}</option>`);
for (const option of STRESS_LEVEL_OPTIONS) elements.stressSelect.insertAdjacentHTML('beforeend', `<option value="${option}">${option}x</option>`);
for (const option of SCALE_OPTIONS) elements.scaleSelect.insertAdjacentHTML('beforeend', `<option value="${option}">${option}x</option>`);

elements.benchmarkModeSelect.value = 'combined';
elements.rendererSelect.value = 'webgl';
elements.computeSelect.value = 'js';
elements.meshSelect.value = 'high';
elements.instanceSelect.value = '600';
elements.stressSelect.value = '4';
elements.scaleSelect.value = '1';
applySavedConfig();
updateSupportChip(state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持', !state.webGpuAvailable);

function createFreshCanvas() {
  const canvas = document.createElement('canvas');
  canvas.id = 'benchmarkCanvas';
  elements.canvasHost.innerHTML = '';
  elements.canvasHost.appendChild(canvas);
  state.canvas = canvas;
  return canvas;
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

function getMeshConfig(level) {
  if (level === 'medium') return { tubularSegments: 96, radialSegments: 20, p: 2, q: 3 };
  if (level === 'ultra') return { tubularSegments: 220, radialSegments: 34, p: 3, q: 5 };
  return { tubularSegments: 160, radialSegments: 28, p: 2, q: 5 };
}

function torusKnotPoint(u, p, q, radius = 1.2) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  const tx = radius * (2 + cs) * 0.5 * cu;
  const ty = radius * (2 + cs) * 0.5 * su;
  const tz = radius * Math.sin(quOverP) * 0.5;
  return [tx, ty, tz];
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function mul3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function createTorusKnotGeometry(level) {
  const { tubularSegments, radialSegments, p, q } = getMeshConfig(level);
  const positions = [];
  const normals = [];
  const indices = [];
  const tube = 0.24;

  for (let i = 0; i <= tubularSegments; i += 1) {
    const u = (i / tubularSegments) * Math.PI * 2 * p;
    const p1 = torusKnotPoint(u, p, q);
    const p2 = torusKnotPoint(u + 0.01, p, q);
    const tangent = normalize3(sub3(p2, p1));
    const normal = normalize3(add3(p2, p1));
    const binormal = normalize3(cross3(tangent, normal));
    const fixedNormal = normalize3(cross3(binormal, tangent));

    for (let j = 0; j <= radialSegments; j += 1) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cx = Math.cos(v);
      const cy = Math.sin(v);
      const radial = add3(mul3(fixedNormal, cx), mul3(binormal, cy));
      const pos = add3(p1, mul3(radial, tube));
      positions.push(pos[0], pos[1], pos[2]);
      const n = normalize3(radial);
      normals.push(n[0], n[1], n[2]);
    }
  }

  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + j + 1;
      const d = (radialSegments + 1) * i + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

function createInstanceState(count, scaleBase) {
  const rand = mulberry32(20260329 + count);
  const data = new Float32Array(count * INSTANCE_STRIDE);
  for (let i = 0; i < count; i += 1) {
    const base = i * INSTANCE_STRIDE;
    const radius = 2.6 + rand() * 3.6;
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI * 2;
    data[base] = Math.cos(theta) * Math.sin(phi) * radius;
    data[base + 1] = Math.cos(phi) * radius * 0.65;
    data[base + 2] = Math.sin(theta) * Math.sin(phi) * radius;
    data[base + 3] = (rand() * 2 - 1) * 0.8;
    data[base + 4] = (rand() * 2 - 1) * 0.8;
    data[base + 5] = (rand() * 2 - 1) * 0.8;
    data[base + 6] = rand() * Math.PI * 2;
    data[base + 7] = scaleBase * (0.65 + rand() * 0.9);
  }
  return data;
}

function updateInstancesJS(buffer, count, dt, time, bounds = 8) {
  for (let i = 0; i < count; i += 1) {
    const base = i * INSTANCE_STRIDE;
    let x = buffer[base];
    let y = buffer[base + 1];
    let z = buffer[base + 2];
    let vx = buffer[base + 3];
    let vy = buffer[base + 4];
    let vz = buffer[base + 5];
    let phase = buffer[base + 6];

    const dx = -x;
    const dy = -y;
    const dz = -z;
    const dist2 = dx * dx + dy * dy + dz * dz + 0.05;
    const invDist = 1 / Math.sqrt(dist2);
    const force = Math.min(24, 18 / dist2);

    vx += (dx * invDist * force + dz * 0.35) * dt;
    vy += (dy * invDist * force + Math.sin(phase + time) * 1.0) * dt;
    vz += (dz * invDist * force - dx * 0.35) * dt;

    vx *= 0.992;
    vy *= 0.992;
    vz *= 0.992;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    phase += dt * 0.8;

    if (Math.abs(x) > bounds) vx = -vx;
    if (Math.abs(y) > bounds) vy = -vy;
    if (Math.abs(z) > bounds) vz = -vz;

    buffer[base] = x;
    buffer[base + 1] = y;
    buffer[base + 2] = z;
    buffer[base + 3] = vx;
    buffer[base + 4] = vy;
    buffer[base + 5] = vz;
    buffer[base + 6] = phase;
  }
}

class JSInstanceSystem {
  constructor(count, scaleBase) {
    this.count = count;
    this.state = createInstanceState(count, scaleBase);
    this.renderData = new Float32Array(count * 5);
  }
  update(dt, time) {
    updateInstancesJS(this.state, this.count, dt, time);
  }
  getRenderData() {
    for (let i = 0; i < this.count; i += 1) {
      const src = i * INSTANCE_STRIDE;
      const dst = i * 5;
      this.renderData[dst] = this.state[src];
      this.renderData[dst + 1] = this.state[src + 1];
      this.renderData[dst + 2] = this.state[src + 2];
      this.renderData[dst + 3] = this.state[src + 6];
      this.renderData[dst + 4] = this.state[src + 7];
    }
    return this.renderData;
  }
}

class WasmInstanceSystem {
  static async create(count, scaleBase) {
    const url = new URL('./wasm/instance-update.wasm', import.meta.url);
    console.info('loading wasm', url.href);
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new WasmInstanceSystem(instance, count, scaleBase);
  }
  constructor(instance, count, scaleBase) {
    this.instance = instance;
    this.count = count;
    this.ptr = 0;
    this.renderData = new Float32Array(count * 5);
    const initial = createInstanceState(count, scaleBase);
    this.state = new Float32Array(this.instance.exports.memory.buffer, this.ptr, initial.length);
    this.state.set(initial);
  }
  update(dt, time) {
    this.instance.exports.update(this.ptr, this.count, dt, time, 8);
  }
  getRenderData() {
    for (let i = 0; i < this.count; i += 1) {
      const src = i * INSTANCE_STRIDE;
      const dst = i * 5;
      this.renderData[dst] = this.state[src];
      this.renderData[dst + 1] = this.state[src + 1];
      this.renderData[dst + 2] = this.state[src + 2];
      this.renderData[dst + 3] = this.state[src + 6];
      this.renderData[dst + 4] = this.state[src + 7];
    }
    return this.renderData;
  }
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy / 2);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
  return out;
}
function lookAt(out, eye, center, up) {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}
function multiplyMat4(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
  const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
  const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
  const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

  out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
  out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  return out;
}

class WebGLRenderer {
  constructor(canvas, geometry) {
    this.type = 'WebGL';
    this.canvas = canvas;
    this.geometry = geometry;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.mvp = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.instanceCapacity = 0;

    const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec3 iOffset;
      layout(location=3) in float iPhase;
      layout(location=4) in float iScale;
      uniform mat4 uViewProj;
      uniform float uTime;
      out vec3 vNormal;
      out vec3 vColor;
      mat3 rotY(float a) {
        float c = cos(a), s = sin(a);
        return mat3(c,0.,-s, 0.,1.,0., s,0.,c);
      }
      mat3 rotX(float a) {
        float c = cos(a), s = sin(a);
        return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);
      }
      void main() {
        float angle = uTime * 0.8 + iPhase;
        mat3 rot = rotY(angle) * rotX(angle * 0.7);
        vec3 pos = rot * (aPosition * iScale) + iOffset;
        vNormal = normalize(rot * aNormal);
        vColor = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + iPhase + uTime * 0.2);
        gl_Position = uViewProj * vec4(pos, 1.0);
      }
    `;
    const fs = `#version 300 es
      precision highp float;
      in vec3 vNormal;
      in vec3 vColor;
      out vec4 outColor;
      void main() {
        vec3 light = normalize(vec3(0.5, 0.7, 0.8));
        float diff = max(dot(normalize(vNormal), light), 0.0);
        vec3 color = vColor * (0.25 + diff * 0.75);
        outColor = vec4(color, 1.0);
      }
    `;
    this.program = this.createProgram(vs, fs);
    this.uViewProj = gl.getUniformLocation(this.program, 'uViewProj');
    this.uTime = gl.getUniformLocation(this.program, 'uTime');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }
  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    return shader;
  }
  createProgram(vs, fs) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, this.createShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, this.createShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    return program;
  }
  resize(width, height) {
    this.gl.viewport(0, 0, width, height);
  }
  setInstanceData(instanceData, usage = this.gl.DYNAMIC_DRAW) {
    const gl = this.gl;
    this.instanceCount = instanceData.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, usage);
  }
  render(width, height, time) {
    const gl = this.gl;
    this.resize(width, height);
    perspective(this.proj, Math.PI / 4, width / height, 0.1, 100);
    lookAt(this.view, [0, 0, 16], [0, 0, 0], [0, 1, 0]);
    multiplyMat4(this.mvp, this.proj, this.view);

    gl.clearColor(0.03, 0.05, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uViewProj, false, this.mvp);
    gl.uniform1f(this.uTime, time);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.geometry.indices.length, gl.UNSIGNED_INT, 0, this.instanceCount || 0);
    gl.bindVertexArray(null);
  }
  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.normalBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

class WebGPURenderer {
  static async create(canvas, geometry) {
    if (!('gpu' in navigator)) throw new Error('当前浏览器不支持 WebGPU');
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('当前环境无法创建 WebGPU canvas context');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('无法获取 WebGPU adapter');
    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, geometry, context, device);
  }
  constructor(canvas, geometry, context, device) {
    this.type = 'WebGPU';
    this.canvas = canvas;
    this.geometry = geometry;
    this.context = context;
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';
    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });
    this.mvp = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.uniformPayload = new Float32Array(24);

    this.vertexBuffer = device.createBuffer({ size: geometry.positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.vertexBuffer, 0, geometry.positions);
    this.normalBuffer = device.createBuffer({ size: geometry.normals.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.normalBuffer, 0, geometry.normals);
    this.indexBuffer = device.createBuffer({ size: geometry.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, geometry.indices);
    this.instanceCapacity = 5 * 4;
    this.instanceBuffer = device.createBuffer({ size: this.instanceCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.uniformBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const shader = device.createShaderModule({
      code: `
        struct Uniforms {
          viewProj : mat4x4<f32>,
          time : f32,
          _pad0 : vec3<f32>,
        };
        @group(0) @binding(0) var<uniform> uniforms : Uniforms;
        struct VSIn {
          @location(0) position : vec3<f32>,
          @location(1) normal : vec3<f32>,
          @location(2) offset : vec3<f32>,
          @location(3) phase : f32,
          @location(4) scale : f32,
        };
        struct VSOut {
          @builtin(position) position : vec4<f32>,
          @location(0) normal : vec3<f32>,
          @location(1) color : vec3<f32>,
        };
        fn rotY(a: f32) -> mat3x3<f32> {
          let c = cos(a); let s = sin(a);
          return mat3x3<f32>(vec3<f32>(c,0.0,s), vec3<f32>(0.0,1.0,0.0), vec3<f32>(-s,0.0,c));
        }
        fn rotX(a: f32) -> mat3x3<f32> {
          let c = cos(a); let s = sin(a);
          return mat3x3<f32>(vec3<f32>(1.0,0.0,0.0), vec3<f32>(0.0,c,-s), vec3<f32>(0.0,s,c));
        }
        @vertex fn vsMain(input : VSIn) -> VSOut {
          let angle = uniforms.time * 0.8 + input.phase;
          let rot = rotY(angle) * rotX(angle * 0.7);
          let pos = rot * (input.position * input.scale) + input.offset;
          var out : VSOut;
          out.position = uniforms.viewProj * vec4<f32>(pos, 1.0);
          out.normal = normalize(rot * input.normal);
          out.color = 0.5 + 0.5 * cos(vec3<f32>(0.0, 2.1, 4.2) + input.phase + uniforms.time * 0.2);
          return out;
        }
        @fragment fn fsMain(input : VSOut) -> @location(0) vec4<f32> {
          let light = normalize(vec3<f32>(0.5, 0.7, 0.8));
          let diff = max(dot(normalize(input.normal), light), 0.0);
          let color = input.color * (0.25 + diff * 0.75);
          return vec4<f32>(color, 1.0);
        }
      `,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform', minBindingSize: 96 },
      }],
    });
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });

    this.pipeline = device.createRenderPipeline({
      layout: this.pipelineLayout,
      vertex: {
        module: shader,
        entryPoint: 'vsMain',
        buffers: [
          { arrayStride: 12, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: 12, stepMode: 'vertex', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
          {
            arrayStride: 20,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 2, offset: 0, format: 'float32x3' },
              { shaderLocation: 3, offset: 12, format: 'float32' },
              { shaderLocation: 4, offset: 16, format: 'float32' },
            ],
          },
        ],
      },
      fragment: { module: shader, entryPoint: 'fsMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: 96 } }],
    });
    this.depthTexture = null;
  }
  ensureInstanceBuffer(byteLength) {
    if (this.instanceCapacity >= byteLength) return;
    this.instanceBuffer.destroy();
    this.instanceCapacity = byteLength;
    this.instanceBuffer = this.device.createBuffer({ size: byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }
  ensureDepth(width, height) {
    if (this.depthTexture && this.depthWidth === width && this.depthHeight === height) return;
    this.depthTexture?.destroy();
    this.depthWidth = width;
    this.depthHeight = height;
    this.depthTexture = this.device.createTexture({ size: [width, height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }
  resize() {}
  setInstanceData(instanceData) {
    this.ensureInstanceBuffer(instanceData.byteLength);
    this.instanceCount = instanceData.length / 5;
    this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceData);
  }
  render(width, height, time) {
    this.ensureDepth(width, height);
    perspective(this.proj, Math.PI / 4, width / height, 0.1, 100);
    lookAt(this.view, [0, 0, 16], [0, 0, 0], [0, 1, 0]);
    multiplyMat4(this.mvp, this.proj, this.view);
    this.uniformPayload.fill(0);
    this.uniformPayload.set(this.mvp, 0);
    this.uniformPayload[16] = time;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformPayload);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0.03, g: 0.05, b: 0.09, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setVertexBuffer(1, this.normalBuffer);
    pass.setVertexBuffer(2, this.instanceBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint32');
    pass.drawIndexed(this.geometry.indices.length, this.instanceCount || 0);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
  destroy() {
    this.vertexBuffer.destroy();
    this.normalBuffer.destroy();
    this.indexBuffer.destroy();
    this.instanceBuffer.destroy();
    this.uniformBuffer.destroy();
    this.depthTexture?.destroy();
  }
}

function getCanvasSize() {
  const rect = state.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (state.canvas.width !== width || state.canvas.height !== height) {
    state.canvas.width = width;
    state.canvas.height = height;
  }
  return { width, height };
}

async function createInstanceSystem(mode, count, scale) {
  console.info('create instance system', { mode, count, scale });
  if (mode === 'wasm') return WasmInstanceSystem.create(count, scale);
  return new JSInstanceSystem(count, scale);
}
async function createRenderer(mode, canvas, geometry) {
  console.info('create renderer', mode);
  if (mode === 'webgpu') return WebGPURenderer.create(canvas, geometry);
  return new WebGLRenderer(canvas, geometry);
}

async function rebuildScene() {
  cancelAnimationFrame(state.animationFrame);
  state.running = false;
  state.renderer?.destroy?.();
  state.renderer = null;
  state.system = null;
  state.staticInstanceData = null;
  state.lastTimestamp = 0;
  state.fpsFrames = 0;
  state.fpsTime = 0;
  state.frameIntervalSamples = [];
  state.metricWindowTime = 0;
  state.metricWindowFrames = 0;
  state.metricWindowFrameCost = 0;
  state.metricWindowUpdateCost = 0;
  state.metricWindowRenderCost = 0;
  state.elapsedTime = 0;
  setLastError('');

  state.benchmarkMode = elements.benchmarkModeSelect.value;
  state.requestedRenderer = elements.rendererSelect.value;
  state.computeMode = elements.computeSelect.value;
  state.meshLevel = elements.meshSelect.value;
  state.instanceCount = Number(elements.instanceSelect.value);
  state.stressLevel = Number(elements.stressSelect.value);
  state.instanceScale = Number(elements.scaleSelect.value);
  persistConfig();

  let rendererMode = state.requestedRenderer;
  let fallbackNotice = '';
  if (rendererMode === 'webgpu' && !state.webGpuAvailable) {
    rendererMode = 'webgl';
    fallbackNotice = 'WebGPU 不可用，已回退到 WebGL';
  }

  try {
    setStatus('创建 canvas / renderer ...');
    state.geometry = createTorusKnotGeometry(state.meshLevel);
    state.system = await createInstanceSystem(state.computeMode, state.instanceCount, state.instanceScale);
    if (state.benchmarkMode !== 'compute') {
      const canvas = createFreshCanvas();
      state.renderer = await createRenderer(rendererMode, canvas, state.geometry);
      state.actualRenderer = state.renderer.type;
    } else {
      elements.canvasHost.innerHTML = '<div class="canvas-placeholder">纯计算模式：当前不进行复杂网格渲染，只统计 update 路径。</div>';
      state.actualRenderer = 'N/A';
    }
    state.staticInstanceData = new Float32Array(state.system.getRenderData());
    if (state.renderer) {
      state.renderer.setInstanceData(
        state.staticInstanceData,
        state.benchmarkMode === 'render' && state.renderer.type === 'WebGL' ? state.renderer.gl.STATIC_DRAW : undefined,
      );
    }
    elements.modeChip.textContent = `模式：${state.benchmarkMode.toUpperCase()} · ${state.computeMode.toUpperCase()} + ${state.requestedRenderer.toUpperCase()}`;
    elements.rendererChip.textContent = `实际渲染：${state.actualRenderer}`;
    elements.meshChip.textContent = `网格：${state.meshLevel} · ${state.instanceCount} 实例 · 压力 ${state.stressLevel}x`;
    updateSupportChip(state.webGpuAvailable ? '浏览器已暴露 API' : '当前浏览器不支持', !state.webGpuAvailable);
    setStatus(fallbackNotice || '运行中', Boolean(fallbackNotice));
    state.running = true;
    tick(0);
  } catch (error) {
    const detail = formatError(error, 'rebuildScene');
    console.error('renderer init failed', detail);
    if (state.requestedRenderer === 'webgpu') {
      try {
        const canvas = createFreshCanvas();
        state.renderer = await createRenderer('webgl', canvas, state.geometry || createTorusKnotGeometry(state.meshLevel));
        state.system = await createInstanceSystem(state.computeMode, state.instanceCount, state.instanceScale);
        state.staticInstanceData = new Float32Array(state.system.getRenderData());
        state.renderer.setInstanceData(state.staticInstanceData);
        state.actualRenderer = state.renderer.type;
        elements.modeChip.textContent = `模式：${state.benchmarkMode.toUpperCase()} · ${state.computeMode.toUpperCase()} + ${state.requestedRenderer.toUpperCase()}`;
        elements.rendererChip.textContent = `实际渲染：${state.actualRenderer}`;
        elements.meshChip.textContent = `网格：${state.meshLevel} · ${state.instanceCount} 实例 · 压力 ${state.stressLevel}x`;
        updateSupportChip('API 可见，但当前环境初始化失败', true);
        setStatus('WebGPU 初始化失败，已回退到 WebGL', true, detail);
        state.running = true;
        tick(0);
        return;
      } catch (fallbackError) {
        const fallbackDetail = `${detail}\n\nFallback Error:\n${formatError(fallbackError, 'fallback-webgl')}`;
        console.error('fallback webgl failed', fallbackDetail);
        setStatus('初始化失败', true, fallbackDetail);
        elements.rendererChip.textContent = '实际渲染：初始化失败';
        return;
      }
    }
    setStatus(error.message || '初始化失败', true, detail);
    elements.rendererChip.textContent = '实际渲染：初始化失败';
  }
}

function formatDurationMs(value) {
  if (value < 0.1) return `${(value * 1000).toFixed(0)}μs`;
  return `${value.toFixed(2)}ms`;
}

function formatFpsWithJitter(fps, samples) {
  if (!samples.length) return fps.toFixed(1);
  const avg = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - avg) ** 2, 0) / samples.length;
  const sigma = Math.sqrt(variance);
  if (sigma < 0.5) return fps.toFixed(1);
  return `${fps.toFixed(1)} (±${sigma.toFixed(1)}ms)`;
}

function tick(timestamp) {
  if (!state.running || !state.system) return;
  try {
    const hasRenderer = Boolean(state.renderer && state.canvas && state.benchmarkMode !== 'compute');
    const { width, height } = hasRenderer ? getCanvasSize() : { width: 1, height: 1 };
    const dt = state.lastTimestamp ? Math.min((timestamp - state.lastTimestamp) / 1000, 0.033) : 0.016;
    state.lastTimestamp = timestamp;
    state.elapsedTime += dt;

    const frameStart = performance.now();
    const updateStart = performance.now();
    const subDt = dt / state.stressLevel;
    let instanceData = state.staticInstanceData;
    if (state.benchmarkMode !== 'render') {
      for (let i = 0; i < state.stressLevel; i += 1) {
        state.system.update(subDt, state.elapsedTime + i * subDt);
      }
      instanceData = state.system.getRenderData();
      if (state.benchmarkMode === 'combined') state.staticInstanceData = instanceData;
    }
    const renderStart = performance.now();
    if (hasRenderer) {
      if (state.benchmarkMode !== 'render') {
        state.renderer.setInstanceData(instanceData);
      }
      state.renderer.render(width, height, state.elapsedTime);
    }
    const renderEnd = performance.now();

    const frameCost = renderEnd - frameStart;
    const updateCost = renderStart - updateStart;
    const renderCost = renderEnd - renderStart;

    state.fpsFrames += 1;
    state.fpsTime += dt;
    state.frameIntervalSamples.push(dt * 1000);
    if (state.frameIntervalSamples.length > 30) state.frameIntervalSamples.shift();
    state.metricWindowTime += dt;
    state.metricWindowFrames += 1;
    state.metricWindowFrameCost += frameCost;
    state.metricWindowUpdateCost += updateCost;
    state.metricWindowRenderCost += renderCost;
    if (state.fpsTime >= 0.5) {
      elements.fpsValue.textContent = formatFpsWithJitter(state.fpsFrames / state.fpsTime, state.frameIntervalSamples);
      state.fpsFrames = 0;
      state.fpsTime = 0;
    }
    if (state.metricWindowTime >= 0.25) {
      const denom = Math.max(1, state.metricWindowFrames);
      elements.frameValue.textContent = formatDurationMs(state.metricWindowFrameCost / denom);
      elements.updateValue.textContent = formatDurationMs(state.metricWindowUpdateCost / denom);
      elements.renderValue.textContent = formatDurationMs(state.metricWindowRenderCost / denom);
      state.metricWindowTime = 0;
      state.metricWindowFrames = 0;
      state.metricWindowFrameCost = 0;
      state.metricWindowUpdateCost = 0;
      state.metricWindowRenderCost = 0;
    }

    state.animationFrame = requestAnimationFrame(tick);
  } catch (error) {
    const detail = formatError(error, 'tick');
    state.running = false;
    console.error('render loop crashed', detail);
    setStatus('渲染过程中出错', true, detail);
  }
}

for (const control of [elements.benchmarkModeSelect, elements.rendererSelect, elements.computeSelect, elements.meshSelect, elements.instanceSelect, elements.stressSelect, elements.scaleSelect]) {
  control.addEventListener('change', rebuildScene);
}
window.addEventListener('resize', () => {
  if (!state.running || !state.canvas || state.benchmarkMode === 'compute') return;
  getCanvasSize();
});

elements.toggleLogsBtn.addEventListener('click', () => {
  elements.logPanel.open = !elements.logPanel.open;
  elements.toggleLogsBtn.textContent = elements.logPanel.open ? '隐藏日志' : '显示日志';
});
elements.logPanel.addEventListener('toggle', () => {
  elements.toggleLogsBtn.textContent = elements.logPanel.open ? '隐藏日志' : '显示日志';
});
elements.clearLogsBtn.addEventListener('click', () => {
  state.logs = [];
  elements.logOutput.textContent = '暂无日志';
});
elements.copyErrorBtn.addEventListener('click', async () => {
  const text = state.lastErrorText || '暂无错误';
  try {
    await navigator.clipboard.writeText(text);
    setStatus('错误详情已复制');
  } catch {
    setStatus('复制失败，请手动长按日志复制', true);
  }
});

console.info('app boot', {
  userAgent: navigator.userAgent,
  webGpuAvailable: state.webGpuAvailable,
  hasPreferredCanvasFormat: Boolean(navigator.gpu?.getPreferredCanvasFormat),
  secureContext: window.isSecureContext,
});

rebuildScene();
