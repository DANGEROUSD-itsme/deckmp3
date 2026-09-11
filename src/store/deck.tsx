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
import type {
  Confirm,
  EqState,
  LoopRange,
  Playlist,
  RepeatMode,
  SavedState,
  ScanProgress,
  Settings,
  SleepTimer,
  SmartViewId,
  Toast,
  Track,
  TrackStats,
  VibeState,
} from '../types'
import { ACCENTS, EQ_PRESETS, VIBE_PRESETS, defaultSettings, emptyStats } from '../types'
import { engine } from '../lib/engine'
import { artUrl, revokeAllArt } from '../lib/art'
import { clearSwatches } from '../lib/color'
import { newId, shuffled } from '../lib/format'
import {
  clearDirHandle,
  clearLibrary,
  clearStats,
  deletePlaylist as dbDeletePlaylist,
  deleteTracks,
  getAllPlaylists,
  getAllStats,
  getAllTracks,
  getAudioFile,
  loadDirHandle,
  loadSettings,
  loadState,
  loadTheme,
  pruneArt,
  putPlaylist,
  putStats,
  putTracks,
  saveDirHandle,
  saveSettings,
  saveState,
  saveTheme,
} from '../lib/db'
import {
  pickLibraryFolder,
  pickLibraryFolderFallback,
  queryPermission,
  requestPermission,
  resolveFile,
  scanLibrary,
  scanLibraryFromFiles,
  supportsFileSystemAccess,
  type ScanMode,
} from '../lib/scan'

type Theme = 'light' | 'dark'
type LibraryStatus = 'loading' | 'empty' | 'needs-permission' | 'ready' | 'scanning'

/** Which overlay panel is up. Only one at a time, so this is a plain enum. */
export type PanelId =
  | 'none'
  | 'queue'
  | 'equalizer'
  | 'vibe'
  | 'settings'
  | 'shortcuts'
  | 'about'
  | 'stats'
  | 'palette'

interface DeckValue {
  /* library */
  tracks: Track[]
  byId: Map<string, Track>
  status: LibraryStatus
  progress: ScanProgress
  supported: boolean
  chooseFolder: () => Promise<void>
  /** Resolve a Track to a playable File — the same lookup playback uses.
   *  Consumed by the DJ mixer, which needs bytes but has no idea whether
   *  they live behind a live directory handle or copied into IndexedDB. */
  resolveFile: (track: Track) => Promise<File | null>
  grantAccess: () => Promise<void>
  rescan: () => Promise<void>
  forgetLibrary: () => Promise<void>
  importFiles: (files: File[]) => Promise<void>

  /* playlists */
  playlists: Playlist[]
  createPlaylist: (name: string, trackIds?: string[]) => Promise<Playlist>
  renamePlaylist: (id: string, name: string) => Promise<void>
  removePlaylist: (id: string) => Promise<void>
  setPlaylistTracks: (id: string, trackIds: string[]) => Promise<void>
  addToPlaylist: (id: string, trackIds: string[]) => Promise<void>
  removeFromPlaylist: (id: string, trackId: string) => Promise<void>
  duplicatePlaylist: (id: string) => Promise<void>
  saveQueueAsPlaylist: (name: string) => Promise<void>

  /* playback */
  current: Track | null
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  queue: string[]
  upNext: Track[]
  history: string[]
  playNow: (trackId: string, context: string[]) => Promise<void>
  toggle: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void

  /* queue management */
  playNext: (trackIds: string[]) => void
  addToQueue: (trackIds: string[]) => void
  removeFromQueue: (cursorIndex: number) => void
  moveInQueue: (from: number, to: number) => void
  jumpTo: (cursorIndex: number) => Promise<void>
  clearQueue: () => void
  shuffleQueue: () => void
  /** Queue in play order, paired with the cursor index each entry sits at. */
  queueEntries: { track: Track; index: number }[]
  cursor: number

  /* stats & favourites */
  stats: Map<string, TrackStats>
  statsFor: (id: string) => TrackStats
  toggleFavorite: (id: string) => void
  setRating: (id: string, rating: number) => void
  smartList: (id: SmartViewId) => Track[]
  resetStats: () => Promise<void>

  /* audio shaping */
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  setEq: (patch: Partial<EqState>) => void
  applyEqPreset: (name: string) => void
  updateVibe: (patch: Partial<VibeState>) => void
  applyVibePreset: (name: string) => void

  /* loop + sleep */
  loop: LoopRange | null
  markLoop: () => void
  clearLoop: () => void
  sleep: SleepTimer | null
  setSleep: (minutes: number | 'end-of-track' | null) => void

  /* chrome */
  theme: Theme
  toggleTheme: () => void
  notice: string | null
  dismissNotice: () => void
  toasts: Toast[]
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismissToast: (id: number) => void
  confirm: Confirm | null
  ask: (c: Confirm) => void
  closeConfirm: () => void
  panel: PanelId
  openPanel: (p: PanelId) => void
  closePanel: () => void
}

const Ctx = createContext<DeckValue | null>(null)

export function useDeck() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDeck must be used inside <DeckProvider>')
  return v
}

/** Subscribe to the playhead without re-rendering the rest of the app. */
export function usePosition() {
  const [state, setState] = useState({ position: 0, duration: 0 })
  useEffect(
    () =>
      engine.on('time', (position, duration) => {
        setState((prev) =>
          Math.abs(prev.position - position) < 0.05 && prev.duration === duration
            ? prev
            : { position, duration }
        )
      }),
    []
  )
  return state
}

const idle: ScanProgress = { phase: 'idle', found: 0, parsed: 0, file: '' }

