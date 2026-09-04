import { useEffect, useRef } from 'react'
import { engine } from '../lib/engine'

/* ---------------------------------------------------------------------------
   2D canvas analysers. These run everywhere — no WebGL, no three.js — and
   they're what the transport bar and the lighter visualizer modes use.

   All of them share one rule: read the CSS custom property for the accent at
   resize time rather than per frame. getComputedStyle in a rAF loop is a
   reliable way to make an otherwise cheap canvas expensive.
   --------------------------------------------------------------------------- */

function readColor(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return v || fallback
}

/** Group linear FFT bins into `count` logarithmic bands. */
function bandEdges(binCount: number, count: number) {
  return new Array(count + 1).fill(0).map((_, i) => Math.floor(Math.pow(binCount, i / count)))
}

interface CanvasProps {
  className?: string
  /** Paused visualisers settle to rest instead of freezing mid-spike. */
  active?: boolean
}

/**
 * The thin analyser strip that lives under the transport bar. Deliberately
 * low-contrast: it's ambient information, not a control.
 */
export function SpectrumStrip({ className = '', active = true }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let colour = readColor('--signal', '#ff6a3d')
    let edges: number[] | null = null
    const BARS = 96
    const smoothed = new Float32Array(BARS)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colour = readColor('--signal', '#ff6a3d')
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    // The accent lives on <html>, so a theme or accent switch needs a re-read.
    const themeObserver = new MutationObserver(() => {
      colour = readColor('--signal', '#ff6a3d')
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    })

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (!w || !h) return

      ctx.clearRect(0, 0, w, h)
      const data = active ? engine.sample() : new Uint8Array(0)
      if (data.length && (!edges || edges.length !== BARS + 1)) {
        edges = bandEdges(data.length, BARS)
      }

      const barW = w / BARS
      ctx.fillStyle = colour

      for (let i = 0; i < BARS; i++) {
        let avg = 0
        if (data.length && edges) {
          const lo = edges[i]
          const hi = Math.max(lo + 1, edges[i + 1])
          let sum = 0
          for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
          avg = sum / (hi - lo) / 255
        }
        const target = avg * avg
        const prev = smoothed[i]
        smoothed[i] = prev + (target - prev) * (target > prev ? 0.6 : 0.09)

        const barH = Math.max(1, smoothed[i] * h)
        // Fade the far edges so the strip doesn't end in a hard vertical.
        const edgeFade = Math.min(1, Math.min(i, BARS - 1 - i) / 6)
        ctx.globalAlpha = 0.18 + smoothed[i] * 0.6 * edgeFade
        ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH)
      }
      ctx.globalAlpha = 1
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [active])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}

/** Full-size log-band analyser, the "bars" visualizer mode. */
export function SpectrumBars({ className = '', active = true }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let colour = readColor('--signal', '#ff6a3d')
    let edges: number[] | null = null
    const BARS = 56
    const smoothed = new Float32Array(BARS)
    const peaks = new Float32Array(BARS)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colour = readColor('--signal', '#ff6a3d')
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)

      const data = active ? engine.sample() : new Uint8Array(0)
      if (data.length && (!edges || edges.length !== BARS + 1)) {
        edges = bandEdges(data.length, BARS)
      }

      const gap = 2
      const barW = (w - gap * (BARS - 1)) / BARS

      for (let i = 0; i < BARS; i++) {
        let avg = 0
        if (data.length && edges) {
          const lo = edges[i]
          const hi = Math.max(lo + 1, edges[i + 1])
          let sum = 0
          for (let b = lo; b < hi && b < data.length; b++) sum += data[b]
          avg = sum / (hi - lo) / 255
        }
        const target = avg * avg
        const prev = smoothed[i]
        smoothed[i] = prev + (target - prev) * (target > prev ? 0.55 : 0.1)
        // A peak-hold cap that falls slowly — the detail that makes a bar
        // meter read as a meter rather than as decoration.
        peaks[i] = Math.max(peaks[i] - 0.006, smoothed[i])

        const x = i * (barW + gap)
        const barH = Math.max(2, smoothed[i] * h * 0.92)

        ctx.fillStyle = colour
        ctx.globalAlpha = 0.25 + smoothed[i] * 0.75
        ctx.beginPath()
        ctx.roundRect(x, h - barH, barW, barH, Math.min(barW / 2, 3))
        ctx.fill()

        ctx.globalAlpha = 0.55
        ctx.fillRect(x, h - Math.max(3, peaks[i] * h * 0.92), barW, 2)
      }
      ctx.globalAlpha = 1
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [active])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}

/** Oscilloscope — the raw waveform, drawn as one continuous stroke. */
export function Oscilloscope({ className = '', active = true }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let colour = readColor('--signal', '#ff6a3d')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colour = readColor('--signal', '#ff6a3d')
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)

      const data = active ? engine.sampleWave() : new Uint8Array(0)
      const mid = h / 2

      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = colour

      if (!data.length) {
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()
        ctx.globalAlpha = 1
        return
      }

      // Two passes: a wide, faint stroke behind a crisp one reads as a glow
      // without needing a shadow blur, which is far more expensive.
      for (const [width, alpha] of [
        [6, 0.16],
        [2, 0.95],
      ] as const) {
        ctx.lineWidth = width
        ctx.globalAlpha = alpha
        ctx.beginPath()
        const step = Math.max(1, Math.floor(data.length / w))
        for (let i = 0, x = 0; i < data.length; i += step, x += (w / data.length) * step) {
          const v = (data[i] - 128) / 128
          const y = mid + v * mid * 0.82
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [active])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}

/**
 * A pair of VU needles. Peak drives the needle, RMS drives the shadow behind
 * it — which is roughly how a real meter with a peak LED behaves.
 */
export function VuMeter({ className = '', active = true }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let colour = readColor('--signal', '#ff6a3d')
    let dim = readColor('--ink-faint', '#625e57')
    let level = 0
    let peakHold = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      colour = readColor('--signal', '#ff6a3d')
      dim = readColor('--ink-faint', '#625e57')
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const SEGMENTS = 14

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      if (!w || !h) return
      ctx.clearRect(0, 0, w, h)

      const { peak } = active ? engine.levels() : { peak: 0 }
      // Fast attack, slow decay — the ballistics of a real needle.
      level = peak > level ? level + (peak - level) * 0.5 : level + (peak - level) * 0.08
      peakHold = Math.max(peakHold - 0.008, level)

      const gap = 2
      const segH = (h - gap * (SEGMENTS - 1)) / SEGMENTS
      const lit = level * SEGMENTS
      const peakSeg = Math.floor(peakHold * SEGMENTS)

      for (let i = 0; i < SEGMENTS; i++) {
        const y = h - (i + 1) * segH - i * gap
        const on = i < lit
        const isPeak = i === peakSeg
        ctx.fillStyle = on || isPeak ? colour : dim
        // The top three segments are the "hot" zone, drawn at full strength.
        ctx.globalAlpha = on ? (i > SEGMENTS - 4 ? 1 : 0.85) : isPeak ? 0.6 : 0.13
        ctx.beginPath()
        ctx.roundRect(0, y, w, segH, 1)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [active])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
