import { motion, type Variants } from 'framer-motion'
import type { Track } from '../types'
import { fmtTime } from '../lib/format'
import { Cover } from './Cover'
import { PlayIcon } from './icons'
import { useDeck } from '../store/deck'

const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } },
}

interface Props {
  track: Track
  index?: number
  isCurrent: boolean
  onPlay: () => void
  showArt?: boolean
}

/** One row in a track list. Doubles as the "current track" indicator via the signal dot. */
export function TrackRow({ track, index, isCurrent, onPlay, showArt = true }: Props) {
  const { isPlaying, toggle } = useDeck()

  return (
    <motion.button
      variants={item}
      onClick={() => (isCurrent ? void toggle() : onPlay())}
      className={`group w-full flex items-center gap-3.5 px-3 py-2.5 rounded-md text-left transition-colors ${
        isCurrent ? 'bg-surface' : 'hover:bg-surface/60'
      }`}
    >
      <div className="w-6 shrink-0 grid place-items-center label !text-[11px]">
        {isCurrent ? (
          isPlaying ? (
            <EqBars />
          ) : (
            <PlayIcon className="w-3 h-3 text-signal" />
          )
        ) : index !== undefined ? (
          <>
            <span className="group-hover:hidden">{index}</span>
            <PlayIcon className="w-3 h-3 hidden group-hover:block text-ink" />
          </>
        ) : (
          <PlayIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 text-ink transition-opacity" />
        )}
      </div>

      {showArt && (
        <div className="w-10 h-10 shrink-0 rounded-[3px] overflow-hidden well">
          <Cover artKey={track.artKey} title={track.title} className="w-full h-full" rounded="rounded-[3px]" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-tight truncate ${isCurrent ? 'text-signal font-medium' : ''}`}>
          {track.title}
        </p>
        <p className="label mt-0.5 truncate normal-case tracking-normal font-normal text-ink-dim">
          {track.artist}
          {showArt ? ` · ${track.album}` : ''}
        </p>
      </div>

      <span className="readout label !text-[11px] shrink-0">{fmtTime(track.duration)}</span>
    </motion.button>
  )
}

function EqBars() {
  return (
    <span className="flex items-end gap-[2px] h-3 w-3.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[2.5px] bg-signal rounded-full"
          animate={{ height: ['30%', '100%', '45%', '85%', '30%'] }}
          transition={{
            duration: 0.9 + i * 0.15,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.12,
          }}
        />
      ))}
    </span>
  )
}
