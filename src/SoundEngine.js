import * as Tone from 'tone'

// Five generative sound characters — one per element
// Each returns { play(), stop() }

function makeWater() {
  const reverb = new Tone.Reverb({ decay: 8, wet: 0.85 })
  const chorus = new Tone.Chorus(1.5, 3.5, 0.7).start()
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 2.5, decay: 1, sustain: 0.9, release: 5 },
    volume: -10,
  })
  synth.chain(chorus, reverb, Tone.Destination)

  const notes = ['D3', 'F#3', 'A3', 'C#4', 'E4']
  let loop

  return {
    play() {
      loop = new Tone.Loop((time) => {
        const note = notes[Math.floor(Math.random() * notes.length)]
        synth.triggerAttackRelease(note, '4n', time)
      }, '2n')
      loop.start(0)
      Tone.Transport.start()
    },
    stop() {
      loop?.stop()
      loop?.dispose()
      synth.releaseAll()
    },
    dispose() { synth.dispose(); reverb.dispose(); chorus.dispose() },
  }
}

function makeFire() {
  const filter = new Tone.Filter({ frequency: 1800, type: 'bandpass', Q: 2 })
  const dist = new Tone.Distortion(0.35)
  const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 })
  const noise = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.05, decay: 0.4, sustain: 0.15, release: 0.6 },
    volume: -8,
  })
  noise.chain(filter, dist, reverb, Tone.Destination)

  let loop
  return {
    play() {
      loop = new Tone.Loop((time) => {
        noise.triggerAttackRelease('8n', time)
        filter.frequency.rampTo(600 + Math.random() * 2400, 0.2, time)
      }, '8n')
      loop.start(0)
      Tone.Transport.start()
    },
    stop() { loop?.stop(); loop?.dispose() },
    dispose() { noise.dispose(); filter.dispose(); dist.dispose(); reverb.dispose() },
  }
}

function makeEarth() {
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 })
  const tremolo = new Tone.Tremolo({ frequency: 1.2, depth: 0.6 }).start()
  const synth = new Tone.AMSynth({
    harmonicity: 0.5,
    oscillator: { type: 'sine' },
    envelope: { attack: 3, decay: 1, sustain: 1, release: 4 },
    modulation: { type: 'square' },
    modulationEnvelope: { attack: 2, decay: 0, sustain: 1, release: 3 },
    volume: -6,
  })
  synth.chain(tremolo, reverb, Tone.Destination)

  return {
    play() { synth.triggerAttack('C1', Tone.now()) },
    stop() { synth.triggerRelease(Tone.now()) },
    dispose() { synth.dispose(); reverb.dispose(); tremolo.dispose() },
  }
}

function makeMetal() {
  const reverb = new Tone.Reverb({ decay: 6, wet: 0.7 })
  const synth = new Tone.MetalSynth({
    frequency: 180,
    envelope: { attack: 0.001, decay: 2.5, release: 0.5 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4200,
    octaves: 1.5,
    volume: -12,
  })
  synth.chain(reverb, Tone.Destination)

  let loop
  return {
    play() {
      synth.triggerAttack(Tone.now())
      loop = new Tone.Loop((time) => {
        synth.frequency.value = 120 + Math.random() * 160
        synth.triggerAttack(time)
      }, Tone.Time('3n').toSeconds() + Math.random())
      loop.start('+1')
    },
    stop() { loop?.stop(); loop?.dispose(); synth.triggerRelease(Tone.now()) },
    dispose() { synth.dispose(); reverb.dispose() },
  }
}

function makeWood() {
  const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.4 })
  const synth = new Tone.PluckSynth({
    attackNoise: 1.2,
    dampening: 3800,
    resonance: 0.97,
    volume: -4,
  })
  synth.connect(reverb)
  reverb.toDestination()

  const pentatonic = ['C3', 'D3', 'F3', 'G3', 'A3', 'C4', 'D4', 'F4']
  let loop

  return {
    play() {
      loop = new Tone.Loop((time) => {
        const note = pentatonic[Math.floor(Math.random() * pentatonic.length)]
        synth.triggerAttack(note, time)
      }, '4n')
      loop.humanize = true
      loop.start(0)
      Tone.Transport.bpm.value = 72
      Tone.Transport.start()
    },
    stop() { loop?.stop(); loop?.dispose() },
    dispose() { synth.dispose(); reverb.dispose() },
  }
}

const FACTORIES = { water: makeWater, fire: makeFire, earth: makeEarth, metal: makeMetal, wood: makeWood }

export class SoundEngine {
  constructor() {
    this.synths = {}
    this.initialized = false
  }

  async init() {
    if (this.initialized) return
    await Tone.start()
    Tone.Transport.bpm.value = 80
    for (const [id, factory] of Object.entries(FACTORIES)) {
      this.synths[id] = factory()
    }
    this.initialized = true
  }

  play(id) {
    if (!this.initialized || !this.synths[id]) return
    this.synths[id].play()
  }

  stop(id) {
    if (!this.initialized || !this.synths[id]) return
    this.synths[id].stop()
  }

  stopAll() {
    for (const id of Object.keys(this.synths)) this.stop(id)
  }
}
