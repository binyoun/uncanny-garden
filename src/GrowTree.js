import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE    = 0.004
const FULL_SCALE    = 2.0
const SEED_HOLD     = 2000
const GROW_MS       = 8000   // seed → full bloom (single phase)
const APPROACH_MS   = 2500   // bloom → move toward viewer
const RECEDE_MS     = 2000   // move back and shrink away
const APPROACH_DIST = 0.4    // metres toward camera during approach

export const SEED_HOLD_MS = SEED_HOLD

function easeOutCubic(t)   { return 1 - Math.pow(1 - t, 3) }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

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

    this._state[element] = {
      anchor,
      origPosZ:     worldPosition.z,
      growing:      false,
      growStart:    null,
      lastProgress: 0,
      seedTimer:    null,
    }

    this._state[element].seedTimer = setTimeout(() => {
      this._state[element].growing   = true
      this._state[element].growStart = performance.now()
    }, SEED_HOLD)
  }

  update() {
    const result = {}

    for (const [element, state] of Object.entries(this._state)) {
      if (!state.growing) { result[element] = state.lastProgress; continue }

      const elapsed = performance.now() - state.growStart

      if (elapsed < GROW_MS) {
        // ── Bloom up ──────────────────────────────────────────────
        const t = elapsed / GROW_MS
        state.anchor.scale.setScalar(SEED_SCALE + (FULL_SCALE - SEED_SCALE) * easeOutCubic(t))
        if (t < 0.4) state.anchor.rotation.y += 0.008
        state.lastProgress = easeOutCubic(t) * 0.8

      } else if (elapsed < GROW_MS + APPROACH_MS) {
        // ── Approach: float toward viewer ─────────────────────────
        const t    = (elapsed - GROW_MS) / APPROACH_MS
        const ease = easeInOutCubic(t)
        state.anchor.scale.setScalar(FULL_SCALE)
        state.anchor.position.z = state.origPosZ + ease * APPROACH_DIST
        state.lastProgress = 0.8 + ease * 0.1

      } else if (elapsed < GROW_MS + APPROACH_MS + RECEDE_MS) {
        // ── Recede: move back and shrink ──────────────────────────
        const t    = (elapsed - GROW_MS - APPROACH_MS) / RECEDE_MS
        const ease = easeInOutCubic(t)
        state.anchor.position.z = state.origPosZ + (1 - ease) * APPROACH_DIST
        state.anchor.scale.setScalar(FULL_SCALE * (1 - ease))
        state.lastProgress = 0.9 + ease * 0.1

      } else {
        // ── Done ──────────────────────────────────────────────────
        state.anchor.scale.setScalar(0)
        state.anchor.position.z = state.origPosZ
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
