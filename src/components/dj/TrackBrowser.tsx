import { useMemo, useState } from 'react'
import { useDeck } from '../../store/deck'
import type { DeckSide } from '../../lib/djEngine'
import type { Track } from '../../types'
import { fmtTime, searchTracksRanked } from '../../lib/format'
import { Cover } from '../Cover'
import { SearchIcon } from '../icons'

/**
 * The in-mixer crate. Queuing up the next tune is the whole point of DJ mode,
 * so this stays inline rather than sending the DJ back out to the library —
 * search, see the result, drop it straight onto A or B.
 */
export function TrackBrowser({
  onLoad,
  loadingSide,
}: {
  onLoad: (side: DeckSide, track: Track) => void
  /** Which deck is mid-load, so its buttons can show a spinner state. */
  loadingSide: DeckSide | null
}) {
  const { tracks } = useDeck()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const ranked = searchTracksRanked(tracks, query)
    return ranked.slice(0, 60)
  }, [tracks, query])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-1 pb-2">
        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the crate…"
            aria-label="Search tracks to load"
            className="field !pl-8 !py-1.5 !text-[12.5px] w-full"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-0.5">
        {results.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-surface/70 transition-colors"
          >
            <div className="w-8 h-8 shrink-0 rounded-[3px] overflow-hidden well">
              <Cover artKey={t.artKey} title={t.title} className="w-full h-full" rounded="rounded-[3px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-tight truncate">{t.title}</p>
              <p className="label !text-[9px] mt-0.5 truncate normal-case tracking-normal">
                {t.artist} · {fmtTime(t.duration)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onLoad('a', t)}
                disabled={loadingSide === 'a'}
                className="w-7 h-7 rounded-md border border-line text-[11px] font-semibold text-ink-dim hover:text-signal hover:border-signal transition-colors disabled:opacity-40"
                aria-label={`Load ${t.title} to deck A`}
              >
                A
              </button>
              <button
                onClick={() => onLoad('b', t)}
                disabled={loadingSide === 'b'}
                className="w-7 h-7 rounded-md border border-line text-[11px] font-semibold text-ink-dim hover:text-signal hover:border-signal transition-colors disabled:opacity-40"
                aria-label={`Load ${t.title} to deck B`}
              >
                B
              </button>
            </div>
          </div>
        ))}
        {!results.length && (
          <p className="label text-center py-8 normal-case tracking-normal">
            {query ? `No matches for "${query}".` : 'No tracks in your library yet.'}
          </p>
        )}
      </div>
    </div>
  )
}
