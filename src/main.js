import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js'
import { HandTracker } from './HandTracker.js'
import { GrowTree, SEED_HOLD_MS } from './GrowTree.js'
import { ParticleSystem } from './ParticleSystem.js'
import { SoundEngine } from './SoundEngine.js'
import { HandPhotoSystem } from './HandPhoto.js'

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

// ── Post-processing: glitch bursts for the AR scene only ──────
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const glitchPass = new GlitchPass()
glitchPass.enabled = false
composer.addPass(glitchPass)

let glitchBurstTimer = null
// wild=true → intense full-frame corruption; wild=false → occasional, lighter
function triggerGlitchBurst(durationMs = 350, wild = true) {
  glitchPass.goWild  = wild
  glitchPass.enabled = true
  clearTimeout(glitchBurstTimer)
  glitchBurstTimer = setTimeout(() => { glitchPass.enabled = false }, durationMs)
}

// Final-stage only: a hand appearing in frame glitches the orbiting models
// themselves (scale/rotation jitter, see render loop) plus a screen burst.
let handGlitchUntil = 0
function triggerHandGlitch() {
  triggerGlitchBurst(300, true)
  handGlitchUntil = performance.now() + 260
}

// Final-stage only: touching one model mutates just that one, harder than
// the ambient hand-wave jitter shared by all five. Each element's mutate
// reflects its Wu Xing character — same idea as GrowTree's per-element
// growth stutter: fire is quick and violent, earth is slow and heavy,
// metal is a short sharp spike, water swells smoothly instead of jittering.
// vertexWobbleAmp/imageGlitchAmp drive the same character on the model's own
// surface (see ModelGlitch.js, wired via GrowTree's getMaterialUniforms);
// flipChance is the odds this touch also mirror-flips the model.
const MUTATE_PROFILES = {
  wood:  { durationMs: 420, scaleAmp: 0.6, rotAmp: 0.8,  posAmp: 0.10, smooth: false, vertexWobbleAmp: 0.04, imageGlitchAmp: 0.55, flipChance: 0.10 },
  fire:  { durationMs: 260, scaleAmp: 0.9, rotAmp: 1.3,  posAmp: 0.16, smooth: false, vertexWobbleAmp: 0.09, imageGlitchAmp: 0.85, flipChance: 0.40 },
  earth: { durationMs: 700, scaleAmp: 0.4, rotAmp: 0.15, posAmp: 0.05, smooth: false, vertexWobbleAmp: 0.05, imageGlitchAmp: 0.60, flipChance: 0.10 },
  metal: { durationMs: 180, scaleAmp: 0.8, rotAmp: 0.05, posAmp: 0.14, smooth: false, vertexWobbleAmp: 0.01, imageGlitchAmp: 0.70, flipChance: 0.50 },
  water: { durationMs: 650, scaleAmp: 0.35, rotAmp: 0.5, posAmp: 0.08, smooth: true,  vertexWobbleAmp: 0.06, imageGlitchAmp: 0.45, flipChance: 0    },
}
const HAND_WAVE_SCALE = 0.55   // ambient all-five jitter is a lighter version of the same profile

const mutateUntil   = {}   // element -> timestamp
const mutateStart   = {}   // element -> timestamp, for the smooth (water) envelope
const mutateFlipped = {}   // element -> bool, this touch mirror-flipped the model

// A mutation that fully reverts isn't a mutation — each touch leaves the
// model permanently a little different: distorted along one random axis
// (not just uniformly bigger — that read as "zoomed in", not "changed"),
// and a small permanent floor of surface glitch that never fully clears,
// so the model looks visibly mutated even at rest, not just mid-flash.
const DEFORM_STEP   = 0.35   // per-touch stretch amount on the chosen axis
const DEFORM_SQUASH  = 0.22  // per-touch squash amount on a different axis
const DEFORM_MAX      = 2.4  // cap on any single axis's stretch
const DEFORM_MIN      = 0.4  // floor on any single axis's squash
const mutationDeform = {}   // element -> { x, y, z } permanent per-axis scale multiplier

const RESIDUAL_GLITCH_STEP = 0.14   // permanent glitch floor gained per touch
const RESIDUAL_GLITCH_CAP  = 0.55   // cap so it never fully corrupts the surface
const mutationResidual = {}   // element -> permanent minimum uGlitch value

