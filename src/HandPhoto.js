import * as THREE from 'three'

// Snapshot of the participant's hand at the moment their gesture is confirmed,
// shown as a plane at the placement point. It folds into a kaleidoscope and
// dissolves as the real model grows in, handing off from "photo of the hand"
// to "model" — Randi's original kaleidoscope motif, applied to the seed moment.

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_SHADER = `
  uniform sampler2D map;
  uniform float uIntensity;   // 0 = clean photo, 1 = fully collapsed
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    // fold into more mirrored segments and spin faster as it collapses
    vec2  p        = vUv - 0.5;
    float r        = length(p);
    float a        = atan(p.y, p.x);
    float segments = mix(1.0, 12.0, uIntensity);
    float segAngle = 6.28318530718 / segments;
    a = mod(a + uTime * uIntensity * 2.4, segAngle);
    if (a > segAngle * 0.5) a = segAngle - a;

    vec2 kaleidoUv = vec2(cos(a), sin(a)) * r + 0.5;
    vec2 uv        = mix(vUv, kaleidoUv, uIntensity);

    // gentle chromatic split, grows with intensity
    float split = uIntensity * 0.038;
    float rCol = texture2D(map, uv + vec2( split, 0.0)).r;
    float gCol = texture2D(map, uv).g;
    float bCol = texture2D(map, uv - vec2( split, 0.0)).b;

    // seed-like mask: soft-edged oval instead of a hard square crop.
    // Fade must fully reach 0 before the UV boundary (0.5 * 0.82 = 0.41 at
    // top/bottom, 0.5 at left/right) or the plane's hard edge shows through.
    vec2 centered = vUv - 0.5;
    centered.y *= 0.82;   // taller than wide, more seed/teardrop than circle
    float dist = length(centered);
    float mask = 1.0 - smoothstep(0.24, 0.40, dist);

    float alpha = (1.0 - uIntensity) * mask;
    gl_FragColor = vec4(rCol, gCol, bCol, alpha);
  }
`

export class HandPhotoSystem {
  constructor(scene) {
    this._scene  = scene
    this._active = {}   // element -> record
  }

  // Captures the current video frame (center-cropped square) and shows it at worldPos.
  spawn(element, video, worldPos) {
    this._disposeOne(element)

    const vw = video.videoWidth  || 640
    const vh = video.videoHeight || 480
    const side = Math.min(vw, vh)

    const SIZE = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, SIZE, SIZE)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map:        { value: texture },
        uIntensity: { value: 0 },
        uTime:      { value: 0 },
      },
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), material)
    mesh.position.copy(worldPos)
    mesh.position.y += 0.35
    this._scene.add(mesh)

    this._active[element] = {
      mesh, material, texture,
      collapsing: false,
      collapseStart: 0,
      collapseDurationMs: 900,
    }
  }

  // Begins the glitch/dissolve of this element's photo, if one is showing.
  collapse(element, durationMs = 900) {
    const rec = this._active[element]
    if (!rec || rec.collapsing) return
    rec.collapsing         = true
    rec.collapseStart      = performance.now()
    rec.collapseDurationMs = durationMs
  }

  update() {
    const now = performance.now()
    for (const [element, rec] of Object.entries(this._active)) {
      rec.material.uniforms.uTime.value = now * 0.001

      if (rec.collapsing) {
        const t = Math.min((now - rec.collapseStart) / rec.collapseDurationMs, 1)
        rec.material.uniforms.uIntensity.value = t
        rec.mesh.scale.setScalar(1 + t * 0.6)
        if (t >= 1) this._disposeOne(element)
      }
    }
  }

  _disposeOne(element) {
    const rec = this._active[element]
    if (!rec) return
    this._scene.remove(rec.mesh)
    rec.mesh.geometry.dispose()
    rec.material.dispose()
    rec.texture.dispose()
    delete this._active[element]
  }
}
