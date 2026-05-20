import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PMREMGenerator } from 'three'
import { SoundEngine } from './SoundEngine.js'

// ── RENDERER ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
document.body.appendChild(renderer.domElement)

// ── ENVIRONMENT (PBR materials need this to be visible) ────────
const pmrem = new PMREMGenerator(renderer)
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

// ── SCENE ──────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111118)
scene.environment = envTexture   // makes metallic/glossy PBR materials visible

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
scene.add(new THREE.AmbientLight(0xffffff, 0.8))

const key = new THREE.DirectionalLight(0xfff4e0, 3)
key.position.set(3, 5, 3)
key.castShadow = true
scene.add(key)

const fill = new THREE.PointLight(0x8b1fb5, 4, 12)
fill.position.set(-2, 1, -2)
scene.add(fill)

// ── SOUND ─────────────────────────────────────────────────────
const sound = new SoundEngine()

// ── LOAD MODEL ────────────────────────────────────────────────
const loader = new GLTFLoader()
let model = null
let isActive = false

const hint = document.getElementById('hint')
const status = document.getElementById('status')

loader.load(
  `${import.meta.env.BASE_URL}models/un-garden_1.glb`,
  (gltf) => {
    model = gltf.scene

    // Fit model to view regardless of original size
    const box = new THREE.Box3().setFromObject(model)
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    model.position.sub(centre)
    if (maxDim > 0) model.scale.setScalar(2 / maxDim)

    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })

    scene.add(model)
    status.style.display = 'none'
    hint.style.opacity = '1'
  },
  (xhr) => {
    if (xhr.total) status.textContent = `Loading ${Math.round(xhr.loaded / xhr.total * 100)}%`
  },
  (err) => {
    console.error('[uncanny-garden] model error:', err)
    status.textContent = 'Model failed to load'
  }
)

// ── TAP — toggle sound + glow ──────────────────────────────────
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function onTap(clientX, clientY) {
  if (!model) return
  pointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  )
  raycaster.setFromCamera(pointer, camera)
  if (raycaster.intersectObject(model, true).length === 0) return

  isActive = !isActive
  sound.init().then(() => isActive ? sound.play() : sound.stop())

  model.traverse((n) => {
    if (n.isMesh && n.material) {
      n.material = n.material.clone()
      n.material.emissive = new THREE.Color(isActive ? 0x4a0a7a : 0x000000)
      n.material.emissiveIntensity = isActive ? 0.5 : 0
    }
  })
}

renderer.domElement.addEventListener('click', (e) => onTap(e.clientX, e.clientY))
renderer.domElement.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0]
  onTap(t.clientX, t.clientY)
}, { passive: true })

// ── RENDER LOOP ───────────────────────────────────────────────
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const elapsed = clock.getElapsedTime()
  controls.update()

  if (model && !controls.isPointerDown) model.rotation.y = elapsed * 0.12

  fill.color.setHSL(0.75 + Math.sin(elapsed * 0.2) * 0.06, 0.7, 0.4)
  fill.intensity = isActive ? 4 + Math.sin(elapsed * 2) * 2 : 2 + Math.sin(elapsed * 0.4) * 0.5

  renderer.render(scene, camera)
})

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
