import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { djEngine, type DeckSide } from '../../lib/djEngine'

/**
 * A vertical fader — the channel faders and the three EQ bands all use this,
 * parameterized by range. `zero`, when given, is the value the fill grows
 * from rather than always from `min` — that's what makes an EQ band read as
 * "boost above the line, cut below it" instead of "however much is filled".
 */
export function VerticalFader({
  value,
  min,
  max,
  zero,
  onChange,
  label,
  ariaLabel,
  format,
  resetTo,
  height = 128,
}: {
  value: number
  min: number
  max: number
  zero?: number
  onChange: (v: number) => void
  /** Short visible caption under the fader, e.g. "LOW". */
  label: string
  /** Full accessible name, e.g. "Deck A low EQ" — `label` alone collides
   *  across decks, since both print the same three-letter caption. */
  ariaLabel?: string
  format?: (v: number) => string
  resetTo?: number
  height?: number
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const ratio = max === min ? 0 : (value - min) / (max - min)
  const zeroRatio = zero === undefined ? 0 : (zero - min) / (max - min)

  const apply = (clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const r = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    onChange(min + r * (max - min))
  }

  const fillFrom = Math.min(ratio, zeroRatio)
  const fillTo = Math.max(ratio, zeroRatio)

  return (
    <div className="flex flex-col items-center gap-1.5">
      {format && (
        <span className="readout text-[9.5px] tabular-nums text-ink-faint w-9 text-center">
          {format(value)}
        </span>
      )}
      <div
        ref={trackRef}
        role="slider"
        aria-label={ariaLabel ?? label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        style={{ height }}
        onDoubleClick={() => resetTo !== undefined && onChange(resetTo)}
        onKeyDown={(e) => {
          const step = (max - min) / 40
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(max, value + step))
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(min, value - step))
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            if (resetTo !== undefined) onChange(resetTo)
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          apply(e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) apply(e.clientY)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
        className="relative w-6 grid place-items-center cursor-ns-resize touch-none outline-none group"
      >
        <div className="fader h-full" />
        {zero !== undefined && (
          <div
            className="absolute left-1/2 -translate-x-1/2 w-3.5 h-px bg-line"
            style={{ bottom: `${zeroRatio * 100}%` }}
          />
        )}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[5px] rounded-full bg-signal"
          style={{ bottom: `${fillFrom * 100}%`, height: `${(fillTo - fillFrom) * 100}%` }}
        />
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-5 h-3 rounded-[3px] bg-ink shadow-[0_1px_4px_rgb(0_0_0/0.5)] border-t border-white/25 group-hover:scale-110 group-focus-visible:scale-110 transition-transform"
          animate={{ bottom: `calc(${ratio * 100}% - 6px)` }}
          transition={{ type: 'spring', stiffness: 700, damping: 45 }}
        />
      </div>
      <span className="label !text-[8px] !tracking-[0.08em]">{label}</span>
    </div>
  )
}

/** A tiny two-segment VU reading straight off the deck's own analyser. */
export function DeckVu({
  side,
  active,
  height = 128,
}: {
  side: DeckSide
  active: boolean
  height?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let color = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff6a3d'
    let dim = getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim() || '#625e57'
    let level = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      color = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff6a3d'
      dim = getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim() || '#625e57'
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const SEGMENTS = 10
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)

      const { peak } = active ? djEngine.levels(side) : { peak: 0 }
      level = peak > level ? level + (peak - level) * 0.5 : level + (peak - level) * 0.1

      const gap = 1.5
      const segH = (h - gap * (SEGMENTS - 1)) / SEGMENTS
      const lit = level * SEGMENTS
      for (let i = 0; i < SEGMENTS; i++) {
        const y = h - (i + 1) * segH - i * gap
        const on = i < lit
        ctx.fillStyle = on ? color : dim
        ctx.globalAlpha = on ? (i > SEGMENTS - 3 ? 1 : 0.85) : 0.15
        ctx.fillRect(0, y, w, segH)
      }
      ctx.globalAlpha = 1
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [side, active])

  return <canvas ref={ref} className="w-2" style={{ height }} aria-hidden="true" />
}
