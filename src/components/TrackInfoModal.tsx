import { useEffect, useState } from 'react'
import { useDeck } from '../store/deck'
import type { Track } from '../types'
import { fmtBytes, fmtCount, fmtRelative, fmtTime } from '../lib/format'
import { Cover } from './Cover'
import { SectionLabel, Sheet } from './ui'
import { HeartIcon, InfoIcon, PlayIcon, StarIcon } from './icons'

/**
 * Everything DECK knows about one file. Opened from the context menu, which
 * dispatches a window event rather than threading a setter through every list
 * — the modal is a singleton and the lists don't need to know it exists.
 */
export function TrackInfoModal() {
  const [track, setTrack] = useState<Track | null>(null)
  const { statsFor, toggleFavorite, setRating, playNow, tracks } = useDeck()

  useEffect(() => {
    const onOpen = (e: Event) => setTrack((e as CustomEvent<Track>).detail)
    window.addEventListener('deck:info', onOpen)
    return () => window.removeEventListener('deck:info', onOpen)
  }, [])

  if (!track) return null
  const stats = statsFor(track.id)

  return (
    <Sheet
      title={track.title}
      subtitle={track.artist}
      icon={<InfoIcon className="w-[18px] h-[18px]" />}
      onClose={() => setTrack(null)}
      footer={
        <>
          <button
            onClick={() => toggleFavorite(track.id)}
            className={`ghost-btn ${stats.favorite ? '!text-signal !border-signal' : ''}`}
          >
            <HeartIcon className="w-3.5 h-3.5" filled={stats.favorite} />
            {stats.favorite ? 'Favourited' : 'Favourite'}
          </button>
          <button
            onClick={() => {
              void playNow(track.id, tracks.map((t) => t.id))
              setTrack(null)
            }}
            className="pill-btn !py-2 !px-5"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            Play
          </button>
        </>
      }
    >
      <div className="flex gap-4 items-start">
        <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 well rounded-md overflow-hidden">
          <Cover
            artKey={track.artKey}
            title={track.title}
            className="w-full h-full"
            rounded="rounded-md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="display text-lg leading-tight">{track.title}</h3>
          <p className="text-sm text-ink-dim mt-1 truncate">{track.artist}</p>
          <p className="label mt-1.5 truncate">
            {track.album}
            {track.year ? ` · ${track.year}` : ''}
          </p>

          <div className="flex items-center gap-0.5 mt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(track.id, n)}
                aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                className="p-0.5 hover:scale-125 transition-transform"
              >
                <StarIcon
                  className={`w-4 h-4 ${n <= stats.rating ? 'text-signal' : 'text-ink-faint'}`}
                  filled={n <= stats.rating}
                />
              </button>
            ))}
            {stats.rating > 0 && (
              <button
                onClick={() => setRating(track.id, stats.rating)}
                className="label ml-2 hover:text-signal transition-colors"
              >
                clear
              </button>
            )}
          </div>
        </div>
      </div>

      <SectionLabel>Tags</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-6">
        <Field label="Album artist" value={track.albumArtist} />
        <Field label="Genre" value={track.genre ?? '—'} />
        <Field
          label="Track"
          value={track.trackNo ? String(track.trackNo) : '—'}
        />
        <Field label="Disc" value={track.discNo ? String(track.discNo) : '—'} />
        <Field label="Year" value={track.year ? String(track.year) : '—'} />
        <Field label="Duration" value={fmtTime(track.duration)} />
      </dl>

      <SectionLabel>File</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-6">
        <Field label="Size" value={fmtBytes(track.size)} />
        <Field
          label="Modified"
          value={track.lastModified ? fmtRelative(track.lastModified) : '—'}
        />
        <Field label="Added" value={fmtRelative(track.addedAt)} />
        <Field label="Artwork" value={track.artKey ? 'Embedded' : 'None'} />
      </dl>
      <div className="mt-2">
        <p className="label !text-[9px]">Path</p>
        <p className="readout text-[11.5px] text-ink-dim break-all mt-1 leading-relaxed">
          {track.path.join(' / ')}
        </p>
      </div>

      <SectionLabel>History</SectionLabel>
      <dl className="grid grid-cols-2 gap-x-6">
        <Field label="Plays" value={fmtCount(stats.plays)} />
        <Field label="Last played" value={fmtRelative(stats.lastPlayed)} />
        <Field label="Rating" value={stats.rating ? `${stats.rating} / 5` : 'unrated'} />
        <Field label="Favourite" value={stats.favorite ? 'yes' : 'no'} />
      </dl>
    </Sheet>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1.5 border-b border-line-soft last:border-0">
      <dt className="label !text-[9px]">{label}</dt>
      <dd className="text-[13px] mt-0.5 truncate">{value}</dd>
    </div>
  )
}
