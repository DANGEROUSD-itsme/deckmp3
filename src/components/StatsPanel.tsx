import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useDeck } from '../store/deck'
import {
  fmtCount,
  fmtLongDuration,
  fmtRelative,
  groupAlbums,
  groupArtists,
  groupGenres,
} from '../lib/format'
import { Cover } from './Cover'
import { SectionLabel, Sheet } from './ui'
import { ChartIcon, HeartIcon, PlayIcon } from './icons'

/**
 * What the library actually looks like, and what you actually listen to.
 * Everything here is derived on open rather than tracked over time — the
 * numbers are small, and a derived figure can never drift out of date.
 */
export function StatsPanel() {
  const { closePanel, tracks, stats, playNow, statsFor } = useDeck()

  const summary = useMemo(() => {
    const artists = groupArtists(tracks)
    const albums = groupAlbums(tracks)
    const genres = groupGenres(tracks)
    const rows = [...stats.values()]

    const totalPlays = rows.reduce((s, v) => s + v.plays, 0)
    const favorites = rows.filter((v) => v.favorite).length
    const rated = rows.filter((v) => v.rating > 0).length
    const runtime = tracks.reduce((s, t) => s + t.duration, 0)

    // "Time listened" is an estimate: a banked play means the listener stayed
    // past the threshold, not that they heard every second. Multiplying the
    // count by the track length is the honest approximation, and it's what
    // every scrobbler shows.
    const listened = tracks.reduce((s, t) => s + t.duration * (stats.get(t.id)?.plays ?? 0), 0)

    const topTracks = tracks
      .filter((t) => (stats.get(t.id)?.plays ?? 0) > 0)
      .sort((a, b) => (stats.get(b.id)?.plays ?? 0) - (stats.get(a.id)?.plays ?? 0))
      .slice(0, 8)

    const artistPlays = new Map<string, number>()
    for (const t of tracks) {
      const p = stats.get(t.id)?.plays ?? 0
      if (p) artistPlays.set(t.albumArtist, (artistPlays.get(t.albumArtist) ?? 0) + p)
    }
    const topArtists = [...artistPlays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

    const years = tracks.map((t) => t.year).filter((y): y is number => !!y)

    return {
      artists: artists.length,
      albums: albums.length,
      genres,
      totalPlays,
      favorites,
      rated,
      runtime,
      listened,
      topTracks,
      topArtists,
      span: years.length ? [Math.min(...years), Math.max(...years)] : null,
    }
  }, [stats, tracks])

  const maxArtistPlays = summary.topArtists[0]?.[1] ?? 1

  return (
    <Sheet
      title="Statistics"
      subtitle="Derived fresh every time you open this"
      icon={<ChartIcon className="w-[18px] h-[18px]" />}
      onClose={closePanel}
      width="sm:max-w-xl"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile label="Tracks" value={fmtCount(tracks.length)} />
        <Tile label="Albums" value={fmtCount(summary.albums)} />
        <Tile label="Artists" value={fmtCount(summary.artists)} />
        <Tile label="Runtime" value={fmtLongDuration(summary.runtime)} />
        <Tile label="Plays" value={fmtCount(summary.totalPlays)} />
        <Tile label="Time listened" value={fmtLongDuration(summary.listened)} />
        <Tile label="Favourites" value={fmtCount(summary.favorites)} />
        <Tile label="Rated" value={fmtCount(summary.rated)} />
        <Tile
          label="Years"
          value={summary.span ? `${summary.span[0]}–${summary.span[1]}` : '—'}
        />
      </div>

      {summary.topArtists.length > 0 && (
        <>
          <SectionLabel>Most played artists</SectionLabel>
          <div className="space-y-1.5">
            {summary.topArtists.map(([name, plays], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="readout label !text-[10px] w-4 shrink-0">{i + 1}</span>
                <span className="text-[13px] truncate flex-1 min-w-0">{name}</span>
                <div className="w-24 sm:w-32 h-1.5 rounded-full bg-line overflow-hidden shrink-0">
                  <motion.div
                    className="h-full bg-signal rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(plays / maxArtistPlays) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="readout label !text-[10px] w-8 text-right shrink-0">{plays}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {summary.topTracks.length > 0 && (
        <>
          <SectionLabel>On heavy rotation</SectionLabel>
          <div className="space-y-0.5">
            {summary.topTracks.map((t) => {
              const s = statsFor(t.id)
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    void playNow(t.id, summary.topTracks.map((x) => x.id))
                    closePanel()
                  }}
                  className="group w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-surface/70 text-left transition-colors"
                >
                  <div className="w-8 h-8 shrink-0 rounded-[3px] overflow-hidden well relative">
                    <Cover
                      artKey={t.artKey}
                      title={t.title}
                      className="w-full h-full"
                      rounded="rounded-[3px]"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayIcon className="w-3 h-3 text-white" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-tight truncate">{t.title}</p>
                    <p className="label mt-0.5 truncate normal-case tracking-normal">
                      {t.artist} · {fmtRelative(s.lastPlayed)}
                    </p>
                  </div>
                  {s.favorite && <HeartIcon className="w-3.5 h-3.5 text-signal shrink-0" filled />}
                  <span className="readout label !text-[10px] shrink-0">
                    {s.plays}×
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {summary.genres.length > 1 && (
        <>
          <SectionLabel>Genres</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {summary.genres.slice(0, 18).map((g) => (
              <span
                key={g.name}
                className="px-2.5 py-1 rounded-full bg-surface text-[12px] text-ink-dim"
              >
                {g.name}
                <span className="readout label !text-[9px] ml-1.5">{g.tracks.length}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {!tracks.length && (
        <p className="label text-center py-10 normal-case tracking-normal">
          Load a library and the numbers show up here.
        </p>
      )}
    </Sheet>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-md px-3 py-3">
      <p className="readout display text-xl leading-none truncate">{value}</p>
      <p className="label mt-1.5 !text-[9px]">{label}</p>
    </div>
  )
}
