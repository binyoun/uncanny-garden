import * as THREE from 'three'
import { Garden } from './Garden.js'
import { ArSession } from './ArSession.js'
import { SoundEngine } from './SoundEngine.js'

// ── RENDERER ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.xr.enabled = true
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

// ── SCENE ──────────────────────────────────────────────────────
const scene = new THREE.Scene()

// ── CAMERA ────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40)
camera.position.set(0, 1.6, 0)

// ── LIGHTING ──────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.8)
scene.add(ambient)

const sun = new THREE.DirectionalLight(0xfff4e0, 2)
sun.position.set(2, 4, 2)
sun.castShadow = true
scene.add(sun)

// Subtle purple fill from below
const fill = new THREE.PointLight(0x8b1fb5, 1.5, 5)
fill.position.set(0, -0.5, 0)
scene.add(fill)

// ── SOUND ─────────────────────────────────────────────────────
const soundEngine = new SoundEngine()

// ── GARDEN ────────────────────────────────────────────────────
const garden = new Garden(scene, soundEngine)
garden.load().then(() => {
  console.log('[uncanny-garden] all elements loaded')
})

// ── AR SESSION ────────────────────────────────────────────────
const arSession = new ArSession(renderer, scene, camera, garden)

// ── BUTTON ────────────────────────────────────────────────────
document.getElementById('ar-button').addEventListener('click', async () => {
  try {
    await soundEngine.init()
    await arSession.start()
  } catch (err) {
    console.error('Startup error:', err)
    document.getElementById('ios-notice').textContent = `Error: ${err.message ?? err}`
    const btn = document.getElementById('ar-button')
    btn.textContent = 'Enter Garden'
    btn.disabled = false
  }
})

// ── CLOCK ─────────────────────────────────────────────────────
const clock = new THREE.Clock()

// ── RENDER LOOP ───────────────────────────────────────────────
renderer.setAnimationLoop((_, frame) => {
  const elapsed = clock.getElapsedTime()

  // Update fill light colour — slow pulse
  fill.color.setHSL(0.75 + Math.sin(elapsed * 0.2) * 0.08, 0.7, 0.4)
  fill.intensity = 1.2 + Math.sin(elapsed * 0.4) * 0.4

  garden.update(elapsed)
  arSession.update(frame)
  renderer.render(scene, camera)
})

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
