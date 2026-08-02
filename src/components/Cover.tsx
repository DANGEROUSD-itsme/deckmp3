import { useEffect, useState } from 'react'
import { artUrl, peekArtUrl } from '../lib/art'
import { DiscIcon } from './icons'

interface Props {
  artKey: string | null
  title: string
  className?: string
  rounded?: string
}

/** Album art with a graceful "no cover" state — a pressed vinyl label, not a broken-image icon. */
export function Cover({ artKey, title, className = '', rounded = 'rounded-md' }: Props) {
  const [url, setUrl] = useState<string | null>(() => peekArtUrl(artKey))

  useEffect(() => {
    let cancelled = false
    setUrl(peekArtUrl(artKey))
    if (artKey) {
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
        className={`${className} ${rounded} object-cover bg-surface`}
      />
    )
  }

  return (
    <div
      className={`${className} ${rounded} bg-surface flex items-center justify-center text-ink-faint/70`}
      aria-label={`No artwork for ${title}`}
    >
      <DiscIcon className="w-[38%] h-[38%]" />
    </div>
  )
}
