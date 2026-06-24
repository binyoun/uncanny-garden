import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { HandTracker } from './HandTracker.js'
import { GrowTree } from './GrowTree.js'
import { ParticleSystem } from './ParticleSystem.js'
import { SoundEngine } from './SoundEngine.js'

const BASE = import.meta.env.BASE_URL

// ── Renderer ──────────────────────────────────────────────────
const canvas = document.getElementById('canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.setClearColor(0x000000, 0)

// ── Shared environment ────────────────────────────────────────
const pmrem      = new THREE.PMREMGenerator(renderer)
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

// ── AR scene ──────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.environment = envTexture
scene.add(new THREE.AmbientLight(0xffffff, 1.5))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 6, 4)
scene.add(sun)

// ── AR camera ─────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 200)
camera.position.set(0, 0, 0)

// ── Intro scene ───────────────────────────────────────────────
const introScene  = new THREE.Scene()
introScene.environment = envTexture
const introCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
introCamera.position.set(0, 0.1, 3.5)

introScene.add(new THREE.AmbientLight(0xffffff, 0.7))
const introKey = new THREE.DirectionalLight(0xeeddff, 1.6)
introKey.position.set(2, 3, 2)
introScene.add(introKey)
const introFill = new THREE.DirectionalLight(0xddeeff, 0.5)
introFill.position.set(-2, 0, 1)
introScene.add(introFill)

let introModel    = null
let introActive   = true
let introRotY     = 0   // accumulated y rotation — driven by auto or drag
let introDragging = false
let introDragPrevX = 0
const introClock  = new THREE.Clock()

const introLoader = new GLTFLoader()
introLoader.setMeshoptDecoder(MeshoptDecoder)
introLoader.load(
  `${BASE}models/hair_1.glb`,
  (gltf) => {
    const model = gltf.scene
    const box   = new THREE.Box3().setFromObject(model)
    const size  = box.getSize(new THREE.Vector3())
    const max   = Math.max(size.x, size.y, size.z)
    if (max > 0) model.scale.setScalar(2.4 / max)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(
      -(center.x / max) * 2.4,
      -(center.y / max) * 2.4,
      -(center.z / max) * 2.4
    )
    introScene.add(model)
    introModel = model
  },
  undefined,
  (err) => console.warn('Intro model failed:', err)
)

// ── Element definitions ───────────────────────────────────────
const SEQUENCE = ['wood', 'fire', 'earth', 'metal', 'water']

const ELEMENT_INFO = {
  wood:  { label: 'Wood 목',  gesture: 'open palm',   color: '#00cc44' },
  fire:  { label: 'Fire 화',  gesture: 'point up',    color: '#ff2200' },
  earth: { label: 'Earth 토', gesture: 'closed fist', color: '#ffcc00' },
  metal: { label: 'Metal 금', gesture: 'peace sign',  color: '#cccccc' },
  water: { label: 'Water 수', gesture: 'ok ring',     color: '#0066ff' },
}

// Wu Xing cardinal horizontal spread — all placed at ground level
const CARDINAL_NDC_X = {
  wood:   0.38,   // East
  fire:   0.19,   // South-East (offset right slightly for spread)
  earth:  0.0,    // Center
  metal: -0.38,   // West
  water: -0.19,   // North-West (offset left slightly for spread)
}

// Place each model close to viewer at floor level so it grows upward through frame
function cardinalWorldPos(element) {
  const nx = CARDINAL_NDC_X[element]
  const ndc = new THREE.Vector3(nx, 0, 0.5)
  ndc.unproject(camera)
  const dir = ndc.sub(camera.position).normalize()
  const pos = camera.position.clone().add(dir.multiplyScalar(0.9))
  pos.y -= 0.5   // push anchor to floor so model grows upward from below frame
  return pos
}

// ── AR modules ────────────────────────────────────────────────
const tracker = new HandTracker()
const tree    = new GrowTree(scene)
const sound   = new SoundEngine()

const particles = {}
for (const el of SEQUENCE) particles[el] = new ParticleSystem(scene)

// ── Orbit group (final state) ─────────────────────────────────
const orbitGroup = new THREE.Group()
orbitGroup.position.set(0, -0.1, -1.5)
orbitGroup.visible = false
scene.add(orbitGroup)

// ── Camera feed ───────────────────────────────────────────────
const video = document.getElementById('camera-feed')

// ── Landing ───────────────────────────────────────────────────
const landing      = document.getElementById('landing')
const loadingLabel = document.getElementById('loading-label')

