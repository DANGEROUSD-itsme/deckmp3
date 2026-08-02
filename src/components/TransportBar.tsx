import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useDeck, usePosition } from '../store/deck'
import { fmtTime } from '../lib/format'
import { Cover } from './Cover'
import {
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from './icons'

/** Drag-to-seek scrubber. A styled <input type=range> would be enough, but a
 *  custom track gives us the tape-counter red line and generous touch target. */
function Scrubber({
  position,
  duration,
  onSeek,
}: {
  position: number
  duration: number
  onSeek: (t: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const ratio = dragRatio ?? (duration ? position / duration : 0)

  const ratioFromEvent = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDragRatio(ratioFromEvent(e.clientX))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRatio === null) return
    setDragRatio(ratioFromEvent(e.clientX))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRatio === null) return
    onSeek(dragRatio * duration)
    setDragRatio(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="label readout w-11 text-right shrink-0">{fmtTime(position)}</span>
      <div
        ref={trackRef}
        className="relative flex-1 h-8 flex items-center cursor-pointer touch-none group"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={position}
      >
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
        <div
          className="absolute left-0 h-[3px] rounded-full bg-signal"
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className="absolute h-3.5 w-3.5 rounded-full bg-signal shadow-[0_0_0_3px_var(--panel)] transition-transform group-hover:scale-110"
          style={{ left: `calc(${ratio * 100}% - 7px)` }}
        />
      </div>
      <span className="label readout w-11 shrink-0">{fmtTime(duration)}</span>
    </div>
  )
}

function VolumeControl() {
  const { volume, muted, setVolume, toggleMute } = useDeck()
  const trackRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }

  return (
    <div
      className="hidden md:flex items-center gap-2 group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={toggleMute}
        className="control-btn w-9 h-9"
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted || volume === 0 ? (
          <MuteIcon className="w-[18px] h-[18px]" />
        ) : (
          <VolumeIcon className="w-[18px] h-[18px]" level={volume} />
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ width: open ? 88 : 0 }}
      >
        <div
          ref={trackRef}
          className="relative h-8 flex items-center cursor-pointer touch-none w-[88px]"
          onPointerDown={(e) => {
            ;(e.target as Element).setPointerCapture(e.pointerId)
            apply(e.clientX)
          }}
          onPointerMove={(e) => e.buttons === 1 && apply(e.clientX)}
        >
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
          <div
            className="absolute left-0 h-[3px] rounded-full bg-ink-dim"
            style={{ width: `${(muted ? 0 : volume) * 100}%` }}
          />
          <div
            className="absolute h-3 w-3 rounded-full bg-ink"
            style={{ left: `calc(${(muted ? 0 : volume) * 100}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  )
}

export function TransportBar({ onOpenNowPlaying }: { onOpenNowPlaying: () => void }) {
  const {
    current,
    isPlaying,
    toggle,
    next,
    prev,
    seek,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = useDeck()
  const { position, duration } = usePosition()

  const handleToggle = useCallback(() => void toggle(), [toggle])

  return (
    <div className="brushed raise border-t border-line bg-panel px-3 sm:px-5 py-2.5 sm:py-3 shrink-0">
      <div className="mx-auto max-w-[1400px] flex items-center gap-3 sm:gap-5">
        {/* Track identity — tap to open the full now-playing view */}
        <button
          onClick={onOpenNowPlaying}
          disabled={!current}
          className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-[240px] text-left group disabled:cursor-default"
        >
          <motion.div
            layoutId={current ? `cover-${current.id}` : undefined}
            className="relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 well rounded-[3px] overflow-hidden"
          >
            <Cover
              artKey={current?.artKey ?? null}
              title={current?.title ?? ''}
              className="w-full h-full"
              rounded="rounded-[3px]"
            />
          </motion.div>
          <div className="min-w-0">
            {current ? (
              <>
                <p className="display text-sm sm:text-[15px] leading-tight truncate group-hover:text-signal transition-colors">
                  {current.title}
                </p>
                <p className="label truncate mt-0.5">{current.artist}</p>
              </>
            ) : (
              <p className="label">nothing loaded</p>
            )}
          </div>
        </button>

        {/* Transport + scrubber */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-2xl">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={toggleShuffle}
              className={`control-btn w-9 h-9 hidden sm:flex ${shuffle ? 'text-signal' : ''}`}
              aria-label="Shuffle"
              aria-pressed={shuffle}
            >
              <ShuffleIcon className="w-4 h-4" />
            </button>
            <button onClick={() => void prev()} className="control-btn w-9 h-9" aria-label="Previous">
              <PrevIcon className="w-5 h-5" />
            </button>
            <motion.button
              onClick={handleToggle}
              disabled={!current}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="control-btn-main w-12 h-12 sm:w-[52px] sm:h-[52px]"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6 translate-x-[1px]" />
              )}
            </motion.button>
            <button onClick={() => void next()} className="control-btn w-9 h-9" aria-label="Next">
              <NextIcon className="w-5 h-5" />
            </button>
            <button
              onClick={cycleRepeat}
              className={`control-btn w-9 h-9 hidden sm:flex ${repeat !== 'off' ? 'text-signal' : ''}`}
              aria-label="Repeat"
              aria-pressed={repeat !== 'off'}
            >
              <RepeatIcon className="w-4 h-4" mode={repeat === 'off' ? undefined : repeat} />
            </button>
          </div>
          <div className="w-full hidden sm:block">
            <Scrubber position={position} duration={duration} onSeek={seek} />
          </div>
        </div>

        <div className="hidden md:block w-[130px] shrink-0 text-right">
          <VolumeControl />
        </div>
      </div>
      {/* Compact scrubber row for narrow/touch layouts */}
      <div className="sm:hidden mt-2">
        <Scrubber position={position} duration={duration} onSeek={seek} />
      </div>
    </div>
  )
}
