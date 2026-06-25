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

const raycaster = new THREE.Raycaster()

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

let introModel     = null
let introBaseY     = 0   // world-space Y center for oscillation (set when model loads)
let introBaseScale = 1   // scale at load time, used as pulse base
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
    introBaseScale = max > 0 ? 2.4 / max : 1
    model.scale.setScalar(introBaseScale)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(
      -(center.x / max) * 2.4,
      -(center.y / max) * 2.4,
      -(center.z / max) * 2.4
    )
    model.position.y -= 0.5    // sit in lower-center of frame
    introBaseY = model.position.y
    introScene.add(model)
    introModel = model
  },
  undefined,
  (err) => console.warn('Intro model failed:', err)
)

// ── Element definitions ───────────────────────────────────────
const SEQUENCE = ['wood', 'fire', 'earth', 'metal', 'water']

const ELEMENT_INFO = {
  wood:  { label: 'Wood',  gesture: 'open palm',   color: '#00cc44' },
  fire:  { label: 'Fire',  gesture: 'point up',    color: '#ff2200' },
  earth: { label: 'Soil',  gesture: 'closed fist', color: '#ffcc00' },
  metal: { label: 'Metal', gesture: 'peace sign',  color: '#cccccc' },
  water: { label: 'Water', gesture: 'ok ring',     color: '#0066ff' },
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
orbitGroup.position.set(0, -0.1, -1.0)
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

let _gestureTyper = null

function typeGesture(text) {
  if (_gestureTyper) { clearInterval(_gestureTyper); _gestureTyper = null }
  promptGesture.classList.remove('gesture-waiting')
  promptGesture.textContent = ''
  const cursor = document.createElement('span')
  cursor.className = 'typing-cursor'
  promptGesture.appendChild(cursor)
  let i = 0
  _gestureTyper = setInterval(() => {
    if (i >= text.length) {
      clearInterval(_gestureTyper); _gestureTyper = null
      cursor.remove()
      promptGesture.classList.add('gesture-waiting')
      return
    }
    cursor.insertAdjacentText('beforebegin', text[i++])
  }, 55)
}

function showPrompt(element) {
  const info = ELEMENT_INFO[element]
  promptElement.textContent = info.label
  promptElement.style.color = info.color
  typeGesture(info.gesture)
  elementPrompt.classList.remove('hidden')
}

function hidePrompt() {
  promptGesture.classList.remove('gesture-waiting')
  elementPrompt.classList.add('hidden')
}

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
const dormantEls   = new Set()   // tracks elements currently in dormant phase
let activeAnchor   = null         // the most-recently-placed model's anchor (for drag)
let activeElement  = null         // which element activeAnchor belongs to

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
const ORBIT_SCALE  = 0.65
const ORBIT_RADIUS = 1.0

function activateFinalState() {
  allComplete = true
  hidePrompt()
  hidePalmRing()
  tracker.stop()
  tree.hideAllOrbs()

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
  activeAnchor  = tree.getAnchor(element)
  activeElement = element
  particles[element].start(element, worldPos)
  ensureSound().then(() => sound.triggerPlacement())
  // Next prompt shows only after this model fully grows and disappears
})

// ── Auto-start logic ──────────────────────────────────────────
let trackerReady   = false
let loadedCount    = 0
let arEntered      = false
const MIN_MODELS   = 3
const LANDING_MIN_MS = 10000
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

// Block iOS Safari's native pinch-zoom — touch-action:none in CSS is often
// ignored on canvas; an explicit non-passive preventDefault is the only
// reliable cross-browser solution.
window.addEventListener('touchmove', (e) => {
  if (e.touches.length >= 2) e.preventDefault()
}, { passive: false })

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

// ── AR touch: 1-finger drag, 2-finger pinch (Z depth), tap on dormant orbs ──
let arDragPrevX  = 0, arDragPrevY  = 0
let arMouseDown  = false
let pinchLastDist = 0   // 0 = no active pinch
let tapStartX    = 0, tapStartY = 0, tapStartTime = 0

function getPinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX
  const dy = e.touches[0].clientY - e.touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

