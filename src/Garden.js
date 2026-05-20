import * as THREE from 'three'
import { Flower } from './Flower.js'

// Five elements — Wu Xing cardinal arrangement
// bearing: compass degrees from center (0 = North, 90 = East, etc.)
// distance: metres from center anchor
export const ELEMENTS = [
  {
    id: 'earth',
    label: '土 Earth',
    desc: 'Center · Ground · Stability',
    bearing: null,
    distance: 0,
    color: 0xc4a35a,
    modelIndex: 1,
    scale: 0.25,
    phase: 0,
  },
  {
    id: 'water',
    label: '水 Water',
    desc: 'North · Flow · Depth',
    bearing: 0,
    distance: 0.9,
    color: 0x4a9eff,
    modelIndex: 1, // swap to 2 when un-garden_2.glb is ready
    scale: 0.22,
    phase: 1.2,
  },
  {
    id: 'fire',
    label: '火 Fire',
    desc: 'South · Energy · Transformation',
    bearing: 180,
    distance: 0.9,
    color: 0xff4a4a,
    modelIndex: 1, // swap to 3
    scale: 0.28,
    phase: 2.4,
  },
  {
    id: 'wood',
    label: '木 Wood',
    desc: 'East · Growth · Expansion',
    bearing: 90,
    distance: 0.9,
    color: 0x4aff7a,
    modelIndex: 1, // swap to 4
    scale: 0.24,
    phase: 3.6,
  },
  {
    id: 'metal',
    label: '金 Metal',
    desc: 'West · Structure · Clarity',
    bearing: 270,
    distance: 0.9,
    color: 0xffd700,
    modelIndex: 1, // swap to 5
    scale: 0.23,
    phase: 4.8,
  },
]

function bearingToXZ(bearing, distance) {
  const rad = (bearing - 90) * (Math.PI / 180)
  return {
    x: Math.cos(rad) * distance,
    z: Math.sin(rad) * distance,
  }
}

export class Garden {
  constructor(scene, soundEngine) {
    this.scene = scene
    this.soundEngine = soundEngine
    this.anchor = new THREE.Group()
    this.anchor.visible = false
    this.flowers = []
    scene.add(this.anchor)
  }

  async load() {
    const promises = ELEMENTS.map(async (el) => {
      const flower = new Flower({ ...el, baseY: 0 }, this.soundEngine)
      try {
        await flower.load()
      } catch {
        // Model not found — placeholder sphere
        const geo = new THREE.SphereGeometry(0.08, 16, 16)
        const mat = new THREE.MeshStandardMaterial({ color: el.color, emissive: el.color, emissiveIntensity: 0.3 })
        const mesh = new THREE.Mesh(geo, mat)
        flower.group.add(mesh)
        const hitGeo = new THREE.SphereGeometry(0.18, 8, 8)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false })
        flower.hitbox = new THREE.Mesh(hitGeo, hitMat)
        flower.hitbox.userData.flower = flower
        flower.group.add(flower.hitbox)
      }

      if (el.bearing !== null) {
        const { x, z } = bearingToXZ(el.bearing, el.distance)
        flower.group.position.set(x, 0, z)
      }

      this.anchor.add(flower.group)
      this.flowers.push(flower)
    })

    await Promise.all(promises)
  }

  place(position) {
    this.anchor.position.copy(position)
    this.anchor.visible = true
  }

  isPlaced() {
    return this.anchor.visible
  }

  getHitboxes() {
    return this.flowers.map((f) => f.hitbox).filter(Boolean)
  }

  update(elapsed) {
    for (const flower of this.flowers) flower.update(elapsed)
  }
}
