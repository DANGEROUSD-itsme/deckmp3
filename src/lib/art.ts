import { getArt } from './db'

/**
 * Cover art lives in IndexedDB as Blobs. The DOM needs object URLs, and those
 * are a leak if you mint one per render — so mint at most one per album key and
 * hold it for the life of the page.
 */
const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

export function peekArtUrl(key: string | null): string | null {
  return key ? (urls.get(key) ?? null) : null
}

export async function artUrl(key: string | null): Promise<string | null> {
  if (!key) return null
  const cached = urls.get(key)
  if (cached) return cached

  const inflight = pending.get(key)
  if (inflight) return inflight

  const p = (async () => {
    const blob = await getArt(key)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urls.set(key, url)
    return url
  })().finally(() => pending.delete(key))

  pending.set(key, p)
  return p
}

/** Drop every cached URL — used when the library is wiped and re-imported. */
export function revokeAllArt() {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  pending.clear()
}
