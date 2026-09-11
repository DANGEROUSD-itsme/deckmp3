/**
 * The DJ engine — a second, independent audio path from the main queue
 * player in `engine.ts`. Where that engine plays one linear queue with an
 * automatic crossfade, this one gives the user two decks they drive by hand:
 * load a track on each, mix between them with a crossfader, shape each with
 * a 3-band EQ and a sweep filter, and nudge tempo for manual beatmatching.
 *
 * Graph, per deck:
 *
 *   <audio> -> source -> trim -> low -> mid -> high -> filter -> fader -\
 *                                                    (tapped for VU) ---+--> analyser
 *                                                                       |
 *                                                            crossfaderGain
 *                                                                       |
 *                                                                       v
 *                                                        master -> destination
 *
 * The two decks' crossfader gains are driven by one equal-power curve so the
 * perceived loudness doesn't dip in the middle of a mix.
 */

export type DeckSide = 'a' | 'b'

const EQ_LOW_HZ = 200
const EQ_MID_HZ = 1000
const EQ_HIGH_HZ = 4000
/** dB range for each EQ band. Real mixers "kill" a band well past unity. */
export const EQ_MIN_DB = -26
export const EQ_MAX_DB = 6
/** dB range for the channel trim knob. */
export const TRIM_MIN_DB = -12
export const TRIM_MAX_DB = 12
/** Sweep filter corner frequencies at the extremes of the -1..1 control. */
const FILTER_LP_MIN_HZ = 120 // control at -1: everything above this is gone
const FILTER_HP_MAX_HZ = 8000 // control at +1: everything below this is gone
/** How far a pitch-bend nudge shifts the rate while held. */
const BEND_AMOUNT = 0.06

type DeckEvents = {
  playing: (side: DeckSide, isPlaying: boolean) => void
  ended: (side: DeckSide) => void
  error: (side: DeckSide, message: string) => void
  loaded: (side: DeckSide, duration: number) => void
}

interface Deck {
  el: HTMLAudioElement
  source: MediaElementAudioSourceNode | null
  trim: GainNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  filter: BiquadFilterNode
  fader: GainNode
  analyser: AnalyserNode
  crossGain: GainNode
  url: string | null
  trackId: string | null
  cue: number
  baseRate: number
  bending: number
  freqData: Uint8Array<ArrayBuffer>
}

export function dbToGain(db: number) {
  return Math.pow(10, db / 20)
}