// ── HUD ───────────────────────────────────────────────────────
const hud           = document.getElementById('hud')
const elementPrompt = document.getElementById('element-prompt')
const promptElement = document.getElementById('prompt-element')
const promptGesture = document.getElementById('prompt-gesture')
const palmRing      = document.getElementById('palm-ring')
const progressArc   = palmRing.querySelector('circle.progress')
const CIRCUMFERENCE = 2 * Math.PI * 35

const ELEMENT_RING_COLORS = {
  wood:  '#00cc44',
  fire:  '#ff2200',
  earth: '#ffcc00',
  metal: '#ffffff',
  water: '#0066ff',
}

function showPrompt(element) {
  const info = ELEMENT_INFO[element]
  promptElement.textContent = info.label
  promptElement.style.color = info.color
  promptGesture.textContent = info.gesture
  elementPrompt.classList.remove('hidden')
}

function hidePrompt() { elementPrompt.classList.add('hidden') }

function updatePalmRing(palm, progress, element) {
  const x = (1 - palm.x) * window.innerWidth
  const y = palm.y * window.innerHeight
  palmRing.style.left    = `${x}px`
  palmRing.style.top     = `${y}px`
  palmRing.style.display = 'block'
  const offset = CIRCUMFERENCE * (1 - progress)
  progressArc.style.strokeDashoffset = offset
  progressArc.style.stroke = element ? ELEMENT_RING_COLORS[element] : '#fff'
}

function hidePalmRing() { palmRing.style.display = 'none' }

// ── Sequence state ────────────────────────────────────────────
let seqIndex       = 0
let seqActive      = false
let allComplete    = false
const completedEls = new Set()

function currentElement() { return SEQUENCE[seqIndex] }

// Called when a model finishes growing and disappears
function onElementComplete(el) {
  const nextIdx = SEQUENCE.indexOf(el) + 1
  if (nextIdx < SEQUENCE.length) {
    seqIndex = nextIdx
    showPrompt(currentElement())
    tracker.start()
  } else {
    // All 5 grown — brief pause, then orbit
    setTimeout(activateFinalState, 1200)
  }
}

// ── Final orbit state ─────────────────────────────────────────
const ORBIT_SCALE  = 0.42
const ORBIT_RADIUS = 0.65

function activateFinalState() {
  allComplete = true
  hidePrompt()
  hidePalmRing()
  tracker.stop()

  SEQUENCE.forEach((el, i) => {
    const angle  = (i / SEQUENCE.length) * Math.PI * 2
    const anchor = tree.getAnchor(el)
    scene.remove(anchor)
    orbitGroup.add(anchor)
    anchor.position.set(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS)
    anchor.rotation.set(0, 0, 0)
    anchor.scale.setScalar(ORBIT_SCALE)
    anchor.visible = true

    const worldPos = new THREE.Vector3()
    anchor.getWorldPosition(worldPos)
    particles[el].start(el, worldPos)
  })

  orbitGroup.visible = true
  sound.triggerFullGrown()
  startOrbitDrag()
}

// ── Drag to rotate orbit ──────────────────────────────────────
function startOrbitDrag() {
  let prevX = 0

  renderer.domElement.addEventListener('touchstart', (e) => {
    prevX = e.touches[0].clientX
  }, { passive: true })

  renderer.domElement.addEventListener('touchmove', (e) => {
    orbitGroup.rotation.y += (e.touches[0].clientX - prevX) * 0.007
    prevX = e.touches[0].clientX
  }, { passive: true })

  let mouseDown = false
  renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDown = true; prevX = e.clientX
  })
  renderer.domElement.addEventListener('mouseup',  () => { mouseDown = false })
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!mouseDown) return
    orbitGroup.rotation.y += (e.clientX - prevX) * 0.007
    prevX = e.clientX
  })
}

// ── Hand tracker events ───────────────────────────────────────
tracker.addEventListener('hand-lost', () => { hidePalmRing() })

tracker.addEventListener('hold-progress', (e) => {
  const { progress, palm, element } = e.detail
  if (element !== currentElement()) { hidePalmRing(); return }
  updatePalmRing(palm, progress, element)
})

tracker.addEventListener('gesture-confirmed', (e) => {
  const { element } = e.detail
  if (element !== currentElement()) return

  tracker.stop()
  hidePrompt()
  hidePalmRing()

  const worldPos = cardinalWorldPos(element)
  tree.place(element, worldPos)
  particles[element].start(element, worldPos)
  ensureSound().then(() => sound.triggerPlacement())
  // Next prompt shows only after this model fully grows and disappears
})

