import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const PALM_INDICES        = [0, 5, 9, 13, 17]
const CONFIRM_DURATION    = 1500
const STABILITY_THRESHOLD = 0.04

function dist2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function isExtended(lm, tipIdx, mcpIdx) {
  return lm[tipIdx].y < lm[mcpIdx].y
}

function classifyGesture(lm) {
  const indexUp  = isExtended(lm, 8, 5)
  const middleUp = isExtended(lm, 12, 9)
  const ringUp   = isExtended(lm, 16, 13)
  const pinkyUp  = isExtended(lm, 20, 17)

  // Water: OK ring — thumb + index tips close, at least one other finger extended
  if (dist2D(lm[4], lm[8]) < 0.07 && (middleUp || ringUp || pinkyUp)) return 'water'

  // Earth: closed fist — no fingers extended
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) return 'earth'

  // Fire: only index extended
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return 'fire'

  // Metal: index + middle extended, ring + pinky curled
  if (indexUp && middleUp && !ringUp && !pinkyUp) return 'metal'

  // Wood: all four extended and spread wide
  if (indexUp && middleUp && ringUp && pinkyUp && dist2D(lm[8], lm[20]) > 0.2) return 'wood'

  return null
}

export class HandTracker extends EventTarget {
  constructor() {
    super()
    this._landmarker    = null
    this._running       = false
    this._holdStart     = null
    this._lastPalm      = null
    this._lastGesture   = null
    this._cooldownUntil = 0
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    )
    this._landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    })
  }

  detect(video, nowMs) {
    if (!this._landmarker || !this._running) return
    if (nowMs < this._cooldownUntil) return

    const result = this._landmarker.detectForVideo(video, nowMs)
    if (!result.landmarks || result.landmarks.length === 0) {
      this._holdStart   = null
      this._lastPalm    = null
      this._lastGesture = null
      this.dispatchEvent(new CustomEvent('hand-lost'))
      return
    }

    const lm      = result.landmarks[0]
    const palm    = this._palmCenter(lm)
    const gesture = classifyGesture(lm)

    this.dispatchEvent(new CustomEvent('hand-detected', { detail: { palm, element: gesture } }))

    // Reset hold timer if gesture changed
    if (gesture !== this._lastGesture) {
      this._holdStart   = null
      this._lastGesture = gesture
    }

    if (!gesture) {
      this._holdStart = null
      this._lastPalm  = null
      return
    }

    if (this._lastPalm && this._isStable(palm, this._lastPalm)) {
      if (!this._holdStart) this._holdStart = performance.now()
      const elapsed  = performance.now() - this._holdStart
      const progress = Math.min(elapsed / CONFIRM_DURATION, 1)
      this.dispatchEvent(new CustomEvent('hold-progress', { detail: { progress, palm, element: gesture } }))

      if (elapsed >= CONFIRM_DURATION) {
        this._holdStart     = null
        this._lastPalm      = null
        this._lastGesture   = null
        this._cooldownUntil = performance.now() + 500
        this.dispatchEvent(new CustomEvent('gesture-confirmed', { detail: { element: gesture, palm } }))
      }
    } else {
      this._holdStart = null
    }

    this._lastPalm = palm
  }

  start() { this._running = true }
  stop()  { this._running = false }

  _palmCenter(landmarks) {
    let x = 0, y = 0, z = 0
    for (const i of PALM_INDICES) {
      x += landmarks[i].x
      y += landmarks[i].y
      z += landmarks[i].z
    }
    const n = PALM_INDICES.length
    return { x: x / n, y: y / n, z: z / n }
  }

  _isStable(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy) < STABILITY_THRESHOLD
  }
}