export class DjEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private decks: Record<DeckSide, Deck> | null = null

  private listeners: { [K in keyof DeckEvents]: Set<DeckEvents[K]> } = {
    playing: new Set(),
    ended: new Set(),
    error: new Set(),
    loaded: new Set(),
  }

  on<K extends keyof DeckEvents>(type: K, fn: DeckEvents[K]) {
    this.listeners[type].add(fn)
    return () => {
      this.listeners[type].delete(fn)
    }
  }

  private emit<K extends keyof DeckEvents>(type: K, ...args: Parameters<DeckEvents[K]>) {
    for (const fn of this.listeners[type]) (fn as (...a: unknown[]) => void)(...args)
  }

  /** Lazily built, because an AudioContext must originate in a user gesture. */
  private init() {
    if (this.ctx) return
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    const makeDeck = (): Deck => {
      const el = new Audio()
      el.preload = 'auto'

      const trim = ctx.createGain()
      trim.gain.value = 1

      const low = ctx.createBiquadFilter()
      low.type = 'lowshelf'
      low.frequency.value = EQ_LOW_HZ
      low.gain.value = 0

      const mid = ctx.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = EQ_MID_HZ
      mid.Q.value = 0.9
      mid.gain.value = 0

      const high = ctx.createBiquadFilter()
      high.type = 'highshelf'
      high.frequency.value = EQ_HIGH_HZ
      high.gain.value = 0

      // Bypassed (allpass) until the filter knob moves off centre.
      const filter = ctx.createBiquadFilter()
      filter.type = 'allpass'
      filter.frequency.value = 350
      filter.Q.value = 0.7

      const fader = ctx.createGain()
      fader.gain.value = 1

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.7

      const crossGain = ctx.createGain()
      crossGain.gain.value = 1

      trim.connect(low)
      low.connect(mid)
      mid.connect(high)
      high.connect(filter)
      filter.connect(fader)
      fader.connect(analyser)
      analyser.connect(crossGain)
      crossGain.connect(master)

      return {
        el,
        source: null,
        trim,
        low,
        mid,
        high,
        filter,
        fader,
        analyser,
        crossGain,
        url: null,
        trackId: null,
        cue: 0,
        baseRate: 1,
        bending: 0,
        freqData: new Uint8Array(analyser.frequencyBinCount),
      }
    }

    const a = makeDeck()
    const b = makeDeck()
    this.ctx = ctx
    this.master = master
    this.decks = { a, b }

    for (const side of ['a', 'b'] as const) {
      const deck = this.decks[side]
      deck.el.addEventListener('play', () => this.emit('playing', side, true))
      deck.el.addEventListener('pause', () => this.emit('playing', side, false))
      deck.el.addEventListener('ended', () => this.emit('ended', side))
      deck.el.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(deck.el.duration)) this.emit('loaded', side, deck.el.duration)
      })
      deck.el.addEventListener('error', () => {
        if (deck.trackId) this.emit('error', side, 'Could not decode this file.')
      })
    }

    this.setCrossfader(0.5)
  }

  async resume() {
    this.init()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
  }

  private deck(side: DeckSide): Deck {
    this.init()
    return this.decks![side]
  }

  /* ------------------------------------------------------------- loading -- */

  async load(side: DeckSide, trackId: string, file: File) {
    await this.resume()
    const deck = this.deck(side)
    const ctx = this.ctx!

    deck.el.pause()
    if (deck.url) URL.revokeObjectURL(deck.url)
    deck.url = URL.createObjectURL(file)
    deck.trackId = trackId
    deck.cue = 0
    deck.el.src = deck.url
    deck.el.playbackRate = deck.baseRate
    deck.el.load()

    // A MediaElementAudioSourceNode can only ever be created once per
    // element and stays valid across future `src` swaps, so this only
    // happens the first time a deck is loaded.
    if (!deck.source) {
      deck.source = ctx.createMediaElementSource(deck.el)
      deck.source.connect(deck.trim)
    }
  }

  /* ----------------------------------------------------------- transport -- */

  async play(side: DeckSide) {
    const deck = this.deck(side)
    if (!deck.trackId) return
    await this.resume()
    try {
      await deck.el.play()
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        this.emit('error', side, 'Playback was blocked.')
      }
    }
  }

  pause(side: DeckSide) {
    this.deck(side).el.pause()
  }

  async toggle(side: DeckSide) {
    const deck = this.deck(side)
    if (deck.el.paused) await this.play(side)
    else this.pause(side)
  }

  seek(side: DeckSide, seconds: number) {
    const deck = this.deck(side)
    if (!Number.isFinite(deck.el.duration)) return
    deck.el.currentTime = Math.max(0, Math.min(seconds, deck.el.duration))
  }

  /** Store the current playhead as the cue point. */
  setCue(side: DeckSide) {
    const deck = this.deck(side)
    deck.cue = deck.el.currentTime
    return deck.cue
  }

  /** Jump to the cue point. Classic behaviour: playing decks stop there. */
  jumpToCue(side: DeckSide) {
    const deck = this.deck(side)
    this.seek(side, deck.cue)
    if (!deck.el.paused) deck.el.pause()
  }

  get cuePoints() {
    if (!this.decks) return { a: 0, b: 0 }
    return { a: this.decks.a.cue, b: this.decks.b.cue }
  }

  /** Temporarily push the rate while a pitch-bend button is held. */
  bend(side: DeckSide, direction: -1 | 0 | 1) {
    const deck = this.deck(side)
    deck.bending = direction * BEND_AMOUNT
    deck.el.playbackRate = Math.max(0.1, deck.baseRate + deck.bending)
  }

  /** The tempo fader / "pitch". `rate` is a multiplier, 1 = original speed. */
  setRate(side: DeckSide, rate: number) {
    const deck = this.deck(side)
    deck.baseRate = Math.max(0.5, Math.min(2, rate))
    deck.el.playbackRate = deck.baseRate + deck.bending
  }

  getRate(side: DeckSide) {
    return this.deck(side).baseRate
  }

  /** Key lock: keep pitch constant across tempo changes, like a CDJ's lock. */
  setKeyLock(side: DeckSide, on: boolean) {
    const el = this.deck(side).el
    el.preservesPitch = on
    ;(el as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = on
  }

  get position() {
    if (!this.decks) return { a: 0, b: 0 }
    return { a: this.decks.a.el.currentTime, b: this.decks.b.el.currentTime }
  }

  get duration() {
    if (!this.decks) return { a: 0, b: 0 }
    const d = (side: DeckSide) => {
      const v = this.decks![side].el.duration
      return Number.isFinite(v) ? v : 0
    }
    return { a: d('a'), b: d('b') }
  }

  isPlaying(side: DeckSide) {
    const deck = this.decks?.[side]
    return !!deck?.trackId && !deck.el.paused
  }

  /* ------------------------------------------------------------- mixing -- */

  /** Channel trim, in dB. Pre-EQ gain — the "how hot is this source" knob. */
  setTrim(side: DeckSide, db: number) {
    const deck = this.deck(side)
    const t = this.ctx!.currentTime
    deck.trim.gain.setTargetAtTime(dbToGain(Math.max(TRIM_MIN_DB, Math.min(TRIM_MAX_DB, db))), t, 0.01)
  }

  /** One EQ band, in dB. `band` is 'low' | 'mid' | 'high'. */
  setEq(side: DeckSide, band: 'low' | 'mid' | 'high', db: number) {
    const deck = this.deck(side)
    const t = this.ctx!.currentTime
    const clamped = Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, db))
    deck[band].gain.setTargetAtTime(clamped, t, 0.01)
  }

  /**
   * The sweep filter. -1 = full low-pass (only bass survives), 0 = bypass,
   * +1 = full high-pass (only treble survives) — the classic mixer filter
   * knob DJs use to build and release tension.
   */
  setFilter(side: DeckSide, value: number) {
    const deck = this.deck(side)
    const v = Math.max(-1, Math.min(1, value))
    const t = this.ctx!.currentTime
    if (Math.abs(v) < 0.02) {
      deck.filter.type = 'allpass'
      return
    }
    if (v < 0) {
      deck.filter.type = 'lowpass'
      // Logarithmic: most of the sweep's "feel" lives in the last 20%.
      const freq = 22000 * Math.pow(FILTER_LP_MIN_HZ / 22000, -v)
      deck.filter.frequency.setTargetAtTime(freq, t, 0.01)
      deck.filter.Q.setTargetAtTime(0.8 + -v * 2, t, 0.01)
    } else {
      deck.filter.type = 'highpass'
      const freq = 20 * Math.pow(FILTER_HP_MAX_HZ / 20, v)
      deck.filter.frequency.setTargetAtTime(freq, t, 0.01)
      deck.filter.Q.setTargetAtTime(0.8 + v * 2, t, 0.01)
    }
  }

  /** The channel fader, linear 0..1. */
  setFader(side: DeckSide, value: number) {
    const deck = this.deck(side)
    deck.fader.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx!.currentTime, 0.01)
  }

  /**
   * Equal-power crossfade: `x` is 0 (full A) .. 1 (full B). Using cos/sin
   * rather than a linear ramp keeps the combined loudness constant through
   * the middle of the mix instead of dipping.
   */
  setCrossfader(x: number) {
    if (!this.decks || !this.ctx) return
    const v = Math.max(0, Math.min(1, x))
    const t = this.ctx.currentTime
    this.decks.a.crossGain.gain.setTargetAtTime(Math.cos((v * Math.PI) / 2), t, 0.01)
    this.decks.b.crossGain.gain.setTargetAtTime(Math.sin((v * Math.PI) / 2), t, 0.01)
  }

  setMasterVolume(v: number) {
    if (!this.master || !this.ctx) return
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.015)
  }

  /* ------------------------------------------------------------- meters -- */

  sample(side: DeckSide) {
    const deck = this.deck(side)
    deck.analyser.getByteFrequencyData(deck.freqData)
    return deck.freqData
  }

  levels(side: DeckSide): { peak: number; rms: number } {
    const data = this.sample(side)
    if (!data.length) return { peak: 0, rms: 0 }
    let peak = 0
    let sum = 0
    const limit = Math.floor(data.length * 0.6)
    for (let i = 0; i < limit; i++) {
      const v = data[i] / 255
      if (v > peak) peak = v
      sum += v * v
    }
    return { peak, rms: Math.sqrt(sum / limit) }
  }

  /** Stop both decks and release their object URLs. Keeps trim/EQ/fader state. */
  stopAll() {
    if (!this.decks) return
    for (const side of ['a', 'b'] as const) {
      const deck = this.decks[side]
      deck.el.pause()
    }
  }

  destroy() {
    if (this.decks) {
      for (const side of ['a', 'b'] as const) {
        const deck = this.decks[side]
        deck.el.pause()
        if (deck.url) URL.revokeObjectURL(deck.url)
      }
    }
    void this.ctx?.close()
    this.ctx = null
    this.decks = null
  }
}

export const djEngine = new DjEngine()
