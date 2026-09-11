import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Playlist, SavedState, Settings, Track, TrackStats } from '../types'
import { defaultSettings } from '../types'

interface DeckDB extends DBSchema {
  tracks: {
    key: string
    value: Track
    indexes: { albumKey: string; artist: string; addedAt: number }
  }
  /** Cover art, deduped per album so a 20-track album stores one image. */
  art: {
    key: string
    value: { key: string; blob: Blob }
  }
  /**
   * Full audio bytes, keyed by track id — only populated when the browser
   * lacks the File System Access API. Without a live directory handle there's
   * no other way to make a track playable across reloads, so the fallback
   * import path copies each file's content in here once, up front.
   */
  audio: {
    key: string
    value: { id: string; blob: Blob; name: string; type: string }
  }
  playlists: {
    key: string
    value: Playlist
  }
  /**
   * Listening history, one row per track id. Kept in its own store rather
   * than on the Track row so a rescan (which rewrites every Track) can never
   * clobber play counts, favourites, or ratings.
   */
  stats: {
    key: string
    value: TrackStats
    indexes: { plays: number; lastPlayed: number }
  }
  /** Directory handle, saved player state, settings. */
  kv: {
    key: string
    value: unknown
  }
}

let dbp: Promise<IDBPDatabase<DeckDB>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<DeckDB>('deck', 3, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          const tracks = d.createObjectStore('tracks', { keyPath: 'id' })
          tracks.createIndex('albumKey', 'albumKey')
          tracks.createIndex('artist', 'artist')
          tracks.createIndex('addedAt', 'addedAt')
          d.createObjectStore('art', { keyPath: 'key' })
          d.createObjectStore('playlists', { keyPath: 'id' })
          d.createObjectStore('kv')
        }
        if (oldVersion < 2) {
          d.createObjectStore('audio', { keyPath: 'id' })
        }
        if (oldVersion < 3) {
          const stats = d.createObjectStore('stats', { keyPath: 'id' })
          stats.createIndex('plays', 'plays')
          stats.createIndex('lastPlayed', 'lastPlayed')
        }
      },
    })
  }
  return dbp
}

/* ---------------------------------------------------------------- tracks -- */

export async function getAllTracks(): Promise<Track[]> {
  return (await db()).getAll('tracks')
}

export async function putTracks(tracks: Track[]) {
  const d = await db()
  const tx = d.transaction('tracks', 'readwrite')
  await Promise.all([...tracks.map((t) => tx.store.put(t)), tx.done])
}

export async function deleteTracks(ids: string[]) {
  const d = await db()
  const tx = d.transaction(['tracks', 'audio'], 'readwrite')
  await Promise.all([
    ...ids.map((id) => tx.objectStore('tracks').delete(id)),
    ...ids.map((id) => tx.objectStore('audio').delete(id)),
    tx.done,
  ])
}

/**
 * Wipe the library. Listening history survives on purpose: re-importing the
 * same folder produces the same track ids, so play counts, favourites and
 * ratings come straight back. `clearStats` is the explicit opt-in.
 */
export async function clearLibrary() {
  const d = await db()
  const tx = d.transaction(['tracks', 'art', 'audio'], 'readwrite')
  await Promise.all([
    tx.objectStore('tracks').clear(),
    tx.objectStore('art').clear(),
    tx.objectStore('audio').clear(),
    tx.done,
  ])
}

/* ----------------------------------------------------------------- audio -- */

/** Only used by the `webkitdirectory` fallback — see the `audio` store comment. */
export async function putAudio(id: string, file: File) {
  return (await db()).put('audio', { id, blob: file, name: file.name, type: file.type })
}

export async function hasAudio(id: string) {
  return ((await (await db()).getKey('audio', id)) ?? null) !== null
}

export async function getAudioFile(id: string): Promise<File | null> {
  const row = await (await db()).get('audio', id)
  if (!row) return null
  return new File([row.blob], row.name, { type: row.type })
}

/* ------------------------------------------------------------------- art -- */

export async function hasArt(key: string) {
  return ((await (await db()).getKey('art', key)) ?? null) !== null
}

export async function putArt(key: string, blob: Blob) {
  return (await db()).put('art', { key, blob })
}

export async function getArt(key: string): Promise<Blob | null> {
  const row = await (await db()).get('art', key)
  return row?.blob ?? null
}

/** Remove art rows no longer referenced by any track. */
export async function pruneArt() {
  const d = await db()
  const tracks = await d.getAll('tracks')
  const live = new Set(tracks.map((t) => t.artKey).filter(Boolean) as string[])
  const keys = await d.getAllKeys('art')
  const dead = keys.filter((k) => !live.has(k))
  if (!dead.length) return
  const tx = d.transaction('art', 'readwrite')
  await Promise.all([...dead.map((k) => tx.store.delete(k)), tx.done])
}

/* ------------------------------------------------------------- playlists -- */

export async function getAllPlaylists(): Promise<Playlist[]> {
  return (await db()).getAll('playlists')
}

export async function putPlaylist(p: Playlist) {
  return (await db()).put('playlists', p)
}

export async function deletePlaylist(id: string) {
  return (await db()).delete('playlists', id)
}

/* ---------------------------------------------------------------- kv/misc -- */

const DIR_KEY = 'libraryDir'
const STATE_KEY = 'savedState'
const THEME_KEY = 'theme'

export async function saveDirHandle(handle: FileSystemDirectoryHandle) {
  return (await db()).put('kv', handle, DIR_KEY)
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const h = await (await db()).get('kv', DIR_KEY)
  return (h as FileSystemDirectoryHandle) ?? null
}

export async function clearDirHandle() {
  return (await db()).delete('kv', DIR_KEY)
}

export async function saveState(s: SavedState) {
  return (await db()).put('kv', s, STATE_KEY)
}

export async function loadState(): Promise<SavedState | null> {
  return ((await (await db()).get('kv', STATE_KEY)) as SavedState) ?? null
}

export async function saveTheme(t: 'light' | 'dark') {
  return (await db()).put('kv', t, THEME_KEY)
}

export async function loadTheme(): Promise<'light' | 'dark' | null> {
  return ((await (await db()).get('kv', THEME_KEY)) as 'light' | 'dark') ?? null
}

/* ------------------------------------------------------------------ stats -- */

export async function getAllStats(): Promise<TrackStats[]> {
  return (await db()).getAll('stats')
}

export async function putStats(s: TrackStats) {
  return (await db()).put('stats', s)
}

export async function putManyStats(rows: TrackStats[]) {
  if (!rows.length) return
  const d = await db()
  const tx = d.transaction('stats', 'readwrite')
  await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done])
}

/** Explicit "forget what I've listened to" — never implied by clearLibrary. */
export async function clearStats() {
  return (await db()).clear('stats')
}

/* --------------------------------------------------------------- settings -- */

const SETTINGS_KEY = 'settings'

export async function saveSettings(s: Settings) {
  return (await db()).put('kv', s, SETTINGS_KEY)
}

/**
 * Settings are stored whole, so a build that adds a field would otherwise
 * read `undefined` for it on every existing install. Merging over the
 * defaults (and over the nested `eq` object, which is the only nested one)
 * keeps old rows forward-compatible without a migration.
 */
export async function loadSettings(): Promise<Settings> {
  const base = defaultSettings()
  const raw = (await (await db()).get('kv', SETTINGS_KEY)) as Partial<Settings> | undefined
  if (!raw) return base
  return {
    ...base,
    ...raw,
    eq: { ...base.eq, ...(raw.eq ?? {}) },
    vibe: { ...base.vibe, ...(raw.vibe ?? {}) },
  }
}
