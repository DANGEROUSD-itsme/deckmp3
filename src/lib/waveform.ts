/**
 * Static waveform peaks for the DJ decks — the min/max envelope of a track,
 * downsampled to a fixed number of buckets so a canvas can draw it as one
 * cheap set of vertical bars regardless of track length.
 *
 * Decoding happens once per track and is cached in memory for the session;
 * re-loading the same track onto a deck (or the other deck) is instant.
 */

export interface Peaks {
  /** Interleaved [min0, max0, min1, max1, …], one pair per bucket, -1..1. */
  data: Float32Array
  buckets: number
}

const BUCKETS = 800
const cache = new Map<string, Peaks | null>()
const inflight = new Map<string, Promise<Peaks | null>>()

/** A short-lived context used only to decode bytes — never connected to output. */
let decodeCtx: AudioContext | null = null
function getDecodeCtx() {
  if (!decodeCtx || decodeCtx.state === 'closed') {
    decodeCtx = new AudioContext()
  }
  return decodeCtx
}

async function decode(file: File): Promise<Peaks | null> {
  try {
    const bytes = await file.arrayBuffer()
    const ctx = getDecodeCtx()
    // decodeAudioData detaches/consumes the buffer, so a fresh copy per call
    // isn't needed here since we only ever decode a given File once.
    const audio = await ctx.decodeAudioData(bytes)
    const channel = audio.getChannelData(0)
    const perBucket = Math.max(1, Math.floor(channel.length / BUCKETS))
    const data = new Float32Array(BUCKETS * 2)

    for (let i = 0; i < BUCKETS; i++) {
      const start = i * perBucket
      const end = Math.min(channel.length, start + perBucket)
      let min = 0
      let max = 0
      for (let j = start; j < end; j++) {
        const v = channel[j]
        if (v < min) min = v
        if (v > max) max = v
      }
      data[i * 2] = min
      data[i * 2 + 1] = max
    }
    return { data, buckets: BUCKETS }
  } catch {
    // Corrupt file, unsupported codec, or the browser just declined —
    // the waveform falls back to a flat placeholder, playback still works.
    return null
  }
}

export async function getPeaks(trackId: string, file: File): Promise<Peaks | null> {
  const cached = cache.get(trackId)
  if (cached !== undefined) return cached

  const running = inflight.get(trackId)
  if (running) return running

  const p = decode(file).then((peaks) => {
    cache.set(trackId, peaks)
    return peaks
  })
  inflight.set(trackId, p)
  try {
    return await p
  } finally {
    inflight.delete(trackId)
  }
}

export function peekPeaks(trackId: string): Peaks | null {
  return cache.get(trackId) ?? null
}
