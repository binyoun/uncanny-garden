import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE    = 0.004
const FULL_SCALE    = 1.8   // peak bloom height (metres, model normalised to 1 unit)
const SETTLED_SCALE = 0.38  // resting size so all 5 fit in view
const SEED_HOLD     = 2000  // ms before growing starts
const GROW_MS       = 14000 // seed → full bloom
const SETTLE_MS     = 2500  // full bloom → settled size

export const SEED_HOLD_MS = SEED_HOLD

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class GrowTree {
  constructor(scene) {
    this._scene  = scene
    this._models = {}
    this._state  = {}
  }

  async load(paths) {
    await Promise.all(
      Object.entries(paths).map(([el, path]) => this._loadOne(el, path))
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
        // Pivot at base so model grows upward from anchor point
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
    anchor.scale.set(SEED_SCALE, SEED_SCALE, SEED_SCALE)
    anchor.add(model)
    this._scene.add(anchor)

    const state = { anchor, growing: false, growStart: null, lastProgress: 0, seedTimer: null }
    this._state[element] = state

    state.seedTimer = setTimeout(() => {
      state.growing   = true
      state.growStart = performance.now()
    }, SEED_HOLD)
  }

  update() {
    const result = {}

    for (const [element, state] of Object.entries(this._state)) {
      if (!state.growing) {
        result[element] = state.lastProgress
        continue
      }

      const elapsed = performance.now() - state.growStart

      if (elapsed < GROW_MS) {
        // ── Bloom phase: Y shoots up first, X/Z blooms after ──────
        const t   = elapsed / GROW_MS
        const tY  = Math.min(t * 2.2, 1)  // Y reaches full at ~45% of grow time
        const tXZ = t

        const sy  = SEED_SCALE + (FULL_SCALE - SEED_SCALE) * easeOutCubic(tY)
        const sxz = SEED_SCALE + (FULL_SCALE - SEED_SCALE) * easeOutCubic(tXZ)

        state.anchor.scale.set(sxz, sy, sxz)
        if (t < 0.35) state.anchor.rotation.y += 0.002

        // Progress 0 → 0.85 during bloom phase
        state.lastProgress = easeOutCubic(tXZ) * 0.85

      } else if (elapsed < GROW_MS + SETTLE_MS) {
        // ── Settle phase: shrink uniformly to resting size ─────────
        const t    = (elapsed - GROW_MS) / SETTLE_MS
        const ease = easeInOutCubic(t)
        const s    = FULL_SCALE + (SETTLED_SCALE - FULL_SCALE) * ease
        state.anchor.scale.setScalar(s)

        // Progress 0.85 → 1.0 during settle
        state.lastProgress = 0.85 + ease * 0.15

      } else {
        // ── Settled ────────────────────────────────────────────────
        state.anchor.scale.setScalar(SETTLED_SCALE)
        state.growing      = false
        state.lastProgress = 1
      }

      result[element] = state.lastProgress
    }

    return result
  }

  getAnchor(element) { return this._state[element]?.anchor }
  isPlaced(element)  { return !!this._state[element] }
  get placedCount()  { return Object.keys(this._state).length }
}
