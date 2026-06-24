// Three sound layers for three collaborators.
// Each layer is independently controllable so each artist can own one.
//
// Layer A (lead):    drone / root tone — triggered on placement
// Layer B (texture): granular / field recording — fades in during growth
// Layer C (event):   one-shot accent sounds — triggered at full scale
//
// To add sound: assign an AudioBuffer to the matching slot in load().

export class SoundEngine {
  constructor() {
    this._ctx = null
    this._masterGain = null
    this._layers = { A: null, B: null, C: null }
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

  // Load an audio file into a layer slot.
  // layer: 'A' | 'B' | 'C'
  async loadLayer(layer, url) {
    if (!this._ready) throw new Error('Call init() first')
    const res = await fetch(url)
    const buf = await this._ctx.decodeAudioData(await res.arrayBuffer())
    this._layers[layer] = buf
  }

  // Play layer A (drone) — call on placement confirmed
  triggerPlacement() {
    this._playLayer('A', { loop: true, fadeIn: 1.5 })
  }

  // Fade in layer B as growth progresses (0–1)
  setGrowthProgress(t) {
    if (!this._ready || !this._layers.B) return
    if (!this._layerBNode) {
      this._layerBNode = this._startLoop('B')
      this._layerBGain = this._layerBNode._gain
      this._layerBGain.gain.value = 0
    }
    this._layerBGain.gain.setTargetAtTime(t, this._ctx.currentTime, 0.3)
  }

  // One-shot accent when fully grown — call on growth complete
  triggerFullGrown() {
    this._playLayer('C', { loop: false })
  }

  stopAll() {
    [this._layerANode, this._layerBNode, this._layerCNode].forEach((n) => {
      if (n) try { n.stop() } catch {}
    })
    this._layerBNode = null
    this._layerBGain = null
  }

  _playLayer(id, { loop = false, fadeIn = 0 } = {}) {
    if (!this._ready || !this._layers[id]) return
    const node = this._ctx.createBufferSource()
    node.buffer = this._layers[id]
    node.loop = loop

    const gain = this._ctx.createGain()
    gain.gain.value = fadeIn > 0 ? 0 : 1
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, this._ctx.currentTime + fadeIn)

    node._gain = gain
    node.connect(gain).connect(this._masterGain)
    node.start()

    this[`_layer${id}Node`] = node
    return node
  }

  _startLoop(id) {
    return this._playLayer(id, { loop: true })
  }

  get context() { return this._ctx }
}
