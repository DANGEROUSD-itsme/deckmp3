import { useEffect, useState } from 'react'
import { artUrl, peekArtUrl } from '../lib/art'
import { DiscIcon } from './icons'

interface Props {
  artKey: string | null
  title: string
  className?: string
  rounded?: string
  /** Spin the placeholder disc — used on the Now Playing fallback. */
  spin?: boolean
}

/** Album art with a graceful "no cover" state — a pressed vinyl label, not a broken-image icon. */
export function Cover({ artKey, title, className = '', rounded = 'rounded-md', spin = false }: Props) {
  const [url, setUrl] = useState<string | null>(() => peekArtUrl(artKey))
  // Art that was already in the URL cache is painted immediately; only a
  // genuine async load gets the fade, so scrolling a list doesn't flicker.
  const [loaded, setLoaded] = useState(() => !!peekArtUrl(artKey))

  useEffect(() => {
    let cancelled = false
    const cached = peekArtUrl(artKey)
    setUrl(cached)
    setLoaded(!!cached)
    if (artKey && !cached) {
      void artUrl(artKey).then((u) => {
        if (!cancelled) setUrl(u)
      })
    }
    return () => {
      cancelled = true
    }
  }, [artKey])

  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`${className} ${rounded} object-cover bg-surface drag-none transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    )
  }

  return (
    <div
      className={`${className} ${rounded} bg-surface flex items-center justify-center text-ink-faint/70 overflow-hidden relative`}
      aria-label={`No artwork for ${title}`}
    >
      {/* Concentric grooves, so a coverless album still looks like a record. */}
      <span
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'repeating-radial-gradient(circle at 50% 50%, transparent 0 3px, currentColor 3px 3.5px)',
        }}
      />
      <DiscIcon className={`w-[38%] h-[38%] relative ${spin ? 'spin-slow' : ''}`} />
    </div>
  )
}