// Called every frame the hand stays in range of a model — refreshes the
// transient burst each time, but only accumulates the permanent traits and
// captures a photo once per distinct touch (not once per frame of contact).
function mutateModel(element, worldPos) {
  const now = performance.now()
  const profile = MUTATE_PROFILES[element] ?? MUTATE_PROFILES.wood
  const isNewTouch = !(mutateUntil[element] && now < mutateUntil[element])

  triggerGlitchBurst(Math.min(profile.durationMs, 300), false)
  mutateStart[element]   = now
  mutateUntil[element]   = now + profile.durationMs
  mutateFlipped[element] = Math.random() < profile.flipChance

  if (!isNewTouch) return

  const deform = mutationDeform[element] ?? { x: 1, y: 1, z: 1 }
  const axes = ['x', 'y', 'z']
  const stretchAxis = axes[Math.floor(Math.random() * 3)]
  const squashAxis  = axes[Math.floor(Math.random() * 3)]
  deform[stretchAxis] = Math.min(deform[stretchAxis] + DEFORM_STEP, DEFORM_MAX)
  deform[squashAxis]  = Math.max(deform[squashAxis] - DEFORM_SQUASH, DEFORM_MIN)
  mutationDeform[element] = deform

  mutationResidual[element] = Math.min((mutationResidual[element] ?? 0) + RESIDUAL_GLITCH_STEP, RESIDUAL_GLITCH_CAP)

  // capture the participant at the moment of mutation, same seed-photo
  // treatment as the original gesture-confirm, briefly held then dissolved.
  // Sized much bigger than the AR-sequence default (0.6) since the final
  // orbit stage's camera distance is far greater — same size there would
  // render as a barely-visible speck.
  if (worldPos) {
    handPhotos.spawn(element, video, worldPos, 1.6)
    setTimeout(() => handPhotos.collapse(element, 500), 350)
  }
}

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
const tracker    = new HandTracker()
const tree       = new GrowTree(scene)
const sound      = new SoundEngine()
const handPhotos = new HandPhotoSystem(scene)

sound.init().then(() => Promise.all([
  ...SEQUENCE.map((el) => sound.loadElement(el, {
    seed: `${BASE}audio/${el}-seed.mp3`,
    grow: `${BASE}audio/${el}.mp3`,
  })),
  sound.loadAmbient(`${BASE}audio/tandem.mp3`),
])).catch((err) => console.warn('Sound load failed:', err))

// iOS/Safari suspend AudioContext until a user gesture
window.addEventListener('touchstart', () => sound.resume(), { once: true })
window.addEventListener('mousedown',  () => sound.resume(), { once: true })

const particles = {}
for (const el of SEQUENCE) particles[el] = new ParticleSystem(scene)

// ── Orbit group (final state) ─────────────────────────────────
const orbitGroup = new THREE.Group()
orbitGroup.position.set(0, -0.3, 0)   // camera sits at center of the ring
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
const finalHint      = document.getElementById('final-hint')

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
const ORBIT_SCALE  = 1.44
const ORBIT_RADIUS = 2.3
const orbitBaseX   = {}   // element -> base circle X, so jitter can offset it instead of replacing it

function activateFinalState() {
  allComplete = true
  hidePrompt()
  hidePalmRing()
  tracker.start()   // keep detecting hands — any hand now glitches the orbiting models
  tree.hideAllOrbs()
  finalHint.classList.add('visible')

  SEQUENCE.forEach((el, i) => {
    const angle  = (i / SEQUENCE.length) * Math.PI * 2
    const anchor = tree.getAnchor(el)
    scene.remove(anchor)
    orbitGroup.add(anchor)
    orbitBaseX[el] = Math.cos(angle) * ORBIT_RADIUS
    anchor.position.set(orbitBaseX[el], 0, Math.sin(angle) * ORBIT_RADIUS)
    anchor.rotation.set(0, 0, 0)
    anchor.scale.setScalar(ORBIT_SCALE)
    anchor.visible = true

    const worldPos = new THREE.Vector3()
    anchor.getWorldPosition(worldPos)
    particles[el].start(el, worldPos)
  })

  orbitGroup.visible = true
  sound.triggerAmbient()
  startOrbitDrag()
}

// ── Drag / pinch for final orbit ─────────────────────────────
const ORBIT_DRAG_SENSITIVITY = 0.011   // rad per px, ring spin from 1-finger drag
const ORBIT_TILT_SENSITIVITY = 0.006   // rad per px, ring tilt from 1-finger drag
const ORBIT_TILT_LIMIT       = 0.65    // rad, max tilt either way (~37°)
const ORBIT_ZOOM_MIN         = 0.2     // pinch-zoom scale clamp
const ORBIT_ZOOM_MAX         = 7.2
const TOUCH_RADIUS_PX        = 130   // how close the tracked palm must be on-screen to "touch" a model

// Projects a world position to screen pixels, using the same convention as
// updatePalmRing() (palm.x flipped) so the two line up for touch detection.
function worldToScreenPx(worldPos) {
  const ndc = worldPos.clone().project(camera)
  return {
    x: (ndc.x + 1) / 2 * window.innerWidth,
    y: (1 - ndc.y) / 2 * window.innerHeight,
  }
}

