// Per-element sound: each of the five elements has two clips —
// a short "seed" accent (fires the instant the gesture is confirmed)
// and a full "grow" track (starts at the same moment, runs the length
// of the whole seed→grow→recede cycle).
//
// Plus one ambient track ("tandem") for the final orbit stage, once all
// five elements are grown — loops for as long as that stage is on screen.
//
// Plus one one-shot "intro" cue that fires on "Tap to Begin", timed to the
// landing screen's typing animation (~6s) — does not loop. Until a dedicated
// intro clip is loaded via loadIntro(), triggerIntro() falls back to playing
// the tandem track once as a placeholder.
//
// Usage:
//   await sound.init()
//   await sound.loadElement('wood', { seed: '/audio/wood-seed.mp3', grow: '/audio/wood.mp3' })
//   sound.trigger('wood')          // call once per placement / reactivation
//   await sound.loadAmbient('/audio/tandem.mp3')
//   sound.triggerAmbient()         // call once, on entering the final orbit stage
//   sound.triggerIntro()           // call once, on "Tap to Begin"

export class SoundEngine {
  constructor() {
    this._ctx = null
    this._masterGain = null
    this._buffers = {}      // { [element]: { seed: AudioBuffer, grow: AudioBuffer } }
    this._activeNodes = {}  // { [element]: { seed: AudioBufferSourceNode, grow: AudioBufferSourceNode } }
    this._ambientBuffer = null
    this._ambientNode = null
    this._introBuffer = null
    this._introNode = null
    this._introPending = false
    this._ready = false
  }

  async init() {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)()
    this._masterGain = this._ctx.createGain()
    this._masterGain.gain.value = 0.8
    this._masterGain.connect(this._ctx.destination)
    this._ready = true
    return this
  }

  // iOS/Safari suspend the context until a user gesture — call on first touch.
  resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume()
  }

  async loadElement(element, { seed, grow }) {
    if (!this._ready) throw new Error('Call init() first')
    const [seedBuf, growBuf] = await Promise.all([
      this._decode(seed),
      this._decode(grow),
    ])
    this._buffers[element] = { seed: seedBuf, grow: growBuf }
  }

  async _decode(url) {
    const res = await fetch(url)
    return this._ctx.decodeAudioData(await res.arrayBuffer())
  }

  async loadAmbient(url) {
    if (!this._ready) throw new Error('Call init() first')
    this._ambientBuffer = await this._decode(url)
    this._tryPendingIntro()
  }

  // Call once on entering the final orbit stage — loops until stopAmbient().
  triggerAmbient() {
    if (!this._ready || !this._ambientBuffer || this._ambientNode) return
    const node = this._ctx.createBufferSource()
    node.buffer = this._ambientBuffer
    node.loop = true
    node.connect(this._masterGain)
    node.start()
    this._ambientNode = node
  }

  stopAmbient() {
    if (!this._ambientNode) return
    try { this._ambientNode.stop() } catch {}
    this._ambientNode = null
  }

  // Optional — only needed once a dedicated intro clip exists.
  async loadIntro(url) {
    if (!this._ready) throw new Error('Call init() first')
    this._introBuffer = await this._decode(url)
    this._tryPendingIntro()
  }

  // Call once on "Tap to Begin" — one-shot, does not loop. Uses the dedicated
  // intro clip if loaded, otherwise falls back to the tandem track. If
  // neither has finished loading yet (likely — this fires the instant the
  // visitor taps, while audio is still being fetched/decoded), it plays as
  // soon as one becomes available instead of silently doing nothing.
  triggerIntro() {
    if (!this._ready) return
    const buffer = this._introBuffer || this._ambientBuffer
    if (buffer) {
      this._introNode = this._play(buffer)
    } else {
      this._introPending = true
    }
  }

  _tryPendingIntro() {
    if (!this._introPending) return
    const buffer = this._introBuffer || this._ambientBuffer
    if (!buffer) return
    this._introPending = false
    this._introNode = this._play(buffer)
  }

  // Cuts the intro cue short if it's still playing (or cancels it if it
  // hasn't started yet) — called automatically by trigger() so it can never
  // overlap the first element's sound, even if that fires before intro
  // audio finished loading.
  stopIntro() {
    this._introPending = false
    if (!this._introNode) return
    try { this._introNode.stop() } catch {}
    this._introNode = null
  }

  // Call on gesture-confirmed (initial placement) and on dormant-orb reactivation.
  // Plays the seed accent and the full growth track together.
  trigger(element) {
    if (!this._ready) return
    const buf = this._buffers[element]
    if (!buf) return
    this.stopIntro()
    this._stopElement(element)
    this._activeNodes[element] = {
      seed: this._play(buf.seed),
      grow: this._play(buf.grow),
    }
  }

  _play(buffer) {
    const node = this._ctx.createBufferSource()
    node.buffer = buffer
    node.connect(this._masterGain)
    node.start()
    return node
  }

  _stopElement(element) {
    const nodes = this._activeNodes[element]
    if (!nodes) return
    Object.values(nodes).forEach((n) => { if (n) try { n.stop() } catch {} })
    delete this._activeNodes[element]
  }

  get context() { return this._ctx }
}
