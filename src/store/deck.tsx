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
import type { Playlist, RepeatMode, SavedState, ScanProgress, Track } from '../types'
import { engine } from '../lib/engine'
import { artUrl, revokeAllArt } from '../lib/art'
import { shuffled } from '../lib/format'
import {
  clearDirHandle,
  clearLibrary,
  deletePlaylist as dbDeletePlaylist,
  deleteTracks,
  getAllPlaylists,
  getAllTracks,
  getAudioFile,
  loadDirHandle,
  loadState,
  loadTheme,
  pruneArt,
  putPlaylist,
  putTracks,
  saveDirHandle,
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
} from '../lib/scan'

type Theme = 'light' | 'dark'
type LibraryStatus = 'loading' | 'empty' | 'needs-permission' | 'ready' | 'scanning'

interface DeckValue {
  /* library */
  tracks: Track[]
  byId: Map<string, Track>
  status: LibraryStatus
  progress: ScanProgress
  supported: boolean
  chooseFolder: () => Promise<void>
  grantAccess: () => Promise<void>
  rescan: () => Promise<void>
  forgetLibrary: () => Promise<void>

  /* playlists */
  playlists: Playlist[]
  createPlaylist: (name: string, trackIds?: string[]) => Promise<Playlist>
  renamePlaylist: (id: string, name: string) => Promise<void>
  removePlaylist: (id: string) => Promise<void>
  setPlaylistTracks: (id: string, trackIds: string[]) => Promise<void>
  addToPlaylist: (id: string, trackIds: string[]) => Promise<void>

  /* playback */
  current: Track | null
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  queue: string[]
  upNext: Track[]
  playNow: (trackId: string, context: string[]) => Promise<void>
  toggle: () => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void

