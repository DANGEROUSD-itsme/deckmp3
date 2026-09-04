import type { Album, Artist, SortKey, Track } from '../types'
import { fuzzyScore } from './fuzzy'

export function fmtTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** "1 hr 24 min" — for album/playlist totals, where seconds are noise. */
export function fmtDuration(seconds: number) {
  const total = Math.round(seconds / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return `${h} hr ${m} min`
}

/** Sort key that ignores a leading article, so "The Cure" files under C. */
function nameKey(s: string) {
  return s.toLowerCase().replace(/^(the|a|an)\s+/, '')
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortTracks(tracks: Track[], key: SortKey): Track[] {
  const out = [...tracks]
  switch (key) {
    case 'added':
      return out.sort((a, b) => b.addedAt - a.addedAt)
    case 'title':
      return out.sort((a, b) => collator.compare(nameKey(a.title), nameKey(b.title)))
    case 'album':
      return out.sort(
        (a, b) =>
          collator.compare(nameKey(a.album), nameKey(b.album)) ||
          (a.discNo ?? 0) - (b.discNo ?? 0) ||
          (a.trackNo ?? 0) - (b.trackNo ?? 0)
      )
    case 'artist':
    default:
      return out.sort(
        (a, b) =>
          collator.compare(nameKey(a.albumArtist), nameKey(b.albumArtist)) ||
          (a.year ?? 0) - (b.year ?? 0) ||
          collator.compare(nameKey(a.album), nameKey(b.album)) ||
          (a.discNo ?? 0) - (b.discNo ?? 0) ||
          (a.trackNo ?? 0) - (b.trackNo ?? 0)
      )
  }
}

/** Album running order: disc, then track no., then title as a last resort. */
export function albumOrder(tracks: Track[]): Track[] {
  return [...tracks].sort(
    (a, b) =>
      (a.discNo ?? 1) - (b.discNo ?? 1) ||
      (a.trackNo ?? 9999) - (b.trackNo ?? 9999) ||
      collator.compare(a.title, b.title)
  )
}

export function groupAlbums(tracks: Track[], sort: SortKey = 'artist'): Album[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const list = map.get(t.albumKey)
    if (list) list.push(t)
    else map.set(t.albumKey, [t])
  }

  const albums: Album[] = [...map.entries()].map(([key, list]) => {
    const ordered = albumOrder(list)
    const first = ordered[0]
    return {
      key,
      title: first.album,
      artist: first.albumArtist,
      year: ordered.find((t) => t.year)?.year ?? null,
      artKey: ordered.find((t) => t.artKey)?.artKey ?? null,
      tracks: ordered,
      duration: ordered.reduce((sum, t) => sum + t.duration, 0),
      addedAt: Math.max(...ordered.map((t) => t.addedAt)),
    }
  })

  if (sort === 'added') return albums.sort((a, b) => b.addedAt - a.addedAt)
  if (sort === 'title' || sort === 'album')
    return albums.sort((a, b) => collator.compare(nameKey(a.title), nameKey(b.title)))
  return albums.sort(
    (a, b) =>
      collator.compare(nameKey(a.artist), nameKey(b.artist)) ||
      (a.year ?? 0) - (b.year ?? 0) ||
      collator.compare(nameKey(a.title), nameKey(b.title))
  )
}

/**
 * Client-side search across title/artist/album. Every whitespace-separated
 * term must match somewhere, so "bowie low" narrows rather than widens.
 */
export function searchTracks(tracks: Track[], query: string): Track[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return tracks
  return tracks.filter((t) => {
    const hay = `${t.title} ${t.artist} ${t.albumArtist} ${t.album} ${t.genre ?? ''}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
}

/** Fisher–Yates, seeded from Math.random. Returns a new array. */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/* ===========================================================================
   V2.01 additions
   =========================================================================== */

/** "3.4 MB" — file sizes in the track info panel. */
export function fmtBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`
}

/** "2 days ago" — relative time, in the units a person would actually say. */
export function fmtRelative(ms: number) {
  if (!ms) return 'never'
  const diff = Date.now() - ms
  if (diff < 45_000) return 'just now'
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, 'minute'],
    [3_600_000, 'hour'],
    [86_400_000, 'day'],
    [604_800_000, 'week'],
    [2_629_800_000, 'month'],
    [31_557_600_000, 'year'],
  ]
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  let unitMs = 60_000
  let unit: Intl.RelativeTimeFormatUnit = 'minute'
  for (const [size, name] of table) {
    if (diff >= size) {
      unitMs = size
      unit = name
    }
  }
  return rtf.format(-Math.round(diff / unitMs), unit)
}

/** "1 234" — play counts, grouped so four figures stay readable. */
export function fmtCount(n: number) {
  return new Intl.NumberFormat().format(n)
}

/** "4:03 / 51:12" style totals for the stats panel. */
export function fmtLongDuration(seconds: number) {
  const total = Math.floor(seconds)
  const d = Math.floor(total / 86400)
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

/** Round a rate to the nearest label the UI offers, so 1.0 reads as "1×". */
export function fmtRate(rate: number) {
  return `${Number(rate.toFixed(2))}×`
}

/** Signed dB for EQ readouts — "+4.5" reads better than "4.5". */
export function fmtDb(db: number) {
  const v = Math.round(db * 10) / 10
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

/**
 * Group tracks by album artist. Each artist carries its albums pre-grouped so
 * the artist page doesn't have to re-derive them per render.
 */
export function groupArtists(tracks: Track[]): Artist[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const key = t.albumArtist.toLowerCase()
    const list = map.get(key)
    if (list) list.push(t)
    else map.set(key, [t])
  }
  const out: Artist[] = [...map.entries()].map(([key, list]) => ({
    key,
    name: list[0].albumArtist,
    tracks: sortTracks(list, 'album'),
    albums: groupAlbums(list, 'album'),
    duration: list.reduce((s, t) => s + t.duration, 0),
    artKey: list.find((t) => t.artKey)?.artKey ?? null,
  }))
  return out.sort((a, b) => collator.compare(nameKey(a.name), nameKey(b.name)))
}

/** Every genre in the library, with its track count, most common first. */
export function groupGenres(tracks: Track[]): { name: string; tracks: Track[] }[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const name = t.genre?.trim() || 'Unfiled'
    const list = map.get(name)
    if (list) list.push(t)
    else map.set(name, [t])
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, tracks: list }))
    .sort((a, b) => b.tracks.length - a.tracks.length || collator.compare(a.name, b.name))
}

