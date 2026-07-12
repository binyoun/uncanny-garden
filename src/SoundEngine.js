// Per-element sound: each of the five elements has two clips —
// a short "seed" accent (fires the instant the gesture is confirmed)
// and a full "grow" track (starts at the same moment, runs the length
// of the whole seed→grow→recede cycle).
//
// Plus one ambient track ("tandem") for the final orbit stage, once all
// five elements are grown — loops for as long as that stage is on screen.
//
// Plus one "intro" cue that fires on "Tap to Begin" and loops seamlessly until
// the first element is summoned. The clip can't just be handed to node.loop:
// MP3 decoding leaves ~23 ms of silence at its head, and its tail runs at full
// level to the last sample, so a raw loop drops a hole and then a tick into
// every wrap. loadIntro() bakes a loopable buffer instead — see
// _makeSeamlessLoop — after which a plain node.loop is genuinely gapless.
// Until a dedicated intro clip is loaded, triggerIntro() falls back to looping
// the tandem track as a placeholder.
//
// Usage:
//   await sound.init()
//   await sound.loadElement('wood', { seed: '/audio/wood-seed.mp3', grow: '/audio/wood.mp3' })
//   sound.trigger('wood')          // call once per placement / reactivation
//   await sound.loadAmbient('/audio/tandem.mp3')
//   sound.triggerAmbient()         // call once, on entering the final orbit stage
//   sound.triggerIntro()           // call once, on "Tap to Begin"

// Seconds the looping intro takes to fade out when it's cut short — the loop
// can be anywhere in the clip when the first gesture lands, so it needs a
// ramp rather than a hard stop.
const INTRO_FADE = 0.6

// Seconds of the clip's tail folded back over its own head to make the wrap
// continuous. Long enough to bridge the waveform discontinuity, short enough
// that the clip is never audibly playing against itself (which is what a
// long crossfade sounds like: phasing).
const INTRO_LOOP_XFADE = 0.03

// Amplitude below which a sample counts as decoder padding rather than signal
// (-60 dBFS).
const SILENCE_FLOOR = 0.001

export class SoundEngine {
  constructor() {
    this._ctx = null
    this._masterGain = null
    this._buffers = {}      // { [element]: { seed: AudioBuffer, grow: AudioBuffer } }
    this._activeNodes = {}  // { [element]: { seed: AudioBufferSourceNode, grow: AudioBufferSourceNode } }
    this._ambientBuffer = null
    this._ambientNode = null
    this._introBuffer = null  // baked by _makeSeamlessLoop, not the raw decode
    this._introNode = null
    this._introGain = null    // own gain so stopIntro can fade the loop out
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
    this._introBuffer = this._makeSeamlessLoop(await this._decode(url))
    this._tryPendingIntro()
  }

  // Turns a decoded clip into one that can be looped with node.loop and no
  // audible seam. Two problems to solve, in order:
  //
  //   1. MP3 decoding pads the clip with silence. Left in, that silence plays
  //      at every wrap as a hole in the sound. So: find the first and last
  //      samples that are actually signal, and keep only what's between them.
  //   2. The trimmed clip now ends mid-gesture at full level and restarts at
  //      full level, and the two waveforms don't meet — a step discontinuity,
  //      heard as a tick. So: drop the last INTRO_LOOP_XFADE of the clip and
  //      mix it, fading out, over the clip's own head, which fades in to meet
  //      it. The head now *is* the tail resolving into itself, so playback
  //      wrapping from the last sample to the first is continuous.
  //
  // The crossfade is baked into the buffer once at load, not performed live on
  // every wrap, so looping costs nothing at runtime.
  _makeSeamlessLoop(buffer) {
    const { numberOfChannels: channels, sampleRate, length } = buffer
    const src = []
    for (let c = 0; c < channels; c++) src.push(buffer.getChannelData(c))

    const isSignal = (i) => {
      for (let c = 0; c < channels; c++) if (Math.abs(src[c][i]) > SILENCE_FLOOR) return true
      return false
    }
    let head = 0
    while (head < length && !isSignal(head)) head++
    let tail = length
    while (tail > head && !isSignal(tail - 1)) tail--

    const body = tail - head
    const xfade = Math.min(Math.round(INTRO_LOOP_XFADE * sampleRate), Math.floor(body / 4))
    if (body <= 0 || xfade <= 0) return buffer   // clip too short to bake; loop it raw

    const loopLength = body - xfade
    const looped = this._ctx.createBuffer(channels, loopLength, sampleRate)
    for (let c = 0; c < channels; c++) {
      const from = src[c]
      const to = looped.getChannelData(c)
      to.set(from.subarray(head, head + loopLength))
      for (let i = 0; i < xfade; i++) {
        const x = i / xfade
        const rising  = Math.cos((1 - x) * 0.5 * Math.PI)   // equal-power, 0 → 1
        const falling = Math.cos(x * 0.5 * Math.PI)         // equal-power, 1 → 0
        to[i] = to[i] * rising + from[head + loopLength + i] * falling
      }
    }
    return looped
  }

  // Call once on "Tap to Begin" — loops until stopIntro(). Uses the dedicated
  // intro clip if loaded, otherwise falls back to the tandem track. If
  // neither has finished loading yet (likely — this fires the instant the
  // visitor taps, while audio is still being fetched/decoded), it starts as
  // soon as one becomes available instead of silently doing nothing.
  triggerIntro() {
    if (!this._ready) return
    const buffer = this._introBuffer || this._ambientBuffer
    if (buffer) {
      this._startIntro(buffer)
    } else {
      this._introPending = true
    }
  }

  _tryPendingIntro() {
    if (!this._introPending) return
    const buffer = this._introBuffer || this._ambientBuffer
    if (!buffer) return
    this._introPending = false
    this._startIntro(buffer)
  }

  _startIntro(buffer) {
    if (this._introNode) return
    const gain = this._ctx.createGain()
    gain.connect(this._masterGain)
    this._introGain = gain
    this._introNode = this._play(buffer, { destination: gain, loop: true })
  }

  // Fades the looping intro out (or cancels it if it hasn't started yet) —
  // called automatically by trigger() so it can never overlap the first
  // element's sound, even if that fires before intro audio finished loading.
  // The loop can be anywhere in the clip when the gesture lands, so it needs a
  // ramp rather than a hard stop.
  stopIntro() {
    this._introPending = false
    if (!this._introNode) return

    const node = this._introNode
    const gain = this._introGain
    this._introNode = null
    this._introGain = null

    const t = this._ctx.currentTime
    const end = t + INTRO_FADE
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(0, end)
    try { node.stop(end) } catch {}
    node.onended = () => { try { gain.disconnect() } catch {} }
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

  _play(buffer, { destination = this._masterGain, loop = false } = {}) {
    const node = this._ctx.createBufferSource()
    node.buffer = buffer
    node.loop = loop
    node.connect(destination)
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
