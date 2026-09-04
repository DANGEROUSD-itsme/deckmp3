import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDeck, usePosition } from '../store/deck'
import { fmtRate, fmtTime } from '../lib/format'
import { artSwatch, peekSwatch } from '../lib/color'
import { VISUALIZER_MODES, type VisualizerMode } from '../types'
import { Cover } from './Cover'
import { Oscilloscope, SpectrumBars } from './Spectrum'
import { useTrackMenu } from './ContextMenu'
import {
  ChevronIcon,
  CloseIcon,
  HeartIcon,
  LoopIcon,
  MoreIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
  SlidersIcon,
  SpeedIcon,
  StarIcon,
  TimerIcon,
  WaveIcon,
} from './icons'

// three.js + fiber are a heavy dependency for a screen the user doesn't
// always open — split it out so the initial bundle stays light.
const Visualizer = lazy(() =>
  import('./Visualizer').then((m) => ({ default: m.Visualizer }))
)

/**
 * Paint the page with a colour sampled from the current cover. The value goes
 * onto the root element as a custom property rather than into React state, so
 * a slow colour extraction can never block or re-render the player.
 */
function useAmbient(artKey: string | null, enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (!enabled) {
      root.style.setProperty('--ambient-strength', '0')
      return
    }
    let cancelled = false
    const apply = (swatch: ReturnType<typeof peekSwatch>) => {
      if (cancelled || !swatch) return
      root.style.setProperty('--ambient', swatch.accent)
      // A light sleeve would wash the panel out, so it gets a gentler tint.
      root.style.setProperty('--ambient-strength', swatch.light ? '0.5' : '1')
    }
    const cached = peekSwatch(artKey)
    if (cached) apply(cached)
    else root.style.setProperty('--ambient-strength', '0')
    void artSwatch(artKey).then(apply)
    return () => {
      cancelled = true
      root.style.setProperty('--ambient-strength', '0')
    }
  }, [artKey, enabled])
}

