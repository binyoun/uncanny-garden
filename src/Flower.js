import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

export class Flower {
  constructor(config, soundEngine) {
    this.config = config
    this.soundEngine = soundEngine
    this.group = new THREE.Group()
    this.hitbox = null
    this.isActive = false
    this._scaleTween = null
  }

  async load() {
    // Each element will have its own GLB — falling back to _1 until all are ready
    const modelPath = `/models/un-garden_${this.config.modelIndex}.glb`

    return new Promise((resolve, reject) => {
      loader.load(
        modelPath,
        (gltf) => {
          const model = gltf.scene
          model.scale.setScalar(this.config.scale ?? 0.25)

          // Tint the model toward the element colour
          model.traverse((node) => {
            if (node.isMesh) {
              node.material = node.material.clone()
              node.material.emissive = new THREE.Color(this.config.color)
              node.material.emissiveIntensity = 0
              node.castShadow = true
              node.userData.originalMaterial = node.material
            }
          })

          this.model = model
          this.group.add(model)

          // Invisible hit sphere for raycasting
          const hitGeo = new THREE.SphereGeometry(0.18, 8, 8)
          const hitMat = new THREE.MeshBasicMaterial({ visible: false })
          this.hitbox = new THREE.Mesh(hitGeo, hitMat)
          this.hitbox.userData.flower = this
          this.group.add(this.hitbox)

          resolve()
        },
        undefined,
        reject
      )
    })
  }

  trigger() {
    if (this.isActive) {
      this.deactivate()
    } else {
      this.activate()
    }
  }

  activate() {
    this.isActive = true
    this.soundEngine.play(this.config.id)
    this._setGlow(1.2)
    this._pulseScale(1.0, 1.18, 400)

    // Show element label
    const label = document.getElementById('element-label')
    document.getElementById('element-name').textContent = this.config.label
    document.getElementById('element-desc').textContent = this.config.desc
    label.classList.add('visible')
  }

  deactivate() {
    this.isActive = false
    this.soundEngine.stop(this.config.id)
    this._setGlow(0)
    this._pulseScale(this.group.scale.x, 1.0, 300)
  }

  _setGlow(intensity) {
    if (!this.model) return
    this.model.traverse((node) => {
      if (node.isMesh && node.material.emissive) {
        node.material.emissiveIntensity = intensity
      }
    })
  }

  _pulseScale(from, to, duration) {
    const start = performance.now()
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      const s = from + (to - from) * ease
      this.group.scale.setScalar(s)
      if (t < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  // Called every frame — gentle idle float
  update(elapsed) {
    if (!this.group) return
    this.group.position.y = this.config.baseY + Math.sin(elapsed * 0.8 + this.config.phase) * 0.015
    this.group.rotation.y = elapsed * 0.12 + this.config.phase
  }
}
