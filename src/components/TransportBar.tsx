import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDeck, usePosition } from '../store/deck'
import { fmtRate, fmtTime } from '../lib/format'
import { engine } from '../lib/engine'
import { Cover } from './Cover'
import { SpectrumStrip, VuMeter } from './Spectrum'
import { useTrackMenu } from './ContextMenu'
import {
  HeartIcon,
  LoopIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  SpeedIcon,
  TimerIcon,
  VolumeIcon,
} from './icons'

/** Drag-to-seek scrubber. A styled <input type=range> would be enough, but a
 *  custom track gives us the tape-counter red line and generous touch target. */
function Scrubber({
  position,
  duration,
  onSeek,
  compact = false,
}: {
  position: number
  duration: number
  onSeek: (t: number) => void
  compact?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const ratio = dragRatio ?? (duration ? position / duration : 0)

  const ratioFromEvent = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  /**
   * Pointer capture is taken on `currentTarget` throughout. Capturing on
   * `e.target` instead would put it on whichever child was under the finger
   * (often the thumb), and the later release on `currentTarget` would throw.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragRatio(ratioFromEvent(e.clientX))
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    setHoverRatio(ratioFromEvent(e.clientX))
    if (dragRatio === null) return
    setDragRatio(ratioFromEvent(e.clientX))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (dragRatio === null) return
    onSeek(dragRatio * duration)
    setDragRatio(null)
  }

  const preview = hoverRatio ?? 0

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="label readout w-11 text-right shrink-0 tabular-nums">
        {fmtTime(dragRatio !== null ? dragRatio * duration : position)}
      </span>
      <div
        ref={trackRef}
        className="relative flex-1 h-8 flex items-center cursor-pointer touch-none group"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoverRatio(null)}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={position}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            onSeek(position - 5)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            onSeek(position + 5)
          }
        }}
      >
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
        {/* How much the browser has actually buffered ahead. */}
        <div
          className="absolute left-0 h-[3px] rounded-full bg-ink-faint/35"
          style={{ width: `${engine.buffered * 100}%` }}
        />
        <div
          className="absolute left-0 h-[3px] rounded-full bg-signal"
          style={{ width: `${ratio * 100}%` }}
        />
        {/* Hover ghost + timecode bubble. */}
        {hoverRatio !== null && duration > 0 && !compact && (
          <>
            <div
              className="absolute w-px h-2.5 bg-ink-faint/60 pointer-events-none"
              style={{ left: `${preview * 100}%` }}
            />
            <div
              className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded readout label !text-[9px] bg-panel border border-line pointer-events-none whitespace-nowrap"
              style={{ left: `${preview * 100}%` }}
            >
              {fmtTime(preview * duration)}
            </div>
          </>
        )}
        <div
          className={`absolute h-3.5 w-3.5 rounded-full bg-signal shadow-[0_0_0_3px_var(--panel)] transition-transform ${
            dragRatio !== null ? 'scale-125' : 'group-hover:scale-110'
          }`}
          style={{ left: `calc(${ratio * 100}% - 7px)` }}
        />
      </div>
      <span className="label readout w-11 shrink-0 tabular-nums">{fmtTime(duration)}</span>
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

  const level = muted ? 0 : volume

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
        title={`${Math.round(level * 100)}%`}
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
            e.currentTarget.setPointerCapture(e.pointerId)
            apply(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e.clientX)
          }}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          onWheel={(e) => setVolume(volume - Math.sign(e.deltaY) * -0.05)}
          role="slider"
          aria-label="Volume"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={level}
        >
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
          <div
            className="absolute left-0 h-[3px] rounded-full bg-ink-dim"
            style={{ width: `${level * 100}%` }}
          />
          <div
            className="absolute h-3 w-3 rounded-full bg-ink"
            style={{ left: `calc(${level * 100}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  )
}

/** The countdown pill that appears only while a sleep timer is armed. */
function SleepBadge() {
  const { sleep, setSleep } = useDeck()
  const [, force] = useState(0)

  // One re-render a second, and only while a timer is actually running.
  useEffect(() => {
    if (!sleep?.endsAt) return
    const tick = window.setInterval(() => force((n) => n + 1), 1000)
    return () => window.clearInterval(tick)
  }, [sleep])

  if (!sleep) return null
  const left = sleep.endsAt ? Math.max(0, Math.round((sleep.endsAt - Date.now()) / 1000)) : 0

  return (
    <button
      onClick={() => setSleep(null)}
      className="hidden sm:flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-surface text-signal shrink-0 hover:bg-surface-hi transition-colors"
      title="Cancel the sleep timer"
    >
      <TimerIcon className="w-3.5 h-3.5" />
      <span className="readout label !text-[10px] !text-signal">
        {sleep.endOfTrack ? 'end' : fmtTime(left)}
      </span>
    </button>
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
    openPanel,
    settings,
    updateSettings,
    statsFor,
    toggleFavorite,
    loop,
    markLoop,
    clearLoop,
    upNext,
  } = useDeck()
  const { position, duration } = usePosition()
  const menu = useTrackMenu()

  const handleToggle = useCallback(() => void toggle(), [toggle])
  const favorite = current ? statsFor(current.id).favorite : false

  return (
    <div className="brushed raise border-t border-line bg-panel shrink-0 relative">
      {/* The live analyser, bled across the full width just under the border. */}
      {settings.spectrumStrip && (
        <SpectrumStrip
          className="absolute -top-px inset-x-0 h-8 pointer-events-none opacity-70"
          active={isPlaying}
        />
      )}

      <div className="relative px-3 sm:px-5 py-2.5 sm:py-3">
        <div className="mx-auto max-w-[1400px] flex items-center gap-3 sm:gap-5">
          {/* Track identity — tap to open the full now-playing view */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 md:flex-none md:w-[270px]">
            <button
              onClick={onOpenNowPlaying}
              onContextMenu={(e) => current && menu.open(e, current)}
              disabled={!current}
              className="flex items-center gap-3 min-w-0 flex-1 text-left group disabled:cursor-default"
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
                <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronUp />
                </span>
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

            {current && (
              <button
                onClick={() => toggleFavorite(current.id)}
                aria-label={favorite ? 'Unfavourite' : 'Favourite'}
                aria-pressed={favorite}
                className={`control-btn w-8 h-8 shrink-0 hidden sm:flex ${
                  favorite ? 'text-signal' : ''
                }`}
              >
                <HeartIcon className="w-4 h-4" filled={favorite} />
              </button>
            )}
          </div>

          {/* Transport + scrubber */}
          <div className="flex-1 flex flex-col items-center gap-1.5 max-w-2xl">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={toggleShuffle}
                className={`control-btn w-9 h-9 hidden sm:flex ${shuffle ? 'control-btn-on' : ''}`}
                aria-label="Shuffle"
                aria-pressed={shuffle}
                title="Shuffle (S)"
              >
                <ShuffleIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => void prev()}
                className="control-btn w-9 h-9"
                aria-label="Previous"
                title="Previous (⇧←)"
              >
                <PrevIcon className="w-5 h-5" />
              </button>
              <motion.button
                onClick={handleToggle}
                disabled={!current}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="control-btn-main w-12 h-12 sm:w-[52px] sm:h-[52px]"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title="Play / pause (space)"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={isPlaying ? 'pause' : 'play'}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 }}
                    className="grid place-items-center"
                  >
                    {isPlaying ? (
                      <PauseIcon className="w-6 h-6" />
                    ) : (
                      <PlayIcon className="w-6 h-6 translate-x-[1px]" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <button
                onClick={() => void next()}
                className="control-btn w-9 h-9"
                aria-label="Next"
                title="Next (⇧→)"
              >
                <NextIcon className="w-5 h-5" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`control-btn w-9 h-9 hidden sm:flex ${
                  repeat !== 'off' ? 'control-btn-on' : ''
                }`}
                aria-label="Repeat"
                aria-pressed={repeat !== 'off'}
                title="Repeat (R)"
              >
                <RepeatIcon className="w-4 h-4" mode={repeat === 'off' ? undefined : repeat} />
              </button>
            </div>
            <div className="w-full hidden sm:block">
              <Scrubber position={position} duration={duration} onSeek={seek} />
            </div>
          </div>

          {/* Right rail: meters, loop, speed, sleep, queue, volume */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0 w-[270px] justify-end">
            <SleepBadge />

            <button
              onClick={loop?.b ? clearLoop : markLoop}
              disabled={!current}
              className={`control-btn w-8 h-8 ${loop ? 'control-btn-on' : ''}`}
              aria-label="A to B loop"
              aria-pressed={!!loop?.b}
              title={
                loop?.b
                  ? `Looping ${fmtTime(loop.a)}–${fmtTime(loop.b)} — click to clear`
                  : loop
                    ? 'Loop start set — press again for the end'
                    : 'A↔B loop (L)'
              }
            >
              <LoopIcon className="w-4 h-4" armed={!!loop?.b} />
            </button>

            {/* Speed reads out only when it isn't 1×, so the bar stays quiet. */}
            <button
              onClick={() =>
                updateSettings({ rate: settings.rate === 1 ? 1.25 : settings.rate === 1.25 ? 1.5 : 1 })
              }
              className={`control-btn h-8 px-2 gap-1 ${settings.rate !== 1 ? 'control-btn-on' : 'w-8'}`}
              aria-label="Playback speed"
              title="Cycle playback speed"
            >
              <SpeedIcon className="w-4 h-4" />
              {settings.rate !== 1 && (
                <span className="readout label !text-[9px] !text-signal">
                  {fmtRate(settings.rate)}
                </span>
              )}
            </button>

            <button
              onClick={() => openPanel('queue')}
              className="control-btn h-8 px-2 gap-1"
              aria-label="Queue"
              title="Queue (Q)"
            >
              <QueueIcon className="w-4 h-4" />
              {upNext.length > 0 && (
                <span className="readout label !text-[9px]">{upNext.length}</span>
              )}
            </button>

            {/* Two channels of level. Cosmetic, and the room knows it. */}
            <div className="flex items-end gap-[3px] h-7 w-4 shrink-0 mx-1" aria-hidden>
              <VuMeter className="w-[6px] h-full" active={isPlaying} />
              <VuMeter className="w-[6px] h-full" active={isPlaying} />
            </div>

            <VolumeControl />
          </div>
        </div>

        {/* Compact scrubber row for narrow/touch layouts */}
        <div className="sm:hidden mt-2">
          <Scrubber position={position} duration={duration} onSeek={seek} compact />
        </div>
      </div>
    </div>
  )
}

function ChevronUp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="m6 15 6-6 6 6" />
    </svg>
  )
}
