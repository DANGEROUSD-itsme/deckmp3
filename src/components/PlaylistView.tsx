import { useMemo, useState } from 'react'
import { Reorder } from 'framer-motion'
import { useDeck } from '../store/deck'
import { fmtDuration } from '../lib/format'
import { PlayIcon, CloseIcon } from './icons'
import { TrackRow } from './TrackRow'

export function PlaylistView({ id }: { id: string }) {
  const { playlists, tracks, playNow, current, setPlaylistTracks, renamePlaylist, removePlaylist } =
    useDeck()
  const playlist = playlists.find((p) => p.id === id)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(playlist?.name ?? '')

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const orderedTracks = useMemo(
    () => (playlist?.trackIds ?? []).map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => !!t),
    [playlist, byId]
  )
  const duration = orderedTracks.reduce((s, t) => s + t.duration, 0)

  if (!playlist) {
    return (
      <div className="flex-1 grid place-items-center">
        <p className="label">Playlist not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-8 pt-6 pb-5 shrink-0 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="label">Playlist · {orderedTracks.length} tracks · {fmtDuration(duration)}</p>
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                void renamePlaylist(playlist.id, name)
                setEditingName(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="display-wide text-2xl sm:text-[28px] bg-transparent outline-none border-b border-signal mt-1 w-full"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="display-wide text-2xl sm:text-[28px] mt-1 cursor-text truncate"
              title="Click to rename"
            >
              {playlist.name}
            </h1>
          )}
        </div>
        {orderedTracks.length > 0 && (
          <button
            onClick={() => void playNow(orderedTracks[0].id, orderedTracks.map((t) => t.id))}
            className="control-btn-main w-11 h-11 shrink-0"
            aria-label="Play playlist"
          >
            <PlayIcon className="w-5 h-5 translate-x-[1px]" />
          </button>
        )}
        <button
          onClick={() => void removePlaylist(playlist.id)}
          className="control-btn w-10 h-10 shrink-0"
          aria-label="Delete playlist"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pb-8">
        {orderedTracks.length === 0 ? (
          <p className="label text-center mt-10">
            Empty. Add tracks from the Library via their menu.
          </p>
        ) : (
          <Reorder.Group
            axis="y"
            values={playlist.trackIds}
            onReorder={(order) => void setPlaylistTracks(playlist.id, order)}
            className="max-w-4xl mx-auto"
          >
            {orderedTracks.map((t) => (
              <Reorder.Item key={t.id} value={t.id}>
                <TrackRow
                  track={t}
                  isCurrent={current?.id === t.id}
                  onPlay={() => void playNow(t.id, orderedTracks.map((x) => x.id))}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  )
}
