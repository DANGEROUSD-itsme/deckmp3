import { getLyrics, putLyrics } from './db'
import type { Track } from '../types'

/**
 * Synced lyrics, looked up live from lrclib.net (https://lrclib.net) by
 * artist/title/album/duration — a free, keyless, community-run lookup. This
 * is the one place in DECK that sends track metadata (never audio) to a
 * third party, and only when `settings.lyricsEnabled` is on and a track
 * actually starts playing. Results are cached locally so the same track
 * never looks itself up twice.
 */

export interface LyricsLine {
  /** Seconds from the start of the track. */
  time: number
  text: string
}

export interface LyricsResult {
  /** Time-synced lines, or null when lrclib only has (or has no) plain text. */
  lines: LyricsLine[] | null
  plain: string | null
}

const cache = new Map<string, LyricsResult | null>()
const inflight = new Map<string, Promise<LyricsResult | null>>()

/** `[mm:ss.xx]text`, one or more timestamps per line, LRC's usual shape. */
function parseLRC(lrc: string): LyricsLine[] {
  const stamp = /\[(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)\]/g
  const lines: LyricsLine[] = []
  for (const raw of lrc.split('\n')) {
    const matches = [...raw.matchAll(stamp)]
    if (!matches.length) continue
    const text = raw.replace(stamp, '').trim()
    for (const m of matches) {
      const minutes = parseInt(m[1], 10)
      const seconds = parseFloat(m[2].replace(':', '.'))
      lines.push({ time: minutes * 60 + seconds, text })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

interface LrclibHit {
  syncedLyrics: string | null
  plainLyrics: string | null
  instrumental: boolean
}

async function queryLrclib(track: Track): Promise<LrclibHit | null> {
  const base = 'https://lrclib.net/api'
  const qs = new URLSearchParams({
    artist_name: track.artist,
    track_name: track.title,
    album_name: track.album,
    duration: String(Math.round(track.duration)),
  })

  const exact = await fetch(`${base}/get?${qs}`).catch(() => null)
  if (exact?.ok) return exact.json()

  // No exact duration match — fall back to a fuzzy search and take the
  // closest duration, which covers singles vs album edits, remasters, etc.
  const search = await fetch(
    `${base}/search?${new URLSearchParams({ artist_name: track.artist, track_name: track.title })}`
  ).catch(() => null)
  if (!search?.ok) return null
  const hits: (LrclibHit & { duration: number })[] = await search.json()
  if (!hits.length) return null
  const closest = hits.reduce((best, h) =>
    Math.abs(h.duration - track.duration) < Math.abs(best.duration - track.duration) ? h : best
  )
  return closest
}

/** Lyrics for a track, fetching and caching (both in memory and IndexedDB)
 *  on first request. Resolves to null when nothing was found. */
export async function lyricsFor(track: Track): Promise<LyricsResult | null> {
  const key = track.id
  if (cache.has(key)) return cache.get(key) ?? null
  const running = inflight.get(key)
  if (running) return running

  const p = (async () => {
    const stored = await getLyrics(key)
    if (stored) {
      const result = stored.lines || stored.plain ? { lines: stored.lines, plain: stored.plain } : null
      cache.set(key, result)
      return result
    }

    let result: LyricsResult | null = null
    try {
      const hit = await queryLrclib(track)
      if (hit && !hit.instrumental) {
        result = {
          lines: hit.syncedLyrics ? parseLRC(hit.syncedLyrics) : null,
          plain: hit.plainLyrics ?? null,
        }
      }
    } catch {
      result = null
    }

    cache.set(key, result)
    await putLyrics({ id: key, lines: result?.lines ?? null, plain: result?.plain ?? null })
    return result
  })().finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p
}

/** Synchronous peek, for a first paint with no flash of "loading". */
export function peekLyrics(trackId: string): LyricsResult | null | undefined {
  return cache.get(trackId)
}
