import { Filter } from 'bad-words'

/**
 * Masks profanity in fetched lyrics for display — `settings.censorLyrics`
 * decides whether this ever runs; the cached lyrics themselves stay
 * unmodified so toggling the setting doesn't need a re-fetch.
 *
 * `Filter.clean()` itself is surprisingly expensive (~15-20ms per call).
 * LyricsView re-renders its whole visible window (up to ~36 lines) every
 * time the active line changes, and was calling this on every one of
 * those lines on every render — the same handful of lines repeatedly,
 * since a line only scrolls out of the window after many renders. That
 * was costing 250-350ms of synchronous work per line change, long enough
 * to glitch the engine's ScriptProcessorNode-based audio (see engine.ts).
 * Caching by exact input text means `clean()` only actually runs once
 * per unique line, ever.
 */
const filter = new Filter()
const cache = new Map<string, string>()

export function censor(text: string): string {
  if (!text) return text
  const cached = cache.get(text)
  if (cached !== undefined) return cached
  const cleaned = filter.clean(text)
  cache.set(text, cleaned)
  return cleaned
}
