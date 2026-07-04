import * as THREE from 'three'

// Patches a model's own material to glitch: block-based color corruption on
// its surface (works whether or not the material has an image texture — it
// perturbs the already-shaded color, not a texture sample) plus a per-vertex
// wobble for a "warping" look. Uses onBeforeCompile, Three's standard hook
// for extending built-in materials without losing PBR lighting/environment
// reflections. Declares its own varying (vGlitchUv) rather than relying on
// the built-in vUv, since that's only declared when a texture map is present.

const VERTEX_HEADER = `
varying vec2 vGlitchUv;
uniform float uGlitch;
uniform float uWobbleAmp;
uniform float uTime;
`

const VERTEX_BEGIN_PATCH = `
#include <begin_vertex>
vGlitchUv = uv;
{
  float n = sin(position.x * 9.0 + uTime * 5.0)
          * sin(position.y * 7.0 - uTime * 4.0)
          * sin(position.z * 11.0 + uTime * 6.0);
  transformed += normal * n * uGlitch * uWobbleAmp;
}
`

const FRAGMENT_HEADER = `
varying vec2 vGlitchUv;
uniform float uGlitch;
uniform float uTime;
uniform vec3 uTint;

float glitchHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`

const FRAGMENT_DITHER_PATCH = `
#include <dithering_fragment>
if (uGlitch > 0.001) {
  vec2 block = floor(vGlitchUv * 14.0);
  float t  = floor(uTime * 12.0);
  float h  = glitchHash(block + t);
  float hr = glitchHash(block + t + 11.1);
  float hg = glitchHash(block + t + 37.7);
  float hb = glitchHash(block + t + 71.3);

  vec3 shifted = gl_FragColor.rgb;
  shifted.r += (hr - 0.5) * 0.9;
  shifted.g += (hg - 0.5) * 0.9;
  shifted.b += (hb - 0.5) * 0.9;

  float dropout = step(1.0 - uGlitch * 0.5, h);
  shifted = mix(shifted, uTint, dropout);

  gl_FragColor.rgb = mix(gl_FragColor.rgb, shifted, uGlitch);
}
`

// Call once per material at load time. Returns the uniforms object — mutate
// .uGlitch.value / .uWobbleAmp.value / .uTime.value per frame to drive it.
export function patchMaterialForGlitch(material, elementColorHex) {
  const uniforms = {
    uGlitch:    { value: 0 },
    uTime:      { value: 0 },
    uWobbleAmp: { value: 0 },
    uTint:      { value: new THREE.Color(elementColorHex ?? 0xffffff) },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader   = VERTEX_HEADER + shader.vertexShader
      .replace('#include <begin_vertex>', VERTEX_BEGIN_PATCH)
    shader.fragmentShader = FRAGMENT_HEADER + shader.fragmentShader
      .replace('#include <dithering_fragment>', FRAGMENT_DITHER_PATCH)
  }
  material.needsUpdate = true

  return uniforms
}
