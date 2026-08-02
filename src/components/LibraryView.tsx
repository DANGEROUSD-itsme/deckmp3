import { useMemo, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { useDeck } from '../store/deck'
import type { Album, SortKey, Track } from '../types'
import { fmtDuration, groupAlbums, searchTracks, sortTracks } from '../lib/format'
import { Cover } from './Cover'
import { GridIcon, ListIcon, PlayIcon, SearchIcon } from './icons'
import { TrackRow } from './TrackRow'
import { EmptyLibrary } from './EmptyLibrary'

type Mode = 'albums' | 'tracks'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.02 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
}

function AlbumCard({
  album,
  onOpen,
  onPlay,
}: {
  album: Album
  onOpen: () => void
  onPlay: () => void
}) {
  return (
    <motion.button
      variants={item}
      onClick={onOpen}
      className="group text-left"
    >
      <div className="relative well rounded-md overflow-hidden aspect-square bg-surface">
        <Cover artKey={album.artKey} title={album.title} className="w-full h-full" rounded="rounded-md" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200" />
        <motion.span
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          whileTap={{ scale: 0.9 }}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-signal text-white grid place-items-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg"
        >
          <PlayIcon className="w-4 h-4 translate-x-[1px]" />
        </motion.span>
      </div>
      <p className="display text-[13.5px] mt-2.5 truncate leading-tight">{album.title}</p>
      <p className="label mt-1 truncate">
        {album.artist}
        {album.year ? ` · ${album.year}` : ''}
      </p>
    </motion.button>
  )
}

function AlbumDetail({ album, onClose }: { album: Album; onClose: () => void }) {
  const { playNow, current } = useDeck()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="brushed bg-panel w-full sm:max-w-2xl sm:rounded-lg h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto border border-line raise"
      >
        <div className="p-5 sm:p-7 flex gap-5 items-end sticky top-0 bg-panel/95 backdrop-blur border-b border-line z-10">
          <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 well rounded-md overflow-hidden">
            <Cover artKey={album.artKey} title={album.title} className="w-full h-full" rounded="rounded-md" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label">{album.tracks.length} tracks · {fmtDuration(album.duration)}</p>
            <h2 className="display-wide text-2xl sm:text-3xl leading-[1.05] mt-1 truncate">
              {album.title}
            </h2>
            <p className="text-sm text-ink-dim mt-1 truncate">
              {album.artist}
              {album.year ? ` · ${album.year}` : ''}
            </p>
          </div>
          <button
            onClick={() => void playNow(album.tracks[0].id, album.tracks.map((t) => t.id))}
            className="control-btn-main w-11 h-11 shrink-0"
            aria-label={`Play ${album.title}`}
          >
            <PlayIcon className="w-5 h-5 translate-x-[1px]" />
          </button>
        </div>
        <div className="p-2 sm:p-3">
          {album.tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i + 1}
              isCurrent={current?.id === t.id}
              onPlay={() => void playNow(t.id, album.tracks.map((x) => x.id))}
              showArt={false}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function LibraryView() {
  const { tracks, status, playNow, current } = useDeck()
  const [mode, setMode] = useState<Mode>('albums')
  const [sort, setSort] = useState<SortKey>('artist')
  const [query, setQuery] = useState('')
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null)

  const filtered = useMemo(() => searchTracks(tracks, query), [tracks, query])
  const albums = useMemo(() => groupAlbums(filtered, sort), [filtered, sort])
  const trackList = useMemo(() => sortTracks(filtered, sort), [filtered, sort])

  if (status === 'empty' || status === 'loading') {
    return <EmptyLibrary status={status} />
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-8 pt-6 pb-4 flex flex-wrap items-center gap-3 shrink-0">
        <h1 className="display-wide text-2xl sm:text-[28px] mr-auto">Library</h1>

        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums…"
            className="bg-surface rounded-full pl-9 pr-4 py-2 text-sm w-52 sm:w-72 outline-none border border-transparent focus:border-signal transition-colors"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="label bg-surface rounded-full px-3.5 py-2 outline-none border border-transparent focus:border-signal cursor-pointer"
        >
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="title">Title</option>
          <option value="added">Recently added</option>
        </select>

        <div className="flex items-center bg-surface rounded-full p-1">
          <button
            onClick={() => setMode('albums')}
            className={`w-8 h-8 rounded-full grid place-items-center transition-colors ${mode === 'albums' ? 'bg-panel text-ink shadow-sm' : 'text-ink-faint'}`}
            aria-label="Album grid"
            aria-pressed={mode === 'albums'}
          >
            <GridIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode('tracks')}
            className={`w-8 h-8 rounded-full grid place-items-center transition-colors ${mode === 'tracks' ? 'bg-panel text-ink shadow-sm' : 'text-ink-faint'}`}
            aria-label="Track list"
            aria-pressed={mode === 'tracks'}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-8">
        {mode === 'albums' ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-x-4 gap-y-6 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]"
          >
            {albums.map((album) => (
              <AlbumCard
                key={album.key}
                album={album}
                onOpen={() => setOpenAlbum(album)}
                onPlay={() => void playNow(album.tracks[0].id, album.tracks.map((t) => t.id))}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl">
            {trackList.map((t: Track) => (
              <TrackRow
                key={t.id}
                track={t}
                isCurrent={current?.id === t.id}
                onPlay={() => void playNow(t.id, trackList.map((x) => x.id))}
              />
            ))}
          </motion.div>
        )}
        {!albums.length && (
          <p className="label mt-10 text-center">No matches for "{query}".</p>
        )}
      </div>

      <AnimatePresence>
        {openAlbum && <AlbumDetail album={openAlbum} onClose={() => setOpenAlbum(null)} />}
      </AnimatePresence>
    </div>
  )
}