/** Decade buckets — "1970s", "1980s" … plus "Undated" for year-less tracks. */
export function groupDecades(tracks: Track[]): { name: string; tracks: Track[] }[] {
  const map = new Map<string, Track[]>()
  for (const t of tracks) {
    const name = t.year ? `${Math.floor(t.year / 10) * 10}s` : 'Undated'
    const list = map.get(name)
    if (list) list.push(t)
    else map.set(name, [t])
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, tracks: list }))
    .sort((a, b) => (a.name === 'Undated' ? 1 : b.name === 'Undated' ? -1 : a.name.localeCompare(b.name)))
}

/**
 * Library search, upgraded. Substring matching still wins — it is what people
 * expect when they type a full word — but a query that matches nothing falls
 * through to fuzzy scoring, so "drk sd mn" still finds Dark Side of the Moon.
 */
export function searchTracksRanked(tracks: Track[], query: string): Track[] {
  const q = query.trim()
  if (!q) return tracks
  const strict = searchTracks(tracks, q)
  if (strict.length) return strict

  const scored: { track: Track; score: number }[] = []
  for (const t of tracks) {
    const hay = `${t.title} ${t.artist} ${t.album}`
    const hit = fuzzyScore(q, hay)
    if (hit) scored.push({ track: t, score: hit.score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.track)
}

/** Pick `n` random items without repeats — the "surprise me" shuffle source. */
export function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return shuffled(items)
  return shuffled(items).slice(0, n)
}

/** A stable, human-readable id for a new playlist or saved queue. */
export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
