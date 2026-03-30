struct Uniforms {
  viewProj : mat4x4<f32>,
  time : f32,
  lightingEnabled : f32,
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

// @panel-start webgpu-render
fn rotateX(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}

fn rotateY(value: vec3<f32>, angle: f32) -> vec3<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec3<f32>(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
}

fn computeInstanceColor(phase: f32, time: f32) -> vec3<f32> {
  return vec3<f32>(0.5) + vec3<f32>(0.5) * cos(vec3<f32>(0.0, 2.1, 4.2) + vec3<f32>(phase + time * 0.2));
}
// @panel-end webgpu-render

@vertex
fn vsMain(input : VSIn) -> VSOut {
  let angle = uniforms.time * 0.8 + input.phase;
  let tilt = angle * 0.7;
  let scaled = input.position * input.scale;
  let rotated = rotateY(rotateX(scaled, tilt), angle);
  let rotatedNormal = rotateY(rotateX(input.normal, tilt), angle);

  var out : VSOut;
  out.position = uniforms.viewProj * vec4<f32>(rotated + input.offset, 1.0);
  out.normal = normalize(rotatedNormal);
  out.color = computeInstanceColor(input.phase, uniforms.time);
  return out;
}

@fragment
fn fsMain(input : VSOut) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(0.5, 0.7, 0.8));
  let diff = max(dot(normalize(input.normal), light), 0.0);
  let litMix = (1.0 - uniforms.lightingEnabled) + uniforms.lightingEnabled * (0.25 + diff * 0.75);
  let color = input.color * litMix;
  return vec4<f32>(color, 1.0);
}