  /* chrome */
  theme: Theme
  toggleTheme: () => void
  notice: string | null
  dismissNotice: () => void
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

export function DeckProvider({ children }: { children: ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [progress, setProgress] = useState<ScanProgress>(idle)
  const [notice, setNotice] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('dark')

  const [queue, setQueue] = useState<string[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [cursor, setCursor] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')

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

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])

  const currentIndex = order.length ? (order[cursor] ?? null) : null
  const currentId = currentIndex === null ? null : (queue[currentIndex] ?? null)
  const current = currentId ? (byId.get(currentId) ?? null) : null

  /* Mirrors, so engine callbacks always see fresh values without re-binding. */
  const live = useRef({ queue, order, cursor, repeat, shuffle, byId, current })
  live.current = { queue, order, cursor, repeat, shuffle, byId, current }

  /* ------------------------------------------------------------ startup -- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [savedTracks, savedPlaylists, savedState, savedTheme, handle] =
        await Promise.all([
          getAllTracks(),
          getAllPlaylists(),
          loadState(),
          loadTheme(),
          loadDirHandle(),
        ])
      if (cancelled) return

      setTracks(savedTracks)
      setPlaylists(savedPlaylists)

      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(savedTheme ?? (prefersDark ? 'dark' : 'light'))

      if (savedState) {
        setVolumeState(savedState.volume)
        engine.setVolume(savedState.volume)
        setShuffle(savedState.shuffle)
        setRepeat(savedState.repeat)
        pendingSeekRef.current = savedState.position
        const validQueue = savedState.queue.filter((id) =>
          savedTracks.some((t) => t.id === id)
        )
        if (validQueue.length) {
          setQueue(validQueue)
          setOrder(validQueue.map((_, i) => i))
          const idx = savedState.trackId ? validQueue.indexOf(savedState.trackId) : 0
          setCursor(Math.max(0, idx))
        }
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
          // Pick up files added outside the app since we last looked.
          if (savedTracks.length) void runScan(handle, savedTracks, true)
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
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#131316' : '#b8b3aa')
    if (restoredRef.current) void saveTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

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
      quiet: boolean
    ) => {
      if (!quiet) setStatus('scanning')
      setProgress({ ...idle, phase: 'listing' })
      try {
        const { tracks: found, removed } = await run()
        await putTracks(found)
        if (removed.length) await deleteTracks(removed)
        await pruneArt()
        setTracks(found)
        setStatus(found.length ? 'ready' : 'empty')
        if (!quiet) {
          setNotice(
            found.length
              ? `${found.length} track${found.length === 1 ? '' : 's'} in your library.`
              : 'No MP3s found in that folder.'
          )
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        console.error(err)
        setProgress((p) => ({ ...p, phase: 'error', error: String(err) }))
        setStatus(existing.length ? 'ready' : 'empty')
        setNotice('Something went wrong reading that folder.')
      } finally {
        setProgress(idle)
      }
    },
    []
  )

  const runScan = useCallback(
    (handle: FileSystemDirectoryHandle, existing: Track[], quiet = false) =>
      applyScanResult(() => scanLibrary(handle, existing, setProgress), existing, quiet),
    [applyScanResult]
  )

  const runScanFromFiles = useCallback(
    (files: File[], existing: Track[], quiet = false) =>
      applyScanResult(
        () => scanLibraryFromFiles(files, existing, setProgress),
        existing,
        quiet
      ),
    [applyScanResult]
  )

  const chooseFolder = useCallback(async () => {
    if (supportsFileSystemAccess()) {
      const handle = await pickLibraryFolder()
      if (!handle) return
      dirRef.current = handle
      fallbackFilesRef.current = null
      await saveDirHandle(handle)
      await runScan(handle, [])
      return
    }

    const files = await pickLibraryFolderFallback()
    if (!files || !files.length) return
    // Best-effort: without this, browsers are free to evict IndexedDB under
    // storage pressure, which would silently take a copied library with it.
    void navigator.storage?.persist?.()
    const cache = new Map<string, File>()
    for (const file of files) {
      const rel = (file as any).webkitRelativePath as string | undefined
      const id = (rel ? rel.split('/').slice(1) : [file.name]).join('/')
      cache.set(id, file)
    }
    fallbackFilesRef.current = cache
    dirRef.current = null
    await clearDirHandle()
    // Reuse existing library rows so relinking the same folder after a
    // reload doesn't re-parse tags/art it already has cached.
    await runScanFromFiles(files, await getAllTracks())
  }, [runScan, runScanFromFiles])

  const grantAccess = useCallback(async () => {
    const handle = dirRef.current
    if (!handle) return chooseFolder()
    const perm = await requestPermission(handle)
    if (perm !== 'granted') {
      setNotice('Access denied — DECK needs read access to play your files.')
      return
    }
    setStatus('ready')
    await runScan(handle, await getAllTracks(), true)
  }, [chooseFolder, runScan])

  const rescan = useCallback(async () => {
    const handle = dirRef.current
    if (!handle) return chooseFolder()
    if ((await queryPermission(handle)) !== 'granted') {
      if ((await requestPermission(handle)) !== 'granted') {
        setNotice('Access denied.')
        return
      }
    }
    await runScan(handle, await getAllTracks())
  }, [chooseFolder, runScan])

  const forgetLibrary = useCallback(async () => {
    engine.stop()
    await clearLibrary()
    await clearDirHandle()
    revokeAllArt()
    dirRef.current = null
    fallbackFilesRef.current = null
    setTracks([])
    setQueue([])
    setOrder([])
    setCursor(0)
    setStatus('empty')
    setNotice('Library cleared.')
  }, [])

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
        engine.stop()
        return
      }
      engine.clearPreload()
      preloadedRef.current = null
      await engine.play(track.id, file)
      if (seekTo > 0) engine.seek(seekTo)
    },
    [fileFor]
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
    setVolumeState(v)
    setMuted(v === 0)
    engine.setVolume(v)
  }, [])

  const lastVolumeRef = useRef(1)
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (m) {
        const restore = lastVolumeRef.current || 0.7
        setVolumeState(restore)
        engine.setVolume(restore)
        return false
      }
      lastVolumeRef.current = engine.volume || 1
      setVolumeState(0)
      engine.setVolume(0)
      return true
    })
  }, [])

  const toggleShuffle = useCallback(() => {
    setShuffle((on) => {
      const nowOn = !on
      const { order: ord, cursor: cur } = live.current
      if (!ord.length) return nowOn
      const currentQueueIndex = ord[cur]
      if (nowOn) {
        const rest = shuffled(
          ord.filter((_, i) => i !== cur).map((qi) => qi)
        )
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

  /* ------------------------------------------------- engine <-> queue -- */

  useEffect(() => {
    const offPlaying = engine.on('playing', setIsPlaying)

    const offNeed = engine.on('needNext', () => {
      void (async () => {
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
      if (n !== null) setCursor(n)
    })

    const offFinished = engine.on('finished', () => {
      void (async () => {
        const n = nextCursor(false)
        if (n === null) {
          engine.stop()
          setIsPlaying(false)
          return
        }
        await playCursor(n)
      })()
    })

    const offError = engine.on('error', (message) => setNotice(message))

    return () => {
      offPlaying()
      offNeed()
      offAdvanced()
      offFinished()
      offError()
    }
  }, [fileFor, nextCursor, playCursor])

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
      ['play', () => void toggle()],
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
          playbackRate: 1,
        })
      } catch {
        /* ignore */
      }
    })
  }, [])

  /* ---------------------------------------------------------- playlists -- */

  const createPlaylist = useCallback(async (name: string, trackIds: string[] = []) => {
    const p: Playlist = {
      id: `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Untitled playlist',
      trackIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await putPlaylist(p)
    setPlaylists((all) => [...all, p])
    return p
  }, [])

  const mutatePlaylist = useCallback(
    async (id: string, fn: (p: Playlist) => Playlist) => {
      let updated: Playlist | null = null
      setPlaylists((all) =>
        all.map((p) => {
          if (p.id !== id) return p
          updated = { ...fn(p), updatedAt: Date.now() }
          return updated
        })
      )
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
    (id: string, trackIds: string[]) =>
      mutatePlaylist(id, (p) => ({
        ...p,
        trackIds: [...p.trackIds, ...trackIds.filter((t) => !p.trackIds.includes(t))],
      })),
    [mutatePlaylist]
  )

  const removePlaylist = useCallback(async (id: string) => {
    await dbDeletePlaylist(id)
    setPlaylists((all) => all.filter((p) => p.id !== id))
  }, [])

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

  const value: DeckValue = {
    tracks,
    byId,
    status,
    progress,
    supported: supportsFileSystemAccess(),
    chooseFolder,
    grantAccess,
    rescan,
    forgetLibrary,

    playlists,
    createPlaylist,
    renamePlaylist,
    removePlaylist,
    setPlaylistTracks,
    addToPlaylist,

    current,
    isPlaying,
    volume,
    muted,
    shuffle,
    repeat,
    queue,
    upNext,
    playNow,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,

    theme,
    toggleTheme,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
