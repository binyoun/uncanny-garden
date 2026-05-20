import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { PMREMGenerator } from 'three'
import { SoundEngine } from './SoundEngine.js'

// ── RENDERER — transparent so camera video shows behind it ─────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
renderer.setClearColor(0x000000, 0)
document.body.appendChild(renderer.domElement)

// ── ENVIRONMENT (PBR materials need this) ─────────────────────
const pmrem = new PMREMGenerator(renderer)
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

// ── SCENE ─────────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.environment = envTexture

// ── THREE CAMERA ──────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100)
camera.position.set(0, 0, 3)

// ── ORBIT CONTROLS ────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.update()

// ── LIGHTING ──────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 2))
const key = new THREE.DirectionalLight(0xffffff, 2)
key.position.set(2, 4, 3)
scene.add(key)
const fill = new THREE.DirectionalLight(0xffffff, 1)
fill.position.set(-2, 1, -1)
scene.add(fill)

// ── SOUND ─────────────────────────────────────────────────────
const sound = new SoundEngine()

// ── MODEL ─────────────────────────────────────────────────────
let model = null
let isActive = false

function setStatus(msg) {
  const el = document.getElementById('status')
  el.textContent = msg
  el.style.display = msg ? 'block' : 'none'
}

const draco = new DRACOLoader()
draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
loader.load(
  `${import.meta.env.BASE_URL}models/base_basic_shaded.glb`,
  (gltf) => {
    model = gltf.scene

    // Add to scene first so Three.js computes correct world bounds
    scene.add(model)

    const box = new THREE.Box3().setFromObject(model)
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    model.position.set(-centre.x, -centre.y, -centre.z)
    if (maxDim > 0) model.scale.setScalar(2 / maxDim)

    model.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } })

    setStatus('')
    document.getElementById('hint').style.opacity = '1'
  },
  (xhr) => {
    if (xhr.total) setStatus(`Loading ${Math.round(xhr.loaded / xhr.total * 100)}%`)
  },
  (err) => {
    console.error('[uncanny-garden] GLB failed:', err)
    setStatus('Model failed — check console')
  }
)

// ── CAMERA VIDEO BACKGROUND ───────────────────────────────────
const video = document.createElement('video')
video.setAttribute('playsinline', '')
video.setAttribute('autoplay', '')
video.setAttribute('muted', '')
video.style.cssText = `
  position: fixed; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; z-index: -1;
`
document.body.insertBefore(video, document.body.firstChild)

// ── START ON USER GESTURE (required for camera + audio) ───────
document.getElementById('start').addEventListener('click', async () => {
  document.getElementById('start').style.display = 'none'
  document.getElementById('status').style.display = 'block'

  // Camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    })
    video.srcObject = stream
    await video.play()
  } catch (err) {
    console.warn('[uncanny-garden] camera denied:', err)
    renderer.setClearColor(0x111118, 1)
  }

  // Prime audio context
  await sound.init()
}, { once: true })

// ── TAP — toggle glow + sound ─────────────────────────────────
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
  isActive ? sound.play() : sound.stop()
}

renderer.domElement.addEventListener('click', (e) => onTap(e.clientX, e.clientY))
renderer.domElement.addEventListener('touchend', (e) => {
  onTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
}, { passive: true })

// ── RENDER LOOP ───────────────────────────────────────────────
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime()
  controls.update()
  if (model) model.rotation.y = t * 0.12
  renderer.render(scene, camera)
})

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
