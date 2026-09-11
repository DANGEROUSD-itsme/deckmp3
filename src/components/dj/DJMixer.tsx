import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDJ } from '../../store/dj'
import { useDeck } from '../../store/deck'
import { engine } from '../../lib/engine'
import type { DeckSide } from '../../lib/djEngine'
import type { Track } from '../../types'
import { Drawer } from '../ui'
import { DeckPanel } from './DeckPanel'
import { DjHelp } from './DjHelp'
import { MixerStrip } from './MixerStrip'
import { TrackBrowser } from './TrackBrowser'
import { AlertIcon, ChevronIcon, DjIcon, HelpIcon, UploadIcon } from '../icons'

/**
 * The DJ mixer — a full-screen overlay, same weight class as Now Playing,
 * but a genuinely separate audio path: two decks the user drives by hand
 * rather than one queue the app advances automatically.
 *
 * Opening it stops the main queue engine so the two audio paths never talk
 * over each other; the main transport bar is fully covered while this is up,
 * so there's no way to restart it by accident from underneath.
 */
export function DJMixer({ onClose }: { onClose: () => void }) {
  const dj = useDJ()
  const { resolveFile, toast } = useDeck()
  const [browserOpen, setBrowserOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(() => !hasOfferedHelp)
  const [loadingSide, setLoadingSide] = useState<DeckSide | null>(null)

  useEffect(() => {
    engine.stop()
  }, [])

  useEffect(() => {
    hasOfferedHelp = true
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !browserOpen && !helpOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [browserOpen, helpOpen, onClose])

  const handleLoad = async (side: DeckSide, track: Track) => {
    setLoadingSide(side)
    try {
      const file = await resolveFile(track)
      if (!file) {
        toast(`Missing file: ${track.title}`, 'error')
        return
      }
      await dj.loadDeck(side, track, file)
      toast(`Loaded "${track.title}" to Deck ${side.toUpperCase()}.`, 'success')
    } finally {
      setLoadingSide(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-panel-deep flex flex-col"
    >
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 pt-4 pb-2">
        <button
          onClick={onClose}
          className="control-btn w-10 h-10"
          aria-label="Close DJ mode"
          title="Close (Esc)"
        >
          <ChevronIcon className="w-5 h-5" dir="down" />
        </button>
        <div className="flex items-center gap-2 mr-auto">
          <DjIcon className="w-[18px] h-[18px] text-signal" />
          <span className="display-wide text-lg tracking-wide">DJ MODE</span>
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          className="control-btn w-10 h-10"
          aria-label="How to mix"
          title="How to mix"
        >
          <HelpIcon className="w-5 h-5" />
        </button>
        <button onClick={() => setBrowserOpen(true)} className="pill-btn !py-2 !px-4">
          <UploadIcon className="w-3.5 h-3.5" />
          Load a track
        </button>
      </header>

      <AnimatePresence>
        {dj.notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="shrink-0 mx-4 sm:mx-6 mb-2 rounded-md bg-surface border border-line px-3.5 py-2 flex items-center gap-2.5 text-[13px]"
          >
            <AlertIcon className="w-4 h-4 text-signal shrink-0" />
            <span className="flex-1">{dj.notice}</span>
            <button onClick={dj.dismissNotice} className="label hover:text-signal transition-colors">
              dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-8">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6 sm:gap-4 pt-2">
          <DeckPanel side="a" />
          <MixerStrip />
          <DeckPanel side="b" />
        </div>
      </div>

      {browserOpen && (
        <Drawer
          title="Load a track"
          subtitle="Drop it on Deck A or Deck B"
          icon={<UploadIcon className="w-[18px] h-[18px]" />}
          onClose={() => setBrowserOpen(false)}
        >
          <TrackBrowser onLoad={handleLoad} loadingSide={loadingSide} />
        </Drawer>
      )}

      {helpOpen && <DjHelp onClose={() => setHelpOpen(false)} />}
    </motion.div>
  )
}

/** Shows the cheat sheet unprompted the first time DJ mode opens in this
 *  browser tab's lifetime — after that it's one click away via the header's
 *  "?" button, so this only needs to fire once, in memory, per session. */
let hasOfferedHelp = false
