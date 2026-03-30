#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vColor;

uniform float uLightingEnabled;

out vec4 outColor;

void main() {
  vec3 light = normalize(vec3(0.5, 0.7, 0.8));
  float diff = max(dot(normalize(vNormal), light), 0.0);
  float litMix = (1.0 - uLightingEnabled) + uLightingEnabled * (0.25 + diff * 0.75);
  vec3 color = vColor * litMix;
  outColor = vec4(color, 1.0);
}
