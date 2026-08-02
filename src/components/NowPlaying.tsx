import { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { useDeck, usePosition } from '../store/deck'
import { fmtTime } from '../lib/format'
import { Cover } from './Cover'
import {
  CloseIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  ShuffleIcon,
} from './icons'

// three.js + fiber are a heavy dependency for a screen the user doesn't
// always open — split it out so the initial bundle stays light.
const Visualizer = lazy(() =>
  import('./Visualizer').then((m) => ({ default: m.Visualizer }))
)

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const { current, isPlaying, toggle, next, prev, seek, shuffle, repeat, toggleShuffle, cycleRepeat, upNext, playNow } =
    useDeck()
  const { position, duration } = usePosition()

  if (!current) return null
  const ratio = duration ? position / duration : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-panel-deep flex flex-col"
    >
      <button
        onClick={onClose}
        className="control-btn w-10 h-10 absolute top-4 right-4 sm:top-6 sm:right-6 z-10"
        aria-label="Close"
      >
        <CloseIcon className="w-5 h-5" />
      </button>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 px-6 sm:px-12 py-10 overflow-y-auto">
        {/* The visualizer ring sits behind the cover, in its own stacking layer
            so 3D repaint never forces the rest of the view to re-render. */}
        <div className="relative w-full max-w-[320px] sm:max-w-[460px] aspect-square shrink-0">
          <Suspense fallback={null}>
            <Visualizer className="absolute inset-[-22%] pointer-events-none" />
          </Suspense>
          <motion.div
            layoutId={`cover-${current.id}`}
            transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
            className="absolute inset-0 well rounded-lg overflow-hidden"
          >
            <Cover artKey={current.artKey} title={current.title} className="w-full h-full" rounded="rounded-lg" />
          </motion.div>
        </div>

        <div className="w-full max-w-md flex flex-col items-center lg:items-start text-center lg:text-left">
          <p className="label">{current.album}</p>
          <h1 className="display-wide text-3xl sm:text-4xl mt-2 leading-[1.05]">{current.title}</h1>
          <p className="text-ink-dim mt-2">{current.artist}</p>

          <div className="w-full mt-8">
            <div
              className="relative h-8 flex items-center cursor-pointer touch-none group"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                seek(((e.clientX - rect.left) / rect.width) * duration)
              }}
            >
              <div className="absolute inset-x-0 h-[3px] rounded-full bg-line" />
              <div className="absolute left-0 h-[3px] rounded-full bg-signal" style={{ width: `${ratio * 100}%` }} />
              <div
                className="absolute h-3.5 w-3.5 rounded-full bg-signal shadow-[0_0_0_3px_var(--panel-deep)]"
                style={{ left: `calc(${ratio * 100}% - 7px)` }}
              />
            </div>
            <div className="flex justify-between label readout mt-1">
              <span>{fmtTime(position)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button onClick={toggleShuffle} className={`control-btn w-10 h-10 ${shuffle ? 'text-signal' : ''}`} aria-label="Shuffle">
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
              {isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7 translate-x-[2px]" />}
            </motion.button>
            <button onClick={() => void next()} className="control-btn w-11 h-11" aria-label="Next">
              <NextIcon className="w-6 h-6" />
            </button>
            <button onClick={cycleRepeat} className={`control-btn w-10 h-10 ${repeat !== 'off' ? 'text-signal' : ''}`} aria-label="Repeat">
              <RepeatIcon className="w-[18px] h-[18px]" mode={repeat === 'off' ? undefined : repeat} />
            </button>
          </div>
        </div>

        {upNext.length > 0 && (
          <div className="hidden xl:block w-full max-w-xs shrink-0 self-stretch">
            <p className="label mb-3">Up next</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
              {upNext.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  onClick={() => void playNow(t.id, [current.id, ...upNext.map((u) => u.id)])}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-surface/60 text-left transition-colors"
                >
                  <div className="w-8 h-8 shrink-0 rounded-[3px] overflow-hidden well">
                    <Cover artKey={t.artKey} title={t.title} className="w-full h-full" rounded="rounded-[3px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] truncate leading-tight">{t.title}</p>
                    <p className="label !text-[10px] truncate mt-0.5">{t.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
