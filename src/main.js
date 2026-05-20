import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SoundEngine } from './SoundEngine.js'

// ── RENDERER ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

// ── SCENE ──────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0a0a0f)

// ── CAMERA ────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100)
camera.position.set(0, 1.2, 3.5)

// ── CONTROLS ──────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.target.set(0, 0.5, 0)
controls.update()

// ── LIGHTING ──────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 1.2))

const sun = new THREE.DirectionalLight(0xfff4e0, 2.5)
sun.position.set(3, 5, 3)
sun.castShadow = true
scene.add(sun)

const fill = new THREE.PointLight(0x8b1fb5, 3, 12)
fill.position.set(-2, 1, -2)
scene.add(fill)

// ── SOUND ─────────────────────────────────────────────────────
const sound = new SoundEngine()

// ── LOAD MODEL ────────────────────────────────────────────────
const loader = new GLTFLoader()
let model = null
let isActive = false

loader.load(
  `${import.meta.env.BASE_URL}models/un-garden_1.glb`,
  (gltf) => {
    model = gltf.scene

    // Auto-centre and fit to view
    const box = new THREE.Box3().setFromObject(model)
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    model.position.sub(centre)
    model.scale.setScalar(2 / maxDim)

    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })

    scene.add(model)
    document.getElementById('hint').style.opacity = '1'
  },
  undefined,
  (err) => console.error('[uncanny-garden] model load error:', err)
)

// ── CLICK — toggle sound + glow ────────────────────────────────
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function onTap(clientX, clientY) {
  if (!model) return
  pointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  )
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObject(model, true)
  if (hits.length === 0) return

  isActive = !isActive
  if (isActive) {
    sound.play()
    model.traverse((n) => {
      if (n.isMesh) { n.material = n.material.clone(); n.material.emissive = new THREE.Color(0x8b1fb5); n.material.emissiveIntensity = 0.6 }
    })
  } else {
    sound.stop()
    model.traverse((n) => {
      if (n.isMesh) n.material.emissiveIntensity = 0
    })
  }
}

renderer.domElement.addEventListener('click', (e) => {
  sound.init().then(() => onTap(e.clientX, e.clientY))
})
renderer.domElement.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0]
  sound.init().then(() => onTap(t.clientX, t.clientY))
}, { passive: true })

// ── RENDER LOOP ───────────────────────────────────────────────
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime()
  controls.update()

  // Slow auto-rotate when idle
  if (model && !isActive) model.rotation.y = elapsed * 0.15

  // Fill light pulse
  fill.color.setHSL(0.75 + Math.sin(elapsed * 0.2) * 0.06, 0.7, 0.4)
  fill.intensity = isActive ? 3 + Math.sin(elapsed * 2) * 1.5 : 2 + Math.sin(elapsed * 0.4) * 0.5

  renderer.render(scene, camera)
})

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
