#version 300 es

precision highp float;

in vec2 pos;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_texSize;
float scale = 1.0;

out vec4 outColor;

void main() {
    vec2 uv = ((pos * 0.5) + 0.5).xy * u_resolution.xy / u_texSize / scale;
    
    vec4 col = texture(u_texture, uv);

    col = vec4(pow(col.xyz / col.a, vec3(1.0 / 2.2)), 1.0);
    outColor = col;
    // outColor = vec4(col.xyz, 1.0);
}