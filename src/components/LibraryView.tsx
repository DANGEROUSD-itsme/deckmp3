import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import { useDeck } from '../store/deck'
import type { Album, Artist, SortKey, Track } from '../types'
import { SMART_VIEWS, type SmartViewId } from '../types'
import {
  fmtDuration,
  groupAlbums,
  groupArtists,
  groupGenres,
  searchTracksRanked,
  sortTracks,
} from '../lib/format'
import { Cover } from './Cover'
import {
  ChevronIcon,
  GridIcon,
  ListIcon,
  PlayIcon,
  PlayNextIcon,
  SearchIcon,
  ShuffleIcon,
  TagIcon,
  UserIcon,
} from './icons'
import { TrackRow } from './TrackRow'
import { EmptyLibrary } from './EmptyLibrary'
import { useOverlay } from './ui'

type Mode = 'albums' | 'tracks' | 'artists' | 'genres'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.02 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
}
/** Used when list animation is switched off — same API, no motion. */
const still: Variants = { hidden: {}, show: {} }

/* ----------------------------------------------------------------- cards -- */

function AlbumCard({
  album,
  onOpen,
  onPlay,
  onQueue,
}: {
  album: Album
  onOpen: () => void
  onPlay: () => void
  onQueue: () => void
}) {
  return (
    <motion.div variants={item} className="group">
      <button onClick={onOpen} className="w-full text-left" aria-label={`Open ${album.title}`}>
        <div className="relative well rounded-md overflow-hidden aspect-square bg-surface">
          <Cover
            artKey={album.artKey}
            title={album.title}
            className="w-full h-full transition-transform duration-500 group-hover:scale-[1.06]"
            rounded="rounded-md"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="absolute bottom-2.5 left-2.5 label !text-[9px] text-white/85 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
            {album.tracks.length} · {fmtDuration(album.duration)}
          </span>
        </div>
      </button>

      {/* Play sits on the artwork; queue tucks in beside it. Both stop
          propagation so they never open the album sheet by accident. */}
      <div className="relative -mt-12 mr-2.5 flex items-center justify-end gap-1.5 pointer-events-none">
        <motion.button
          onClick={(e) => {
            e.stopPropagation()
            onQueue()
          }}
          whileTap={{ scale: 0.9 }}
          aria-label={`Queue ${album.title}`}
          className="pointer-events-auto w-8 h-8 rounded-full glass border border-white/15 text-white grid place-items-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 delay-[30ms]"
        >
          <PlayNextIcon className="w-3.5 h-3.5" />
        </motion.button>
        <motion.button
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          whileTap={{ scale: 0.9 }}
          aria-label={`Play ${album.title}`}
          className="pointer-events-auto w-10 h-10 rounded-full bg-signal text-white grid place-items-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg"
        >
          <PlayIcon className="w-4 h-4 translate-x-[1px]" />
        </motion.button>
      </div>

      <button onClick={onOpen} className="w-full text-left mt-2.5">
        <p className="display text-[13.5px] truncate leading-tight group-hover:text-signal transition-colors">
          {album.title}
        </p>
        <p className="label mt-1 truncate">
          {album.artist}
          {album.year ? ` · ${album.year}` : ''}
        </p>
      </button>
    </motion.div>
  )
}

function ArtistCard({ artist, onOpen }: { artist: Artist; onOpen: () => void }) {
  return (
    <motion.button variants={item} onClick={onOpen} className="group text-left">
      {/* Round crop for people, square for records — the oldest cue in the book. */}
      <div className="relative well rounded-full overflow-hidden aspect-square bg-surface">
        <Cover
          artKey={artist.artKey}
          title={artist.name}
          className="w-full h-full transition-transform duration-500 group-hover:scale-[1.07]"
          rounded="rounded-full"
        />
        <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10" />
      </div>
      <p className="display text-[13.5px] mt-2.5 truncate leading-tight text-center group-hover:text-signal transition-colors">
        {artist.name}
      </p>
      <p className="label mt-1 truncate text-center">
        {artist.albums.length} album{artist.albums.length === 1 ? '' : 's'}
      </p>
    </motion.button>
  )
}

/* ---------------------------------------------------------------- detail -- */

