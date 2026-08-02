import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DeckProvider, useDeck } from './store/deck'
import { engine } from './lib/engine'
import { Sidebar, type View } from './components/Sidebar'
import { LibraryView } from './components/LibraryView'
import { PlaylistView } from './components/PlaylistView'
import { TransportBar } from './components/TransportBar'
import { NowPlaying } from './components/NowPlaying'

function useKeyboardShortcuts(onOpenNowPlaying: () => void) {
  const { toggle, next, prev, seek, setVolume, volume, toggleMute } = useDeck()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          void toggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) void next()
          else seek(engine.position + 5)
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) void prev()
          else seek(engine.position - 5)
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.05))
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.05))
          break
        case 'KeyM':
          toggleMute()
          break
        case 'KeyN':
          void onOpenNowPlaying()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, next, prev, seek, setVolume, volume, toggleMute, onOpenNowPlaying])
}

function Notice() {
  const { notice, dismissNotice } = useDeck()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(dismissNotice, 4000)
    return () => clearTimeout(t)
  }, [notice, dismissNotice])

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] brushed raise bg-panel border border-line rounded-full px-4 py-2 text-sm"
        >
          {notice}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ScanBanner() {
  const { progress, status } = useDeck()
  if (status !== 'scanning' || progress.phase === 'idle') return null
  const pct = progress.found ? Math.min(100, (progress.parsed / progress.found) * 100) : 0
  return (
    <div className="shrink-0 bg-surface border-b border-line px-5 py-1.5 flex items-center gap-3 text-xs">
      <span className="label !text-[10px]">
        {progress.phase === 'listing' ? `Finding files… ${progress.found}` : `Reading tags ${progress.parsed}/${progress.found}`}
      </span>
      <div className="flex-1 h-1 rounded-full bg-line overflow-hidden max-w-xs">
        <motion.div
          className="h-full bg-signal"
          animate={{ width: `${pct}%` }}
          transition={{ ease: 'easeOut', duration: 0.2 }}
        />
      </div>
    </div>
  )
}

function Shell() {
  const [view, setView] = useState<View>({ kind: 'library' })
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)

  useKeyboardShortcuts(() => setNowPlayingOpen(true))

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex">
        <Sidebar view={view} onNavigate={setView} />
        <main className="flex-1 min-w-0 flex flex-col">
          <ScanBanner />
          {view.kind === 'library' ? (
            <LibraryView />
          ) : (
            <PlaylistView id={view.id} />
          )}
        </main>
      </div>
      <TransportBar onOpenNowPlaying={() => setNowPlayingOpen(true)} />
      <AnimatePresence>
        {nowPlayingOpen && <NowPlaying onClose={() => setNowPlayingOpen(false)} />}
      </AnimatePresence>
      <Notice />
    </div>
  )
}

export default function App() {
  return (
    <DeckProvider>
      <Shell />
    </DeckProvider>
  )
}
