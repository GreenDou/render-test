#version 300 es
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
