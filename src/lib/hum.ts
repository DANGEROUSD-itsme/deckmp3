/**
 * Hum to Find: match a few seconds of hummed/sung audio against the user's
 * own library by melody shape, not by audio fingerprint — a hum will never
 * be in the right key or tempo, so this can't work like matching two copies
 * of the same recording (that's a different, much easier problem). Instead
 * every track gets reduced to a *contour*: the sequence of pitch movements
 * (up N semitones, down M semitones) traced by whatever's melodically
 * dominant in the mix, and matching is "does the query's shape appear
 * somewhere inside this track's shape" via subsequence DTW — which is
 * tolerant of both wrong key (deltas are relative, not absolute) and wrong
 * tempo (DTW warps the time axis to align them).
 *
 * This is necessarily best-effort: `detectPitch` is a single-pitch tracker
 * run on a full polyphonic mix, so on a dense arrangement it's tracking
 * whatever's loudest/most tonal at each instant, not an isolated vocal
 * line. It works best on vocal-forward material and short, hummable
 * queries — which is the realistic use case here.
 */

import { getHumContour, putHumContour, getAllHumContours } from './db'
import { detectPitch, hzToMidi } from './pitch'
import type { Track } from '../types'

/** Sample rate contour extraction runs at — plenty above the hum/vocal
 *  range's Nyquist requirement, and keeps per-track analysis cheap. */
export const ANALYSIS_SAMPLE_RATE = 8000
const FRAME_SIZE = 1024 // 128ms at 8kHz
const HOP_SIZE = 400 // 50ms at 8kHz — 20 pitch estimates/sec

/**
 * Bumped whenever the extraction or matching algorithm changes in a way
 * that invalidates previously cached contours — compared against the
 * `version` field on a cached row to decide whether to re-analyze.
 */
export const HUM_CONTOUR_VERSION = 1

/**
 * Frame-by-frame pitch, converted to MIDI note numbers, with `NaN` marking
 * unvoiced frames (silence, noise, percussion — nothing melodic to track).
 * Chunked with a yield between batches so analyzing a whole track never
 * shows up as a single long synchronous block — important since this runs
 * on the same main thread as playback (see engine.ts's bitcrush effect).
 */
export async function extractContour(
  mono: Float32Array,
  sampleRate: number,
  onChunkYield?: () => Promise<void> | void
): Promise<number[]> {
  const contour: number[] = []
  const frameCount = Math.max(0, Math.floor((mono.length - FRAME_SIZE) / HOP_SIZE) + 1)
  const FRAMES_PER_CHUNK = 40 // ~2s of audio per chunk at the default hop

  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP_SIZE
    const frame = mono.subarray(start, start + FRAME_SIZE)
    const hz = detectPitch(frame, sampleRate)
    contour.push(hz === null ? NaN : hzToMidi(hz))

    if (onChunkYield && (f + 1) % FRAMES_PER_CHUNK === 0) {
      await onChunkYield()
    }
  }
  return contour
}

/**
 * Collapses a MIDI contour to the sequence of semitone deltas between
 * consecutive *voiced* frames, dropping unvoiced gaps entirely. This is
 * what actually gets matched: deltas are invariant to the hum being in a
 * different key than the original, and dropping gaps means a query and
 * reference don't need to agree on exactly where the silences fall.
 */
export function contourToDeltas(contour: number[]): number[] {
  const deltas: number[] = []
  let prev: number | null = null
  for (const v of contour) {
    if (Number.isNaN(v)) continue
    if (prev !== null) deltas.push(v - prev)
    prev = v
  }
  return deltas
}

/**
 * Subsequence DTW: how well `query` matches *some* contiguous stretch of
 * `reference`, warped in time. Lower is better. Unlike ordinary DTW, the
 * first row of the cost matrix starts at 0 everywhere (not just [0,0]),
 * so the alignment is free to start partway through the reference — the
 * whole point, since a hummed snippet corresponds to a few seconds out of
 * a multi-minute track, not the start of it. Returns the best (minimum)
 * end-of-query cost across every possible ending point, normalized by
 * query length so scores are comparable across tracks of different
 * lengths.
 *
 * O(query.length * reference.length) — cheap for a query of a few hundred
 * deltas against a reference of a few thousand.
 */
export function dtwSubsequenceScore(query: number[], reference: number[]): number {
  const n = query.length
  const m = reference.length
  if (n === 0 || m === 0) return Infinity

  // Two rolling rows instead of a full n*m matrix.
  let prevRow = new Float64Array(m + 1)
  let curRow = new Float64Array(m + 1)
  // Row 0: subsequence match can start anywhere, so every starting column
  // costs 0 rather than accumulating from the left edge.
  for (let j = 0; j <= m; j++) prevRow[j] = 0

  for (let i = 1; i <= n; i++) {
    curRow[0] = i * COST_CAP // no valid subsequence match of zero reference length
    for (let j = 1; j <= m; j++) {
      const d = Math.abs(query[i - 1] - reference[j - 1])
      const cost = Math.min(d, COST_CAP)
      const best = Math.min(prevRow[j], curRow[j - 1], prevRow[j - 1])
      curRow[j] = cost + best
    }
    ;[prevRow, curRow] = [curRow, prevRow]
  }

  let best = Infinity
  for (let j = 0; j <= m; j++) best = Math.min(best, prevRow[j])
  return best / n
}

