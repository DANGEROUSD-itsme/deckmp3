/**
 * The audio engine.
 *
 * Two <audio> elements alternate. While one plays, the next track is loaded
 * into the other and left paused at 0. At the end of a track we start the
 * standby deck and run a short crossfade between the two gain nodes — long
 * enough to hide MP3 encoder padding (the usual source of the "gap" between
 * tracks), short enough that it never sounds like a DJ mix.
 *
 * Graph:  elementA -> gainA -\
 *                             +-> master -> analyser -> destination
 *         elementB -> gainB -/
 */

const CROSSFADE = 0.14 // seconds of overlap between tracks
const PRELOAD_LEAD = 12 // ask for the next track this many seconds early

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
}

interface Deck {
  el: HTMLAudioElement
  gain: GainNode
  url: string | null
  trackId: string | null
}

export class Engine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private decks: [Deck, Deck] | null = null
  private active = 0
  private raf = 0
  private crossfading = false
  /** The track we've already asked the queue about, so we ask only once. */
  private askedFor: string | null = null

  private listeners: { [K in keyof Events]: Set<Events[K]> } = {
    time: new Set(),
    playing: new Set(),
    needNext: new Set(),
    advanced: new Set(),
    finished: new Set(),
    error: new Set(),
  }

  freqData: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  volume = 1

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
    const master = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.72
    analyser.minDecibels = -85
    analyser.maxDecibels = -12

    master.connect(analyser)
    analyser.connect(ctx.destination)

    const makeDeck = (): Deck => {
      const el = new Audio()
      el.preload = 'auto'
      const gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(el).connect(gain)
      gain.connect(master)
      return { el, gain, url: null, trackId: null }
    }

    this.ctx = ctx
    this.master = master
    this.analyser = analyser
    this.decks = [makeDeck(), makeDeck()]
    this.freqData = new Uint8Array(analyser.frequencyBinCount)
    master.gain.value = this.volume

    for (const deck of this.decks) {
      deck.el.addEventListener('error', () => {
        if (deck.trackId && deck === this.cur) {
          this.emit('error', 'Could not decode this file.')
          this.emit('finished')
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

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000
  }

  /* ----------------------------------------------------------- playback -- */

  private get cur(): Deck | null {
    return this.decks ? this.decks[this.active] : null
  }

  private get standby(): Deck | null {
    return this.decks ? this.decks[this.active ^ 1] : null
  }

  /** Load and play `file` immediately, replacing whatever is playing. */
  async play(trackId: string, file: File) {
    await this.resume()
    this.crossfading = false
    this.askedFor = null

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
      await deck.el.play()
      this.emit('playing', true)
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        this.emit('error', 'Playback was blocked.')
      }
    }
  }

  async toggle() {
    await this.resume()
    const cur = this.cur
    if (!cur?.trackId) return
    if (cur.el.paused) {
      await cur.el.play()
      this.emit('playing', true)
    } else {
      cur.el.pause()
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
    this.stopDeck(this.decks[0])
    this.stopDeck(this.decks[1])
    this.askedFor = null
    this.emit('playing', false)
    this.emit('time', 0, 0)
  }

  seek(seconds: number) {
    const cur = this.cur
    if (!cur?.el.duration) return
    cur.el.currentTime = Math.max(0, Math.min(seconds, cur.el.duration))
    this.emit('time', cur.el.currentTime, cur.el.duration)
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master && this.ctx) {
      // Ramp rather than jump, so dragging the fader doesn't zipper.
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015)
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

  /* --------------------------------------------------------------- loop -- */

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick)
    const cur = this.cur
    if (!cur?.trackId) return

    const { currentTime, duration } = cur.el
    if (!Number.isFinite(duration) || duration === 0) return

    this.emit('time', currentTime, duration)
    const remaining = duration - currentTime

    // Ask the queue for the next file, once, early enough for it to buffer.
    if (
      remaining < PRELOAD_LEAD &&
      !this.standby?.trackId &&
      this.askedFor !== cur.trackId &&
      !cur.el.paused
    ) {
      this.askedFor = cur.trackId
      this.emit('needNext')
    }

    // Hand over to the standby deck, overlapping by CROSSFADE.
    if (
      remaining <= CROSSFADE &&
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

    const t = ctx.currentTime
    from.gain.gain.cancelScheduledValues(t)
    from.gain.gain.setValueAtTime(from.gain.gain.value, t)
    from.gain.gain.linearRampToValueAtTime(0.0001, t + CROSSFADE)

    to.gain.gain.cancelScheduledValues(t)
    to.gain.gain.setValueAtTime(0.0001, t)
    to.gain.gain.linearRampToValueAtTime(1, t + CROSSFADE)

    to.el.currentTime = 0
    void to.el.play().catch(() => {})

    const finished = from
    this.active ^= 1
    this.askedFor = null

    window.setTimeout(
      () => {
        this.stopDeck(finished)
        this.crossfading = false
        this.emit('advanced')
      },
      CROSSFADE * 1000 + 60
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

export const engine = new Engine()