export function NowPlaying({ onClose }: { onClose: () => void }) {
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
    upNext,
    queue,
    cursor,
    queueEntries,
    jumpTo,
    settings,
    updateSettings,
    statsFor,
    toggleFavorite,
    setRating,
    openPanel,
    loop,
    markLoop,
    clearLoop,
    sleep,
    setSleep,
  } = useDeck()
  const { position, duration } = usePosition()
  const menu = useTrackMenu()
  const [showModes, setShowModes] = useState(false)

  useAmbient(current?.artKey ?? null, settings.ambientArt)

  // Escape closes, and the arrow keys walk the queue from in here too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!current) return null

  const stats = statsFor(current.id)
  const mode = settings.visualizer

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-panel-deep flex flex-col"
    >
      {/* The album's own colour, bled behind everything. */}
      <div className="absolute inset-0 ambient-wash pointer-events-none" />

      <header className="relative shrink-0 flex items-center gap-2 px-4 sm:px-6 pt-4">
        <button
          onClick={onClose}
          className="control-btn w-10 h-10"
          aria-label="Close now playing"
          title="Close (Esc)"
        >
          <ChevronIcon className="w-5 h-5" dir="down" />
        </button>

        <div className="flex-1 text-center min-w-0">
          <p className="label !text-[9px]">
            {queueEntries.length > 1
              ? `${cursor + 1} of ${queueEntries.length} in queue`
              : 'Now playing'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Visualizer switcher, kept out of the way until asked for. */}
          <div className="relative">
            <button
              onClick={() => setShowModes((s) => !s)}
              className="control-btn w-10 h-10"
              aria-label="Visualizer mode"
              aria-expanded={showModes}
              title={`Visualizer: ${VISUALIZER_MODES.find((m) => m.id === mode)?.label}`}
            >
              <WaveIcon className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showModes && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowModes(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-11 z-20 w-44 glass raise-lg border border-line rounded-lg py-1.5"
                  >
                    {VISUALIZER_MODES.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          updateSettings({ visualizer: m.id as VisualizerMode })
                          setShowModes(false)
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors hover:bg-surface/70 ${
                          mode === m.id ? 'text-signal' : 'text-ink-dim hover:text-ink'
                        }`}
                      >
                        {m.label}
                        <span className="label block !text-[9px] mt-0.5 normal-case tracking-normal">
                          {m.hint}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={() => openPanel('equalizer')}
            className="control-btn w-10 h-10"
            aria-label="Equalizer"
            title="Equalizer (E)"
          >
            <SlidersIcon className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => menu.open(e, current)}
            className="control-btn w-10 h-10"
            aria-label="More actions"
          >
            <MoreIcon className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="control-btn w-10 h-10 sm:hidden" aria-label="Close">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 px-6 sm:px-12 py-6 overflow-y-auto">
        {/* The visualizer sits behind the cover, in its own stacking layer so
            3D repaint never forces the rest of the view to re-render. */}
        <div className="relative w-full max-w-[320px] sm:max-w-[460px] aspect-square shrink-0">
          {(mode === 'ring' || mode === 'orbit') && (
            <Suspense fallback={null}>
              <Visualizer
                className="absolute inset-[-34%] pointer-events-none"
                mode={mode}
              />
            </Suspense>
          )}
          {mode === 'bars' && (
            <SpectrumBars
              className="absolute -inset-x-[8%] -bottom-[14%] h-[38%] pointer-events-none"
              active={isPlaying}
            />
          )}
          {mode === 'wave' && (
            <Oscilloscope
              className="absolute -inset-x-[10%] top-1/2 -translate-y-1/2 h-[45%] pointer-events-none"
              active={isPlaying}
            />
          )}

          <motion.div
            layoutId={`cover-${current.id}`}
            transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
            className="absolute inset-0 well rounded-lg overflow-hidden"
          >
            <Cover
              artKey={current.artKey}
              title={current.title}
              className="w-full h-full"
              rounded="rounded-lg"
              spin={isPlaying}
            />
          </motion.div>

          {/* A soft halo in the album's own colour, under the sleeve. */}
          <div
            className="absolute inset-0 -z-10 rounded-lg blur-3xl pointer-events-none"
            style={{
              background: 'rgb(var(--ambient) / calc(var(--ambient-strength) * 0.35))',
              transform: 'scale(0.92) translateY(6%)',
            }}
          />
        </div>

        <div className="w-full max-w-md flex flex-col items-center lg:items-start text-center lg:text-left">
          <p className="label">{current.album}</p>

          {/* A long title scrolls on hover instead of being cut off. */}
          <div className="w-full overflow-hidden marquee-run">
            <h1 className="display-wide text-3xl sm:text-4xl mt-2 leading-[1.05] marquee">
              {current.title}
            </h1>
          </div>

          <p className="text-ink-dim mt-2">
            {current.artist}
            {current.year ? ` · ${current.year}` : ''}
          </p>

          {/* Favourite + rating, right where you'd reach for them. */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => toggleFavorite(current.id)}
              aria-label={stats.favorite ? 'Unfavourite' : 'Favourite'}
              aria-pressed={stats.favorite}
              className={`control-btn w-9 h-9 ${stats.favorite ? 'control-btn-on' : ''}`}
              title="Favourite (F)"
            >
              <HeartIcon className="w-[18px] h-[18px]" filled={stats.favorite} />
            </button>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(current.id, n)}
                  aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                  className="p-1 hover:scale-125 transition-transform"
                >
                  <StarIcon
                    className={`w-4 h-4 ${n <= stats.rating ? 'text-signal' : 'text-ink-faint'}`}
                    filled={n <= stats.rating}
                  />
                </button>
              ))}
            </div>
            {stats.plays > 0 && (
              <span className="label !text-[9px]">
                {stats.plays} play{stats.plays === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="w-full mt-7">
            <NowPlayingScrubber
              position={position}
              duration={duration}
              onSeek={seek}
              loopA={loop?.a ?? null}
              loopB={loop?.b ?? null}
            />
            <div className="flex justify-between label readout mt-1">
              <span>{fmtTime(position)}</span>
              <span className="text-ink-faint">−{fmtTime(Math.max(0, duration - position))}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={toggleShuffle}
              className={`control-btn w-10 h-10 ${shuffle ? 'control-btn-on' : ''}`}
              aria-label="Shuffle"
              aria-pressed={shuffle}
            >
              <ShuffleIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => void prev()} className="control-btn w-11 h-11" aria-label="Previous">
              <PrevIcon className="w-6 h-6" />
            </button>
            <motion.button
              onClick={() => void toggle()}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="control-btn-main w-16 h-16"
              aria-label={isPlaying ? 'Pause' : 'Play'}
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
                    <PauseIcon className="w-7 h-7" />
                  ) : (
                    <PlayIcon className="w-7 h-7 translate-x-[2px]" />
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <button onClick={() => void next()} className="control-btn w-11 h-11" aria-label="Next">
              <NextIcon className="w-6 h-6" />
            </button>
            <button
              onClick={cycleRepeat}
              className={`control-btn w-10 h-10 ${repeat !== 'off' ? 'control-btn-on' : ''}`}
              aria-label="Repeat"
              aria-pressed={repeat !== 'off'}
            >
              <RepeatIcon className="w-[18px] h-[18px]" mode={repeat === 'off' ? undefined : repeat} />
            </button>
          </div>

          {/* Second row: the things you reach for less often. */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={loop?.b ? clearLoop : markLoop}
              className={`ghost-btn !py-1.5 !px-3 ${loop ? '!text-signal !border-signal' : ''}`}
              title="A↔B loop (L)"
            >
              <LoopIcon className="w-3.5 h-3.5" armed={!!loop?.b} />
              {loop?.b ? `${fmtTime(loop.a)}–${fmtTime(loop.b)}` : loop ? 'Set B…' : 'Loop'}
            </button>
            <button
              onClick={() =>
                updateSettings({
                  rate: settings.rate === 1 ? 1.25 : settings.rate === 1.25 ? 1.5 : 1,
                })
              }
              className={`ghost-btn !py-1.5 !px-3 ${
                settings.rate !== 1 ? '!text-signal !border-signal' : ''
              }`}
              title="Cycle playback speed"
            >
              <SpeedIcon className="w-3.5 h-3.5" />
              {fmtRate(settings.rate)}
            </button>
            <button
              onClick={() => setSleep(sleep ? null : 30)}
              className={`ghost-btn !py-1.5 !px-3 ${sleep ? '!text-signal !border-signal' : ''}`}
              title="Sleep timer"
            >
              <TimerIcon className="w-3.5 h-3.5" />
              {sleep ? (sleep.endOfTrack ? 'End of track' : `${sleep.minutes}m`) : 'Sleep'}
            </button>
          </div>
        </div>

        {upNext.length > 0 && (
          <div className="hidden xl:block w-full max-w-xs shrink-0 self-stretch">
            <div className="flex items-center justify-between mb-3">
              <p className="label">Up next</p>
              <button
                onClick={() => openPanel('queue')}
                className="label hover:text-signal transition-colors"
              >
                See all
              </button>
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1 fade-bottom">
              {queueEntries
                .filter((e) => e.index > cursor)
                .slice(0, 14)
                .map((e) => (
                  <button
                    key={e.index}
                    onClick={() => void jumpTo(e.index)}
                    onContextMenu={(ev) => menu.open(ev, e.track)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-surface/60 text-left transition-colors group"
                  >
                    <div className="w-8 h-8 shrink-0 rounded-[3px] overflow-hidden well relative">
                      <Cover
                        artKey={e.track.artKey}
                        title={e.track.title}
                        className="w-full h-full"
                        rounded="rounded-[3px]"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <PlayIcon className="w-3 h-3 text-white" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] truncate leading-tight">{e.track.title}</p>
                      <p className="label !text-[10px] truncate mt-0.5">{e.track.artist}</p>
                    </div>
                  </button>
                ))}
            </div>
            {/* Kept so the queue length is reachable without opening the drawer. */}
            <p className="label mt-3 !text-[9px]">
              {queue.length} track{queue.length === 1 ? '' : 's'} loaded
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/** The large scrubber, with A↔B loop markers drawn onto the track. */
function NowPlayingScrubber({
  position,
  duration,
  onSeek,
  loopA,
  loopB,
}: {
  position: number
  duration: number
  onSeek: (t: number) => void
  loopA: number | null
  loopB: number | null
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const ratio = drag ?? (duration ? position / duration : 0)

  const ratioFrom = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  return (
    <div
      ref={trackRef}
      className="relative h-8 flex items-center cursor-pointer touch-none group"
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
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag(ratioFrom(e.clientX))
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) setDrag(ratioFrom(e.clientX))
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        if (drag === null) return
        onSeek(drag * duration)
        setDrag(null)
      }}
    >
      <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />

      {/* The loop span, shaded behind the progress fill. */}
      {loopA !== null && duration > 0 && (
        <div
          className="absolute h-[7px] rounded-sm bg-signal/25 border-x border-signal"
          style={{
            left: `${(loopA / duration) * 100}%`,
            width: `${(((loopB ?? loopA + 0.5) - loopA) / duration) * 100}%`,
          }}
        />
      )}

      <div
        className="absolute left-0 h-[3px] rounded-full bg-signal"
        style={{ width: `${ratio * 100}%` }}
      />
      <div
        className={`absolute h-3.5 w-3.5 rounded-full bg-signal shadow-[0_0_0_3px_var(--panel-deep)] transition-transform ${
          drag !== null ? 'scale-125' : 'group-hover:scale-110'
        }`}
        style={{ left: `calc(${ratio * 100}% - 7px)` }}
      />
    </div>
  )
}
