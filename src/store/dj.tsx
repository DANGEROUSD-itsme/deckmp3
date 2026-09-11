import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Track } from '../types'
import { djEngine, EQ_MIN_DB, type DeckSide } from '../lib/djEngine'
import { getPeaks, type Peaks } from '../lib/waveform'

export interface DeckState {
  trackId: string | null
  title: string
  artist: string
  artKey: string | null
  duration: number
  /** Stored cue point, in seconds. */
  cue: number
  /** dB, pre-EQ. */
  trim: number
  eq: { low: number; mid: number; high: number }
  /** -1 (low-pass) .. 0 (bypass) .. 1 (high-pass). */
  filter: number
  /** Channel fader, 0..1. */
  fader: number
  /** Tempo multiplier, 1 = original speed. */
  rate: number
  keylock: boolean
  playing: boolean
  /** BPM estimated from manual taps, or null until tapped twice. */
  tappedBpm: number | null
  /** Waveform envelope. null while decoding or if decoding failed. */
  peaks: Peaks | null
}

const emptyDeck = (): DeckState => ({
  trackId: null,
  title: '',
  artist: '',
  artKey: null,
  duration: 0,
  cue: 0,
  trim: 0,
  eq: { low: 0, mid: 0, high: 0 },
  filter: 0,
  fader: 1,
  rate: 1,
  keylock: false,
  playing: false,
  tappedBpm: null,
  peaks: null,
})

/** Progress of an in-flight automatic transition, or null when idle. */
export interface AutoMixState {
  from: DeckSide
  to: DeckSide
  /** 0..1 through the transition. */
  progress: number
}

interface DJValue {
  open: boolean
  openMixer: () => void
  closeMixer: () => void

  decks: Record<DeckSide, DeckState>
  /** `file` must already be resolved (see `useDeck().resolveFile`) — the DJ
   *  store deliberately doesn't know how the main library reads bytes off
   *  disk or IndexedDB, so it can't resolve a Track on its own. */
  loadDeck: (side: DeckSide, track: Track, file: File) => Promise<void>

  toggle: (side: DeckSide) => void
  seek: (side: DeckSide, seconds: number) => void
  setCue: (side: DeckSide) => void
  jumpToCue: (side: DeckSide) => void
  bend: (side: DeckSide, direction: -1 | 0 | 1) => void
  setRate: (side: DeckSide, rate: number) => void
  toggleKeyLock: (side: DeckSide) => void
  setTrim: (side: DeckSide, db: number) => void
  setEq: (side: DeckSide, band: 'low' | 'mid' | 'high', db: number) => void
  setFilter: (side: DeckSide, value: number) => void
  setFader: (side: DeckSide, value: number) => void
  tapTempo: (side: DeckSide) => void
  /** Nudge this deck's rate so its effective BPM matches the other deck's. */
  matchTempo: (side: DeckSide) => void

  crossfader: number
  setCrossfader: (value: number) => void
  master: number
  setMaster: (value: number) => void

  /** The automatic beatmatch-and-blend transition. null when nothing is running. */
  autoMix: AutoMixState | null
  /** Blend from whichever deck currently leads into the other, over `seconds`. */
  startAutoMix: (seconds?: number) => void
  cancelAutoMix: () => void

  notice: string | null
  dismissNotice: () => void
}

const Ctx = createContext<DJValue | null>(null)

export function useDJ() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDJ must be used inside <DJProvider>')
  return v
}

const other = (side: DeckSide): DeckSide => (side === 'a' ? 'b' : 'a')

