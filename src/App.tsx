import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DeckProvider, useDeck } from './store/deck'
import { DJProvider, useDJ } from './store/dj'
import { engine } from './lib/engine'
import { Sidebar, type View } from './components/Sidebar'
import { LibraryView } from './components/LibraryView'
import { PlaylistView } from './components/PlaylistView'
import { TransportBar } from './components/TransportBar'
import { NowPlaying } from './components/NowPlaying'
import { ReconnectBanner } from './components/EmptyLibrary'
import { TrackMenuProvider } from './components/ContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { QueueView } from './components/QueueView'
import { EqualizerPanel } from './components/EqualizerPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { ShortcutsOverlay } from './components/ShortcutsOverlay'
import { AboutPanel } from './components/AboutPanel'
import { StatsPanel } from './components/StatsPanel'
import { TrackInfoModal } from './components/TrackInfoModal'
import { Toasts } from './components/Toasts'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DJMixer } from './components/dj/DJMixer'
import { UploadIcon } from './components/icons'

/**
 * Global shortcuts.
 *
 * Two rules keep these from fighting the rest of the UI:
 *   1. They stand down entirely while a text field has focus.
 *   2. Space and Enter stand down when a button or link has focus, because
 *      the browser is already going to activate it — otherwise focusing the
 *      play button and pressing Space toggled playback twice.
 */
function useKeyboardShortcuts(
  onOpenNowPlaying: () => void,
  onToggleTheme: () => void,
  onOpenDJ: () => void
) {
  const {
    toggle,
    next,
    prev,
    seek,
    setVolume,
    volume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    openPanel,
    closePanel,
    panel,
    current,
    toggleFavorite,
    markLoop,
  } = useDeck()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable
      ) {
        return
      }

      // ⌘K / Ctrl+K reaches the palette from anywhere, including a field.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPanel(panel === 'palette' ? 'none' : 'palette')
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const onControl =
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.getAttribute('role') === 'button' ||
        target.getAttribute('role') === 'slider'

      switch (e.code) {
        case 'Space':
          // The browser will already click a focused control.
          if (onControl) return
          e.preventDefault()
          void toggle()
          break
        case 'ArrowRight':
          if (onControl) return
          e.preventDefault()
          if (e.shiftKey) void next()
          else seek(engine.position + 5)
          break
        case 'ArrowLeft':
          if (onControl) return
          e.preventDefault()
          if (e.shiftKey) void prev()
          else seek(engine.position - 5)
          break
        case 'ArrowUp':
          if (onControl) return
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.05))
          break
        case 'ArrowDown':
          if (onControl) return
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.05))
          break
        case 'KeyM':
          toggleMute()
          break
        case 'KeyN':
          onOpenNowPlaying()
          break
        case 'KeyS':
          toggleShuffle()
          break
        case 'KeyR':
          cycleRepeat()
          break
        case 'KeyL':
          markLoop()
          break
        case 'KeyQ':
          openPanel(panel === 'queue' ? 'none' : 'queue')
          break
        case 'KeyE':
          openPanel(panel === 'equalizer' ? 'none' : 'equalizer')
          break
        case 'KeyD':
          onOpenDJ()
          break
        case 'KeyT':
          onToggleTheme()
          break
        case 'KeyF':
          if (current) toggleFavorite(current.id)
          break
        case 'Escape':
          if (panel !== 'none') closePanel()
          break
        default:
          // 0–9 jump to that tenth of the track: 0 restarts, 5 is halfway.
          if (/^Digit[0-9]$/.test(e.code)) {
            const tenth = Number(e.code.slice(5))
            if (engine.duration) {
              e.preventDefault()
              seek((engine.duration * tenth) / 10)
            }
          } else if (e.key === '?') {
            openPanel(panel === 'shortcuts' ? 'none' : 'shortcuts')
          }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    closePanel,
    current,
    cycleRepeat,
    markLoop,
    next,
    onOpenDJ,
    onOpenNowPlaying,
    onToggleTheme,
    openPanel,
    panel,
    prev,
    seek,
    setVolume,
    toggle,
    toggleFavorite,
    toggleMute,
    toggleShuffle,
    volume,
  ])
}

/**
 * The v1 notice. Kept because the store still raises it and because a
 * screen-reader user benefits from the polite live region; the toast stack
 * carries the same message with more presence.
 */
function Notice() {
  const { notice, dismissNotice } = useDeck()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(dismissNotice, 4000)
    return () => clearTimeout(t)
  }, [notice, dismissNotice])

  return (
    <div className="sr-only" role="status" aria-live="polite">
      {notice}
    </div>
  )
}

