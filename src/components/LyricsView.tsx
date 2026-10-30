import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { lyricsFor, peekLyrics, type LyricsResult } from '../lib/lyrics'
import { censor } from '../lib/profanity'
import { useDeck } from '../store/deck'
import type { Track } from '../types'

/**
 * The "Lyrics" visualizer mode: synced lines that flow past, the active one
 * lit up and centred, the rest dimmed by distance — the karaoke-style view
 * the ring/bars/wave/orbit modes don't try to be. Falls back to a static
 * block when lrclib only has plain text, and to a quiet empty state when it
 * has nothing at all.
 */
export function LyricsView({
  track,
  position,
  className = '',
}: {
  track: Track
  position: number
  className?: string
}) {
  const { settings, seek } = useDeck()
  const [result, setResult] = useState<LyricsResult | null | undefined>(() =>
    peekLyrics(track.id)
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

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

  const activeIndex = useMemo(() => {
    if (!lines || !lines.length) return -1
    let i = 0
    while (i + 1 < lines.length && lines[i + 1].time <= position) i++
    return lines[i].time <= position ? i : -1
  }, [lines, position])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    // lrclib had text but no per-line timing — still worth showing.
    return (
      <div className={`overflow-y-auto fade-y px-4 ${className}`}>
        <p className="label !text-[9px] mb-3 text-center">Not time-synced</p>
        <p className="text-[15px] leading-relaxed text-ink-dim whitespace-pre-line text-center max-w-md mx-auto">
          {mask(result.plain ?? '')}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto fade-y px-4 py-[20vh] ${className}`}
    >
      <div className="max-w-md mx-auto flex flex-col gap-3">
        {lines.map((line, i) => {
          const distance = Math.abs(i - activeIndex)
          const isActive = i === activeIndex
          return (
            <motion.button
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={() => seek(line.time)}
              initial={false}
              animate={{
                opacity: isActive ? 1 : Math.max(0.2, 1 - distance * 0.22),
                scale: isActive ? 1 : 0.97,
              }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`text-left text-xl sm:text-2xl leading-snug font-medium transition-colors ${
                isActive ? 'text-signal' : 'text-ink-dim hover:text-ink'
              } ${!line.text ? 'h-3' : ''}`}
            >
              {line.text ? mask(line.text) : null}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyState({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid place-items-center text-center px-6 ${className}`}>
      <p className="label normal-case tracking-normal text-ink-faint leading-relaxed">{children}</p>
    </div>
  )
}