function startOrbitDrag() {
  let prevX = 0, prevY = 0
  let oPinchLast = 0   // 0 = no active pinch

  renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length >= 2) {
      oPinchLast = getPinchDist(e)
    } else {
      oPinchLast = 0
      prevX = e.touches[0].clientX
      prevY = e.touches[0].clientY
    }
  }, { passive: true })

  renderer.domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2) {
      const px = getPinchDist(e)
      if (oPinchLast > 0) {
        // spread = ring expands (models further); pinch = ring contracts (closer)
        // flipped: spread = ring contracts (models closer), pinch = expands (further)
        const ratio = oPinchLast / px
        const next  = THREE.MathUtils.clamp(orbitGroup.scale.x * ratio, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX)
        orbitGroup.scale.setScalar(next)
      }
      oPinchLast = px
    } else {
      oPinchLast = 0
      const dx = e.touches[0].clientX - prevX
      const dy = e.touches[0].clientY - prevY
      orbitGroup.rotation.y += dx * ORBIT_DRAG_SENSITIVITY
      orbitGroup.rotation.x = THREE.MathUtils.clamp(
        orbitGroup.rotation.x + dy * ORBIT_TILT_SENSITIVITY, -ORBIT_TILT_LIMIT, ORBIT_TILT_LIMIT
      )
      prevX = e.touches[0].clientX
      prevY = e.touches[0].clientY
    }
  }, { passive: true })

  renderer.domElement.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) oPinchLast = 0
  }, { passive: true })

  let mouseDown = false
  renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDown = true; prevX = e.clientX; prevY = e.clientY
  })
  renderer.domElement.addEventListener('mouseup', () => { mouseDown = false })
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!mouseDown) return
    orbitGroup.rotation.y += (e.clientX - prevX) * ORBIT_DRAG_SENSITIVITY
    orbitGroup.rotation.x = THREE.MathUtils.clamp(
      orbitGroup.rotation.x + (e.clientY - prevY) * ORBIT_TILT_SENSITIVITY, -ORBIT_TILT_LIMIT, ORBIT_TILT_LIMIT
    )
    prevX = e.clientX; prevY = e.clientY
  })
}

// ── Hand tracker events ───────────────────────────────────────
let handPresent = false   // tracks rising edge for the final-stage hand glitch
let lastPalm    = null    // most recent palm position, for final-stage touch detection

tracker.addEventListener('hand-lost', () => {
  hidePalmRing()
  handPresent = false
  lastPalm    = null
})

tracker.addEventListener('hand-detected', (e) => {
  lastPalm = e.detail.palm
  if (!allComplete) return
  if (!handPresent) {
    handPresent = true
    triggerHandGlitch()
  }
})

tracker.addEventListener('hold-progress', (e) => {
  if (allComplete) return
  const { progress, palm, element } = e.detail
  if (element !== currentElement()) { hidePalmRing(); return }
  updatePalmRing(palm, progress, element)
})

