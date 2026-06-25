import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE = 0.004
const FULL_SCALE = 2.0
const SEED_HOLD  = 2000
const GROW_MS    = 22000   // slow organic bloom
const RECEDE_MS  = 2500    // shrink and vanish

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

function makeOrb(element) {
  const geo  = new THREE.SphereGeometry(0.07, 16, 16)
  const mat  = new THREE.MeshBasicMaterial({ color: ELEMENT_COLORS[element] })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.element = element
  return mesh
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

    const orb = makeOrb(element)
    orb.position.copy(worldPosition)
    orb.visible = false
    this._scene.add(orb)

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

    for (const [element, state] of Object.entries(this._state)) {

      if (state.phase === 'seed') {
        result[element] = { progress: 0, phase: 'seed' }
        continue
      }

      if (state.phase === 'dormant') {
        // pulse the orb
        state.orb.scale.setScalar(1 + Math.sin(now * 0.002) * 0.28)
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
          state.phase      = 'recede'
          state.phaseStart = now
          state.lastProgress = 0.8
        }

      } else if (state.phase === 'recede') {
        if (elapsed < RECEDE_MS) {
          const ease = easeInOutCubic(elapsed / RECEDE_MS)
          state.anchor.scale.setScalar(FULL_SCALE * (1 - ease))
          state.anchor.rotation.y += 0.003
          state.lastProgress = 0.8 + ease * 0.2
        } else {
          // go dormant — orb appears where model was
          state.anchor.scale.setScalar(0)
          state.anchor.visible = false
          state.orb.position.copy(state.anchor.position)
          state.orb.visible    = true
          state.phase          = 'dormant'
          state.lastProgress   = 1
        }
      }

      result[element] = { progress: state.lastProgress, phase: state.phase }
    }

    return result
  }

  reactivate(element) {
    const state = this._state[element]
    if (!state || state.phase !== 'dormant') return
    state.orb.visible = false
    // grow from where the orb was sitting
    state.anchor.position.copy(state.orb.position)
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
      .filter(s => s.phase === 'dormant' && s.orb.visible)
      .map(s => s.orb)
  }

  hideAllOrbs() {
    for (const state of Object.values(this._state)) {
      if (state.orb) state.orb.visible = false
    }
  }

  getAnchor(element) { return this._state[element]?.anchor }
  isPlaced(element)  { return !!this._state[element] }
  get placedCount()  { return Object.keys(this._state).length }
}
