import { Filter } from 'bad-words'

/**
 * Masks profanity in fetched lyrics for display — `settings.censorLyrics`
 * decides whether this ever runs; the cached lyrics themselves stay
 * unmodified so toggling the setting doesn't need a re-fetch.
 */
const filter = new Filter()

export function censor(text: string): string {
  if (!text) return text
  return filter.clean(text)
}
