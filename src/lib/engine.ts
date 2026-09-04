import { EQ_FREQUENCIES } from '../types'

/**
 * The audio engine.
 *
 * Two <audio> elements alternate. While one plays, the next track is loaded
 * into the other and left paused at 0. At the end of a track we start the
 * standby deck and run a short crossfade between the two gain nodes — long
 * enough to hide MP3 encoder padding (the usual source of the "gap" between
 * tracks), short enough that it never sounds like a DJ mix.
 *
 * Graph:
 *
 *   elementA -> gainA -\
 *                       +-> preamp -> EQ×10 -> compressor -> panner
 *   elementB -> gainB -/                                        |
 *                                                               v
 *                              destination <- analyser <- master
 *
 * Everything between preamp and panner is a pass-through until the user
 * turns it on: EQ band gains sit at 0 dB, the compressor is bypassed by a
 * ratio of 1, the panner sits centred. Building the chain once and leaving
 * it flat is far cheaper than rewiring the graph when a switch flips, and it
 * means a setting change can never drop audio mid-track.
 */

const DEFAULT_CROSSFADE = 0.14 // seconds of overlap between tracks
const PRELOAD_LEAD = 12 // ask for the next track this many seconds early
const PAUSE_FADE = 0.09 // seconds — takes the click off pause/resume

type Events = {
  time: (position: number, duration: number) => void
  playing: (isPlaying: boolean) => void
  /** "I'm near the end and have nothing queued — give me the next file." */
  needNext: () => void
  /** "The crossfade completed; the queue pointer should move forward." */
  advanced: () => void
  /** "Playback ran out and there was nothing queued." */
  finished: () => void
  error: (message: string) => void
  /** Emitted once per loaded track when the decoder reports its duration. */
  loaded: (trackId: string, duration: number) => void
}

interface Deck {
  el: HTMLAudioElement
  gain: GainNode
  url: string | null
  trackId: string | null
}

export class Engine {
  private ctx: AudioContext | null = null
  private preamp: GainNode | null = null
  private bands: BiquadFilterNode[] = []
  private compressor: DynamicsCompressorNode | null = null
  private panner: StereoPannerNode | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private decks: [Deck, Deck] | null = null
  private active = 0
  private raf = 0
  private crossfading = false
  /**
   * Bumped on every crossfade and on every `play`. The deferred cleanup a
   * crossfade schedules checks it before touching a deck, so hitting Next
   * mid-fade can't have the old timer stop the deck that just took over.
   */
  private fadeToken = 0
  /** The track we've already asked the queue about, so we ask only once. */
  private askedFor: string | null = null

  private listeners: { [K in keyof Events]: Set<Events[K]> } = {
    time: new Set(),
    playing: new Set(),
    needNext: new Set(),
    advanced: new Set(),
    finished: new Set(),
    error: new Set(),
    loaded: new Set(),
  }

  freqData: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  waveData: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  volume = 1

  /* -------------------------------------------------------- live settings -- */

  /** Seconds of track overlap. 0 turns the crossfade into a hard cut. */
  crossfadeTime = DEFAULT_CROSSFADE
  /** Fade the master gain around pause/resume instead of cutting. */
  smoothPause = true
  /** A↔B repeat span in seconds, or null. Enforced in the rAF loop. */
  loop: { a: number; b: number } | null = null

  /* ------------------------------------------------------------- events -- */

  on<K extends keyof Events>(type: K, fn: Events[K]) {
    this.listeners[type].add(fn)
    return () => {
      this.listeners[type].delete(fn)
    }
  }

  private emit<K extends keyof Events>(type: K, ...args: Parameters<Events[K]>) {
    for (const fn of this.listeners[type]) (fn as (...a: unknown[]) => void)(...args)
  }

  /* ------------------------------------------------------------- set-up -- */