function AlbumDetail({ album, onClose }: { album: Album; onClose: () => void }) {
  const { playNow, current, addToQueue, shuffle, toggleShuffle } = useDeck()
  const ref = useOverlay(onClose)
  const ids = album.tracks.map((t) => t.id)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={album.title}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="brushed bg-panel w-full sm:max-w-2xl sm:rounded-lg h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto border border-line raise-lg"
      >
        <div className="p-5 sm:p-7 flex gap-5 items-end sticky top-0 bg-panel/95 backdrop-blur border-b border-line z-10">
          <div className="w-24 h-24 sm:w-32 sm:h-32 shrink-0 well rounded-md overflow-hidden">
            <Cover
              artKey={album.artKey}
              title={album.title}
              className="w-full h-full"
              rounded="rounded-md"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label">
              {album.tracks.length} tracks · {fmtDuration(album.duration)}
            </p>
            <h2 className="display-wide text-2xl sm:text-3xl leading-[1.05] mt-1 truncate">
              {album.title}
            </h2>
            <p className="text-sm text-ink-dim mt-1 truncate">
              {album.artist}
              {album.year ? ` · ${album.year}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => addToQueue(ids)}
              className="control-btn w-9 h-9"
              aria-label={`Queue ${album.title}`}
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
              aria-label={`Shuffle ${album.title}`}
              title="Shuffle this album"
            >
              <ShuffleIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => void playNow(album.tracks[0].id, ids)}
              className="control-btn-main w-11 h-11"
              aria-label={`Play ${album.title}`}
              data-autofocus
            >
              <PlayIcon className="w-5 h-5 translate-x-[1px]" />
            </button>
          </div>
        </div>
        <div className="p-2 sm:p-3">
          {album.tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i + 1}
              isCurrent={current?.id === t.id}
              onPlay={() => void playNow(t.id, ids)}
              showArt={false}
              showRating
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ArtistDetail({
  artist,
  onClose,
  onOpenAlbum,
}: {
  artist: Artist
  onClose: () => void
  onOpenAlbum: (a: Album) => void
}) {
  const { playNow, current, shuffle, toggleShuffle } = useDeck()
  const ref = useOverlay(onClose)
  const ids = artist.tracks.map((t) => t.id)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={artist.name}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="brushed bg-panel w-full sm:max-w-3xl sm:rounded-lg h-full sm:h-auto sm:max-h-[85vh] overflow-y-auto border border-line raise-lg"
      >
        <div className="p-5 sm:p-7 flex gap-5 items-end sticky top-0 bg-panel/95 backdrop-blur border-b border-line z-10">
          <div className="w-20 h-20 sm:w-28 sm:h-28 shrink-0 well rounded-full overflow-hidden">
            <Cover
              artKey={artist.artKey}
              title={artist.name}
              className="w-full h-full"
              rounded="rounded-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="label">
              {artist.albums.length} albums · {artist.tracks.length} tracks ·{' '}
              {fmtDuration(artist.duration)}
            </p>
            <h2 className="display-wide text-2xl sm:text-3xl leading-[1.05] mt-1 truncate">
              {artist.name}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                if (!shuffle) toggleShuffle()
                void playNow(ids[Math.floor(Math.random() * ids.length)], ids)
              }}
              className="control-btn w-9 h-9"
              aria-label={`Shuffle ${artist.name}`}
            >
              <ShuffleIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => void playNow(ids[0], ids)}
              className="control-btn-main w-11 h-11"
              aria-label={`Play ${artist.name}`}
              data-autofocus
            >
              <PlayIcon className="w-5 h-5 translate-x-[1px]" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <p className="label mb-3">Albums</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))] mb-6">
            {artist.albums.map((a) => (
              <button key={a.key} onClick={() => onOpenAlbum(a)} className="group text-left">
                <div className="well rounded overflow-hidden aspect-square">
                  <Cover
                    artKey={a.artKey}
                    title={a.title}
                    className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                    rounded="rounded"
                  />
                </div>
                <p className="text-[12.5px] mt-1.5 truncate group-hover:text-signal transition-colors">
                  {a.title}
                </p>
                <p className="label !text-[9px] mt-0.5">{a.year ?? '—'}</p>
              </button>
            ))}
          </div>

          <p className="label mb-2">All tracks</p>
          {artist.tracks.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              isCurrent={current?.id === t.id}
              onPlay={() => void playNow(t.id, ids)}
              showRating
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ view -- */

export function LibraryView({ smart }: { smart?: SmartViewId }) {
  const { tracks, status, playNow, current, settings, smartList, addToQueue, shuffle, toggleShuffle } =
    useDeck()
  const [mode, setMode] = useState<Mode>('albums')
  const [sort, setSort] = useState<SortKey>('artist')
  const [query, setQuery] = useState('')
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null)
  const [openArtist, setOpenArtist] = useState<Artist | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const smartView = smart ? SMART_VIEWS.find((v) => v.id === smart) : undefined

  // A smart view is a fixed list, so it always opens as a track list — an
  // album grid of "recently played" would be a lie about what you're seeing.
  const source = useMemo(
    () => (smart ? smartList(smart) : tracks),
    [smart, smartList, tracks]
  )

  const filtered = useMemo(() => searchTracksRanked(source, query), [source, query])
  const albums = useMemo(() => groupAlbums(filtered, sort), [filtered, sort])
  const artists = useMemo(() => groupArtists(filtered), [filtered])
  const genres = useMemo(() => groupGenres(filtered), [filtered])
  const trackList = useMemo(
    // Smart views carry their own meaningful order — don't re-sort them
    // unless the user has explicitly picked a sort other than the default.
    () => (smart && sort === 'artist' ? filtered : sortTracks(filtered, sort)),
    [filtered, smart, sort]
  )

  const effectiveMode: Mode = smart ? 'tracks' : mode

  // "/" focuses search from anywhere in the library.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key.toLowerCase() === 'g' && !smart) {
        setMode((m) => (m === 'albums' ? 'tracks' : 'albums'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [smart])

  // A new search wipes any open sheet — otherwise you filter the grid behind
  // a modal you can no longer see the context for.
  useEffect(() => {
    if (query) {
      setOpenAlbum(null)
      setOpenArtist(null)
    }
  }, [query])

  if (status === 'empty' || status === 'loading') {
    return <EmptyLibrary status={status} />
  }

  const allIds = trackList.map((t) => t.id)
  const variants = settings.listAnimation ? container : still
  const rowVariants = settings.listAnimation ? item : still

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 sm:px-8 pt-6 pb-4 flex flex-wrap items-center gap-3 shrink-0">
        <div className="mr-auto min-w-0">
          <h1 className="display-wide text-2xl sm:text-[28px] truncate">
            {smartView?.name ?? 'Library'}
          </h1>
          <p className="label mt-0.5 normal-case tracking-normal">
            {smartView?.hint ??
              `${tracks.length} tracks · ${albums.length} albums · ${artists.length} artists`}
          </p>
        </div>

        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Search…  (press /)"
            aria-label="Search library"
            className="bg-surface rounded-full pl-9 pr-4 py-2 text-sm w-44 sm:w-72 outline-none border border-transparent focus:border-signal transition-colors"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort by"
          className="label bg-surface rounded-full px-3.5 py-2 outline-none border border-transparent focus:border-signal cursor-pointer"
        >
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="title">Title</option>
          <option value="added">Recently added</option>
        </select>

        {!smart && (
          <div className="flex items-center bg-surface rounded-full p-1">
            {(
              [
                ['albums', GridIcon, 'Album grid'],
                ['tracks', ListIcon, 'Track list'],
                ['artists', UserIcon, 'Artists'],
                ['genres', TagIcon, 'Genres'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`relative w-8 h-8 rounded-full grid place-items-center transition-colors ${
                  mode === id ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                }`}
                aria-label={label}
                title={label}
                aria-pressed={mode === id}
              >
                {mode === id && (
                  <motion.span
                    layoutId="library-mode"
                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                    className="absolute inset-0 rounded-full bg-panel raise"
                  />
                )}
                <Icon className="w-4 h-4 relative z-10" />
              </button>
            ))}
          </div>
        )}

        {trackList.length > 0 && (
          <button
            onClick={() => {
              if (!shuffle) toggleShuffle()
              void playNow(allIds[Math.floor(Math.random() * allIds.length)], allIds)
            }}
            className="ghost-btn"
            title="Shuffle everything shown"
          >
            <ShuffleIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={effectiveMode + (smart ?? '')}
            variants={variants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {effectiveMode === 'albums' && (
              <div
                className="grid gap-x-4 gap-y-6"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${settings.gridSize}px, 1fr))`,
                }}
              >
                {albums.map((album) => (
                  <AlbumCard
                    key={album.key}
                    album={album}
                    onOpen={() => setOpenAlbum(album)}
                    onPlay={() =>
                      void playNow(album.tracks[0].id, album.tracks.map((t) => t.id))
                    }
                    onQueue={() => addToQueue(album.tracks.map((t) => t.id))}
                  />
                ))}
              </div>
            )}

            {effectiveMode === 'artists' && (
              <div
                className="grid gap-x-4 gap-y-6"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(
                    120,
                    settings.gridSize - 28
                  )}px, 1fr))`,
                }}
              >
                {artists.map((artist) => (
                  <ArtistCard
                    key={artist.key}
                    artist={artist}
                    onOpen={() => setOpenArtist(artist)}
                  />
                ))}
              </div>
            )}

            {effectiveMode === 'genres' && (
              <div className="max-w-3xl space-y-2">
                {genres.map((g) => (
                  <motion.div key={g.name} variants={rowVariants}>
                    <GenreRow
                      name={g.name}
                      tracks={g.tracks}
                      onPlay={() => void playNow(g.tracks[0].id, g.tracks.map((t) => t.id))}
                      onQueue={() => addToQueue(g.tracks.map((t) => t.id))}
                    />
                  </motion.div>
                ))}
              </div>
            )}

            {effectiveMode === 'tracks' && (
              <div className="max-w-4xl">
                {trackList.map((t: Track, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    index={smart ? i + 1 : undefined}
                    isCurrent={current?.id === t.id}
                    onPlay={() => void playNow(t.id, allIds)}
                    showRating
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {!filtered.length && (
          <div className="text-center mt-16">
            <p className="label">
              {query ? `No matches for “${query}”.` : 'Nothing here yet.'}
            </p>
            {query && (
              <button onClick={() => setQuery('')} className="ghost-btn mt-4">
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {openAlbum && <AlbumDetail album={openAlbum} onClose={() => setOpenAlbum(null)} />}
        {openArtist && !openAlbum && (
          <ArtistDetail
            artist={openArtist}
            onClose={() => setOpenArtist(null)}
            onOpenAlbum={(a) => setOpenAlbum(a)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** A collapsible genre group — heading, counts, and the tracks underneath. */
function GenreRow({
  name,
  tracks,
  onPlay,
  onQueue,
}: {
  name: string
  tracks: Track[]
  onPlay: () => void
  onQueue: () => void
}) {
  const { playNow, current } = useDeck()
  const [open, setOpen] = useState(false)
  const duration = tracks.reduce((s, t) => s + t.duration, 0)
  const ids = tracks.map((t) => t.id)

  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface/50 hover:bg-surface transition-colors">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <ChevronIcon
            className="w-3.5 h-3.5 text-ink-faint shrink-0 transition-transform"
            dir={open ? 'down' : 'right'}
          />
          <TagIcon className="w-4 h-4 text-ink-faint shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block display text-sm truncate">{name}</span>
            <span className="label block mt-0.5 normal-case tracking-normal">
              {tracks.length} tracks · {fmtDuration(duration)}
            </span>
          </span>
        </button>
        <button onClick={onQueue} className="control-btn w-8 h-8 shrink-0" aria-label={`Queue ${name}`}>
          <PlayNextIcon className="w-3.5 h-3.5" />
        </button>
        <button onClick={onPlay} className="control-btn-main w-9 h-9 shrink-0" aria-label={`Play ${name}`}>
          <PlayIcon className="w-4 h-4 translate-x-[1px]" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="p-2 max-h-80 overflow-y-auto">
              {tracks.slice(0, 100).map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  isCurrent={current?.id === t.id}
                  onPlay={() => void playNow(t.id, ids)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
