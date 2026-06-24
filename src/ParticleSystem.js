import * as THREE from 'three'

const COUNT      = 120   // 60 particles per strand
const TURNS      = 3     // full helix rotations from base to outer
const R_MIN      = 0.03  // tight at model base
const R_MAX      = 1.5   // spread into background
const HEIGHT     = 2.0   // vertical travel distance (world units)
const BASE_SPEED = 0.04  // helix travel speed (0–1 per second)
const Y_OFFSET   = 0.35  // start below the anchor origin

const ELEMENT_COLORS = {
  wood:  0x00cc44,
  fire:  0xff2200,
  earth: 0xffcc00,
  metal: 0xffffff,
  water: 0x0066ff,
}

function createGlowTexture() {
  const size   = 64
  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const g   = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)')
  g.addColorStop(0.2, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.4)')
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export class ParticleSystem {
  constructor(scene) {
    const positions = new Float32Array(COUNT * 3)
    const geo       = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    this._mat = new THREE.PointsMaterial({
      size: 0.16,
      map: createGlowTexture(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    })

    this._points         = new THREE.Points(geo, this._mat)
    this._points.visible = false
    scene.add(this._points)

    this._positions = positions
    this._geo       = geo
    this._active    = false
    this._origin    = new THREE.Vector3()
    this._clock     = 0

    this._t     = new Float32Array(COUNT)
    this._speed = new Float32Array(COUNT)

    for (let i = 0; i < COUNT; i++) {
      this._t[i]     = i / COUNT  // evenly staggered along helix
      this._speed[i] = BASE_SPEED * (0.7 + Math.random() * 0.6)
    }
  }

  start(element, position) {
    this._active = true
    this._clock  = 0
    this._origin.copy(position)
    this._mat.color.setHex(ELEMENT_COLORS[element] ?? 0xffffff)
    this._points.visible = true

    for (let i = 0; i < COUNT; i++) {
      this._t[i] = i / COUNT
    }
  }

  update(progress, dt) {
    if (!this._active) return

    this._clock += dt

    const fade        = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1
    this._mat.opacity = 0.9 * fade

    const o = this._origin

    for (let i = 0; i < COUNT; i++) {
      this._t[i] += this._speed[i] * dt
      if (this._t[i] > 1) this._t[i] -= 1

      const t      = this._t[i]
      const strand = i % 2  // two strands offset by π
      const angle  = t * TURNS * Math.PI * 2 + strand * Math.PI + this._clock * 0.25

      // quadratic radius expansion: tight at base, wide at top
      const r = R_MIN + (R_MAX - R_MIN) * (t * t)
      const h = t * HEIGHT - Y_OFFSET

      // slight organic wobble
      const wobble = Math.sin(this._clock * 1.5 + i * 0.4) * 0.015

      this._positions[i * 3]     = o.x + (r + wobble) * Math.cos(angle)
      this._positions[i * 3 + 1] = o.y + h
      this._positions[i * 3 + 2] = o.z + (r + wobble) * Math.sin(angle)
    }

    this._geo.attributes.position.needsUpdate = true
  }

  stop() {
    this._active         = false
    this._points.visible = false
  }
}
