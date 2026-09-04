import { artUrl } from './art'

/**
 * Pull a dominant colour out of a cover so Now Playing can glow in the album's
 * own palette instead of a fixed accent.
 *
 * The sampling is coarse on purpose: a 24×24 downscale is more than enough to
 * find the mood of an image, costs one tiny canvas draw, and — crucially —
 * keeps the whole thing synchronous once the image has decoded, so it never
 * shows up as jank while a track is starting.
 */

export interface Swatch {
  /** `r, g, b` — ready to drop into a `rgb(... / alpha)` string. */
  rgb: string
  /** The same colour pushed to a usable accent: saturated, mid-lightness. */
  accent: string
  /** A near-black version for backdrops. */
  shade: string
  /** True when the source image is mostly light — the UI dims its glow then. */
  light: boolean
}

const cache = new Map<string, Swatch | null>()
const inflight = new Map<string, Promise<Swatch | null>>()

const SIZE = 24

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const conv = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [
    Math.round(conv(h + 1 / 3) * 255),
    Math.round(conv(h) * 255),
    Math.round(conv(h - 1 / 3) * 255),
  ]
}

function analyse(image: CanvasImageSource): Swatch | null {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, SIZE, SIZE)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, SIZE, SIZE).data
  } catch {
    // A tainted canvas can't be read. Blob-backed art never taints, but a
    // future remote-art path would, and a missing glow beats a thrown error.
    return null
  }

  // Bucket by hue and keep the most *colourful* bucket rather than the most
  // common one: album sleeves are mostly black or white, and the interesting
  // colour is nearly always the minority.
  const buckets = new Array(12).fill(0).map(() => ({ weight: 0, r: 0, g: 0, b: 0 }))
  let lightness = 0
  let samples = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, s, l] = rgbToHsl(r, g, b)
    lightness += l
    samples++
    // Near-black and near-white pixels carry no hue worth keeping.
    if (l < 0.12 || l > 0.94) continue
    const weight = s * s * (1 - Math.abs(l - 0.5))
    const bucket = buckets[Math.min(11, Math.floor(h * 12))]
    bucket.weight += weight
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
  }

  if (!samples) return null

  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a))
  const avgLight = lightness / samples

  let r: number
  let g: number
  let b: number
  if (best.weight < 0.5) {
    // A genuinely monochrome sleeve: use its own grey rather than inventing
    // a hue that isn't in the artwork.
    const v = Math.round(avgLight * 255)
    ;[r, g, b] = [v, v, v]
  } else {
    r = Math.round(best.r / best.weight)
    g = Math.round(best.g / best.weight)
    b = Math.round(best.b / best.weight)
  }

  const [h, s] = rgbToHsl(r, g, b)
  const [ar, ag, ab] = hslToRgb(h, Math.min(1, Math.max(s, 0.45)), 0.58)
  const [sr, sg, sb] = hslToRgb(h, Math.min(0.6, s), 0.1)

  return {
    rgb: `${r} ${g} ${b}`,
    accent: `${ar} ${ag} ${ab}`,
    shade: `${sr} ${sg} ${sb}`,
    light: avgLight > 0.62,
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Swatch for an album's art key. Resolves to null when the album has no
 * cover — callers fall back to the theme accent.
 */
export async function artSwatch(artKey: string | null): Promise<Swatch | null> {
  if (!artKey) return null
  if (cache.has(artKey)) return cache.get(artKey) ?? null
  const running = inflight.get(artKey)
  if (running) return running

  const p = (async () => {
    const url = await artUrl(artKey)
    if (!url) return null
    const img = await loadImage(url)
    if (!img) return null
    const swatch = analyse(img)
    cache.set(artKey, swatch)
    return swatch
  })().finally(() => inflight.delete(artKey))

  inflight.set(artKey, p)
  return p
}

/** Synchronous peek, for a first paint with no flash of the wrong colour. */
export function peekSwatch(artKey: string | null): Swatch | null {
  return artKey ? (cache.get(artKey) ?? null) : null
}

export function clearSwatches() {
  cache.clear()
  inflight.clear()
}