export function DJProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [decks, setDecks] = useState<Record<DeckSide, DeckState>>({
    a: emptyDeck(),
    b: emptyDeck(),
  })
  const [crossfader, setCrossfaderState] = useState(0.5)
  const [master, setMasterState] = useState(0.85)
  const [notice, setNotice] = useState<string | null>(null)
  const [autoMix, setAutoMix] = useState<AutoMixState | null>(null)

  /** Rolling tap timestamps per deck, for tap-tempo. Not rendered directly. */
  const taps = useRef<Record<DeckSide, number[]>>({ a: [], b: [] })

  const patchDeck = useCallback((side: DeckSide, patch: Partial<DeckState>) => {
    setDecks((all) => ({ ...all, [side]: { ...all[side], ...patch } }))
  }, [])

  /** Read the live rate/tappedBpm without depending on `decks` in a callback. */
  const decksRef = useRef(decks)
  decksRef.current = decks
  const crossfaderRef = useRef(crossfader)
  crossfaderRef.current = crossfader
  /** Interval handle driving an in-flight auto-mix, 0 when idle. */
  const autoMixTimer = useRef(0)
  /** Indirection so the manual setCrossfader/setEq (defined above
   *  cancelAutoMix in this file) can still reach it. Reassigned on every
   *  render, right below where cancelAutoMix itself is defined. */
  const cancelAutoMixRef = useRef<() => void>(() => {})

  useEffect(() => {
    const offPlaying = djEngine.on('playing', (side, playing) => patchDeck(side, { playing }))
    const offEnded = djEngine.on('ended', (side) => patchDeck(side, { playing: false }))
    const offLoaded = djEngine.on('loaded', (side, duration) => patchDeck(side, { duration }))
    const offError = djEngine.on('error', (_side, message) => setNotice(message))
    return () => {
      offPlaying()
      offEnded()
      offLoaded()
      offError()
    }
  }, [patchDeck])

  const openMixer = useCallback(() => setOpen(true), [])
  const closeMixer = useCallback(() => {
    djEngine.stopAll()
    setOpen(false)
  }, [])

  const loadDeck = useCallback(
    async (side: DeckSide, track: Track, file: File) => {
      djEngine.setKeyLock(side, decksRef.current[side].keylock)
      await djEngine.load(side, track.id, file)
      patchDeck(side, {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        artKey: track.artKey,
        duration: track.duration,
        cue: 0,
        peaks: null,
      })
      const peaks = await getPeaks(track.id, file)
      // The deck may have moved on to a different track while this decoded.
      if (decksRef.current[side].trackId === track.id) patchDeck(side, { peaks })
    },
    [patchDeck]
  )

  const toggle = useCallback((side: DeckSide) => void djEngine.toggle(side), [])
  const seek = useCallback((side: DeckSide, seconds: number) => djEngine.seek(side, seconds), [])

  const setCue = useCallback(
    (side: DeckSide) => patchDeck(side, { cue: djEngine.setCue(side) }),
    [patchDeck]
  )
  const jumpToCue = useCallback((side: DeckSide) => djEngine.jumpToCue(side), [])
  const bend = useCallback((side: DeckSide, direction: -1 | 0 | 1) => djEngine.bend(side, direction), [])

  const setRate = useCallback(
    (side: DeckSide, rate: number) => {
      djEngine.setRate(side, rate)
      patchDeck(side, { rate: djEngine.getRate(side) })
    },
    [patchDeck]
  )

  const toggleKeyLock = useCallback(
    (side: DeckSide) => {
      const next = !decksRef.current[side].keylock
      djEngine.setKeyLock(side, next)
      patchDeck(side, { keylock: next })
    },
    [patchDeck]
  )

  const setTrim = useCallback(
    (side: DeckSide, db: number) => {
      djEngine.setTrim(side, db)
      patchDeck(side, { trim: db })
    },
    [patchDeck]
  )

  const setEq = useCallback(
    (side: DeckSide, band: 'low' | 'mid' | 'high', db: number) => {
      // A manual touch on the EQ during an automatic transition means the
      // user wants to drive from here — hand control back immediately
      // rather than have the automation fight the fader a moment later.
      if (autoMixTimer.current) cancelAutoMixRef.current()
      djEngine.setEq(side, band, db)
      patchDeck(side, { eq: { ...decksRef.current[side].eq, [band]: db } })
    },
    [patchDeck]
  )

  const setFilter = useCallback(
    (side: DeckSide, value: number) => {
      djEngine.setFilter(side, value)
      patchDeck(side, { filter: value })
    },
    [patchDeck]
  )

  const setFader = useCallback(
    (side: DeckSide, value: number) => {
      djEngine.setFader(side, value)
      patchDeck(side, { fader: value })
    },
    [patchDeck]
  )

  const setCrossfader = useCallback((value: number) => {
    if (autoMixTimer.current) cancelAutoMixRef.current()
    djEngine.setCrossfader(value)
    setCrossfaderState(value)
  }, [])

  const setMaster = useCallback((value: number) => {
    djEngine.setMasterVolume(value)
    setMasterState(value)
  }, [])

  /**
   * Two taps start a reading; a gap over 2s starts over rather than averaging
   * across an unrelated later tap. Keeps a short rolling window so the
   * estimate settles as you tap along rather than drifting forever.
   */
  const tapTempo = useCallback(
    (side: DeckSide) => {
      const now = performance.now()
      const arr = taps.current[side]
      if (arr.length && now - arr[arr.length - 1] > 2000) arr.length = 0
      arr.push(now)
      if (arr.length > 8) arr.shift()
      if (arr.length < 2) return
      const gaps = arr.slice(1).map((t, i) => t - arr[i])
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      patchDeck(side, { tappedBpm: Math.round((60000 / avg) * 10) / 10 })
    },
    [patchDeck]
  )

  const matchTempo = useCallback(
    (side: DeckSide) => {
      const mine = decksRef.current[side]
      const theirs = decksRef.current[other(side)]
      if (!mine.tappedBpm || !theirs.tappedBpm) {
        setNotice('Tap tempo on both decks first.')
        return
      }
      const targetBpm = theirs.tappedBpm * theirs.rate
      setRate(side, targetBpm / mine.tappedBpm)
    },
    [setRate]
  )

  const cancelAutoMix = useCallback(() => {
    if (autoMixTimer.current) {
      window.clearInterval(autoMixTimer.current)
      autoMixTimer.current = 0
    }
    setAutoMix(null)
  }, [])
  // Kept fresh every render so setCrossfader/setEq above — defined earlier
  // in the file, called far more often than this changes identity — can
  // always reach the current version without being in their own deps.
  cancelAutoMixRef.current = cancelAutoMix

  /**
   * The "clean transition" button: beatmatch if both decks have a tapped
   * BPM, then blend the crossfader across to the quiet deck on an
   * equal-power curve while swapping the low end — the outgoing bassline
   * fades out over the first two-thirds of the blend, the incoming one
   * fades in from a quarter of the way through, so the two basslines hand
   * off instead of stacking into mud in the middle of the mix. Ends with
   * the deck that finished playing.
   */
  const startAutoMix = useCallback(
    (seconds = 8) => {
      if (autoMixTimer.current) return

      const cur = crossfaderRef.current
      const from: DeckSide =
        cur !== 0.5 ? (cur < 0.5 ? 'a' : 'b') : decksRef.current.b.playing ? 'b' : 'a'
      const to = other(from)

      if (!decksRef.current[to].trackId) {
        setNotice(`Load a track on Deck ${to.toUpperCase()} first.`)
        return
      }
      if (!decksRef.current[from].trackId) {
        setNotice(`Nothing to mix from — load Deck ${from.toUpperCase()} too.`)
        return
      }

      if (decksRef.current[from].tappedBpm && decksRef.current[to].tappedBpm) {
        matchTempo(to)
      }
      if (!decksRef.current[from].playing) void djEngine.play(from)
      if (!decksRef.current[to].playing) {
        const startAt = decksRef.current[to].cue || 0
        djEngine.seek(to, startAt)
        void djEngine.play(to)
      }

      const startX = cur
      const endX = to === 'b' ? 1 : 0
      const fromStartLow = decksRef.current[from].eq.low
      const toStartLow = decksRef.current[to].eq.low
      const startTime = performance.now()
      const durMs = Math.max(1000, seconds * 1000)
      // 20 steps/sec: the audible smoothing happens in djEngine's own
      // setTargetAtTime ramps, so the control loop only needs to be smooth
      // enough for the sliders to visibly track it, not for the audio.
      const STEP_MS = 50

      setAutoMix({ from, to, progress: 0 })

      autoMixTimer.current = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - startTime) / durMs)
        const eased = t * t * (3 - 2 * t) // smoothstep

        const x = startX + (endX - startX) * eased
        djEngine.setCrossfader(x)
        setCrossfaderState(x)

        const outT = Math.min(1, t / 0.65)
        const inT = Math.max(0, Math.min(1, (t - 0.25) / 0.65))
        const outLow = fromStartLow + (EQ_MIN_DB - fromStartLow) * outT
        const inLow = toStartLow + (0 - toStartLow) * inT
        djEngine.setEq(from, 'low', outLow)
        djEngine.setEq(to, 'low', inLow)
        setDecks((all) => ({
          ...all,
          [from]: { ...all[from], eq: { ...all[from].eq, low: outLow } },
          [to]: { ...all[to], eq: { ...all[to].eq, low: inLow } },
        }))

        setAutoMix({ from, to, progress: t })

        if (t >= 1) {
          window.clearInterval(autoMixTimer.current)
          autoMixTimer.current = 0
          djEngine.pause(from)
          setAutoMix(null)
        }
      }, STEP_MS)
    },
    [matchTempo]
  )

  // A deck ending naturally mid-automix (track ran out) would otherwise
  // leave the interval driving a paused deck's fader for no one.
  useEffect(() => {
    const offEnded = djEngine.on('ended', (side) => {
      if (autoMix && side === autoMix.from) cancelAutoMix()
    })
    return offEnded
  }, [autoMix, cancelAutoMix])

  // Stop both decks if the whole DJ subsystem unmounts (app-level, never in
  // practice — DJProvider lives for the app's lifetime — but cheap to guard).
  useEffect(() => () => djEngine.stopAll(), [])

  const value = useMemo<DJValue>(
    () => ({
      open,
      openMixer,
      closeMixer,
      decks,
      loadDeck,
      toggle,
      seek,
      setCue,
      jumpToCue,
      bend,
      setRate,
      toggleKeyLock,
      setTrim,
      setEq,
      setFilter,
      setFader,
      tapTempo,
      matchTempo,
      crossfader,
      setCrossfader,
      master,
      setMaster,
      autoMix,
      startAutoMix,
      cancelAutoMix,
      notice,
      dismissNotice: () => setNotice(null),
    }),
    [
      open,
      openMixer,
      closeMixer,
      decks,
      loadDeck,
      toggle,
      seek,
      setCue,
      jumpToCue,
      bend,
      setRate,
      toggleKeyLock,
      setTrim,
      setEq,
      setFilter,
      setFader,
      tapTempo,
      matchTempo,
      crossfader,
      setCrossfader,
      master,
      setMaster,
      autoMix,
      startAutoMix,
      cancelAutoMix,
      notice,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