  /** Lazily built, because an AudioContext must originate in a user gesture. */
  private init() {
    if (this.ctx) return
    const ctx = new AudioContext()

    const preamp = ctx.createGain()
    preamp.gain.value = 1

    // Ten peaking filters in series. The outer two are shelves so the very
    // bottom and very top move as a whole rather than around a centre — that
    // is what a real graphic EQ does, and it stops 32 Hz from sounding like
    // it does nothing on speakers that roll off below it.
    const bands = EQ_FREQUENCIES.map((freq, i) => {
      const f = ctx.createBiquadFilter()
      f.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.1
      f.gain.value = 0
      return f
    })

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 1 // bypassed until night mode turns it up
    compressor.attack.value = 0.006
    compressor.release.value = 0.22

    const panner = ctx.createStereoPanner()
    panner.pan.value = 0

    const master = ctx.createGain()
    master.gain.value = this.volume

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.72
    analyser.minDecibels = -85
    analyser.maxDecibels = -12

    // preamp -> band0 -> … -> band9 -> compressor -> panner -> master
    let node: AudioNode = preamp
    for (const b of bands) {
      node.connect(b)
      node = b
    }
    node.connect(compressor)
    compressor.connect(panner)
    panner.connect(master)
    master.connect(analyser)
    analyser.connect(ctx.destination)

    const makeDeck = (): Deck => {
      const el = new Audio()
      el.preload = 'auto'
      const gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(el).connect(gain)
      gain.connect(preamp)
      return { el, gain, url: null, trackId: null }
    }

    this.ctx = ctx
    this.preamp = preamp
    this.bands = bands
    this.compressor = compressor
    this.panner = panner
    this.master = master
    this.analyser = analyser
    this.decks = [makeDeck(), makeDeck()]
    this.freqData = new Uint8Array(analyser.frequencyBinCount)
    this.waveData = new Uint8Array(analyser.fftSize)

    for (const deck of this.decks) {
      deck.el.addEventListener('error', () => {
        if (deck.trackId && deck === this.cur) {
          this.emit('error', 'Could not decode this file.')
          this.emit('finished')
        }
      })
      deck.el.addEventListener('loadedmetadata', () => {
        if (deck.trackId && Number.isFinite(deck.el.duration)) {
          this.emit('loaded', deck.trackId, deck.el.duration)
        }
      })
      // Safety net: if a track ends without our crossfade firing (very short
      // file, seek to the very end, a stall), still move the queue along.
      deck.el.addEventListener('ended', () => {
        if (deck !== this.cur || this.crossfading) return
        if (this.standby?.trackId) this.crossfade()
        else this.emit('finished')
      })
    }

    this.applyRate()
    this.tick()
  }

  async resume() {
    this.init()
    if (this.ctx?.state === 'suspended') await this.ctx.resume()
  }

  getAnalyser() {
    return this.analyser
  }

  /** Copy the current spectrum into `freqData`. Cheap; call once per frame. */
  sample() {
    if (this.analyser) this.analyser.getByteFrequencyData(this.freqData)
    return this.freqData
  }

  /** Raw time-domain samples, for the oscilloscope visualiser. */
  sampleWave() {
    if (this.analyser) this.analyser.getByteTimeDomainData(this.waveData)
    return this.waveData
  }

  /**
   * Peak level per channel, 0..1 — what the VU meters read. Derived from the
   * spectrum rather than a second analyser per channel: two more analysers
   * plus a splitter is real CPU for a needle that only has to look right.
   */
  levels(): { peak: number; rms: number } {
    const data = this.sample()
    if (!data.length) return { peak: 0, rms: 0 }
    let peak = 0
    let sum = 0
    // Above ~11 kHz there is almost never enough energy in an MP3 to move a
    // needle, and including it just makes the meter read low all the time.
    const limit = Math.floor(data.length * 0.55)
    for (let i = 0; i < limit; i++) {
      const v = data[i] / 255
      if (v > peak) peak = v
      sum += v * v
    }
    return { peak, rms: Math.sqrt(sum / limit) }
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000
  }

  /* ------------------------------------------------------------- filters -- */

  /**
   * Push a whole EQ state in one call. `enabled: false` flattens every band
   * rather than disconnecting the filters — a disconnect/reconnect mid-track
   * is audible, a ramp to 0 dB is not.
   */
  setEq(enabled: boolean, preamp: number, bands: number[]) {
    this.init()
    const ctx = this.ctx
    if (!ctx || !this.preamp) return
    const t = ctx.currentTime
    for (let i = 0; i < this.bands.length; i++) {
      const target = enabled ? (bands[i] ?? 0) : 0
      this.bands[i].gain.setTargetAtTime(target, t, 0.02)
    }
    const trim = enabled ? preamp : 0
    this.preamp.gain.setTargetAtTime(dbToGain(trim), t, 0.02)
  }

  /** The "late night" compressor: ratio 1 is a bypass, 4 is a firm hand. */
  setNightMode(on: boolean) {
    this.init()
    const c = this.compressor
    const ctx = this.ctx
    if (!c || !ctx) return
    const t = ctx.currentTime
    c.ratio.setTargetAtTime(on ? 4 : 1, t, 0.05)
    c.threshold.setTargetAtTime(on ? -30 : -24, t, 0.05)
  }

