import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, Reorder, motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import { fmtDuration, searchTracksRanked } from '../lib/format'
import {
  CopyIcon,
  PlayIcon,
  PlayNextIcon,
  SearchIcon,
  ShuffleIcon,
  TrashIcon,
} from './icons'
import { TrackRow } from './TrackRow'

export function PlaylistView({ id, onLeave }: { id: string; onLeave: () => void }) {
  const {
    playlists,
    tracks,
    playNow,
    current,
    setPlaylistTracks,
    renamePlaylist,
    removePlaylist,
    removeFromPlaylist,
    duplicatePlaylist,
    addToQueue,
    shuffle,
    toggleShuffle,
    ask,
    settings,
  } = useDeck()

  const playlist = playlists.find((p) => p.id === id)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(playlist?.name ?? '')
  const [query, setQuery] = useState('')

  /**
   * The name field is local state, so it has to be re-seeded when the route
   * changes to a different playlist — otherwise navigating between two
   * playlists leaves the previous one's name in the input, and blurring it
   * would rename the new playlist to the old one's name.
   */
  useEffect(() => {
    setName(playlist?.name ?? '')
    setEditingName(false)
    setQuery('')
  }, [id, playlist?.name])

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const orderedTracks = useMemo(
    () =>
      (playlist?.trackIds ?? [])
        .map((tid) => byId.get(tid))
        .filter((t): t is NonNullable<typeof t> => !!t),
    [playlist, byId]
  )
  const visible = useMemo(
    () => searchTracksRanked(orderedTracks, query),
    [orderedTracks, query]
  )
  const duration = orderedTracks.reduce((s, t) => s + t.duration, 0)
  const ids = orderedTracks.map((t) => t.id)

  if (!playlist) {
    return (
      <div className="flex-1 grid place-items-center">
        <div className="text-center">
          <p className="label">Playlist not found.</p>
          <button onClick={onLeave} className="ghost-btn mt-4">
            Back to library
          </button>
        </div>
      </div>
    )
  }

  /** Missing rows are tracks that left the library — surface, don't hide. */
  const missing = playlist.trackIds.length - orderedTracks.length

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-8 pt-6 pb-5 shrink-0 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="label">
            Playlist · {orderedTracks.length} tracks · {fmtDuration(duration)}
            {missing > 0 && (
              <span className="text-[#e0523c]"> · {missing} missing</span>
            )}
          </p>
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                void renamePlaylist(playlist.id, name)
                setEditingName(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setName(playlist.name)
                  setEditingName(false)
                }
              }}
              className="display-wide text-2xl sm:text-[28px] bg-transparent outline-none border-b border-signal mt-1 w-full"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="display-wide text-2xl sm:text-[28px] mt-1 cursor-text truncate hover:text-signal transition-colors"
              title="Click to rename"
            >
              {playlist.name}
            </h1>
          )}
        </div>

        {orderedTracks.length > 0 && (
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              aria-label="Filter this playlist"
              className="bg-surface rounded-full pl-9 pr-4 py-2 text-sm w-36 sm:w-52 outline-none border border-transparent focus:border-signal transition-colors"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {orderedTracks.length > 0 && (
            <>
              <button
                onClick={() => addToQueue(ids)}
                className="control-btn w-9 h-9"
                aria-label="Add playlist to queue"
                title="Add to queue"
              >
                <PlayNextIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (!shuffle) toggleShuffle()
                  void playNow(ids[Math.floor(Math.random() * ids.length)], ids)
                }}
                className="control-btn w-9 h-9"
                aria-label="Shuffle playlist"
                title="Shuffle"
              >
                <ShuffleIcon className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => void duplicatePlaylist(playlist.id)}
            className="control-btn w-9 h-9"
            aria-label="Duplicate playlist"
            title="Duplicate"
          >
            <CopyIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              ask({
                title: `Delete “${playlist.name}”?`,
                body: 'The playlist is removed. The tracks themselves stay in your library.',
                confirmLabel: 'Delete',
                destructive: true,
                run: () => {
                  void removePlaylist(playlist.id)
                  onLeave()
                },
              })
            }
            className="control-btn w-9 h-9 hover:!text-[#e0523c]"
            aria-label="Delete playlist"
            title="Delete"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
          {orderedTracks.length > 0 && (
            <button
              onClick={() => void playNow(ids[0], ids)}
              className="control-btn-main w-11 h-11"
              aria-label="Play playlist"
            >
              <PlayIcon className="w-5 h-5 translate-x-[1px]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pb-8">
        {orderedTracks.length === 0 ? (
          <div className="text-center mt-16">
            <p className="label normal-case tracking-normal leading-relaxed max-w-xs mx-auto">
              Nothing here yet. Right-click any track in the library and choose
              “Add to playlist”.
            </p>
            <button onClick={onLeave} className="ghost-btn mt-5">
              Browse the library
            </button>
          </div>
        ) : query ? (
          /* Filtering and drag-reordering can't coexist — the visible order
             isn't the stored order — so the filtered view is a plain list. */
          <div className="max-w-4xl mx-auto">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <motion.div key={t.id} layout>
                  <TrackRow
                    track={t}
                    isCurrent={current?.id === t.id}
                    onPlay={() => void playNow(t.id, ids)}
                    showRating
                    menuExtra={{
                      label: 'Remove from this playlist',
                      destructive: true,
                      run: () => void removeFromPlaylist(playlist.id, t.id),
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {!visible.length && (
              <p className="label text-center mt-10">No matches in this playlist.</p>
            )}
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={playlist.trackIds}
            onReorder={(order) => void setPlaylistTracks(playlist.id, order)}
            className="max-w-4xl mx-auto"
            variants={settings.listAnimation ? undefined : {}}
          >
            {orderedTracks.map((t, i) => (
              <Reorder.Item key={t.id} value={t.id} className="touch-none">
                <TrackRow
                  track={t}
                  index={i + 1}
                  isCurrent={current?.id === t.id}
                  onPlay={() => void playNow(t.id, ids)}
                  showArt
                  showRating
                  menuExtra={{
                    label: 'Remove from this playlist',
                    destructive: true,
                    run: () => void removeFromPlaylist(playlist.id, t.id),
                  }}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  )
}
