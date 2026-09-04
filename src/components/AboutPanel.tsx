import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { DECK_CODENAME, DECK_VERSION } from '../types'
import { fmtCount, fmtLongDuration } from '../lib/format'
import { Sheet } from './ui'
import { InfoIcon } from './icons'

/**
 * About. Carries the version statement, and doubles as the one place that
 * says plainly what DECK does with your files — which for a local-first
 * player is the single most useful thing it can tell you.
 */
export function AboutPanel() {
  const { closePanel, tracks, playlists, stats, supported } = useDeck()

  const totalSeconds = tracks.reduce((s, t) => s + t.duration, 0)
  const plays = [...stats.values()].reduce((s, v) => s + v.plays, 0)

  return (
    <Sheet
      title="About DECK"
      subtitle="A local-first MP3 deck"
      icon={<InfoIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      footer={
        <button onClick={closePanel} className="pill-btn !py-2 !px-5">
          Close
        </button>
      }
    >
      {/* The faceplate. A version badge that looks like it was silkscreened on. */}
      <div className="well rounded-lg brushed bg-panel border border-line px-6 py-7 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-12 h-12 rounded-full bg-signal grid place-items-center mx-auto mb-4 breathe"
        >
          <span className="w-3.5 h-3.5 rounded-full bg-panel-deep" />
        </motion.div>

        <h3 className="display-wide text-3xl tracking-wide">DECK</h3>

        {/* The version statement. */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="label mt-3 !text-[11px] !tracking-[0.3em] text-signal"
        >
          Version {DECK_VERSION}
        </motion.p>
        <p className="label mt-1.5 normal-case tracking-normal">
          “{DECK_CODENAME}” — second-generation faceplate
        </p>

        <div className="rule my-5" />

        <p className="text-[13px] text-ink-dim leading-relaxed max-w-sm mx-auto">
          This is DECK v{DECK_VERSION}. It reads your MP3s once — tags, artwork,
          durations — and then plays them entirely on your own machine. Nothing
          is uploaded, nothing is streamed, and nothing phones home. Close the
          tab, pull the network cable, and it still works.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        <Stat label="Tracks" value={fmtCount(tracks.length)} />
        <Stat label="Runtime" value={fmtLongDuration(totalSeconds)} />
        <Stat label="Playlists" value={fmtCount(playlists.length)} />
        <Stat label="Plays" value={fmtCount(plays)} />
      </div>

      <div className="mt-6 space-y-3 text-[13px] text-ink-dim leading-relaxed">
        <p>
          <span className="label !text-[9px] block mb-1">Storage</span>
          {supported
            ? 'Your browser supports the File System Access API, so DECK holds a permission to read your music folder and streams straight off disk. Only tags and artwork are cached.'
            : 'Your browser has no File System Access API, so DECK copies each track into its own local storage on import. That is what lets it launch straight into your library instead of asking for the folder again.'}
        </p>
        <p>
          <span className="label !text-[9px] block mb-1">New in {DECK_VERSION}</span>
          A ten-band equalizer with a preamp and twelve presets, night mode,
          stereo balance and speed control. A command palette on ⌘K. An editable
          queue. Favourites, ratings and play counts. Four visualizer modes,
          artist and genre browsing, smart views, a sleep timer, A↔B looping,
          six accent colours and drag-and-drop import.
        </p>
      </div>

      <p className="label mt-6 text-center normal-case tracking-normal">
        Developed by{' '}
        <a
          href="https://studiosdpe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-signal hover:underline"
        >
          studiosdpe.com
        </a>
      </p>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-md px-3 py-2.5 text-center">
      <p className="readout display text-lg leading-none">{value}</p>
      <p className="label mt-1.5 !text-[9px]">{label}</p>
    </div>
  )
}