  /** -1 hard left … 0 centre … +1 hard right. */
  setBalance(v: number) {
    this.init()
    const p = this.panner
    const ctx = this.ctx
    if (!p || !ctx) return
    p.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), ctx.currentTime, 0.02)
  }

  private rate = 1

  /** 0.25×…4×. `preservesPitch` keeps voices from turning into chipmunks. */
  setRate(v: number) {
    this.rate = Math.max(0.25, Math.min(4, v))
    this.applyRate()
  }

  get playbackRate() {
    return this.rate
  }

  private applyRate() {
    if (!this.decks) return
    for (const d of this.decks) {
      d.el.playbackRate = this.rate
      // Vendor-prefixed on older Safari/WebKit; the standard name lands first
      // where it exists, and the prefixed assignment is a harmless no-op.
      d.el.preservesPitch = true
      ;(d.el as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true
    }
  }

  /* ----------------------------------------------------------- playback -- */

  private get cur(): Deck | null {
    return this.decks ? this.decks[this.active] : null
  }

  private get standby(): Deck | null {
    return this.decks ? this.decks[this.active ^ 1] : null
  }

  get currentTrackId() {
    return this.cur?.trackId ?? null
  }

  /** Load and play `file` immediately, replacing whatever is playing. */
  async play(trackId: string, file: File) {
    await this.resume()
    this.crossfading = false
    this.fadeToken++
    this.askedFor = null
    this.loop = null

    const cur = this.cur!
    const standby = this.standby!

    // If we already pre-loaded this exact track, swap to it rather than
    // re-decoding from scratch — this is the natural "next track" path.
    if (standby.trackId === trackId && standby.el.readyState >= 2) {
      this.stopDeck(cur)
      this.active ^= 1
      const next = this.cur!
      next.gain.gain.setValueAtTime(1, this.ctx!.currentTime)
      next.el.currentTime = 0
      await this.start(next)
      return
    }

    this.stopDeck(standby)
    this.stopDeck(cur)
    this.loadInto(cur, trackId, file)
    cur.gain.gain.setValueAtTime(1, this.ctx!.currentTime)
    await this.start(cur)
  }

  /** Put a track on the standby deck so the crossfade has something to play. */
  preload(trackId: string, file: File) {
    this.init()
    const standby = this.standby!
    if (standby.trackId === trackId) return
    this.stopDeck(standby)
    this.loadInto(standby, trackId, file)
    standby.el.load()
  }

  /** Forget anything queued on standby (e.g. the user re-ordered the queue). */
  clearPreload() {
    if (this.standby) this.stopDeck(this.standby)
    this.askedFor = null
  }

  private loadInto(deck: Deck, trackId: string, file: File) {
    if (deck.url) URL.revokeObjectURL(deck.url)
    deck.url = URL.createObjectURL(file)
    deck.trackId = trackId
    deck.el.src = deck.url
    deck.el.playbackRate = this.rate
    deck.el.preservesPitch = true
  }

  private stopDeck(deck: Deck) {
    deck.el.pause()
    deck.gain.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0)
    deck.gain.gain.value = 0
    if (deck.url) {
      deck.el.removeAttribute('src')
      deck.el.load() // detach the decoder from the revoked blob
      URL.revokeObjectURL(deck.url)
      deck.url = null
    }
    deck.trackId = null
  }

  private async start(deck: Deck) {
    try {
      this.rampMaster(this.volume)
      await deck.el.play()
      this.emit('playing', true)
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        this.emit('error', 'Playback was blocked.')
      }
    }
  }

  /** Ramp the master gain rather than jumping, so pause doesn't click. */
  private rampMaster(to: number, time = this.smoothPause ? PAUSE_FADE : 0.005) {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const t = ctx.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t)
    master.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + time)
  }

  async toggle() {
    await this.resume()
    const cur = this.cur
    if (!cur?.trackId) return
    if (cur.el.paused) {
      this.rampMaster(this.volume)
      await cur.el.play()
      this.emit('playing', true)
    } else {
      // Let the fade finish before the element stops, or the fade is silent.
      this.rampMaster(0)
      const el = cur.el
      const wait = this.smoothPause ? PAUSE_FADE * 1000 : 0
      window.setTimeout(() => {
        if (!el.paused) el.pause()
      }, wait)
      this.emit('playing', false)
    }
  }

  async setPlaying(next: boolean) {
    const cur = this.cur
    if (!cur?.trackId) return
    if (next === !cur.el.paused) return
    await this.toggle()
  }

  stop() {
    if (!this.decks) return
    this.fadeToken++
    this.crossfading = false
    this.stopDeck(this.decks[0])
    this.stopDeck(this.decks[1])
    this.askedFor = null
    this.loop = null
    this.emit('playing', false)
    this.emit('time', 0, 0)
  }

  seek(seconds: number) {
    const cur = this.cur
    if (!cur?.el.duration || !Number.isFinite(cur.el.duration)) return
    cur.el.currentTime = Math.max(0, Math.min(seconds, cur.el.duration))
    this.emit('time', cur.el.currentTime, cur.el.duration)
  }

  /** Nudge by a signed number of seconds — what the arrow keys use. */
  nudge(seconds: number) {
    this.seek(this.position + seconds)
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master && this.ctx) {
      // Ramp rather than jump, so dragging the fader doesn't zipper.
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.setTargetAtTime(
        Math.max(0.0001, this.volume),
        this.ctx.currentTime,
        0.015
      )
    }
  }

  get position() {
    return this.cur?.el.currentTime ?? 0
  }

  get duration() {
    const d = this.cur?.el.duration
    return Number.isFinite(d) ? (d as number) : 0
  }

  get isPlaying() {
    return !!this.cur?.trackId && !this.cur.el.paused
  }

  /** How far the browser has buffered ahead, 0..1 of the whole track. */
  get buffered() {
    const el = this.cur?.el
    if (!el || !Number.isFinite(el.duration) || !el.duration) return 0
    const ranges = el.buffered
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (ranges.start(i) <= el.currentTime) {
        return Math.min(1, ranges.end(i) / el.duration)
      }
    }
    return 0
  }

  /* --------------------------------------------------------------- loop -- */

  /** Drop the A marker at the playhead, then B on the second call. */
  markLoop(): { a: number; b: number | null } | null {
    const pos = this.position
    if (!this.cur?.trackId) return null
    if (!this.loopA && this.loopA !== 0) {
      this.loopA = pos
      return { a: pos, b: null }
    }
    if (pos <= this.loopA + 0.3) {
      // B too close to A would be an unlistenable stutter — restart instead.
      this.loopA = pos
      return { a: pos, b: null }
    }
    this.loop = { a: this.loopA, b: pos }
    return this.loop
  }

  clearLoop() {
    this.loop = null
    this.loopA = null
  }

  private loopA: number | null = null

  get loopMark(): number | null {
    return this.loopA
  }

  /* --------------------------------------------------------------- tick -- */

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    const cur = this.cur
    if (!cur?.trackId) return

    const { currentTime, duration } = cur.el
    if (!Number.isFinite(duration) || duration === 0) return

    // A↔B repeat wins over everything else, including the crossfade.
    if (this.loop && currentTime >= this.loop.b) {
      cur.el.currentTime = this.loop.a
      this.emit('time', this.loop.a, duration)
      return
    }

    this.emit('time', currentTime, duration)
    const remaining = duration - currentTime

    // Ask the queue for the next file, once, early enough for it to buffer.
    if (
      remaining < PRELOAD_LEAD &&
      !this.loop &&
      !this.standby?.trackId &&
      this.askedFor !== cur.trackId &&
      !cur.el.paused
    ) {
      this.askedFor = cur.trackId
      this.emit('needNext')
    }

    // Hand over to the standby deck, overlapping by the crossfade time.
    if (
      remaining <= Math.max(this.crossfadeTime, 0.05) &&
      !this.loop &&
      !this.crossfading &&
      this.standby?.trackId &&
      this.standby.el.readyState >= 3
    ) {
      this.crossfade()
    }
  }

  private crossfade() {
    const ctx = this.ctx!
    const from = this.cur!
    const to = this.standby!
    this.crossfading = true
    const token = ++this.fadeToken
    const span = Math.max(this.crossfadeTime, 0.02)

    const t = ctx.currentTime
    from.gain.gain.cancelScheduledValues(t)
    from.gain.gain.setValueAtTime(from.gain.gain.value, t)
    from.gain.gain.linearRampToValueAtTime(0.0001, t + span)

    to.gain.gain.cancelScheduledValues(t)
    to.gain.gain.setValueAtTime(0.0001, t)
    to.gain.gain.linearRampToValueAtTime(1, t + span)

    to.el.currentTime = 0
    to.el.playbackRate = this.rate
    void to.el.play().catch(() => {})

    const finished = from
    this.active ^= 1
    this.askedFor = null

    window.setTimeout(
      () => {
        // A `play()` or `stop()` during the fade bumps the token; the deck we
        // were about to tear down may now be the one playing.
        if (token !== this.fadeToken) return
        this.stopDeck(finished)
        this.crossfading = false
        this.emit('advanced')
      },
      span * 1000 + 60
    )
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    if (this.decks) {
      this.stopDeck(this.decks[0])
      this.stopDeck(this.decks[1])
    }
    void this.ctx?.close()
    this.ctx = null
  }
}

/** dB → linear gain. 0 dB is unity; -12 dB is about a quarter of the power. */
export function dbToGain(db: number) {
  return Math.pow(10, db / 20)
}

export const engine = new Engine()
