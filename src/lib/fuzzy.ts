/**
 * A small subsequence matcher, used by the command palette and by library
 * search when a plain substring finds nothing.
 *
 * The scoring is deliberately simple — no trigram index, no worker. A library
 * of ten thousand tracks is ~10k short strings, which a linear pass chews
 * through inside one frame, and the ranking quality of a hand-tuned bonus
 * table beats a clever algorithm at this size.
 */

const BONUS_START = 40 // match sits at the very start of the haystack
const BONUS_WORD = 18 // match sits at the start of a word
const BONUS_CONSECUTIVE = 14 // this char follows the previous match
const BONUS_CASE = 3 // exact case, not just a case-insensitive hit
const PENALTY_GAP = 2 // per skipped character between matches
const PENALTY_LENGTH = 0.15 // per character of haystack, so short wins ties

function isBoundary(ch: string) {
  return ch === ' ' || ch === '-' || ch === '_' || ch === '/' || ch === '.' || ch === '('
}

/**
 * Score `needle` against `haystack`. Returns null when the needle isn't a
 * subsequence at all; otherwise a number where higher is better. Positions of
 * the matched characters come back too, so the UI can bold them.
 */
export function fuzzyScore(
  needle: string,
  haystack: string
): { score: number; positions: number[] } | null {
  if (!needle) return { score: 0, positions: [] }
  if (needle.length > haystack.length) return null

  const nl = needle.toLowerCase()
  const hl = haystack.toLowerCase()

  // Cheap exact-substring path: it's both the common case and always the
  // best possible match, so it skips the subsequence walk entirely.
  const direct = hl.indexOf(nl)
  if (direct !== -1) {
    const positions = Array.from({ length: nl.length }, (_, i) => direct + i)
    let score = 100 + nl.length * BONUS_CONSECUTIVE
    if (direct === 0) score += BONUS_START
    else if (isBoundary(haystack[direct - 1])) score += BONUS_WORD
    return { score: score - haystack.length * PENALTY_LENGTH, positions }
  }

  const positions: number[] = []
  let score = 0
  let h = 0
  let lastMatch = -2

  for (let n = 0; n < nl.length; n++) {
    const ch = nl[n]
    let found = -1
    for (let i = h; i < hl.length; i++) {
      if (hl[i] === ch) {
        found = i
        break
      }
    }
    if (found === -1) return null

    if (found === 0) score += BONUS_START
    else if (isBoundary(haystack[found - 1])) score += BONUS_WORD
    if (found === lastMatch + 1) score += BONUS_CONSECUTIVE
    if (haystack[found] === needle[n]) score += BONUS_CASE
    score -= Math.max(0, found - h) * PENALTY_GAP

    positions.push(found)
    lastMatch = found
    h = found + 1
  }

  return { score: score - haystack.length * PENALTY_LENGTH, positions }
}

/** Rank `items` by how well `query` matches the string `key` returns. */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
  limit = Infinity
): { item: T; score: number; positions: number[] }[] {
  const q = query.trim()
  if (!q) {
    return items.slice(0, limit === Infinity ? items.length : limit).map((item) => ({
      item,
      score: 0,
      positions: [],
    }))
  }
  const out: { item: T; score: number; positions: number[] }[] = []
  for (const item of items) {
    const hit = fuzzyScore(q, key(item))
    if (hit) out.push({ item, score: hit.score, positions: hit.positions })
  }
  out.sort((a, b) => b.score - a.score)
  return limit === Infinity ? out : out.slice(0, limit)
}

/** Split a string into matched / unmatched runs, for highlight rendering. */
export function highlightRuns(
  text: string,
  positions: number[]
): { text: string; hit: boolean }[] {
  if (!positions.length) return [{ text, hit: false }]
  const set = new Set(positions)
  const runs: { text: string; hit: boolean }[] = []
  let buf = ''
  let mode = set.has(0)
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i)
    if (hit !== mode) {
      if (buf) runs.push({ text: buf, hit: mode })
      buf = ''
      mode = hit
    }
    buf += text[i]
  }
  if (buf) runs.push({ text: buf, hit: mode })
  return runs
}