// ── Auto-start logic ──────────────────────────────────────────
let trackerReady   = false
let loadedCount    = 0
let arEntered      = false
const MIN_MODELS   = 3
const LANDING_MIN_MS = 4000
const pageLoadTime = Date.now()

function maybeEnterAR() {
  if (arEntered || !trackerReady || loadedCount < MIN_MODELS) return
  const elapsed = Date.now() - pageLoadTime
  if (elapsed < LANDING_MIN_MS) {
    setTimeout(maybeEnterAR, LANDING_MIN_MS - elapsed)
    return
  }
  arEntered = true

  introActive = false
  landing.classList.add('hidden')
  landing.addEventListener('transitionend', () => {
    landing.style.display = 'none'
  }, { once: true })

  hud.style.display = 'block'
  seqActive = true
  showPrompt(currentElement())
  tracker.start()
}

// Sound requires a user gesture on iOS — init lazily on first touch
let soundReady = false
async function ensureSound() {
  if (soundReady) return
  soundReady = true
  await sound.init()
}
window.addEventListener('touchstart', ensureSound, { once: true })
window.addEventListener('mousedown',  ensureSound, { once: true })

// ── Landing model drag ────────────────────────────────────────
canvas.addEventListener('touchstart', (e) => {
  if (!introActive) return
  introDragging  = true
  introDragPrevX = e.touches[0].clientX
}, { passive: true })

canvas.addEventListener('touchmove', (e) => {
  if (!introActive || !introDragging || !introModel) return
  introRotY     += (e.touches[0].clientX - introDragPrevX) * 0.012
  introDragPrevX = e.touches[0].clientX
}, { passive: true })

canvas.addEventListener('touchend', () => { introDragging = false })

let mouseDown = false
canvas.addEventListener('mousedown', (e) => {
  if (!introActive) return
  mouseDown = true; introDragPrevX = e.clientX
})
canvas.addEventListener('mouseup',   () => { mouseDown = false })
canvas.addEventListener('mousemove', (e) => {
  if (!introActive || !mouseDown || !introModel) return
  introRotY     += (e.clientX - introDragPrevX) * 0.012
  introDragPrevX = e.clientX
})

// ── Initialise everything on page load ────────────────────────
;(async () => {
  // Camera — video getUserMedia doesn't require a user gesture
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    })
    video.srcObject = stream
    video.play()
  } catch (err) {
    console.warn('Camera denied:', err)
  }

  // Tracker and models load in parallel; enter AR when both conditions met
  tracker.init().then(() => {
    trackerReady = true
    maybeEnterAR()
  })

  tree.load(
    {
      wood:  `${BASE}models/tree.glb`,
      fire:  `${BASE}models/fire.glb`,
      earth: `${BASE}models/earth.glb`,
      metal: `${BASE}models/metal.glb`,
      water: `${BASE}models/water.glb`,
    },
    () => {
      loadedCount++
      loadingLabel.textContent = `${loadedCount} / 5`
      maybeEnterAR()
    }
  )
})()

// ── Render loop ───────────────────────────────────────────────
const clock = new THREE.Clock()

renderer.setAnimationLoop(() => {
  if (introActive) {
    if (introModel) {
      const t = introClock.getElapsedTime()
      if (!introDragging) introRotY += 0.014   // auto-rotate (~50°/s at 60fps)
      introModel.rotation.y = introRotY
      introModel.rotation.x = Math.sin(t * 0.28) * 0.12
      introModel.position.y = Math.sin(t * 0.55) * 0.06
    }
    renderer.render(introScene, introCamera)
    return
  }

  if (!seqActive) return

  const delta = clock.getDelta()

  if (video.readyState >= 2) tracker.detect(video, performance.now())

  if (allComplete) {
    orbitGroup.rotation.y += 0.004

    for (const el of SEQUENCE) {
      const anchor = tree.getAnchor(el)
      const worldPos = new THREE.Vector3()
      anchor.getWorldPosition(worldPos)
      particles[el].setOrigin(worldPos)
      particles[el].update(0.5, delta)
    }

  } else {
    const progressMap = tree.update()

    for (const [el, progress] of Object.entries(progressMap)) {
      if (progress < 1) {
        particles[el].update(progress, delta)
      } else if (!completedEls.has(el)) {
        completedEls.add(el)
        particles[el].stop()
        tree.getAnchor(el).visible = false
        onElementComplete(el)
      }
    }
  }

  renderer.render(scene, camera)
})

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = introCamera.aspect = w / h
  camera.updateProjectionMatrix()
  introCamera.updateProjectionMatrix()
  renderer.setSize(w, h)
})