/** Caps a single step's cost so one wildly mismatched note can't dominate
 *  the whole alignment — keeps the match robust to one bad pitch estimate. */
const COST_CAP = 6 // semitones

export interface HumMatch {
  trackId: string
  score: number
}

/**
 * Ranks every candidate reference contour against the query, best (lowest
 * score) first. Candidates with too few voiced deltas to meaningfully
 * match are skipped rather than scored, since a near-empty reference would
 * otherwise produce a trivially low score.
 */
export function matchLibrary(
  queryDeltas: number[],
  candidates: { trackId: string; deltas: number[] }[]
): HumMatch[] {
  const results: HumMatch[] = []
  for (const c of candidates) {
    if (c.deltas.length < queryDeltas.length) continue
    results.push({ trackId: c.trackId, score: dtwSubsequenceScore(queryDeltas, c.deltas) })
  }
  results.sort((a, b) => a.score - b.score)
  return results
}

/* ------------------------------------------------------------ decoding -- */

/** A short-lived context used only to decode bytes — never connected to
 *  output. Mirrors the same pattern waveform.ts uses for peaks. */
let decodeCtx: AudioContext | null = null
function getDecodeCtx() {
  if (!decodeCtx || decodeCtx.state === 'closed') {
    decodeCtx = new AudioContext()
  }
  return decodeCtx
}

/**
 * Decodes a file to mono PCM at `targetRate`. Resampling happens via
 * `OfflineAudioContext` rather than naive decimation, since that's the
 * platform-native way to do it correctly (proper anti-aliasing) and it's
 * cheap for a one-off per-track analysis pass.
 */
async function decodeToMono(file: File, targetRate: number): Promise<Float32Array | null> {
  try {
    const bytes = await file.arrayBuffer()
    const audio = await getDecodeCtx().decodeAudioData(bytes)
    const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * targetRate), targetRate)
    const source = offline.createBufferSource()
    source.buffer = audio
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  } catch {
    // Corrupt file, unsupported codec, or decode declined — the track is
    // simply left unmatchable rather than failing the whole library pass.
    return null
  }
}

/** Decodes a recorded hum (e.g. a `Blob` from `MediaRecorder`) the same way. */
export async function decodeHumBlob(blob: Blob, targetRate = ANALYSIS_SAMPLE_RATE) {
  return decodeToMono(new File([blob], 'hum', { type: blob.type }), targetRate)
}

/* ------------------------------------------------------- library analysis -- */

export interface AnalyzeProgress {
  done: number
  total: number
}

/**
 * Analyzes every library track that doesn't already have an up-to-date
 * cached contour, storing each one as it finishes. Runs one track at a
 * time with a yield in between (on top of the yields already inside
 * `extractContour`), so a library of hundreds of tracks never produces a
 * single long synchronous block — this runs on the same main thread as
 * playback. Safe to call repeatedly; already-analyzed tracks are skipped
 * instantly via the IndexedDB cache.
 */
export async function ensureLibraryAnalyzed(
  tracks: Track[],
  resolveFile: (track: Track) => Promise<File | null>,
  onProgress?: (p: AnalyzeProgress) => void,
  shouldCancel?: () => boolean
): Promise<void> {
  const pending: Track[] = []
  for (const t of tracks) {
    const cached = await getHumContour(t.id)
    if (!cached || cached.version !== HUM_CONTOUR_VERSION) pending.push(t)
  }

  let done = 0
  onProgress?.({ done, total: pending.length })
  for (const track of pending) {
    if (shouldCancel?.()) return
    const file = await resolveFile(track)
    if (file) {
      const mono = await decodeToMono(file, ANALYSIS_SAMPLE_RATE)
      if (mono) {
        const contour = await extractContour(mono, ANALYSIS_SAMPLE_RATE, () =>
          new Promise((r) => setTimeout(r, 0))
        )
        await putHumContour({
          id: track.id,
          deltas: contourToDeltas(contour),
          version: HUM_CONTOUR_VERSION,
        })
      }
    }
    done++
    onProgress?.({ done, total: pending.length })
    await new Promise((r) => setTimeout(r, 0))
  }
}

/* -------------------------------------------------------------- search -- */

/**
 * The full query path: extract the hum's own contour, then rank every
 * cached reference contour against it. Returns an empty list for a query
 * too short or too unvoiced to say anything meaningful (fewer than a
 * handful of note transitions) rather than returning noisy, low-confidence
 * matches.
 */
export async function searchHum(queryMono: Float32Array, sampleRate: number): Promise<HumMatch[]> {
  const queryContour = await extractContour(queryMono, sampleRate)
  const queryDeltas = contourToDeltas(queryContour)
  if (queryDeltas.length < 4) return []

  const rows = await getAllHumContours()
  const candidates = rows
    .filter((r) => r.version === HUM_CONTOUR_VERSION)
    .map((r) => ({ trackId: r.id, deltas: r.deltas }))
  return matchLibrary(queryDeltas, candidates)
}
