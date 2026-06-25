import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE = 0.004
const FULL_SCALE = 1.0     // reduced from 2.0 — was too large
const SEED_HOLD  = 2000
const GROW_MS    = 36000   // 36 s — slow organic bloom
const RECEDE_MS  = 2500

export const SEED_HOLD_MS = SEED_HOLD

const ELEMENT_COLORS = {
  wood:  0x00cc44,
  fire:  0xff2200,
  earth: 0xffcc00,
  metal: 0xffffff,
  water: 0x0066ff,
}

function easeOutCubic(t)   { return 1 - Math.pow(1 - t, 3) }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

// ── Dormant orb: swirling particle cluster ────────────────────
const ORB_COUNT  = 3
const ORB_DRIFT  = 0.42   // wide lazy drift radius
const ORB_DRIFT_H = 0.32  // vertical float range

let _glowTex = null
function getGlowTex() {
  if (_glowTex) return _glowTex
  const size = 64
  const c    = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g   = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return (_glowTex = new THREE.CanvasTexture(c))
}

function makeOrb(scene, element) {
  // swirling particles — the visual
  // positions are LOCAL offsets from points.position (set to orb world pos when dormant)
  const positions = new Float32Array(ORB_COUNT * 3)
  const geo       = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.09,
    map: getGlowTex(),
    color: ELEMENT_COLORS[element],
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false   // bounding sphere is stale until first update; skip culling
  points.visible = false
  scene.add(points)

  // transparent sphere — exists only for raycasting; renders nothing
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  )
  hit.userData.element = element
  hit.visible = false
  scene.add(hit)

  return { hit, points, positions, geo }
}

export class GrowTree {
  constructor(scene) {
    this._scene  = scene
    this._models = {}
    this._state  = {}
  }

  load(paths, onEach) {
    return Promise.all(
      Object.entries(paths).map(([el, path]) =>
        this._loadOne(el, path).then(() => { if (onEach) onEach(el) })
      )
    )
  }

  _loadOne(element, path) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader()
      loader.setMeshoptDecoder(MeshoptDecoder)
      loader.load(path, (gltf) => {
        const model = gltf.scene
        model.traverse((n) => {
          if (!n.isMesh) return
          const mats = Array.isArray(n.material) ? n.material : [n.material]
          mats.forEach((m) => { m.side = THREE.DoubleSide; m.depthWrite = true })
        })
        const box    = new THREE.Box3().setFromObject(model)
        const size   = box.getSize(new THREE.Vector3())
        const max    = Math.max(size.x, size.y, size.z)
        if (max > 0) model.scale.setScalar(1 / max)
        const center = box.getCenter(new THREE.Vector3())
        model.position.set(-center.x / max, -box.min.y / max, -center.z / max)
        this._models[element] = model
        resolve()
      }, undefined, reject)
    })
  }

  place(element, worldPosition) {
    if (this._state[element]) return
    const model = this._models[element]
    if (!model) return

    const anchor = new THREE.Group()
    anchor.position.copy(worldPosition)
    anchor.scale.setScalar(SEED_SCALE)
    anchor.add(model)
    this._scene.add(anchor)

    const orb = makeOrb(this._scene, element)

    this._state[element] = {
      anchor, orb,
      phase:        'seed',
      phaseStart:   null,
      lastProgress: 0,
      seedTimer:    null,
    }

    this._state[element].seedTimer = setTimeout(() => {
      this._state[element].phase      = 'grow'
      this._state[element].phaseStart = performance.now()
    }, SEED_HOLD)
  }

  update() {
    const result = {}
    const now    = performance.now()
    const t_s    = now * 0.001

    for (const [element, state] of Object.entries(this._state)) {

      if (state.phase === 'seed') {
        result[element] = { progress: 0, phase: 'seed' }
        continue
      }

      if (state.phase === 'dormant') {
        // animate swirling particle orb — positions are LOCAL to points.position
        const { hit, points, positions, geo } = state.orb
        points.position.copy(hit.position)   // world position of the orb
        for (let i = 0; i < ORB_COUNT; i++) {
          const phase = (i / ORB_COUNT) * Math.PI * 2   // evenly separated
          const speed = 0.22 + i * 0.09                 // each drifts at own pace
          const r = ORB_DRIFT * (0.75 + 0.25 * Math.sin(t_s * 0.4 + phase))
          const angle = phase + t_s * speed
          positions[i*3]     = r * Math.cos(angle)
          positions[i*3 + 1] = ORB_DRIFT_H * Math.sin(t_s * 0.28 + phase)
          positions[i*3 + 2] = r * Math.sin(angle)
        }
        geo.attributes.position.needsUpdate = true
        points.material.opacity = 0.6 + 0.35 * Math.sin(t_s * 2.5)
        result[element] = { progress: 1, phase: 'dormant' }
        continue
      }

      const elapsed = now - state.phaseStart

      if (state.phase === 'grow') {
        if (elapsed < GROW_MS) {
          const t = elapsed / GROW_MS
          state.anchor.scale.setScalar(SEED_SCALE + (FULL_SCALE - SEED_SCALE) * easeOutCubic(t))
          state.anchor.rotation.y += 0.006
          state.anchor.rotation.x = Math.sin(elapsed * 0.00025) * 0.25
          state.anchor.rotation.z = Math.sin(elapsed * 0.00018 + 1.2) * 0.1
          state.lastProgress = easeOutCubic(t) * 0.8
        } else {
          state.phase        = 'recede'
          state.phaseStart   = now
          state.lastProgress = 0.8
        }

      } else if (state.phase === 'recede') {
        if (elapsed < RECEDE_MS) {
          const ease = easeInOutCubic(elapsed / RECEDE_MS)
          state.anchor.scale.setScalar(FULL_SCALE * (1 - ease))
          state.anchor.rotation.y += 0.003
          state.lastProgress = 0.8 + ease * 0.2
        } else {
          // go dormant — particle orb appears at anchor position
          state.anchor.scale.setScalar(0)
          state.anchor.visible          = false
          state.orb.hit.position.copy(state.anchor.position)
          state.orb.hit.visible         = true   // transparent but raycasts
          state.orb.points.visible      = true
          state.phase                   = 'dormant'
          state.lastProgress            = 1
        }
      }

      result[element] = { progress: state.lastProgress, phase: state.phase }
    }

    return result
  }

  reactivate(element) {
    const state = this._state[element]
    if (!state || state.phase !== 'dormant') return
    state.orb.hit.visible    = false
    state.orb.points.visible = false
    state.anchor.position.copy(state.orb.hit.position)
    state.anchor.rotation.set(0, 0, 0)
    state.anchor.scale.setScalar(SEED_SCALE)
    state.anchor.visible = true
    state.phase          = 'seed'
    state.lastProgress   = 0
    state.seedTimer = setTimeout(() => {
      state.phase      = 'grow'
      state.phaseStart = performance.now()
    }, SEED_HOLD)
  }

  getDormantOrbs() {
    return Object.values(this._state)
      .filter(s => s.phase === 'dormant' && s.orb.hit.visible)
      .map(s => s.orb.hit)
  }

  hideAllOrbs() {
    for (const state of Object.values(this._state)) {
      if (!state.orb) continue
      state.orb.hit.visible    = false
      state.orb.points.visible = false
    }
  }

  getAnchor(element) { return this._state[element]?.anchor }
  isPlaced(element)  { return !!this._state[element] }
  get placedCount()  { return Object.keys(this._state).length }
}
