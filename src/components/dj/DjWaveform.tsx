import { useEffect, useRef } from 'react'
import type { Peaks } from '../../lib/waveform'
import { djEngine, type DeckSide } from '../../lib/djEngine'

/**
 * The deck's waveform strip. Draws the pre-decoded min/max envelope once as
 * an offscreen bitmap, then repaints just a thin playhead line and a
 * progress tint over it every frame — the expensive part (800 bars) never
 * has to re-render while a deck is spinning.
 *
 * Position is read straight from `djEngine` each frame, the same pattern the
 * main transport's Spectrum canvases use for the queue engine — a context
 * value here would mean 60 re-renders a second for a number nothing else on
 * the page needs.
 */
export function DjWaveform({
  side,
  peaks,
  cue,
  onSeek,
}: {
  side: DeckSide
  peaks: Peaks | null
  cue: number
  onSeek: (ratio: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bitmapRef = useRef<HTMLCanvasElement | null>(null)
  const draggingRef = useRef(false)

  // Repaint the static envelope whenever the peaks or the panel size change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const paintBitmap = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      canvas.width = w
      canvas.height = h

      const bitmap = bitmapRef.current ?? document.createElement('canvas')
      bitmap.width = w
      bitmap.height = h
      bitmapRef.current = bitmap
      const bctx = bitmap.getContext('2d')
      if (!bctx) return

      bctx.clearRect(0, 0, w, h)
      const dim = getComputedStyle(document.documentElement).getPropertyValue('--ink-faint').trim() || '#625e57'
      bctx.fillStyle = dim
      const mid = h / 2

      if (!peaks) {
        bctx.globalAlpha = 0.3
        bctx.fillRect(0, mid - 1, w, 2)
        bctx.globalAlpha = 1
        return
      }

      const barW = w / peaks.buckets
      for (let i = 0; i < peaks.buckets; i++) {
        const min = peaks.data[i * 2]
        const max = peaks.data[i * 2 + 1]
        const y1 = mid - max * mid * 0.94
        const y2 = mid - min * mid * 0.94
        bctx.fillRect(i * barW, y1, Math.max(1, barW - dpr * 0.4), Math.max(1, y2 - y1))
      }
    }

    paintBitmap()
    const observer = new ResizeObserver(paintBitmap)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [peaks])

  // The live overlay: progress tint, playhead, cue marker. One rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let accent = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff6a3d'
    const themeObserver = new MutationObserver(() => {
      accent = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim() || '#ff6a3d'
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] })

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const bitmap = bitmapRef.current
      const w = canvas.width
      const h = canvas.height
      if (!bitmap || !w || !h) return

      const duration = djEngine.duration[side]
      const position = djEngine.position[side]
      const ratio = duration ? position / duration : 0

      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0)

      // Played portion in the accent colour, via a clipped overlay redraw —
      // cheaper than keeping two bitmaps, and the bitmap beneath already
      // shows through untouched for the part still to come.
      if (duration > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, w * ratio, h)
        ctx.clip()
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.55
        ctx.fillRect(0, 0, w * ratio, h)
        ctx.restore()
        ctx.globalAlpha = 1
      }

      // Cue marker.
      if (duration > 0) {
        const cueX = (cue / duration) * w
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.85
        ctx.fillRect(cueX, 0, Math.max(1, w * 0.0025), h)
        ctx.beginPath()
        ctx.moveTo(cueX, 0)
        ctx.lineTo(cueX + 8, 0)
        ctx.lineTo(cueX, 8)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Playhead.
      if (duration > 0) {
        const x = w * ratio
        ctx.fillStyle = '#fff'
        ctx.globalAlpha = 0.9
        ctx.fillRect(x - 1, 0, 2, h)
        ctx.globalAlpha = 1
      }
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      themeObserver.disconnect()
    }
  }, [side, cue])

  const seekFromEvent = (clientX: number) => {
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-20 rounded-md bg-panel-deep well cursor-pointer touch-none"
      role="slider"
      aria-label={`Deck ${side.toUpperCase()} position`}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        draggingRef.current = true
        seekFromEvent(e.clientX)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) seekFromEvent(e.clientX)
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        draggingRef.current = false
      }}
    />
  )
}
