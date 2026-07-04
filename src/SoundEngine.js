// Per-element sound: each of the five elements has two clips —
// a short "seed" accent (fires the instant the gesture is confirmed)
// and a full "grow" track (starts at the same moment, runs the length
// of the whole seed→grow→recede cycle).
//
// Plus one ambient track ("tandem") for the final orbit stage, once all
// five elements are grown — loops for as long as that stage is on screen.
//
// Usage:
//   await sound.init()
//   await sound.loadElement('wood', { seed: '/audio/wood-seed.mp3', grow: '/audio/wood.mp3' })
//   sound.trigger('wood')          // call once per placement / reactivation
//   await sound.loadAmbient('/audio/tandem.mp3')
//   sound.triggerAmbient()         // call once, on entering the final orbit stage

export class SoundEngine {
  constructor() {
    this._ctx = null
    this._masterGain = null
    this._buffers = {}      // { [element]: { seed: AudioBuffer, grow: AudioBuffer } }
    this._activeNodes = {}  // { [element]: { seed: AudioBufferSourceNode, grow: AudioBufferSourceNode } }
    this._ambientBuffer = null
    this._ambientNode = null
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

  // Call on gesture-confirmed (initial placement) and on dormant-orb reactivation.
  // Plays the seed accent and the full growth track together.
  trigger(element) {
    if (!this._ready) return
    const buf = this._buffers[element]
    if (!buf) return
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