canvas.addEventListener('touchstart', (e) => {
  if (introActive || allComplete) return
  if (e.touches.length >= 2) {
    pinchLastDist = getPinchDist(e)
  } else {
    pinchLastDist = 0
    arDragPrevX  = e.touches[0].clientX
    arDragPrevY  = e.touches[0].clientY
    tapStartX    = e.touches[0].clientX
    tapStartY    = e.touches[0].clientY
    tapStartTime = Date.now()
  }
}, { passive: true })

canvas.addEventListener('touchmove', (e) => {
  if (introActive || allComplete || !activeAnchor) return
  if (e.touches.length >= 2) {
    const px = getPinchDist(e)
    if (pinchLastDist > 0 && activeAnchor) {
      const delta   = px - pinchLastDist          // positive = spreading
      const current = activeAnchor.position.length()
      if (current > 0) {
        // spread fingers → model closer (distance shrinks)
        // pinch fingers  → model further (distance grows)
        const next = THREE.MathUtils.clamp(current - delta * 0.006, 0.25, 3.5)
        activeAnchor.position.setLength(next)
      }
    }
    pinchLastDist = px
  } else if (e.touches.length === 1 && pinchLastDist === 0) {
    const dx = e.touches[0].clientX - arDragPrevX
    const dy = e.touches[0].clientY - arDragPrevY
    activeAnchor.rotation.y += dx * 0.012
    activeAnchor.position.y -= dy * 0.004
    arDragPrevX = e.touches[0].clientX
    arDragPrevY = e.touches[0].clientY
  }
}, { passive: true })

canvas.addEventListener('touchend', (e) => {
  if (introActive || allComplete) return
  if (e.touches.length < 2) pinchLastDist = 0

  // tap: small movement + short duration, only from single-finger lift
  const wasPinching = e.touches.length >= 1
  if (!wasPinching && e.changedTouches.length === 1) {
    const dx = e.changedTouches[0].clientX - tapStartX
    const dy = e.changedTouches[0].clientY - tapStartY
    if (Math.sqrt(dx * dx + dy * dy) < 18 && Date.now() - tapStartTime < 350) {
      const ndc = new THREE.Vector2(
        (e.changedTouches[0].clientX / window.innerWidth) * 2 - 1,
        -(e.changedTouches[0].clientY / window.innerHeight) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(tree.getDormantOrbs())
      if (hits.length > 0) {
        const el = hits[0].object.userData.element
        dormantEls.delete(el)
        tree.reactivate(el)
        activeAnchor  = tree.getAnchor(el)
        activeElement = el
        particles[el].start(el, activeAnchor.position.clone())
      }
    }
  }
}, { passive: true })

canvas.addEventListener('mousedown', (e) => {
  if (introActive || allComplete) return
  arMouseDown = true; arDragPrevX = e.clientX; arDragPrevY = e.clientY
})
canvas.addEventListener('mouseup',   () => { arMouseDown = false })
canvas.addEventListener('mousemove', (e) => {
  if (introActive || allComplete || !activeAnchor || !arMouseDown) return
  activeAnchor.rotation.y += (e.clientX - arDragPrevX) * 0.012
  activeAnchor.position.y -= (e.clientY - arDragPrevY) * 0.004
  arDragPrevX = e.clientX; arDragPrevY = e.clientY
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
      loadingLabel.textContent = `loading ${loadedCount} / 5`
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
      if (!introDragging) introRotY += 0.005
      introModel.rotation.y = introRotY
      introModel.rotation.x = Math.sin(t * 0.18) * 0.2
      introModel.rotation.z = Math.sin(t * 0.13 + 0.8) * 0.09
      introModel.position.y = introBaseY + Math.sin(t * 0.28) * 0.22
      // two-frequency pulse: fast throb + slow swell
      const pulse = 1 + Math.sin(t * 1.2) * 0.07 + Math.sin(t * 0.35) * 0.04
      introModel.scale.setScalar(introBaseScale * pulse)
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

    for (const [el, { progress, phase }] of Object.entries(progressMap)) {
      if (phase === 'dormant') {
        // first frame entering dormant: stop particles, advance sequence
        if (!dormantEls.has(el)) {
          dormantEls.add(el)
          particles[el].stop()
          if (!completedEls.has(el)) {
            completedEls.add(el)
            onElementComplete(el)
          }
        }
      } else {
        // seed / grow / recede — keep particles alive
        dormantEls.delete(el)
        particles[el].update(progress, delta)
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
