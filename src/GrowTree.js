import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE = 0.004
const FULL_SCALE = 2.0
const SEED_HOLD  = 2000
const PHASE1_MS  = 6000
const PHASE2_MS  = 10000

export const SEED_HOLD_MS = SEED_HOLD

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function growthProgress(elapsed) {
  if (elapsed <= PHASE1_MS) {
    return easeOutCubic(elapsed / PHASE1_MS) * 0.5
  }
  const p2 = Math.min((elapsed - PHASE1_MS) / PHASE2_MS, 1)
  return 0.5 + easeOutCubic(p2) * 0.5
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

    const state = { anchor, growing: false, growStart: null, lastProgress: 0, seedTimer: null }
    this._state[element] = state

    state.seedTimer = setTimeout(() => {
      state.growing   = true
      state.growStart = performance.now()
    }, SEED_HOLD)
  }

  // Returns { element: progress } for all placed elements.
  update() {
    const result = {}
    for (const [element, state] of Object.entries(this._state)) {
      if (!state.growing) {
        result[element] = state.lastProgress
        continue
      }
      const elapsed  = performance.now() - state.growStart
      const progress = growthProgress(elapsed)
      state.lastProgress = Math.min(progress, 1)

      const scale = SEED_SCALE + (FULL_SCALE - SEED_SCALE) * state.lastProgress
      state.anchor.scale.setScalar(scale)
      if (progress < 0.5) state.anchor.rotation.y += 0.003

      if (elapsed >= PHASE1_MS + PHASE2_MS) {
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