function ScanBanner() {
  const { progress, status } = useDeck()
  if (status !== 'scanning' || progress.phase === 'idle') return null
  const pct = progress.found ? Math.min(100, (progress.parsed / progress.found) * 100) : 0
  return (
    <div className="shrink-0 bg-surface border-b border-line px-5 py-1.5 flex items-center gap-3 text-xs">
      <span className="label !text-[10px]">
        {progress.phase === 'listing'
          ? `Finding files… ${progress.found}`
          : `Reading tags ${progress.parsed}/${progress.found}`}
      </span>
      <div className="flex-1 h-1 rounded-full bg-line overflow-hidden max-w-xs">
        <motion.div
          className="h-full bg-signal"
          animate={{ width: `${pct}%` }}
          transition={{ ease: 'easeOut', duration: 0.2 }}
        />
      </div>
      {progress.file && (
        <span className="label !text-[9px] truncate max-w-[240px] hidden sm:block normal-case tracking-normal">
          {progress.file}
        </span>
      )}
    </div>
  )
}

/** Drop MP3s anywhere on the window to import them. */
function DropZone() {
  const { importFiles } = useDeck()
  const [over, setOver] = useState(false)
  // dragenter/dragleave fire for every child element, so a plain boolean
  // flickers. Counting entries against leaves is the standard fix.
  const depth = useRef(0)

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current++
      setOver(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void importFiles(files)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  return (
    <AnimatePresence>
      {over && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[95] grid place-items-center pointer-events-none"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(4px)' }}
        >
          <motion.div
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            className="glass raise-lg border-2 border-dashed border-signal rounded-2xl px-12 py-10 text-center"
          >
            <UploadIcon className="w-9 h-9 text-signal mx-auto" />
            <p className="display-wide text-lg mt-4">Drop to import</p>
            <p className="label mt-2 normal-case tracking-normal">
              MP3s are added to your library
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Every overlay panel, routed off one piece of store state. */
function Panels({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { panel } = useDeck()
  return (
    <AnimatePresence mode="wait">
      {panel === 'palette' && <CommandPalette key="palette" onNavigate={onNavigate} />}
      {panel === 'queue' && <QueueView key="queue" />}
      {panel === 'equalizer' && <EqualizerPanel key="eq" />}
      {panel === 'settings' && <SettingsPanel key="settings" />}
      {panel === 'shortcuts' && <ShortcutsOverlay key="shortcuts" />}
      {panel === 'about' && <AboutPanel key="about" />}
      {panel === 'stats' && <StatsPanel key="stats" />}
    </AnimatePresence>
  )
}

function Shell() {
  const [view, setView] = useState<View>({ kind: 'library' })
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const { status, toggleTheme } = useDeck()
  const dj = useDJ()

  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), [])
  // DJ mode and Now Playing are both full-screen; opening one puts the other
  // away rather than stacking two edge-to-edge overlays.
  const openDJ = useCallback(() => {
    setNowPlayingOpen(false)
    dj.openMixer()
  }, [dj])
  useKeyboardShortcuts(openNowPlaying, toggleTheme, openDJ)

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex">
        <Sidebar view={view} onNavigate={setView} />
        <main className="flex-1 min-w-0 flex flex-col">
          <ScanBanner />
          {status === 'needs-permission' && <ReconnectBanner />}

          {/* A crossfade between views, so navigation has the same motion
              language as everything else rather than a hard swap. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={view.kind === 'playlist' ? `pl-${view.id}` : view.kind === 'smart' ? `sm-${view.id}` : 'library'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {view.kind === 'library' && <LibraryView />}
              {view.kind === 'smart' && <LibraryView smart={view.id} />}
              {view.kind === 'playlist' && (
                <PlaylistView id={view.id} onLeave={() => setView({ kind: 'library' })} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <TransportBar onOpenNowPlaying={openNowPlaying} />

      <AnimatePresence>
        {nowPlayingOpen && <NowPlaying onClose={() => setNowPlayingOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {dj.open && <DJMixer onClose={dj.closeMixer} />}
      </AnimatePresence>

      <Panels
        onNavigate={(v) => {
          setView(v)
          setNowPlayingOpen(false)
        }}
      />
      <TrackInfoModal />
      <ConfirmDialog />
      <Toasts />
      <DropZone />
      <Notice />
    </div>
  )
}

export default function App() {
  return (
    <DeckProvider>
      <DJProvider>
        <TrackMenuProvider>
          <Shell />
        </TrackMenuProvider>
      </DJProvider>
    </DeckProvider>
  )
}
