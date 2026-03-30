#version 300 es
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

// @panel-start webgl-render
vec3 rotateX(vec3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}

vec3 rotateY(vec3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * value.x + s * value.z, value.y, -s * value.x + c * value.z);
}

vec3 computeInstanceColor(float phase, float time) {
  return 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + phase + time * 0.2);
}
// @panel-end webgl-render

void main() {
  float angle = uTime * 0.8 + iPhase;
  float tilt = angle * 0.7;
  vec3 scaled = aPosition * iScale;
  vec3 rotated = rotateY(rotateX(scaled, tilt), angle);
  vec3 rotatedNormal = rotateY(rotateX(aNormal, tilt), angle);

  vNormal = normalize(rotatedNormal);
  vColor = computeInstanceColor(iPhase, uTime);
  gl_Position = uViewProj * vec4(rotated + iOffset, 1.0);
}
