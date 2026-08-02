import type { Album, SortKey, Track } from '../types'

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
