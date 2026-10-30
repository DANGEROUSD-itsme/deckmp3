import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../lib/engine'
import { lyricsFor, peekLyrics, type LyricsResult } from '../lib/lyrics'
import { censor } from '../lib/profanity'
import { useDeck } from '../store/deck'
import type { Track } from '../types'

/**
 * The "Lyrics" visualizer mode: synced lines that flow past, the active one
 * glowing and centred, the rest dimmed by distance. Falls back to a static
 * block when lrclib only has plain text, and to a quiet empty state when it
 * has nothing at all.
 *
 * Deliberately reads the engine's clock itself on its own rAF loop instead
 * of taking `position` as a prop: NowPlaying's scrubber already re-renders
 * ~20x/second from `usePosition()`, and a lyrics line only actually changes
 * a few dozen times per song. Re-rendering a hundred-plus animated lines at
 * scrubber-rate was the actual cause of the audio glitching — the engine's
 * ScriptProcessorNode-based bitcrush (see engine.ts) shares the main thread
 * with React, and that much layout/animation work per frame was enough to
 * starve it. `memo` below keeps NowPlaying's own re-renders from cascading
 * into this component at all; internally, only an actual line change (not
 * every tick) triggers a re-render.
 */
export const LyricsView = memo(function LyricsView({
  track,
  className = '',
}: {
  track: Track
  className?: string
}) {
  const { settings, seek } = useDeck()
  const [result, setResult] = useState<LyricsResult | null | undefined>(() =>
    peekLyrics(track.id)
  )
  const [activeIndex, setActiveIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settings.lyricsEnabled) {
      setResult(null)
      return
    }
    let cancelled = false
    setResult(peekLyrics(track.id))
    void lyricsFor(track).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [track, settings.lyricsEnabled])

  const lines = result?.lines ?? null

  // The only per-frame work: find the active line. No style writes here —
  // the karaoke fill (below) is a plain CSS animation with its duration set
  // once when a line becomes active, so the browser's compositor drives it
  // with zero ongoing JS cost. An earlier version drove the fill by writing
  // a CSS variable every frame, which forced a repaint every frame too
  // (`background-position` isn't compositor-only like `transform`) — on a
  // hundred-plus lines that was enough main-thread work to start glitching
  // the audio, since engine.ts's ScriptProcessorNode-based bitcrush shares
  // the main thread with everything else.
  useEffect(() => {
    if (!lines || !lines.length) return
    let raf = 0
    let lastIndex = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const position = engine.position
      let i = 0
      while (i + 1 < lines.length && lines[i + 1].time <= position) i++
      const idx = lines[i].time <= position ? i : -1
      if (idx !== lastIndex) {
        lastIndex = idx
        setActiveIndex(idx)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lines])

  // How long the active line has to fill, derived only when the line
  // actually changes — cheap, and it's what lets the CSS animation below
  // run itself rather than being pushed frame by frame.
  const fillSeconds = useMemo(() => {
    if (!lines || activeIndex < 0) return 0
    const next = lines[activeIndex + 1]?.time ?? lines[activeIndex].time + 4
    return Math.max(0.4, next - lines[activeIndex].time)
  }, [lines, activeIndex])

  // Follow the active line with a transform instead of scrollIntoView — a
  // single compositor-friendly property, written straight to the DOM (not
  // through React state) and recomputed only when the line actually
  // changes, not on every scroll/layout tick.
  useLayoutEffect(() => {
    const list = listRef.current
    const row = list?.children[activeIndex] as HTMLElement | undefined
    if (!list || !row) return
    const container = list.parentElement
    if (!container) return
    const target = row.offsetTop + row.offsetHeight / 2 - container.clientHeight / 2
    list.style.transform = `translateY(${-target}px)`
  }, [activeIndex])

  if (!settings.lyricsEnabled) {
    return (
      <EmptyState className={className}>
        Lyrics lookup is off.
        <br />
        Turn it on under Settings → Lyrics.
      </EmptyState>
    )
  }

  if (result === undefined) {
    return <EmptyState className={className}>Looking for lyrics…</EmptyState>
  }

  if (result === null) {
    return <EmptyState className={className}>No lyrics found for this track.</EmptyState>
  }

  const mask = (s: string) => (settings.censorLyrics ? censor(s) : s)

  if (!lines || !lines.length) {
    return (
      <div className={`overflow-y-auto fade-y px-4 ${className}`}>
        <p className="label !text-[9px] mb-3 text-center">Not time-synced</p>
        <p className="text-[15px] leading-relaxed text-ink-dim whitespace-pre-line text-center max-w-md mx-auto">
          {mask(result.plain ?? '')}
        </p>
      </div>
    )
  }

  // A window around the active line keeps very long lyric sheets from
  // rendering hundreds of off-screen rows at once.
  const windowStart = Math.max(0, activeIndex - 18)
  const windowEnd = Math.min(lines.length, Math.max(activeIndex + 18, 18))

  return (
    <div className={`relative overflow-hidden fade-y px-4 ${className}`}>
      <div
        ref={listRef}
        className="max-w-md mx-auto flex flex-col gap-3 transition-transform duration-500 will-change-transform"
        style={{ paddingTop: '50%', paddingBottom: '50%' }}
      >
        {lines.map((line, i) => {
          if (i < windowStart || i >= windowEnd) {
            // Kept as a spacer so offsetTop math for every real row above
            // and below the window stays correct without rendering it.
            return <div key={i} className="h-[1.875rem]" aria-hidden="true" />
          }
          const distance = Math.abs(i - activeIndex)
          const isActive = i === activeIndex
          const state = isActive ? 'active' : distance <= 2 ? 'near' : 'far'
          const text = line.text ? mask(line.text) : ' '
          return (
            <button
              key={i}
              onClick={() => seek(line.time)}
              data-state={state}
              className="lyric-line relative text-left text-xl sm:text-2xl leading-snug font-medium"
            >
              <span>{text}</span>
              {isActive && (
                // The karaoke fill: an identical, brighter copy of the same
                // text, revealed left-to-right by a plain CSS animation
                // whose duration (how long until the next line) is set
                // once, not driven frame by frame.
                <span
                  key={activeIndex}
                  aria-hidden="true"
                  className="lyric-line-fill absolute inset-0"
                  style={{ animationDuration: `${fillSeconds}s` }}
                >
                  {text}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})

function EmptyState({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid place-items-center text-center px-6 ${className}`}>
      <p className="label normal-case tracking-normal text-ink-faint leading-relaxed">{children}</p>
    </div>
  )
}