/** Preset name -> band gains. Built once; the list itself never changes. */
const EQ_PRESET_MAP = new Map(EQ_PRESETS.map((p) => [p.name, p.bands]))
const VIBE_PRESET_MAP = new Map(VIBE_PRESETS.map((p) => [p.name, p]))

export function DeckProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [progress, setProgress] = useState<ScanProgress>(idle)
  const [notice, setNotice] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [panel, setPanel] = useState<PanelId>('none')
  const [theme, setTheme] = useState<Theme>('dark')
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [stats, setStats] = useState<Map<string, TrackStats>>(() => new Map())

  const [queue, setQueue] = useState<string[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [cursor, setCursor] = useState(0)
  const [history, setHistory] = useState<string[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [loop, setLoop] = useState<LoopRange | null>(null)
  const [sleep, setSleepState] = useState<SleepTimer | null>(null)

  const dirRef = useRef<FileSystemDirectoryHandle | null>(null)
  /**
   * Session-only file cache for the `webkitdirectory` fallback. These File
   * objects can't be persisted or re-resolved after a reload — the browser
   * gives no way to reopen an arbitrary path without the File System Access
   * API — so on relaunch the user has to reselect the folder to resume
   * playback. Tags and art already parsed stay put in IndexedDB either way.
   */
  const fallbackFilesRef = useRef<Map<string, File> | null>(null)
  /** Which queue slot the engine has sitting on its standby deck. */
  const preloadedRef = useRef<number | null>(null)
  /** Position restored from the last session, applied on first play. */
  const pendingSeekRef = useRef(0)
  const restoredRef = useRef(false)
  /** Monotonic id for toasts; a counter beats Date.now() for rapid pairs. */
  const toastSeq = useRef(0)

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])

  const currentIndex = order.length ? (order[cursor] ?? null) : null
  const currentId = currentIndex === null ? null : (queue[currentIndex] ?? null)
  const current = currentId ? (byId.get(currentId) ?? null) : null

  /* Mirrors, so engine callbacks always see fresh values without re-binding. */
  const live = useRef({ queue, order, cursor, repeat, shuffle, byId, current })
  live.current = { queue, order, cursor, repeat, shuffle, byId, current }

  /* -------------------------------------------------------------- toasts -- */

  const dismissToast = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) => {
      const id = ++toastSeq.current
      // Four is as many as fit above the transport without covering the art.
      setToasts((all) => [...all.slice(-3), { id, message, kind, action, ttl: 4200 }])
    },
    []
  )

  const ask = useCallback((c: Confirm) => setConfirm(c), [])
  const closeConfirm = useCallback(() => setConfirm(null), [])
  const openPanel = useCallback((p: PanelId) => setPanel(p), [])
  const closePanel = useCallback(() => setPanel('none'), [])

  /* ------------------------------------------------------------ startup -- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [savedTracks, savedPlaylists, savedState, savedTheme, savedSettings, savedStats, handle] =
        await Promise.all([
          getAllTracks(),
          getAllPlaylists(),
          loadState(),
          loadTheme(),
          loadSettings(),
          getAllStats(),
          loadDirHandle(),
        ])
      if (cancelled) return

      setTracks(savedTracks)
      setPlaylists(savedPlaylists)
      const statsMap = new Map(savedStats.map((s) => [s.id, s]))
      statsRef.current = statsMap
      setStats(statsMap)

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      // `theme` in settings is authoritative from V2 on; the standalone key is
      // what V1 wrote, and is still honoured so an upgrade doesn't flip modes.
      const resolved: Settings = {
        ...savedSettings,
        theme: savedSettings.theme ?? (savedTheme ?? (prefersDark ? 'dark' : 'light')),
      }
      setSettings(resolved)
      setTheme(
        resolved.theme === 'system'
          ? prefersDark
            ? 'dark'
            : 'light'
          : (resolved.theme as Theme)
      )
      engine.crossfadeTime = resolved.crossfade
      engine.smoothPause = resolved.smoothPause
      engine.setRate(resolved.rate)

      if (savedState && resolved.resumeOnLaunch) {
        setVolumeState(savedState.volume)
        engine.setVolume(savedState.volume)
        setShuffle(savedState.shuffle)
        setRepeat(savedState.repeat)
        pendingSeekRef.current = savedState.position
        const known = new Set(savedTracks.map((t) => t.id))
        const validQueue = savedState.queue.filter((id) => known.has(id))
        if (validQueue.length) {
          setQueue(validQueue)
          setOrder(validQueue.map((_, i) => i))
          const idx = savedState.trackId ? validQueue.indexOf(savedState.trackId) : 0
          setCursor(Math.max(0, idx))
        }
      } else if (savedState) {
        setVolumeState(savedState.volume)
        engine.setVolume(savedState.volume)
      }

      dirRef.current = handle
      if (!supportsFileSystemAccess()) {
        // The fallback import path copies audio bytes into IndexedDB, so
        // playback works from here without ever touching the original file
        // handle again — no reselecting needed on relaunch.
        setStatus(savedTracks.length ? 'ready' : 'empty')
      } else if (!handle) {
        setStatus(savedTracks.length ? 'ready' : 'empty')
      } else {
        const perm = await queryPermission(handle)
        if (cancelled) return
        if (perm === 'granted') {
          setStatus(savedTracks.length ? 'ready' : 'empty')
          // Pick up files added outside the app since we last looked. This
          // only re-walks the one folder DECK has a live handle for, so it
          // must merge rather than sync — otherwise every track that came
          // from a *different* folder (FSA can only hold one handle, the
          // fallback path can hold many) would look deleted and vanish.
          if (savedTracks.length) void runScan(handle, savedTracks, true, 'merge')
        } else {
          setStatus(savedTracks.length ? 'needs-permission' : 'empty')
        }
      }
      restoredRef.current = true

      // Dev-only: lets a synthetic FileSystemDirectoryHandle be injected from
      // the console so playback can be exercised without a real folder picker
      // (which requires a user gesture the test harness can't produce).
      if (import.meta.env.DEV) {
        ;(window as unknown as Record<string, unknown>).__deckSetDir = async (
          h: FileSystemDirectoryHandle,
          persist = true
        ) => {
          dirRef.current = h
          if (persist) await saveDirHandle(h)
          await runScan(h, await getAllTracks())
        }
        ;(window as unknown as Record<string, unknown>).__deckDebug = () => ({
          hasDir: !!dirRef.current,
          live: live.current,
        })
        ;(window as unknown as Record<string, unknown>).__deckPlayNow = playNow
        ;(window as unknown as Record<string, unknown>).__deckEngine = engine
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------------------------------------------------------------- theme -- */

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const accent = ACCENTS.find((a) => a.id === settings.accent) ?? ACCENTS[0]
    document.documentElement.dataset.accent = accent.id
    document.documentElement.dataset.density = settings.density
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0f0f12' : '#b8b3aa')
    if (restoredRef.current) void saveTheme(theme)
  }, [theme, settings.accent, settings.density])

  /** In 'system' mode, follow the OS as it changes rather than only at launch. */
  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setTheme(mq.matches ? 'dark' : 'light')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [settings.theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      setSettings((s) => ({ ...s, theme: next }))
      return next
    })
  }, [])

  /* ----------------------------------------------------------- settings -- */

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  // Push settings at the engine and at storage whenever they move. Doing it
  // in one effect keeps the engine and the persisted copy from ever drifting.
  useEffect(() => {
    engine.crossfadeTime = settings.crossfade
    engine.smoothPause = settings.smoothPause
    engine.setRate(settings.rate)
    engine.setPreservesPitch(settings.pitchLock)
    engine.setBalance(settings.balance)
    engine.setNightMode(settings.nightMode)
    engine.setEq(settings.eq.enabled, settings.eq.preamp, settings.eq.bands)
    engine.setVibe(settings.vibe)
    if (settings.theme !== 'system') setTheme(settings.theme)
    if (!restoredRef.current) return
    const t = window.setTimeout(() => void saveSettings(settings), 250)
    return () => window.clearTimeout(t)
  }, [settings])

  const setEq = useCallback((patch: Partial<EqState>) => {
    setSettings((s) => ({ ...s, eq: { ...s.eq, ...patch } }))
  }, [])

  const applyEqPreset = useCallback((name: string) => {
    setSettings((s) => {
      const preset = EQ_PRESET_MAP.get(name)
      if (!preset) return s
      return { ...s, eq: { ...s.eq, bands: [...preset], preset: name, enabled: true } }
    })
  }, [])

  const updateVibe = useCallback((patch: Partial<VibeState>) => {
    setSettings((s) => ({ ...s, vibe: { ...s.vibe, ...patch } }))
  }, [])

  /**
   * Unlike `applyEqPreset`, a Vibe preset also carries `rate` and
   * `pitchLock` — the whole point of "Slowed" or "Nightcore" is the tempo
   * change, which lives on `Settings` directly rather than nested under
   * `vibe` (it's the same value the Playback section's Speed slider reads).
   */
  const applyVibePreset = useCallback((name: string) => {
    setSettings((s) => {
      const preset = VIBE_PRESET_MAP.get(name)
      if (!preset) return s
      return {
        ...s,
        rate: preset.rate,
        pitchLock: preset.pitchLock,
        vibe: { ...preset.vibe, preset: name },
      }
    })
  }, [])

  /* --------------------------------------------------------- persistence -- */

  useEffect(() => {
    if (!restoredRef.current) return
    const state: SavedState = {
      trackId: currentId,
      queue,
      queueIndex: cursor,
      position: engine.position,
      volume,
      shuffle,
      repeat,
    }
    const t = window.setTimeout(() => void saveState(state), 400)
    return () => window.clearTimeout(t)
  }, [currentId, queue, cursor, volume, shuffle, repeat])

  // Also capture the playhead when the app is backgrounded or closed.
  useEffect(() => {
    const persist = () => {
      if (!restoredRef.current) return
      void saveState({
        trackId: live.current.current?.id ?? null,
        queue: live.current.queue,
        queueIndex: live.current.cursor,
        position: engine.position,
        volume: engine.volume,
        shuffle: live.current.shuffle,
        repeat: live.current.repeat,
      })
    }
    document.addEventListener('visibilitychange', persist)
    window.addEventListener('pagehide', persist)
    return () => {
      document.removeEventListener('visibilitychange', persist)
      window.removeEventListener('pagehide', persist)
    }
  }, [])

  /* ------------------------------------------------------------ scanning -- */

  const applyScanResult = useCallback(
    async (
      run: () => Promise<{ tracks: Track[]; removed: string[] }>,
      existing: Track[],
      quiet: boolean,
      mode: ScanMode
    ) => {
      if (!quiet) setStatus('scanning')
      setProgress({ ...idle, phase: 'listing' })
      try {
        const { tracks: found, removed } = await run()
        await putTracks(found)
        if (removed.length) await deleteTracks(removed)
        await pruneArt()
        // 'merge' scans only cover the folder just picked — fold its results
        // into the full library instead of replacing it, so tracks from
        // folders added earlier stick around.
        const merged =
          mode === 'merge'
            ? [...existing.filter((t) => !found.some((f) => f.id === t.id)), ...found]
            : found
        setTracks(merged)
        setStatus(merged.length ? 'ready' : 'empty')
        if (!quiet) {
          const msg = found.length
            ? `${found.length} track${found.length === 1 ? '' : 's'} added.`
            : 'No MP3s found in that folder.'
          setNotice(msg)
          toast(msg, found.length ? 'success' : 'info')
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        console.error(err)
        setProgress((p) => ({ ...p, phase: 'error', error: String(err) }))
        setStatus(existing.length ? 'ready' : 'empty')
        setNotice('Something went wrong reading that folder.')
        toast('Something went wrong reading that folder.', 'error')
      } finally {
        setProgress(idle)
      }
    },
    [toast]
  )

  const runScan = useCallback(
    (
      handle: FileSystemDirectoryHandle,
      existing: Track[],
      quiet = false,
      mode: ScanMode = 'sync'
    ) =>
      applyScanResult(
        () => scanLibrary(handle, existing, setProgress, undefined, mode),
        existing,
        quiet,
        mode
      ),
    [applyScanResult]
  )

  const runScanFromFiles = useCallback(
    (files: File[], existing: Track[], quiet = false, mode: ScanMode = 'sync') =>
      applyScanResult(
        () => scanLibraryFromFiles(files, existing, setProgress, undefined, mode),
        existing,
        quiet,
        mode
      ),
    [applyScanResult]
  )

  /** Remember dropped/picked File objects so this session can play them. */
  const cacheFiles = useCallback((files: File[]) => {
    const cache = fallbackFilesRef.current ?? new Map<string, File>()
    for (const file of files) {
      const rel = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath
      const id = (rel ? rel.split('/').slice(1) : [file.name]).join('/')
      cache.set(id, file)
    }
    fallbackFilesRef.current = cache
  }, [])

  /**
   * Picking a folder always adds to the library rather than replacing it —
   * `mode: 'merge'` on the scan is what keeps tracks from folders chosen
   * earlier in the session. Note that FSA mode can only hold one live
   * directory handle at a time, so playing a track from an *earlier* FSA
   * folder after picking a *different* one won't resolve until that folder
   * is re-picked — the fallback path doesn't have this limitation, since it
   * copies bytes into IndexedDB per track instead of relying on a handle.
   */
  const chooseFolder = useCallback(async () => {
    if (supportsFileSystemAccess()) {
      const handle = await pickLibraryFolder()
      if (!handle) return
      dirRef.current = handle
      await saveDirHandle(handle)
      await runScan(handle, await getAllTracks(), false, 'merge')
      return
    }

    const files = await pickLibraryFolderFallback()
    if (!files || !files.length) return
    // Best-effort: without this, browsers are free to evict IndexedDB under
    // storage pressure, which would silently take a copied library with it.
    void navigator.storage?.persist?.()
    cacheFiles(files)
    dirRef.current = null
    await clearDirHandle()
    // Reuse existing library rows so relinking a previously-picked folder
    // doesn't re-parse tags/art it already has cached.
    await runScanFromFiles(files, await getAllTracks(), false, 'merge')
  }, [cacheFiles, runScan, runScanFromFiles])

  /**
   * Drag-and-drop import. Always takes the copy-into-IndexedDB path, because
   * a dropped File has no directory handle behind it to re-resolve later.
   */
  const importFiles = useCallback(
    async (files: File[]) => {
      const audio = files.filter((f) => /\.mp3$/i.test(f.name))
      if (!audio.length) {
        toast('Those weren’t MP3s.', 'error')
        return
      }
      void navigator.storage?.persist?.()
      cacheFiles(audio)
      await runScanFromFiles(audio, await getAllTracks(), false, 'merge')
    },
    [cacheFiles, runScanFromFiles, toast]
  )

  const grantAccess = useCallback(async () => {
    const handle = dirRef.current
    if (!handle) return chooseFolder()
    const perm = await requestPermission(handle)
    if (perm !== 'granted') {
      setNotice('Access denied — DECK needs read access to play your files.')
      toast('Access denied — DECK needs read access.', 'error')
      return
    }
    setStatus('ready')
    await runScan(handle, await getAllTracks(), true)
    toast('Library reconnected.', 'success')
  }, [chooseFolder, runScan, toast])

  const rescan = useCallback(async () => {
    const handle = dirRef.current
    if (!handle) return chooseFolder()
    if ((await queryPermission(handle)) !== 'granted') {
      if ((await requestPermission(handle)) !== 'granted') {
        setNotice('Access denied.')
        toast('Access denied.', 'error')
        return
      }
    }
    await runScan(handle, await getAllTracks())
  }, [chooseFolder, runScan, toast])

  const forgetLibrary = useCallback(async () => {
    engine.stop()
    await clearLibrary()
    await clearDirHandle()
    revokeAllArt()
    clearSwatches()
    dirRef.current = null
    fallbackFilesRef.current = null
    setTracks([])
    setQueue([])
    setOrder([])
    setCursor(0)
    setHistory([])
    setStatus('empty')
    setNotice('Library cleared.')
    toast('Library cleared. Listening history was kept.', 'info')
  }, [toast])

  /* ----------------------------------------------------------- playback -- */

  const fileFor = useCallback(async (track: Track) => {
    const cached = fallbackFilesRef.current?.get(track.id)
    if (cached) return cached
    const root = dirRef.current
    if (root) {
      const resolved = await resolveFile(root, track.path)
      if (resolved) return resolved
    }
    // Fallback mode persists bytes to IndexedDB on import, so this is the
    // common path on every relaunch once the browser lacks a live handle.
    return getAudioFile(track.id)
  }, [])

  /** Where the playhead goes after `cursor`, honouring repeat. */
  const nextCursor = useCallback((manual: boolean) => {
    const { order: ord, cursor: cur, repeat: rep } = live.current
    if (!ord.length) return null
    if (rep === 'one' && !manual) return cur
    if (cur + 1 < ord.length) return cur + 1
    if (rep === 'all') return 0
    return null
  }, [])

  /* --------------------------------------------------------------- stats -- */

  /**
   * A mirror of `stats`, so a mutation can read the current row without the
   * caller having to depend on the whole map (which changes on every play and
   * would re-bind every callback that touches history).
   */
  const statsRef = useRef(stats)
  statsRef.current = stats

  const statsFor = useCallback(
    (id: string) => stats.get(id) ?? emptyStats(id),
    [stats]
  )

  /**
   * Read-modify-write on one stats row. The new row is computed *outside* the
   * state updater: React is free to run an updater more than once, and an
   * IndexedDB write is not something to repeat.
   */
  const mutateStats = useCallback(
    (id: string, fn: (s: TrackStats) => TrackStats) => {
      const updated = fn(statsRef.current.get(id) ?? emptyStats(id))
      const next = new Map(statsRef.current)
      next.set(id, updated)
      statsRef.current = next
      setStats(next)
      void putStats(updated)
      return updated
    },
    []
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      const updated = mutateStats(id, (s) => ({ ...s, favorite: !s.favorite }))
      toast(updated.favorite ? 'Added to favourites.' : 'Removed from favourites.', 'success')
    },
    [mutateStats, toast]
  )

  const setRating = useCallback(
    (id: string, rating: number) => {
      mutateStats(id, (s) => ({ ...s, rating: s.rating === rating ? 0 : rating }))
    },
    [mutateStats]
  )

  const resetStats = useCallback(async () => {
    await clearStats()
    statsRef.current = new Map()
    setStats(new Map())
    toast('Listening history cleared.', 'info')
  }, [toast])

  /**
   * Count a play once the listener has actually stayed with the track. The
   * threshold is a setting because "what counts as a play" is genuinely a
   * matter of taste — 20 seconds by default, the scrobbler convention.
   */
  const scrobbleRef = useRef<{ id: string; at: number } | null>(null)

  /* ---------------------------------------------------------- transport -- */

  /**
   * Move the playhead to `nextCur` and start playback there. The cursor is
   * updated up front — the UI should show what's *selected* even while the
   * file is still being resolved — and rolled back only if the track truly
   * can't be found, so "current" never drifts out of sync with queue/order.
   */
  const playCursor = useCallback(
    async (nextCur: number, seekTo = 0) => {
      const { order: ord, queue: q, byId: map } = live.current
      const qi = ord[nextCur]
      const track = qi === undefined ? null : map.get(q[qi] ?? '')
      if (!track) return

      setCursor(nextCur)
      live.current = { ...live.current, cursor: nextCur }

      const file = await fileFor(track)
      if (!file) {
        setNotice(`Missing file: ${track.title}`)
        toast(`Missing file: ${track.title}`, 'error')
        engine.stop()
        return
      }
      engine.clearPreload()
      preloadedRef.current = null
      setLoop(null)
      await engine.play(track.id, file)
      if (seekTo > 0) engine.seek(seekTo)
      scrobbleRef.current = { id: track.id, at: performance.now() }
      setHistory((h) => (h[h.length - 1] === track.id ? h : [...h.slice(-49), track.id]))
    },
    [fileFor, toast]
  )

  const playNow = useCallback(
    async (trackId: string, context: string[]) => {
      const ctxIds = context.length ? context : [trackId]
      const startIndex = Math.max(0, ctxIds.indexOf(trackId))
      const ord = shuffle
        ? [startIndex, ...shuffled(ctxIds.map((_, i) => i).filter((i) => i !== startIndex))]
        : ctxIds.map((_, i) => i)
      const startCursor = shuffle ? 0 : startIndex

      // Queue, order, and cursor must land together — never let `current`
      // be derived from an old cursor paired with a brand-new order array.
      setQueue(ctxIds)
      setOrder(ord)
      setCursor(startCursor)
      live.current = { ...live.current, queue: ctxIds, order: ord, cursor: startCursor }
      pendingSeekRef.current = 0
      await playCursor(startCursor)
    },
    [playCursor, shuffle]
  )

  const toggle = useCallback(async () => {
    // Resuming a session restored from disk: nothing is loaded yet.
    if (!engine.isPlaying && !engine.duration && live.current.current) {
      const seekTo = pendingSeekRef.current
      pendingSeekRef.current = 0
      await playCursor(live.current.cursor, seekTo)
      return
    }
    await engine.toggle()
  }, [playCursor])

  const next = useCallback(async () => {
    const n = nextCursor(true)
    if (n === null) {
      engine.stop()
      setIsPlaying(false)
      return
    }
    await playCursor(n)
  }, [nextCursor, playCursor])

  const prev = useCallback(async () => {
    // Same as every physical transport: first press restarts the track.
    if (engine.position > 3) {
      engine.seek(0)
      return
    }
    const { cursor: cur, order: ord, repeat: rep } = live.current
    const p = cur > 0 ? cur - 1 : rep === 'all' ? ord.length - 1 : 0
    await playCursor(p)
  }, [playCursor])

  const seek = useCallback((seconds: number) => engine.seek(seconds), [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolumeState(clamped)
    setMuted(clamped === 0)
    engine.setVolume(clamped)
  }, [])

  /** The level to come back to when unmuting. Never allowed to be 0. */
  const lastVolumeRef = useRef(1)

  const toggleMute = useCallback(() => {
    // Side effects live here rather than inside the state updater: React may
    // run an updater more than once, and muting twice would stash 0 as the
    // level to restore.
    if (muted || volume === 0) {
      const restore = lastVolumeRef.current || 0.7
      setMuted(false)
      setVolumeState(restore)
      engine.setVolume(restore)
    } else {
      lastVolumeRef.current = volume || 1
      setMuted(true)
      setVolumeState(0)
      engine.setVolume(0)
    }
  }, [muted, volume])

  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const nowOn = !on
      const { order: ord, cursor: cur } = live.current
      if (!ord.length) return nowOn
      const currentQueueIndex = ord[cur]
      if (nowOn) {
        const rest = shuffled(ord.filter((_, i) => i !== cur))
        const newOrder = [currentQueueIndex, ...rest]
        setOrder(newOrder)
        setCursor(0)
        live.current = { ...live.current, order: newOrder, cursor: 0 }
      } else {
        const newOrder = live.current.queue.map((_, i) => i)
        setOrder(newOrder)
        setCursor(currentQueueIndex)
        live.current = { ...live.current, order: newOrder, cursor: currentQueueIndex }
      }
      engine.clearPreload()
      preloadedRef.current = null
      return nowOn
    })
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
    engine.clearPreload()
    preloadedRef.current = null
  }, [])

  /* ------------------------------------------------------ queue editing -- */

  /**
   * All four queue editors work on `order` (play order) rather than `queue`
   * (insertion order), because that is what the user is looking at in the
   * queue panel. `queue` only ever grows; `order` is the real playlist.
   */

  const insertAt = useCallback(
    (trackIds: string[], at: number) => {
      if (!trackIds.length) return
      const { queue: q, order: ord } = live.current
      const newQueue = [...q, ...trackIds]
      const newIndices = trackIds.map((_, i) => q.length + i)
      const newOrder = [...ord.slice(0, at), ...newIndices, ...ord.slice(at)]
      setQueue(newQueue)
      setOrder(newOrder)
      live.current = { ...live.current, queue: newQueue, order: newOrder }
      engine.clearPreload()
      preloadedRef.current = null
    },
    []
  )

  const playNext = useCallback(
    (trackIds: string[]) => {
      if (!live.current.order.length) {
        void playNow(trackIds[0], trackIds)
        return
      }
      insertAt(trackIds, live.current.cursor + 1)
      toast(
        trackIds.length === 1 ? 'Playing next.' : `${trackIds.length} tracks play next.`,
        'success'
      )
    },
    [insertAt, playNow, toast]
  )

  const addToQueue = useCallback(
    (trackIds: string[]) => {
      if (!live.current.order.length) {
        void playNow(trackIds[0], trackIds)
        return
      }
      insertAt(trackIds, live.current.order.length)
      toast(
        trackIds.length === 1 ? 'Added to queue.' : `${trackIds.length} tracks queued.`,
        'success'
      )
    },
    [insertAt, playNow, toast]
  )

  const removeFromQueue = useCallback((cursorIndex: number) => {
    const { order: ord, cursor: cur } = live.current
    if (cursorIndex < 0 || cursorIndex >= ord.length) return
    const newOrder = ord.filter((_, i) => i !== cursorIndex)
    // Removing something before the playhead shifts the playhead back by one
    // so the same track stays current.
    const newCursor = cursorIndex < cur ? cur - 1 : Math.min(cur, newOrder.length - 1)
    setOrder(newOrder)
    setCursor(Math.max(0, newCursor))
    live.current = { ...live.current, order: newOrder, cursor: Math.max(0, newCursor) }
    engine.clearPreload()
    preloadedRef.current = null
  }, [])

  const moveInQueue = useCallback((from: number, to: number) => {
    const { order: ord, cursor: cur } = live.current
    if (from === to || from < 0 || to < 0 || from >= ord.length || to >= ord.length) return
    const newOrder = [...ord]
    const [moved] = newOrder.splice(from, 1)
    newOrder.splice(to, 0, moved)
    // Follow the currently-playing entry to wherever it ended up.
    let newCursor = cur
    if (from === cur) newCursor = to
    else if (from < cur && to >= cur) newCursor = cur - 1
    else if (from > cur && to <= cur) newCursor = cur + 1
    setOrder(newOrder)
    setCursor(newCursor)
    live.current = { ...live.current, order: newOrder, cursor: newCursor }
    engine.clearPreload()
    preloadedRef.current = null
  }, [])

  const jumpTo = useCallback(
    (cursorIndex: number) => playCursor(cursorIndex),
    [playCursor]
  )

  const clearQueue = useCallback(() => {
    // Everything after the playhead goes; what's playing keeps playing.
    const { order: ord, cursor: cur } = live.current
    const newOrder = ord.slice(0, cur + 1)
    setOrder(newOrder)
    live.current = { ...live.current, order: newOrder }
    engine.clearPreload()
    preloadedRef.current = null
    toast('Queue cleared after the current track.', 'info')
  }, [toast])

  const shuffleQueue = useCallback(() => {
    const { order: ord, cursor: cur } = live.current
    if (ord.length < 3) return
    const head = ord.slice(0, cur + 1)
    const tail = shuffled(ord.slice(cur + 1))
    const newOrder = [...head, ...tail]
    setOrder(newOrder)
    live.current = { ...live.current, order: newOrder }
    engine.clearPreload()
    preloadedRef.current = null
    toast('Up next reshuffled.', 'success')
  }, [toast])

  /* --------------------------------------------------------------- loop -- */

  const markLoop = useCallback(() => {
    const marked = engine.markLoop()
    if (!marked) return
    setLoop(marked)
    toast(
      marked.b === null ? 'Loop start set — press again for the end.' : 'A↔B loop armed.',
      'success'
    )
  }, [toast])

  const clearLoop = useCallback(() => {
    engine.clearLoop()
    setLoop(null)
  }, [])

  /* -------------------------------------------------------- sleep timer -- */

  const setSleep = useCallback(
    (minutes: number | 'end-of-track' | null) => {
      if (minutes === null) {
        setSleepState(null)
        toast('Sleep timer off.', 'info')
        return
      }
      if (minutes === 'end-of-track') {
        setSleepState({ endsAt: null, endOfTrack: true, minutes: 0 })
        toast('Stopping at the end of this track.', 'success')
        return
      }
      setSleepState({
        endsAt: Date.now() + minutes * 60_000,
        endOfTrack: false,
        minutes,
      })
      toast(`Sleeping in ${minutes} minutes.`, 'success')
    },
    [toast]
  )

  useEffect(() => {
    if (!sleep?.endsAt) return
    const tick = window.setInterval(() => {
      if (!sleep.endsAt || Date.now() < sleep.endsAt) return
      void engine.setPlaying(false)
      setSleepState(null)
      toast('Sleep timer — goodnight.', 'info')
    }, 1000)
    return () => window.clearInterval(tick)
  }, [sleep, toast])

  /* ------------------------------------------------- engine <-> queue -- */

  useEffect(() => {
    const offPlaying = engine.on('playing', setIsPlaying)

    const offNeed = engine.on('needNext', () => {
      void (async () => {
        // End-of-track sleep means: don't line anything up behind this one.
        if (sleepEndOfTrackRef.current) return
        const n = nextCursor(false)
        if (n === null) return
        const { order: ord, queue: q, byId: map } = live.current
        const track = map.get(q[ord[n]] ?? '')
        if (!track) return
        const file = await fileFor(track)
        if (!file) return
        preloadedRef.current = n
        engine.preload(track.id, file)
      })()
    })

    const offAdvanced = engine.on('advanced', () => {
      const n = preloadedRef.current
      preloadedRef.current = null
      if (n !== null) {
        setCursor(n)
        const { order: ord, queue: q } = live.current
        const id = q[ord[n] ?? -1]
        if (id) {
          scrobbleRef.current = { id, at: performance.now() }
          setHistory((h) => (h[h.length - 1] === id ? h : [...h.slice(-49), id]))
        }
      }
    })

    const offFinished = engine.on('finished', () => {
      void (async () => {
        if (sleepEndOfTrackRef.current) {
          engine.stop()
          setIsPlaying(false)
          setSleepState(null)
          return
        }
        const n = nextCursor(false)
        if (n === null) {
          engine.stop()
          setIsPlaying(false)
          return
        }
        await playCursor(n)
      })()
    })

    const offError = engine.on('error', (message) => {
      setNotice(message)
      toast(message, 'error')
    })

    return () => {
      offPlaying()
      offNeed()
      offAdvanced()
      offFinished()
      offError()
    }
  }, [fileFor, nextCursor, playCursor, toast])

  /** Read inside engine callbacks, which mustn't re-bind on every timer tick. */
  const sleepEndOfTrackRef = useRef(false)
  sleepEndOfTrackRef.current = !!sleep?.endOfTrack

  /* ------------------------------------------------- play counting -- */

  useEffect(() => {
    // A play is banked once the listener stays past the threshold. Checking on
    // a one-second interval rather than per frame keeps this off the hot path.
    const timer = window.setInterval(() => {
      const pending = scrobbleRef.current
      if (!pending || !engine.isPlaying) return
      if (engine.currentTrackId !== pending.id) return
      if (engine.position < settings.scrobbleAt) return
      scrobbleRef.current = null
      mutateStats(pending.id, (s) => ({
        ...s,
        plays: s.plays + 1,
        lastPlayed: Date.now(),
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mutateStats, settings.scrobbleAt])

  /* ------------------------------------------------------ media session -- */

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (!current) {
      ms.metadata = null
      ms.playbackState = 'none'
      return
    }
    let cancelled = false
    void (async () => {
      const art = await artUrl(current.artKey)
      if (cancelled) return
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: art
          ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }]
          : undefined,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [current])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      // The OS says "play", so play — `toggle` would pause a playing deck if
      // the two ever disagreed about state.
      ['play', () => void (engine.duration ? engine.setPlaying(true) : toggle())],
      ['pause', () => void engine.setPlaying(false)],
      ['nexttrack', () => void next()],
      ['previoustrack', () => void prev()],
      ['stop', () => engine.stop()],
      ['seekbackward', (d) => engine.seek(engine.position - (d.seekOffset ?? 10))],
      ['seekforward', (d) => engine.seek(engine.position + (d.seekOffset ?? 10))],
      ['seekto', (d) => d.seekTime != null && engine.seek(d.seekTime)],
    ]
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn)
      } catch {
        // Not every action is supported on every platform.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null)
        } catch {
          /* ignore */
        }
      }
    }
  }, [next, prev, toggle])

  // Keep the OS scrubber in step, but only about once a second.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState)
      return
    let last = 0
    return engine.on('time', (position, duration) => {
      const now = performance.now()
      if (now - last < 900 || !Number.isFinite(duration) || duration <= 0) return
      last = now
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(position, duration),
          playbackRate: engine.playbackRate,
        })
      } catch {
        /* ignore */
      }
    })
  }, [])

  /* ---------------------------------------------------------- playlists -- */

  const createPlaylist = useCallback(async (name: string, trackIds: string[] = []) => {
    const p: Playlist = {
      id: newId('pl'),
      name: name.trim() || 'Untitled playlist',
      trackIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await putPlaylist(p)
    setPlaylists((all) => [...all, p])
    return p
  }, [])

  /**
   * Playlist edits go through here so every one of them persists. The updated
   * row is computed outside the state updater — a React updater can run more
   * than once, and an IndexedDB write is not something to do twice.
   */
  const mutatePlaylist = useCallback(
    async (id: string, fn: (p: Playlist) => Playlist) => {
      let updated: Playlist | null = null
      setPlaylists((all) => {
        const found = all.find((p) => p.id === id)
        if (!found) return all
        updated = { ...fn(found), updatedAt: Date.now() }
        return all.map((p) => (p.id === id ? (updated as Playlist) : p))
      })
      if (updated) await putPlaylist(updated)
    },
    []
  )

  const renamePlaylist = useCallback(
    (id: string, name: string) =>
      mutatePlaylist(id, (p) => ({ ...p, name: name.trim() || p.name })),
    [mutatePlaylist]
  )

  const setPlaylistTracks = useCallback(
    (id: string, trackIds: string[]) =>
      mutatePlaylist(id, (p) => ({ ...p, trackIds })),
    [mutatePlaylist]
  )

  const addToPlaylist = useCallback(
    async (id: string, trackIds: string[]) => {
      await mutatePlaylist(id, (p) => ({
        ...p,
        trackIds: [...p.trackIds, ...trackIds.filter((t) => !p.trackIds.includes(t))],
      }))
      const name = playlists.find((p) => p.id === id)?.name ?? 'playlist'
      toast(`Added to ${name}.`, 'success')
    },
    [mutatePlaylist, playlists, toast]
  )

  const removeFromPlaylist = useCallback(
    (id: string, trackId: string) =>
      mutatePlaylist(id, (p) => ({
        ...p,
        trackIds: p.trackIds.filter((t) => t !== trackId),
      })),
    [mutatePlaylist]
  )

  const removePlaylist = useCallback(
    async (id: string) => {
      await dbDeletePlaylist(id)
      setPlaylists((all) => all.filter((p) => p.id !== id))
    },
    []
  )

  const duplicatePlaylist = useCallback(
    async (id: string) => {
      const source = playlists.find((p) => p.id === id)
      if (!source) return
      await createPlaylist(`${source.name} copy`, [...source.trackIds])
      toast(`Duplicated “${source.name}”.`, 'success')
    },
    [createPlaylist, playlists, toast]
  )

  const saveQueueAsPlaylist = useCallback(
    async (name: string) => {
      const ids = order.map((qi) => queue[qi]).filter(Boolean)
      if (!ids.length) {
        toast('Nothing in the queue to save.', 'error')
        return
      }
      await createPlaylist(name, ids)
      toast(`Saved ${ids.length} tracks as “${name}”.`, 'success')
    },
    [createPlaylist, order, queue, toast]
  )

  /* ------------------------------------------------------------- derived -- */

  const upNext = useMemo(() => {
    const out: Track[] = []
    for (let i = cursor + 1; i < order.length && out.length < 40; i++) {
      const t = byId.get(queue[order[i]] ?? '')
      if (t) out.push(t)
    }
    if (repeat === 'all' && out.length < 40) {
      for (let i = 0; i < cursor && out.length < 40; i++) {
        const t = byId.get(queue[order[i]] ?? '')
        if (t) out.push(t)
      }
    }
    return out
  }, [byId, cursor, order, queue, repeat])

  /** The whole queue in play order, each entry tagged with its cursor slot. */
  const queueEntries = useMemo(() => {
    const out: { track: Track; index: number }[] = []
    for (let i = 0; i < order.length; i++) {
      const t = byId.get(queue[order[i]] ?? '')
      if (t) out.push({ track: t, index: i })
    }
    return out
  }, [byId, order, queue])

  /** The sidebar's computed lists. Recomputed only when stats or tracks move. */
  const smartList = useCallback(
    (id: SmartViewId): Track[] => {
      const withStats = (t: Track) => stats.get(t.id)
      switch (id) {
        case 'recent':
          return [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 200)
        case 'favorites':
          return tracks.filter((t) => withStats(t)?.favorite)
        case 'mostPlayed':
          return tracks
            .filter((t) => (withStats(t)?.plays ?? 0) > 0)
            .sort((a, b) => (withStats(b)?.plays ?? 0) - (withStats(a)?.plays ?? 0))
            .slice(0, 200)
        case 'lastPlayed':
          return tracks
            .filter((t) => (withStats(t)?.lastPlayed ?? 0) > 0)
            .sort((a, b) => (withStats(b)?.lastPlayed ?? 0) - (withStats(a)?.lastPlayed ?? 0))
            .slice(0, 200)
        case 'top-rated':
          return tracks
            .filter((t) => (withStats(t)?.rating ?? 0) >= 4)
            .sort((a, b) => (withStats(b)?.rating ?? 0) - (withStats(a)?.rating ?? 0))
        case 'neverPlayed':
          // Deterministic order on purpose: this list is derived on every
          // render, and a fresh shuffle each time would make it unusable.
          return tracks
            .filter((t) => !(withStats(t)?.plays ?? 0))
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, 200)
        default:
          return tracks
      }
    },
    [stats, tracks]
  )

  const value: DeckValue = {
    tracks,
    byId,
    status,
    progress,
    supported: supportsFileSystemAccess(),
    chooseFolder,
    resolveFile: fileFor,
    grantAccess,
    rescan,
    forgetLibrary,
    importFiles,

    playlists,
    createPlaylist,
    renamePlaylist,
    removePlaylist,
    setPlaylistTracks,
    addToPlaylist,
    removeFromPlaylist,
    duplicatePlaylist,
    saveQueueAsPlaylist,

    current,
    isPlaying,
    volume,
    muted,
    shuffle,
    repeat,
    queue,
    upNext,
    history,
    playNow,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,

    playNext,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    jumpTo,
    clearQueue,
    shuffleQueue,
    queueEntries,
    cursor,

    stats,
    statsFor,
    toggleFavorite,
    setRating,
    smartList,
    resetStats,

    settings,
    updateSettings,
    setEq,
    applyEqPreset,
    updateVibe,
    applyVibePreset,

    loop,
    markLoop,
    clearLoop,
    sleep,
    setSleep,

    theme,
    toggleTheme,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    toasts,
    toast,
    dismissToast,
    confirm,
    ask,
    closeConfirm,
    panel,
    openPanel,
    closePanel,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
