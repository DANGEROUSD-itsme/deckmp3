import { supabase } from './supabase'
import type { Playlist, Settings, TrackStats } from '../types'

/**
 * Remote mirrors of the three IndexedDB stores worth following you between
 * devices. Audio itself never leaves the device it was imported on — these
 * are metadata only, matched back to local tracks by their stable id (the
 * relative file path — see Track.id in types.ts).
 */

interface RemoteSettingsRow {
  user_id: string
  data: Settings
  updated_at: string
}

interface RemotePlaylistRow {
  id: string
  user_id: string
  name: string
  track_ids: string[]
  created_at: string
  updated_at: string
}

interface RemoteStatsRow {
  track_id: string
  user_id: string
  plays: number
  skips: number
  last_played: number
  favorite: boolean
  rating: number
}

export async function pushSettings(userId: string, settings: Settings) {
  if (!supabase) return
  await supabase
    .from('settings')
    .upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() })
}

export async function pullSettings(userId: string): Promise<Settings | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('settings')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle<Pick<RemoteSettingsRow, 'data'>>()
  return data?.data ?? null
}

export async function upsertPlaylistRemote(userId: string, p: Playlist) {
  if (!supabase) return
  await supabase.from('playlists').upsert({
    id: p.id,
    user_id: userId,
    name: p.name,
    track_ids: p.trackIds,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt).toISOString(),
  })
}

export async function deletePlaylistRemote(userId: string, id: string) {
  if (!supabase) return
  await supabase.from('playlists').delete().eq('user_id', userId).eq('id', id)
}

export async function pullPlaylists(userId: string): Promise<Playlist[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('playlists')
    .select('*')
    .eq('user_id', userId)
    .returns<RemotePlaylistRow[]>()
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    trackIds: r.track_ids,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  }))
}

export async function upsertStatsRemote(userId: string, s: TrackStats) {
  if (!supabase) return
  await supabase.from('track_stats').upsert({
    track_id: s.id,
    user_id: userId,
    plays: s.plays,
    skips: s.skips,
    last_played: s.lastPlayed,
    favorite: s.favorite,
    rating: s.rating,
  })
}

export async function pullStats(userId: string): Promise<TrackStats[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('track_stats')
    .select('*')
    .eq('user_id', userId)
    .returns<RemoteStatsRow[]>()
  return (data ?? []).map((r) => ({
    id: r.track_id,
    plays: r.plays,
    skips: r.skips,
    lastPlayed: r.last_played,
    favorite: r.favorite,
    rating: r.rating,
  }))
}

/**
 * Playlists merge by id, newer `updatedAt` wins — safe because both sides
 * already carry that field for exactly this purpose (see mutatePlaylist in
 * store/deck.tsx). A playlist that only exists on one side survives as-is.
 */
export function mergePlaylists(local: Playlist[], remote: Playlist[]): Playlist[] {
  const byId = new Map(local.map((p) => [p.id, p]))
  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r)
  }
  return [...byId.values()]
}

/**
 * Stats merge field-by-field, always taking the larger/truer value — plays,
 * skips and lastPlayed only ever grow, favorite is "true wins", rating takes
 * whichever is non-zero (or the higher one if both device set one). That
 * makes the merge commutative and lossless without needing a timestamp.
 */
export function mergeStats(
  local: Map<string, TrackStats>,
  remote: TrackStats[]
): Map<string, TrackStats> {
  const merged = new Map(local)
  for (const r of remote) {
    const l = merged.get(r.id)
    if (!l) {
      merged.set(r.id, r)
      continue
    }
    merged.set(r.id, {
      id: r.id,
      plays: Math.max(l.plays, r.plays),
      skips: Math.max(l.skips, r.skips),
      lastPlayed: Math.max(l.lastPlayed, r.lastPlayed),
      favorite: l.favorite || r.favorite,
      rating: Math.max(l.rating, r.rating),
    })
  }
  return merged
}
