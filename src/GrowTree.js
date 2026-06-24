import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const SEED_SCALE = 0.004
const FULL_SCALE = 4.0
const SEED_HOLD  = 3000
const PHASE1_MS  = 15000
const PHASE2_MS  = 45000

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
    this._scene         = scene
    this._models        = {}
    this._activeElement = null
    this._anchor        = new THREE.Group()
    this._growing       = false
    this._growStart     = null
    this._lastProgress  = 0
    this._seedTimer     = null
    scene.add(this._anchor)
  }

  async load(paths) {
    await Promise.all(
      Object.entries(paths).map(([element, path]) => this._loadOne(element, path))
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

        model.visible         = false
        this._models[element] = model
        this._anchor.add(model)
        resolve()
      }, undefined, reject)
    })
  }

  place(worldPosition, element) {
    if (this._seedTimer) clearTimeout(this._seedTimer)

    for (const m of Object.values(this._models)) m.visible = false

    const model = this._models[element]
    if (!model) return

    this._activeElement = element
    model.visible       = true

    this._anchor.position.copy(worldPosition)
    this._anchor.rotation.set(0, 0, 0)
    this._anchor.visible = true
    this._anchor.scale.setScalar(SEED_SCALE)
    this._growing      = false
    this._growStart    = null
    this._lastProgress = 0

    this._seedTimer = setTimeout(() => {
      this._growing   = true
      this._growStart = performance.now()
    }, SEED_HOLD)
  }

  update() {
    if (!this._growing || !this._models[this._activeElement]) return this._lastProgress

    const elapsed  = performance.now() - this._growStart
    const progress = growthProgress(elapsed)
    this._lastProgress = progress

    const scale = SEED_SCALE + (FULL_SCALE - SEED_SCALE) * progress
    this._anchor.scale.setScalar(scale)

    if (progress < 0.5) {
      this._anchor.rotation.y += 0.003
    }

    if (elapsed >= PHASE1_MS + PHASE2_MS) {
      this._growing = false
      return 1
    }
    return progress
  }

  get anchor()        { return this._anchor }
  get placed()        { return this._activeElement !== null }
  get activeElement() { return this._activeElement }
}
