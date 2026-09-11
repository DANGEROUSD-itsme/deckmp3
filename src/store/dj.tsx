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
import { djEngine, type DeckSide } from '../lib/djEngine'
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

  /** Rolling tap timestamps per deck, for tap-tempo. Not rendered directly. */
  const taps = useRef<Record<DeckSide, number[]>>({ a: [], b: [] })

  const patchDeck = useCallback((side: DeckSide, patch: Partial<DeckState>) => {
    setDecks((all) => ({ ...all, [side]: { ...all[side], ...patch } }))
  }, [])

  /** Read the live rate/tappedBpm without depending on `decks` in a callback. */
  const decksRef = useRef(decks)
  decksRef.current = decks

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
      notice,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