tracker.addEventListener('gesture-confirmed', (e) => {
  if (allComplete) return
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
  sound.trigger(element)

  // Snapshot of the hand that just summoned this element — glitches apart
  // and dissolves right as the model starts growing (seed→grow handoff).
  handPhotos.spawn(element, video, worldPos)
  setTimeout(() => {
    handPhotos.collapse(element)
    triggerGlitchBurst(450, true)
  }, SEED_HOLD_MS)
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
        sound.trigger(el)
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

      // variable-speed slow rotation — like a vine turning toward light
      if (!introDragging) introRotY += 0.003 + Math.sin(t * 0.11) * 0.0015
      introModel.rotation.y = introRotY

      // layered slow tendrilling — two independent sinusoids per axis
      // so motion never repeats in a simple loop
      introModel.rotation.x = Math.sin(t * 0.10) * 0.18
                             + Math.sin(t * 0.27 + 1.4) * 0.07
      introModel.rotation.z = Math.sin(t * 0.08 + 0.6) * 0.13
                             + Math.sin(t * 0.21 + 2.2) * 0.05

      // slow upward reach with secondary sway — growing upward tendency
      introModel.position.y = introBaseY
                             + Math.sin(t * 0.16) * 0.18
                             + Math.sin(t * 0.06 + 1.0) * 0.09

      // slow breathing scale — gentle swell like a living plant
      const pulse = 1 + Math.sin(t * 0.38) * 0.055
                      + Math.sin(t * 0.14 + 0.5) * 0.03
      introModel.scale.setScalar(introBaseScale * pulse)
    }
    renderer.render(introScene, introCamera)
    return
  }

  if (!seqActive) return

  const delta = clock.getDelta()

  if (video.readyState >= 2) tracker.detect(video, performance.now())

  if (allComplete) {
    const t = clock.elapsedTime
    orbitGroup.rotation.y += 0.0045   // ring auto-rotation

    const nowMs      = performance.now()
    const handGlitch = nowMs < handGlitchUntil

    SEQUENCE.forEach((el, i) => {
      const anchor    = tree.getAnchor(el)
      const phase     = (i / SEQUENCE.length) * Math.PI * 2

      // bob and breathe — same organic feel as intro / grow animations
      anchor.position.y  = Math.sin(t * 0.42 + phase) * 0.12
      anchor.rotation.y += 0.005
      anchor.rotation.x  = Math.sin(t * 0.28 + phase * 0.7) * 0.14
      anchor.rotation.z  = Math.sin(t * 0.19 + phase * 1.2) * 0.07
      let pulse = 1 + Math.sin(t * 0.65 + phase) * 0.07 + Math.sin(t * 0.31 + phase) * 0.04

      // touching this one model mutates it harder than the ambient hand-wave jitter
      const mutateProfile = MUTATE_PROFILES[el] ?? MUTATE_PROFILES.wood
      const mutating = mutateUntil[el] && nowMs < mutateUntil[el]
      let uGlitch = 0
      let flipped = false

      if (mutating) {
        // water swells smoothly; the rest jitter at full strength for the whole window
        let envelope = 1
        if (mutateProfile.smooth) {
          const p = (nowMs - mutateStart[el]) / mutateProfile.durationMs
          envelope = Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI)
        }
        pulse            *= 1 + (Math.random() - 0.5) * mutateProfile.scaleAmp * envelope
        anchor.rotation.y += (Math.random() - 0.5) * mutateProfile.rotAmp * envelope
        anchor.position.x  = orbitBaseX[el] + (Math.random() - 0.5) * mutateProfile.posAmp * envelope
        uGlitch = envelope * mutateProfile.imageGlitchAmp
        flipped = mutateFlipped[el] ?? false
      } else if (handGlitch) {
        // a hand in frame corrupts all five, not just the screen — a lighter,
        // ambient version of each model's own mutate character (no mirror-flip;
        // that stays reserved for a deliberate touch)
        pulse            *= 1 + (Math.random() - 0.5) * mutateProfile.scaleAmp * HAND_WAVE_SCALE
        anchor.rotation.y += (Math.random() - 0.5) * mutateProfile.rotAmp * HAND_WAVE_SCALE
        anchor.position.x  = orbitBaseX[el] + (Math.random() - 0.5) * mutateProfile.posAmp * HAND_WAVE_SCALE
        uGlitch = mutateProfile.imageGlitchAmp * HAND_WAVE_SCALE
      } else {
        anchor.position.x = orbitBaseX[el]
      }

      const residualGlitch = mutationResidual[el] ?? 0
      for (const u of tree.getMaterialUniforms(el)) {
        u.uGlitch.value    = Math.max(uGlitch, residualGlitch)
        u.uWobbleAmp.value = mutateProfile.vertexWobbleAmp
        u.uTime.value      = t
      }

      const deform     = mutationDeform[el] ?? { x: 1, y: 1, z: 1 }
      const baseScale  = ORBIT_SCALE * pulse
      anchor.scale.set(
        (flipped ? -baseScale : baseScale) * deform.x,
        baseScale * deform.y,
        baseScale * deform.z,
      )

      const worldPos = new THREE.Vector3()
      anchor.getWorldPosition(worldPos)
      particles[el].setOrigin(worldPos)
      particles[el].update(0.5, delta)

      // real hand in the camera view overlapping this model on screen = touch
      if (lastPalm) {
        const palmPx  = { x: (1 - lastPalm.x) * window.innerWidth, y: lastPalm.y * window.innerHeight }
        const modelPx = worldToScreenPx(worldPos)
        const dx = palmPx.x - modelPx.x, dy = palmPx.y - modelPx.y
        if (Math.sqrt(dx * dx + dy * dy) < TOUCH_RADIUS_PX) mutateModel(el, worldPos)
      }
    })

  } else {
    const progressMap = tree.update()

    for (const [el, { progress, phase, glitch }] of Object.entries(progressMap)) {
      if (phase === 'dormant') {
        // first frame entering dormant: model + particles collapse into the orb
        if (!dormantEls.has(el)) {
          dormantEls.add(el)
          particles[el].stop()
          triggerGlitchBurst(500, true)
          if (!completedEls.has(el)) {
            completedEls.add(el)
            onElementComplete(el)
          }
        }
      } else {
        // seed / grow / recede — keep particles alive
        dormantEls.delete(el)
        particles[el].update(progress, delta)
        if (glitch) triggerGlitchBurst(120, false)
      }
    }
  }

  handPhotos.update()

  composer.render()
})

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = introCamera.aspect = w / h
  camera.updateProjectionMatrix()
  introCamera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
})
