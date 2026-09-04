import { useRef } from 'react'
import { motion, type Variants } from 'framer-motion'
import type { Track } from '../types'
import { fmtTime } from '../lib/format'
import { Cover } from './Cover'
import { HeartIcon, MoreIcon, PlayIcon, StarIcon } from './icons'
import { useDeck } from '../store/deck'
import { useTrackMenu } from './ContextMenu'

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
  /** Extra context-menu entry, e.g. "Remove from this playlist". */
  menuExtra?: { label: string; destructive?: boolean; run: () => void }
  /** Show the star rating inline. Off in dense grids where it's just noise. */
  showRating?: boolean
}

/** One row in a track list. Doubles as the "current track" indicator via the signal dot. */
export function TrackRow({
  track,
  index,
  isCurrent,
  onPlay,
  showArt = true,
  menuExtra,
  showRating = false,
}: Props) {
  const { isPlaying, toggle, statsFor, toggleFavorite } = useDeck()
  const menu = useTrackMenu()
  const stats = statsFor(track.id)
  const pressTimer = useRef(0)

  /**
   * Long-press opens the same menu as right-click. 480ms is long enough not
   * to fire on a scroll flick and short enough not to feel broken.
   */
  const startPress = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    const { clientX, clientY } = e
    pressTimer.current = window.setTimeout(
      () => menu.openAt(clientX, clientY, track, menuExtra),
      480
    )
  }
  const cancelPress = () => window.clearTimeout(pressTimer.current)

  return (
    <motion.div
      variants={item}
      onContextMenu={(e) => menu.open(e, track, menuExtra)}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      className={`group w-full flex items-center rounded-md text-left transition-colors ${
        isCurrent ? 'bg-surface' : 'hover:bg-surface/60'
      }`}
      style={{ paddingBlock: 'var(--row-pad-y)', gap: 'var(--row-gap)', paddingInline: '0.75rem' }}
    >
      <button
        onClick={() => (isCurrent ? void toggle() : onPlay())}
        className="flex items-center min-w-0 flex-1 text-left"
        style={{ gap: 'var(--row-gap)' }}
        aria-label={isCurrent ? (isPlaying ? 'Pause' : 'Resume') : `Play ${track.title}`}
      >
        <span className="w-6 shrink-0 grid place-items-center label !text-[11px]">
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
        </span>

        {showArt && (
          <span
            className="shrink-0 rounded-[3px] overflow-hidden well block"
            style={{ width: 'var(--row-art)', height: 'var(--row-art)' }}
          >
            <Cover
              artKey={track.artKey}
              title={track.title}
              className="w-full h-full"
              rounded="rounded-[3px]"
            />
          </span>
        )}

        <span className="min-w-0 flex-1 block">
          <span
            className={`block text-[14px] leading-tight truncate ${
              isCurrent ? 'text-signal font-medium' : ''
            }`}
          >
            {track.title}
          </span>
          <span className="label block mt-0.5 truncate normal-case tracking-normal font-normal text-ink-dim">
            {track.artist}
            {showArt ? ` · ${track.album}` : ''}
          </span>
        </span>
      </button>

      {showRating && stats.rating > 0 && (
        <span className="hidden sm:flex items-center gap-0.5 shrink-0" aria-label={`${stats.rating} stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <StarIcon
              key={n}
              className={`w-2.5 h-2.5 ${n <= stats.rating ? 'text-signal' : 'text-ink-faint/40'}`}
              filled={n <= stats.rating}
            />
          ))}
        </span>
      )}

      {/* Favourite: always visible once set, revealed on hover otherwise. */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite(track.id)
        }}
        aria-label={stats.favorite ? `Unfavourite ${track.title}` : `Favourite ${track.title}`}
        aria-pressed={stats.favorite}
        className={`control-btn w-7 h-7 shrink-0 transition-opacity ${
          stats.favorite ? 'text-signal opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <HeartIcon className="w-3.5 h-3.5" filled={stats.favorite} />
      </button>

      {stats.plays > 0 && (
        <span
          className="readout label !text-[9px] shrink-0 hidden lg:block w-6 text-right"
          title={`Played ${stats.plays} times`}
        >
          {stats.plays}×
        </span>
      )}

      <span className="readout label !text-[11px] shrink-0 w-10 text-right">
        {fmtTime(track.duration)}
      </span>

      <button
        onClick={(e) => menu.open(e, track, menuExtra)}
        aria-label={`More actions for ${track.title}`}
        className="control-btn w-7 h-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <MoreIcon className="w-4 h-4" />
      </button>
    </motion.div>
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
