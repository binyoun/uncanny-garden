import * as Tone from 'tone'

export class SoundEngine {
  constructor() {
    this._ready = false
    this._synth = null
    this._loop = null
  }

  async init() {
    if (this._ready) return
    await Tone.start()
    this._ready = true

    const reverb = new Tone.Reverb({ decay: 6, wet: 0.7 }).toDestination()
    const chorus = new Tone.Chorus(0.5, 3, 0.4).connect(reverb)
    chorus.start()

    this._synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 1.5, decay: 1, sustain: 0.8, release: 3 },
      volume: -14,
    }).connect(chorus)

    const notes = ['C3', 'G3', 'D4', 'A4', 'E4']
    let i = 0
    this._loop = new Tone.Loop((time) => {
      this._synth.triggerAttackRelease(notes[i % notes.length], '4n', time)
      i++
    }, '2n')
  }

  play() {
    if (!this._ready) return
    Tone.getTransport().start()
    this._loop.start(0)
  }

  stop() {
    if (!this._ready) return
    this._loop.stop()
    this._synth.releaseAll()
    Tone.getTransport().stop()
  }
}
